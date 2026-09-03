import { createHash, randomInt } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type ContractData = {
  agencyId?: unknown;
  brokerId?: unknown;
  createdByUserId?: unknown;
  signers?: unknown;
  status?: unknown;
  requiredSignerIds?: unknown;
  contractPayload?: unknown;
};

type SignatureEvidence = {
  signerId?: unknown;
  signerName?: unknown;
  signerRole?: unknown;
  signerAfm?: unknown;
  signerIdCardNumber?: unknown;
  signerPhone?: unknown;
  signerEmail?: unknown;
  signatureBase64?: unknown;
  signedAt?: unknown;
  locationCoords?: unknown;
  otpVerified?: unknown;
  otpVerifiedAt?: unknown;
  idCardPhotoUrl?: unknown;
  idCardBackPhotoUrl?: unknown;
  ipAddress?: unknown;
  deviceInfo?: unknown;
};

function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return uid;
}

function isExecutiveRole(value: unknown): boolean {
  return value === "ceo" || value === "secretary" || value === "secretariat";
}

async function canOperateContract(uid: string, contract: ContractData, signerId: string): Promise<boolean> {
  if (uid === signerId || uid === contract.brokerId || uid === contract.createdByUserId) return true;
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const user = userSnapshot.data() as { agencyId?: unknown; agencyRole?: unknown; role?: unknown; is_broker?: unknown } | undefined;
  return user?.agencyId === contract.agencyId && (user?.is_broker === true || isExecutiveRole(user?.agencyRole) || isExecutiveRole(user?.role));
}

async function loadAuthorizedContract(request: CallableRequest<{ contractId?: unknown; signerId?: unknown }>): Promise<{ uid: string; contractRef: FirebaseFirestore.DocumentReference<DocumentData>; contract: ContractData; signerId: string }> {
  const uid = requireAuth(request);
  const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
  const signerId = typeof request.data?.signerId === "string" ? request.data.signerId.trim() : "";
  if (!contractId || !signerId) throw new HttpsError("invalid-argument", "Contract and signer are required.");

  const contractRef = db.doc(`contracts/${contractId}`);
  const snapshot = await contractRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Contract not found.");
  const contract = snapshot.data() as ContractData;
  if (contract.status === "cancelled") throw new HttpsError("failed-precondition", "Contract is cancelled.");
  const signers = Array.isArray(contract.signers) ? contract.signers : [];
  if (!signers.some((signer) => signer && typeof signer === "object" && (signer as { signerId?: unknown }).signerId === signerId)) {
    throw new HttpsError("permission-denied", "Signer is not part of this contract.");
  }
  if (!(await canOperateContract(uid, contract, signerId))) throw new HttpsError("permission-denied", "You cannot operate this contract.");
  return { uid, contractRef, contract, signerId };
}

function hashCode(contractId: string, signerId: string, code: string): string {
  const secret = process.env.SIGNING_OTP_SECRET || "campustay-signing-otp";
  return createHash("sha256").update(`${secret}:${contractId}:${signerId}:${code}`).digest("hex");
}

async function dispatchSms(phone: string, code: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return false;

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `CampuStay: Ο κωδικός υπογραφής σας είναι ${code}. Ισχύει για 5 λεπτά.`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    logger.error("Signing OTP SMS provider rejected the request", { status: response.status });
    throw new HttpsError("internal", "The SMS provider rejected the request.");
  }
  return true;
}

export const sendSigningOtp = onCall(async (request) => {
  const { contractRef, contract, signerId } = await loadAuthorizedContract(request);
  const signers = Array.isArray(contract.signers) ? contract.signers : [];
  const signer = signers.find((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId) as { signerPhone?: unknown } | undefined;
  const phone = typeof signer?.signerPhone === "string" ? signer.signerPhone.trim() : "";
  if (!phone) throw new HttpsError("failed-precondition", "The signer has no phone number.");

  const contractId = contractRef.id;
  const otpRef = db.doc(`signingOtps/${contractId}_${signerId}`);
  const existing = await otpRef.get();
  const lastSentAt = Number(existing.data()?.sentAt ?? 0);
  if (Date.now() - lastSentAt < 30_000) throw new HttpsError("resource-exhausted", "Please wait before requesting another code.");

  const code = String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + OTP_TTL_MS;
  await otpRef.set({ contractId, signerId, codeHash: hashCode(contractId, signerId, code), sentAt: Date.now(), expiresAt, attempts: 0, verifiedAt: null }, { merge: true });

  const delivered = await dispatchSms(phone, code);
  const isDevelopment = process.env.FUNCTIONS_EMULATOR === "true" || process.env.SIGNING_OTP_ALLOW_DEBUG === "true";
  if (!delivered && !isDevelopment) {
    logger.error("Signing OTP provider is not configured", { contractId, signerId });
    throw new HttpsError("failed-precondition", "SMS delivery is not configured.");
  }
  if (!delivered) logger.warn("Signing OTP is available only through the development response", { contractId, signerId });
  return { delivered, expiresInSeconds: OTP_TTL_MS / 1000, ...(isDevelopment ? { debugCode: code } : {}) };
});

export const verifySigningOtp = onCall(async (request) => {
  const { contractRef, signerId } = await loadAuthorizedContract(request);
  const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "A six-digit code is required.");
  const otpRef = db.doc(`signingOtps/${contractRef.id}_${signerId}`);
  const now = Date.now();
  const otpSnapshot = await otpRef.get();
  if (!otpSnapshot.exists) throw new HttpsError("failed-precondition", "No active verification request exists.");
  const otp = otpSnapshot.data() ?? {};
  if (Number(otp.verifiedAt ?? 0) > 0) return { verified: true, verifiedAt: Number(otp.verifiedAt) };
  if (now > Number(otp.expiresAt ?? 0)) throw new HttpsError("deadline-exceeded", "The verification code has expired.");
  const attempts = Number(otp.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) throw new HttpsError("resource-exhausted", "Too many invalid verification attempts.");
  if (otp.codeHash !== hashCode(contractRef.id, signerId, code)) {
    await otpRef.update({ attempts: attempts + 1 });
    throw new HttpsError("invalid-argument", "The verification code is incorrect.");
  }

  return db.runTransaction(async (transaction) => {
    const [latestOtpSnapshot, contractSnapshot] = await Promise.all([transaction.get(otpRef), transaction.get(contractRef)]);
    if (!latestOtpSnapshot.exists || !contractSnapshot.exists) throw new HttpsError("failed-precondition", "No active verification request exists.");
    if (Number(latestOtpSnapshot.data()?.verifiedAt ?? 0) > 0) return { verified: true, verifiedAt: Number(latestOtpSnapshot.data()?.verifiedAt) };
    const verifiedAt = Date.now();
    const contractData = contractSnapshot.data() as ContractData;
    const signers = Array.isArray(contractData.signers) ? contractData.signers : [];
    const nextSigners = signers.map((signer) => signer && typeof signer === "object" && (signer as { signerId?: unknown }).signerId === signerId
      ? { ...signer, otpVerified: true, otpVerifiedAt: verifiedAt }
      : signer);
    transaction.update(otpRef, { verifiedAt });
    transaction.update(contractRef, { signers: nextSigners, updatedAt: verifiedAt });
    return { verified: true, verifiedAt };
  });
});

export const recordSigningEvidence = onCall(async (request) => {
  const { contractRef, signerId } = await loadAuthorizedContract(request);
  const evidence = request.data?.evidence as SignatureEvidence | undefined;
  if (!evidence || evidence.signerId !== signerId || typeof evidence.signatureBase64 !== "string" || evidence.signatureBase64.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Complete signature evidence is required.");
  }
  const signedAt = Number(evidence.signedAt);
  const coords = evidence.locationCoords as { latitude?: unknown; longitude?: unknown; accuracyMeters?: unknown } | undefined;
  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  const accuracyMeters = Number(coords?.accuracyMeters);
  if (!Number.isFinite(signedAt) || signedAt <= 0 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    throw new HttpsError("invalid-argument", "Valid timestamp and GPS evidence are required.");
  }
  const pdfStoragePath = typeof request.data?.pdfStoragePath === "string" ? request.data.pdfStoragePath.trim() : "";
  const pdfStorageUrl = typeof request.data?.pdfStorageUrl === "string" ? request.data.pdfStorageUrl.trim() : "";
  const pdfSha256Hash = typeof request.data?.pdfSha256Hash === "string" ? request.data.pdfSha256Hash.trim() : "";
  if (pdfStoragePath && !pdfStoragePath.startsWith(`contracts/${contractRef.id}/source/`)) {
    throw new HttpsError("invalid-argument", "The PDF source does not belong to this contract.");
  }
  if (pdfSha256Hash && !/^[a-f0-9]{64}$/i.test(pdfSha256Hash)) {
    throw new HttpsError("invalid-argument", "A valid SHA-256 hash is required.");
  }
  const otpVerified = evidence.otpVerified === true;
  if (otpVerified) {
    const otpSnapshot = await db.doc(`signingOtps/${contractRef.id}_${signerId}`).get();
    if (!otpSnapshot.exists || Number(otpSnapshot.data()?.verifiedAt ?? 0) <= 0) {
      throw new HttpsError("failed-precondition", "OTP verification evidence is not valid.");
    }
  }

  const updated = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(contractRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Contract not found.");
    const current = snapshot.data() as ContractData;
    if (current.status === "cancelled") throw new HttpsError("failed-precondition", "Contract is cancelled.");
    const currentSigners = Array.isArray(current.signers) ? current.signers : [];
    const originalSigner = currentSigners.find((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId) as SignatureEvidence | undefined;
    if (!originalSigner) {
      throw new HttpsError("permission-denied", "Signer is not part of this contract.");
    }
    const nextSigners = currentSigners.map((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId
      ? {
        ...originalSigner,
        ...evidence,
        signerId: originalSigner.signerId,
        signerName: originalSigner.signerName,
        signerRole: originalSigner.signerRole,
        signerPhone: originalSigner.signerPhone,
        signerEmail: originalSigner.signerEmail,
        locationCoords: { latitude, longitude, accuracyMeters },
        signedAt,
      }
      : entry);
    const requiredSignerIds = Array.isArray(current.requiredSignerIds) ? current.requiredSignerIds.filter((value): value is string => typeof value === "string") : [];
    const allSigned = requiredSignerIds.length > 0 && requiredSignerIds.every((requiredId) => nextSigners.some((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === requiredId && typeof (entry as { signatureBase64?: unknown }).signatureBase64 === "string" && (entry as { signatureBase64: string }).signatureBase64.trim().length > 0));
    const now = Date.now();
    const updates = {
      signers: nextSigners,
      status: allSigned ? "signed" : "pending_signatures",
      updatedAt: now,
      ...(allSigned ? { completedAt: now } : {}),
      ...(pdfStoragePath ? { pdfStoragePath } : {}),
      ...(pdfStorageUrl ? { pdfStorageUrl } : {}),
      ...(pdfSha256Hash ? { pdfSha256Hash } : {}),
    };
    transaction.update(contractRef, updates);
    return { id: contractRef.id, ...current, ...updates };
  });
  return updated;
});

export const updateContractPayload = onCall(async (request) => {
  const { uid, contractRef, contract } = await loadAuthorizedContract(request);
  if (uid !== contract.brokerId && uid !== contract.createdByUserId) throw new HttpsError("permission-denied", "Only the contract creator can edit contract details.");
  if (contract.status !== "pending_signatures") throw new HttpsError("failed-precondition", "Only pending contracts can be edited.");
  const signers = Array.isArray(contract.signers) ? contract.signers : [];
  if (signers.some((entry) => entry && typeof entry === "object" && typeof (entry as { signatureBase64?: unknown }).signatureBase64 === "string" && (entry as { signatureBase64: string }).signatureBase64.trim().length > 0)) {
    throw new HttpsError("failed-precondition", "The contract cannot be edited after a signature has been recorded.");
  }
  const requestedPayload = request.data?.payload;
  if (!requestedPayload || typeof requestedPayload !== "object" || Array.isArray(requestedPayload)) {
    throw new HttpsError("invalid-argument", "A contract payload is required.");
  }
  const allowedKeys = new Set(["commissionRatePercentage", "commissionAmountCalculated", "customTerms", "monthlyRentOrPrice", "houseRulesConfig", "holdingDepositAmount", "assignmentMode"]);
  const payload = Object.fromEntries(Object.entries(requestedPayload as Record<string, unknown>).filter(([key]) => allowedKeys.has(key)));
  const currentPayload = contract.contractPayload && typeof contract.contractPayload === "object" && !Array.isArray(contract.contractPayload)
    ? contract.contractPayload as Record<string, unknown>
    : {};
  const now = Date.now();
  const updated = { id: contractRef.id, ...contract, contractPayload: { ...currentPayload, ...payload }, updatedAt: now };
  await contractRef.update({ contractPayload: updated.contractPayload, updatedAt: now });
  return updated;
});