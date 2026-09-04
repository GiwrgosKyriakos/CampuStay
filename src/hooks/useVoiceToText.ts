import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as Haptics from "expo-haptics";

import { useLocale } from "@/src/context/locale";
import { t } from "@/src/locales";

export interface VoiceToTextCallbacks {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
}

export type VoiceToTextErrorCode =
  | "permission_denied"
  | "service_unavailable"
  | "network_error"
  | "silence_timeout"
  | "unsupported_locale"
  | "start_failed";

export interface VoiceToTextError {
  code: VoiceToTextErrorCode;
  message: string;
}

const INACTIVITY_TIMEOUT_MS = 3500;
let nextSessionId = 0;
let activeSessionId: number | null = null;

function matchesLocale(candidate: string, target: string) {
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  return normalizedCandidate === normalizedTarget || normalizedCandidate.split("-")[0] === normalizedTarget.split("-")[0];
}

function getErrorForNativeCode(code: string, message: string): VoiceToTextError {
  if (code === "not-allowed") return { code: "permission_denied", message: t("voice.errors.permissionDenied") };
  if (code === "network") return { code: "network_error", message: t("voice.errors.network") };
  if (code === "no-speech" || code === "speech-timeout") return { code: "silence_timeout", message: t("voice.errors.silenceTimeout") };
  if (code === "language-not-supported") return { code: "unsupported_locale", message: t("voice.errors.unsupportedLocale") };
  if (code === "service-not-allowed" || code === "busy") return { code: "service_unavailable", message: t("voice.errors.unavailable") };
  return { code: "start_failed", message: message || t("voice.errors.generic") };
}

export function useVoiceToText() {
  const { locale } = useLocale();
  const activeLang = locale === "el" ? "el-GR" : "en-US";
  const sessionIdRef = useRef<number | null>(null);
  if (sessionIdRef.current === null) {
    nextSessionId += 1;
    sessionIdRef.current = nextSessionId;
  }
  const sessionId = sessionIdRef.current;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<VoiceToTextError | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState<boolean | null>(null);
  const [isRecognitionAvailable, setIsRecognitionAvailable] = useState<boolean | null>(null);
  const [isRecordingSupported, setIsRecordingSupported] = useState<boolean | null>(null);
  const [resolvedLocale, setResolvedLocale] = useState(activeLang);
  const transcriptRef = useRef("");
  const callbacksRef = useRef<VoiceToTextCallbacks>({});
  const committedTranscriptRef = useRef("");
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVoiceError = useCallback((nextError: VoiceToTextError) => {
    setError(nextError);
  }, []);

  const releaseSession = useCallback(() => {
    if (activeSessionId === sessionId) activeSessionId = null;
  }, [sessionId]);

  const resolveRecognitionOptions = useCallback(async () => {
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    const recordingSupported = ExpoSpeechRecognitionModule.supportsRecording();
    setIsRecognitionAvailable(available);
    setIsRecordingSupported(recordingSupported);

    if (!available) {
      setVoiceError({ code: "service_unavailable", message: t("voice.errors.unavailable") });
      return null;
    }

    let supportedLocales: { locales: string[]; installedLocales: string[] };
    try {
      supportedLocales = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    } catch {
      setVoiceError({ code: "service_unavailable", message: t("voice.errors.unavailable") });
      return null;
    }

    const requiresOnDeviceRecognition = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    const localePool = requiresOnDeviceRecognition && supportedLocales.installedLocales.length > 0
      ? supportedLocales.installedLocales
      : supportedLocales.locales;

    // Older Android versions can return no locale list, so recognition remains usable when the platform cannot report it.
    if (localePool.length === 0) {
      setResolvedLocale(activeLang);
      return { lang: activeLang, requiresOnDeviceRecognition };
    }

    const candidates = activeLang === "el-GR" ? ["el-GR", "en-US"] : ["en-US"];
    const resolved = candidates.map((candidate) => localePool.find((supported) => matchesLocale(supported, candidate))).find(Boolean);
    if (!resolved) {
      setVoiceError({ code: "unsupported_locale", message: t("voice.errors.unsupportedLocale") });
      return null;
    }

    setResolvedLocale(resolved);
    return { lang: resolved, requiresOnDeviceRecognition };
  }, [activeLang, setVoiceError]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const commitTranscript = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized || normalized === committedTranscriptRef.current) return;
    committedTranscriptRef.current = normalized;
    callbacksRef.current.onFinalResult?.(normalized);
  }, []);

  const scheduleInactivityStop = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current.trim()) {
        setVoiceError({ code: "silence_timeout", message: t("voice.errors.silenceTimeout") });
        void ExpoSpeechRecognitionModule.stop();
        return;
      }
      commitTranscript(transcriptRef.current);
      void ExpoSpeechRecognitionModule.stop();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer, commitTranscript, setVoiceError]);

  useSpeechRecognitionEvent("start", () => {
    if (activeSessionId !== sessionId) return;
    setIsListening(true);
    scheduleInactivityStop();
  });

  useSpeechRecognitionEvent("end", () => {
    if (activeSessionId !== sessionId) return;
    clearInactivityTimer();
    setIsListening(false);
    releaseSession();
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (activeSessionId !== sessionId) return;
    const nextTranscript = event.results[0]?.transcript?.trim() ?? "";
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
    if (nextTranscript && !event.isFinal) callbacksRef.current.onPartialResult?.(nextTranscript);
    if (event.isFinal) commitTranscript(nextTranscript);
    scheduleInactivityStop();
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (activeSessionId !== sessionId) return;
    clearInactivityTimer();
    setError(getErrorForNativeCode(event.error, event.message));
    setIsListening(false);
    releaseSession();
  });

  const startListening = useCallback(async (callbacks: VoiceToTextCallbacks = {}) => {
    if (activeSessionId !== null) {
      setVoiceError({ code: "service_unavailable", message: t("voice.errors.busy") });
      return;
    }

    activeSessionId = sessionId;
    try {
      setError(null);
      callbacksRef.current = callbacks;
      transcriptRef.current = "";
      committedTranscriptRef.current = "";
      setTranscript("");

      if (hasPermission !== true) {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        setHasPermission(permission.granted);
        setPermissionCanAskAgain(permission.canAskAgain);
        if (!permission.granted) {
          setVoiceError({ code: "permission_denied", message: t("voice.errors.permissionDenied") });
          releaseSession();
          return;
        }
      }

      const recognitionOptions = await resolveRecognitionOptions();
      if (!recognitionOptions || activeSessionId !== sessionId) {
        releaseSession();
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      ExpoSpeechRecognitionModule.start({
        lang: recognitionOptions.lang,
        interimResults: true,
        continuous: true,
        // Prefer on-device recognition whenever the native engine reports support; otherwise use its configured fallback service.
        requiresOnDeviceRecognition: recognitionOptions.requiresOnDeviceRecognition,
      });
    } catch (startError) {
      setVoiceError(getErrorForNativeCode("start-failed", startError instanceof Error ? startError.message : ""));
      setIsListening(false);
      releaseSession();
    }
  }, [hasPermission, releaseSession, resolveRecognitionOptions, sessionId, setVoiceError]);

  const stopListening = useCallback(async () => {
    if (activeSessionId !== sessionId) return;
    clearInactivityTimer();
    commitTranscript(transcriptRef.current);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setIsListening(false);
      setVoiceError({ code: "service_unavailable", message: t("voice.errors.unavailable") });
      releaseSession();
    }
  }, [clearInactivityTimer, commitTranscript, releaseSession, sessionId, setVoiceError]);

  const abortListening = useCallback(() => {
    if (activeSessionId !== sessionId) return;
    clearInactivityTimer();
    transcriptRef.current = "";
    committedTranscriptRef.current = "";
    setTranscript("");
    setIsListening(false);
    releaseSession();
    ExpoSpeechRecognitionModule.abort();
  }, [clearInactivityTimer, releaseSession, sessionId]);

  const cancelListening = abortListening;

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      ExpoSpeechRecognitionModule.getPermissionsAsync(),
      Promise.resolve().then(() => {
        const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
        const recordingSupported = ExpoSpeechRecognitionModule.supportsRecording();
        return { available, recordingSupported };
      }),
    ]).then(([permission, device]) => {
      if (!mounted) return;
      setHasPermission(permission.granted);
      setPermissionCanAskAgain(permission.canAskAgain);
      setIsRecognitionAvailable(device.available);
      setIsRecordingSupported(device.recordingSupported);
      if (!device.available) setVoiceError({ code: "service_unavailable", message: t("voice.errors.unavailable") });
    }).catch(() => undefined);

    return () => {
      mounted = false;
      clearInactivityTimer();
      if (activeSessionId === sessionId) {
        activeSessionId = null;
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [clearInactivityTimer, sessionId, setVoiceError]);

  return {
    isListening,
    transcript,
    error,
    hasPermission,
    permissionCanAskAgain,
    isRecognitionAvailable,
    isRecordingSupported,
    resolvedLocale,
    startListening,
    stopListening,
    abortListening,
    cancelListening,
  };
}
