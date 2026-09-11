import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from "firebase/auth";

import { firebasePhoneAuth } from "@/src/config/firebase";
import type { OtpConfirmation } from "@/src/services/signingOtp.shared";
import { OtpProviderUnavailableError } from "@/src/services/signingOtp.shared";
import { logOtpTerminalDiagnostic } from "@/src/services/otpDiagnostics";

export function NativeFirebaseRecaptchaHost(): null {
  return null;
}

function createRecaptchaHost(): { host: HTMLElement; cleanup: () => void } {
  if (typeof document === "undefined") {
    throw new OtpProviderUnavailableError("Firebase phone authentication requires a browser verifier.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  document.body.appendChild(host);
  return { host, cleanup: () => host.parentNode?.removeChild(host) };
}

export async function startFirebasePhoneVerification(params: { phone: string; signerId: string }): Promise<{ confirmation: OtpConfirmation; cleanup?: () => void }> {
  const recaptchaHost = createRecaptchaHost();
  const verifier = new RecaptchaVerifier(firebasePhoneAuth, recaptchaHost.host, { size: "invisible" });
  const cleanup = () => {
    verifier.clear();
    recaptchaHost.cleanup();
  };
  try {
    const confirmation = await signInWithPhoneNumber(firebasePhoneAuth, params.phone, verifier);
    return { confirmation, cleanup: () => { cleanup(); void signOut(firebasePhoneAuth); } };
  } catch (error) {
    logOtpTerminalDiagnostic({
      phase: "web-phone-dispatch",
      targetPhoneNumber: params.phone,
      authMethod: "signInWithPhoneNumber",
      error,
      details: { verifierType: "RecaptchaVerifier", firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID },
    });
    cleanup();
    throw error;
  }
}
