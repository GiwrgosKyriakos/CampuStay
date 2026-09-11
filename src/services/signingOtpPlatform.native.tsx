import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ApplicationVerifier } from "firebase/auth";

import { firebasePhoneAuth } from "@/src/config/firebase";
import type { OtpConfirmation } from "@/src/services/signingOtp.shared";
import { OtpProviderUnavailableError } from "@/src/services/signingOtp.shared";
import { logOtpTerminalDiagnostic } from "@/src/services/otpDiagnostics";

type PendingRecaptcha = {
  targetPhoneNumber: string;
  resolve: (token: string) => void;
  reject: (error: Error) => void;
};

let requestRecaptchaToken: ((targetPhoneNumber: string) => Promise<string>) | null = null;

function recaptchaSiteKeyUrl(): string {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new OtpProviderUnavailableError("Firebase API key is required for native phone authentication.");
  return `https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${encodeURIComponent(apiKey)}`;
}

function recaptchaHtml(siteKey: string): string {
  const encodedSiteKey = JSON.stringify(siteKey);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>
<div id="recaptcha-container"></div>
<script>
(function() {
  var siteKey = ${encodedSiteKey};
  function post(type, payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
  }
  var widgetId;
  window.__requestRecaptcha = function() {
    if (widgetId === undefined || !window.grecaptcha) {
      post("error", { message: "The reCAPTCHA widget is not ready." });
      return;
    }
    window.grecaptcha.execute(widgetId);
  };
  window.__recaptchaReady = function() {
    try {
      widgetId = window.grecaptcha.render("recaptcha-container", {
        sitekey: siteKey,
        size: "invisible",
        callback: function(token) { post("token", { token: token }); },
        "expired-callback": function() { post("error", { message: "The reCAPTCHA token expired." }); },
        "error-callback": function() { post("error", { message: "The reCAPTCHA widget failed." }); }
      });
      post("ready");
    } catch (error) {
      post("error", { message: error && error.message ? error.message : "The reCAPTCHA widget could not be created." });
    }
  };
  var script = document.createElement("script");
  script.src = "https://www.google.com/recaptcha/api.js?onload=__recaptchaReady&render=explicit";
  script.async = true;
  script.defer = true;
  script.onerror = function() { post("error", { message: "The reCAPTCHA script could not be loaded." }); };
  document.head.appendChild(script);
}());
</script></body></html>`;
}

export function NativeFirebaseRecaptchaHost(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef<PendingRecaptcha | null>(null);

  useEffect(() => {
    let active = true;
    const loadSiteKey = async () => {
      try {
        const response = await fetch(recaptchaSiteKeyUrl());
        const payload = await response.json() as { recaptchaSiteKey?: unknown };
        if (!response.ok || typeof payload.recaptchaSiteKey !== "string" || !payload.recaptchaSiteKey) {
          throw new Error("Firebase did not return a reCAPTCHA site key.");
        }
        if (active) setSiteKey(payload.recaptchaSiteKey);
      } catch (error) {
        logOtpTerminalDiagnostic({
          phase: "native-recaptcha-site-key",
          authMethod: "signInWithPhoneNumber",
          error,
          details: { firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID },
        });
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) pending.reject(error instanceof Error ? error : new Error("The reCAPTCHA site key could not be loaded."));
        if (active) setVisible(false);
      }
    };
    void loadSiteKey();
    return () => {
      active = false;
      requestRecaptchaToken = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.reject(new Error("The reCAPTCHA verifier was unmounted."));
    };
  }, []);

  useEffect(() => {
    requestRecaptchaToken = (targetPhoneNumber) => {
      if (!siteKey) return Promise.reject(new OtpProviderUnavailableError("The Firebase reCAPTCHA verifier is not ready."));
      if (pendingRef.current) return Promise.reject(new Error("A Firebase reCAPTCHA request is already active."));
      setReady(false);
      setVisible(true);
      return new Promise<string>((resolve, reject) => {
        pendingRef.current = { targetPhoneNumber, resolve, reject };
      });
    };
    return () => {
      requestRecaptchaToken = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!visible || !ready) return;
    webViewRef.current?.injectJavaScript("window.__requestRecaptcha(); true;");
  }, [ready, visible]);

  const html = useMemo(() => siteKey ? recaptchaHtml(siteKey) : "", [siteKey]);
  const closeWithError = (message: string) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setVisible(false);
    logOtpTerminalDiagnostic({
      phase: "native-recaptcha-callback",
      targetPhoneNumber: pending?.targetPhoneNumber,
      authMethod: "signInWithPhoneNumber",
      error: new Error(message),
    });
    pending?.reject(new Error(message));
  };
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string; message?: string };
      if (message.type === "ready") {
        setReady(true);
      } else if (message.type === "token" && message.token) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        setVisible(false);
        pending?.resolve(message.token);
      } else if (message.type === "error") {
        closeWithError(message.message || "The Firebase reCAPTCHA verifier failed.");
      }
    } catch (error) {
      logOtpTerminalDiagnostic({
        phase: "native-recaptcha-message",
        authMethod: "signInWithPhoneNumber",
        error,
        details: { webViewMessage: event.nativeEvent.data },
      });
      closeWithError("The Firebase reCAPTCHA verifier returned an invalid response.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => closeWithError("The Firebase reCAPTCHA verification was cancelled.")}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Verification required</Text>
          <Text style={styles.subtitle}>Complete the security check to send the code.</Text>
          {html ? (
            <WebView
              ref={webViewRef}
              source={{ html, baseUrl: `https://${process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "localhost"}/` }}
              onMessage={handleMessage}
              onError={() => closeWithError("The Firebase reCAPTCHA verifier could not load.")}
              javaScriptEnabled
              domStorageEnabled
              style={styles.webView}
            />
          ) : null}
          <Pressable onPress={() => closeWithError("The Firebase reCAPTCHA verification was cancelled.")} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export async function startFirebasePhoneVerification(params: { phone: string; signerId: string }): Promise<{ confirmation: OtpConfirmation; cleanup?: () => void }> {
  if (!requestRecaptchaToken) {
    throw new OtpProviderUnavailableError("The native Firebase reCAPTCHA host is not mounted.");
  }

  const { signInWithPhoneNumber, signOut } = await import("firebase/auth");
  const applicationVerifier: ApplicationVerifier = {
    type: "recaptcha",
    verify: () => requestRecaptchaToken!(params.phone),
  };
  try {
    const confirmation = await signInWithPhoneNumber(firebasePhoneAuth, params.phone, applicationVerifier);
    return { confirmation, cleanup: () => { void signOut(firebasePhoneAuth); } };
  } catch (error) {
    logOtpTerminalDiagnostic({
      phase: "native-phone-dispatch",
      targetPhoneNumber: params.phone,
      authMethod: "signInWithPhoneNumber",
      error,
      details: {
        baseUrl: `https://${process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "localhost"}/`,
        firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      },
    });
    throw error;
  }
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.45)", padding: 24 },
  dialog: { width: "100%", maxWidth: 360, minHeight: 260, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 18 },
  title: { color: "#142126", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  subtitle: { color: "#506066", fontSize: 14, marginBottom: 12 },
  webView: { height: 150, width: "100%", backgroundColor: "#FFFFFF" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelText: { color: "#176B7A", fontSize: 15, fontWeight: "600" },
});
