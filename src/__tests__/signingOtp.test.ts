jest.mock("@/src/api/contracts", () => ({
  sendSigningOtp: jest.fn(),
  verifySigningOtp: jest.fn(),
}));

jest.mock("@/src/config/firebase", () => ({
  firebaseAuth: { currentUser: { uid: "signer-1" } },
}));

jest.mock("react-native-webview", () => ({ WebView: "WebView" }));

import { sendSigningOtp, verifySigningOtp } from "@/src/api/contracts";
import {
  configureFirebasePhoneAuthHandler,
  startSigningOtp,
  verifySigningOtpSession,
} from "@/src/services/signingOtp";

describe("signing OTP provider strategy", () => {
  const originalProvider = process.env.EXPO_PUBLIC_OTP_PROVIDER;
  const originalFirebaseEnabled = process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    configureFirebasePhoneAuthHandler(null);
    delete process.env.EXPO_PUBLIC_OTP_PROVIDER;
    delete process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED;
  });

  afterAll(() => {
    if (originalProvider === undefined) delete process.env.EXPO_PUBLIC_OTP_PROVIDER;
    else process.env.EXPO_PUBLIC_OTP_PROVIDER = originalProvider;
    if (originalFirebaseEnabled === undefined) delete process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED;
    else process.env.EXPO_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED = originalFirebaseEnabled;
  });

  it("dispatches and verifies through Twilio by default", async () => {
    (sendSigningOtp as jest.Mock).mockResolvedValue({ delivered: true, expiresInSeconds: 600 });
    (verifySigningOtp as jest.Mock).mockResolvedValue({ verified: true, verifiedAt: 123, verificationId: "twilio-id", verificationToken: "token" });

    const sent = await startSigningOtp({ contractId: "contract-1", signerId: "signer-1", phone: "690 000 0000" });
    const verified = await verifySigningOtpSession({ contractId: "contract-1", signerId: "signer-1", code: "123456", session: sent.session });

    expect(sent.provider).toBe("twilio");
    expect(sendSigningOtp).toHaveBeenCalledWith("contract-1", "signer-1");
    expect(verified.verificationToken).toBe("token");
    expect(verifySigningOtp).toHaveBeenCalledWith("contract-1", "signer-1", "123456");
  });

  it("does not hide an unavailable explicitly selected Firebase provider", async () => {
    process.env.EXPO_PUBLIC_OTP_PROVIDER = "firebase";
    (sendSigningOtp as jest.Mock).mockResolvedValue({ delivered: true, expiresInSeconds: 600 });

    await expect(startSigningOtp({ contractId: "contract-2", signerId: "signer-1", phone: "+306900000000" })).rejects.toMatchObject({ code: "otp-provider-unavailable" });

    expect(sendSigningOtp).not.toHaveBeenCalled();
  });

  it("keeps a native confirmation session and bridges its ID token", async () => {
    process.env.EXPO_PUBLIC_OTP_PROVIDER = "firebase";
    const confirm = jest.fn().mockResolvedValue({ user: { getIdToken: jest.fn().mockResolvedValue("firebase-token") } });
    const cleanup = jest.fn();
    configureFirebasePhoneAuthHandler({ startPhoneVerification: jest.fn().mockResolvedValue({ confirmation: { confirm }, cleanup }) });
    (verifySigningOtp as jest.Mock).mockResolvedValue({ verified: true, verifiedAt: 456, verificationId: "firebase-id", verificationToken: "token" });

    const sent = await startSigningOtp({ contractId: "contract-3", signerId: "signer-1", phone: "+306900000000" });
    await verifySigningOtpSession({ contractId: "contract-3", signerId: "signer-1", code: "123456", session: sent.session });

    expect(sent.provider).toBe("firebase");
    expect(confirm).toHaveBeenCalledWith("123456");
    expect(verifySigningOtp).toHaveBeenCalledWith("contract-3", "signer-1", "123456", { provider: "firebase", firebaseIdToken: "firebase-token" });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
