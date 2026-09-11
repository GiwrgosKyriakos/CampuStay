import {
  sendSigningOtp as sendTwilioSigningOtp,
  verifySigningOtp as verifyTwilioSigningOtp,
} from "@/src/api/contracts";
import { startFirebasePhoneVerification } from "@/src/services/signingOtpPlatform";
import { logOtpTerminalDiagnostic } from "@/src/services/otpDiagnostics";

export type OtpProvider = "twilio" | "firebase";

export type OtpVerificationResult = {
  verified: boolean;
  verifiedAt: number;
  verificationId?: string;
  verificationToken?: string;
};

export type OtpConfirmation = {
  confirm: (code: string) => Promise<{ user: { getIdToken: (forceRefresh?: boolean) => Promise<string> } }>;
};

export type FirebasePhoneAuthHandler = {
  startPhoneVerification: (params: { phone: string; signerId: string }) => Promise<{
    confirmation: OtpConfirmation;
    cleanup?: () => void;
  }>;
};

export type SigningOtpSession =
  | { provider: "twilio"; phone: string }
  | {
      provider: "firebase";
      phone: string;
      confirmation: OtpConfirmation;
      cleanup: () => void;
    };

export type SigningOtpSendResult = {
  provider: OtpProvider;
  delivered: boolean;
  expiresInSeconds: number;
  session: SigningOtpSession;
};

export class OtpProviderUnavailableError extends Error {
  code = "otp-provider-unavailable";

  constructor(message: string) {
    super(message);
    this.name = "OtpProviderUnavailableError";
  }
}

let firebasePhoneAuthHandler: FirebasePhoneAuthHandler | null = null;

export function configureFirebasePhoneAuthHandler(handler: FirebasePhoneAuthHandler | null): void {
  firebasePhoneAuthHandler = handler;
}

export function normalizeE164PhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let normalizedDigits = digits;
  if (trimmed.startsWith("00")) normalizedDigits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length === 10) normalizedDigits = `30${digits}`;
  else if (!trimmed.startsWith("+") && !digits.startsWith("30")) return null;

  if (!/^[1-9]\d{7,14}$/.test(normalizedDigits)) return null;
  return `+${normalizedDigits}`;
}

function configuredProvider(): OtpProvider {
  return process.env.EXPO_PUBLIC_OTP_PROVIDER === "firebase" ? "firebase" : "twilio";
}

function callableErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.replace(/^functions\//, "") : "";
}

function providerCandidates(): OtpProvider[] {
  return [configuredProvider()];
}

async function startFirebaseOtp(phone: string, signerId: string): Promise<SigningOtpSession> {
  if (firebasePhoneAuthHandler) {
    const result = await firebasePhoneAuthHandler.startPhoneVerification({ phone, signerId });
    return {
      provider: "firebase",
      phone,
      confirmation: result.confirmation,
      cleanup: result.cleanup ?? (() => undefined),
    };
  }

  try {
    const result = await startFirebasePhoneVerification({ phone, signerId });
    return { provider: "firebase", phone, confirmation: result.confirmation, cleanup: result.cleanup ?? (() => undefined) };
  } catch (error) {
    if (error instanceof OtpProviderUnavailableError) throw error;
    throw new OtpProviderUnavailableError(error instanceof Error ? error.message : "Firebase phone authentication is unavailable.");
  }
}

export async function startSigningOtp(params: { contractId: string; signerId: string; phone: string }): Promise<SigningOtpSendResult> {
  const phone = normalizeE164PhoneNumber(params.phone);
  if (!phone) throw new Error("A valid E.164 phone number is required.");

  const candidates = providerCandidates();
  let lastError: unknown;
  for (const provider of candidates) {
    try {
      if (provider === "twilio") {
        const result = await sendTwilioSigningOtp(params.contractId, params.signerId);
        return { ...result, provider, session: { provider, phone } };
      }

      const session = await startFirebaseOtp(phone, params.signerId);
      return { provider, delivered: true, expiresInSeconds: 600, session };
    } catch (error) {
      lastError = error;
      logOtpTerminalDiagnostic({
        phase: "provider-dispatch",
        targetPhoneNumber: phone,
        authMethod: provider === "firebase" ? "signInWithPhoneNumber" : "httpsCallable.sendSigningOtp",
        error,
        details: { provider, contractId: params.contractId, signerId: params.signerId },
      });
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new OtpProviderUnavailableError("No OTP provider is available.");
}

export async function verifySigningOtpSession(params: {
  contractId: string;
  signerId: string;
  code: string;
  session: SigningOtpSession;
}): Promise<OtpVerificationResult> {
  if (params.session.provider === "twilio") {
    return verifyTwilioSigningOtp(params.contractId, params.signerId, params.code);
  }

  try {
    const credential = await params.session.confirmation.confirm(params.code);
    const firebaseIdToken = await credential.user.getIdToken(true);
    const result = await verifyTwilioSigningOtp(params.contractId, params.signerId, params.code, {
      provider: "firebase",
      firebaseIdToken,
    });
    params.session.cleanup();
    return result;
  } catch (error) {
    logOtpTerminalDiagnostic({
      phase: "provider-confirm",
      targetPhoneNumber: params.session.phone,
      authMethod: params.session.provider === "firebase" ? "signInWithPhoneNumber.confirm" : "httpsCallable.verifySigningOtp",
      error,
      details: { provider: params.session.provider, contractId: params.contractId, signerId: params.signerId },
    });
    throw error;
  }
}

export function getOtpProviderLabel(provider: OtpProvider): string {
  return provider === "firebase" ? "Firebase" : "SMS";
}
