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
