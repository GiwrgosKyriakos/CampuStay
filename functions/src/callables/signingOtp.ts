import { createHash, randomInt, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { validateContractTemplate } from "../lib/contractTemplates";
import { getShortLivedStorageUrl } from "../lib/mailOutbox";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

type ContractData = {
  agencyId?: unknown;
  brokerId?: unknown;
  createdByUserId?: unknown;
  clientId?: unknown;
  ownerId?: unknown;
  contractType?: unknown;
  templateVersion?: unknown;
  propertyCode?: unknown;
  apartmentAddress?: unknown;
  pdfStoragePath?: unknown;
  finalPdfStoragePath?: unknown;
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
  otpVerificationId?: unknown;
  otpVerifiedAt?: unknown;
  idCardPhotoUrl?: unknown;
  idCardBackPhotoUrl?: unknown;
  idCaptureTimestamp?: unknown;
  idDocumentType?: unknown;
  idCaptureMetadata?: unknown;
  ipAddress?: unknown;
  deviceInfo?: unknown;
};

type LedgerEvidence = {
  signerId: string;
  signerName: string;
  signerRole: string;
  signerPhone: string;
  signerEmail: string;
  signerAfm?: string;
  signerIdCardNumber?: string;
  signatureBase64: string;
  serverTimestamp: Timestamp;
  ipAddress?: string;
  evidenceId: string;
  deviceAttestation?: string;
  gpsCoordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    classification: "corroborating";
  };
  otpVerified: boolean;
  otpVerificationId?: string;
  otpVerifiedAt?: number;
  idCardPhotoUrl?: string;
  idCardBackPhotoUrl?: string;
  idCaptureTimestamp: number;
  idDocumentType: "national_id" | "passport";
  idCaptureMetadata: {
    front: { width: number; height: number; fileSizeBytes: number; idCaptureTimestamp: number; idDocumentType: "national_id" | "passport" };
    back: { width: number; height: number; fileSizeBytes: number; idCaptureTimestamp: number; idDocumentType: "national_id" | "passport" };
  };
  pdfStoragePath: string;
  pdfSha256Hash: string;
};

function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return uid;
}

function isExecutiveRole(value: unknown): boolean {
  return value === "ceo" || value === "secretary" || value === "secretariat";
}

function sanitizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
  return sanitized || undefined;
}

function getRequestIp(request: CallableRequest<unknown>): string | undefined {
  const directIp = sanitizeText(request.rawRequest?.ip, 64);
  if (directIp) return directIp;
  const forwarded = request.rawRequest?.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return sanitizeText(typeof forwardedValue === "string" ? forwardedValue.split(",")[0] : undefined, 64);
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

function hashVerificationToken(contractId: string, signerId: string, token: string): string {
  const secret = process.env.SIGNING_OTP_SECRET || "campustay-signing-otp";
  return createHash("sha256").update(`${secret}:verification:${contractId}:${signerId}:${token}`).digest("hex");
}

async function getAuthoritativePdfHash(storagePath: string, submittedHash: string): Promise<string> {
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "The uploaded PDF could not be found.");
  let contents: Buffer;
  try {
    [contents] = await file.download();
  } catch (error) {
    logger.error("Failed to download source PDF for hash validation", { storagePath, error });
    throw new HttpsError("internal", "The uploaded PDF could not be validated.");
  }
  const authoritativeHash = createHash("sha256").update(contents).digest("hex");
  if (authoritativeHash !== submittedHash.toLowerCase()) throw new HttpsError("invalid-argument", "The submitted PDF hash does not match the uploaded bytes.");
  return authoritativeHash;
}

function isValidIdCaptureMetadata(value: unknown, documentType: "national_id" | "passport"): value is { front: Record<string, unknown>; back: Record<string, unknown> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return ["front", "back"].every((side) => {
    const entry = metadata[side];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    const width = Number(item.width);
    const height = Number(item.height);
    const fileSizeBytes = Number(item.fileSizeBytes);
    const captureTimestamp = Number(item.idCaptureTimestamp);
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    const aspectRatio = longSide / shortSide;
    return Number.isInteger(width) && Number.isInteger(height) && longSide >= 1000 && shortSide >= 600
      && Number.isFinite(aspectRatio) && aspectRatio >= 1.2 && aspectRatio <= 2
      && Number.isInteger(fileSizeBytes) && fileSizeBytes > 0 && fileSizeBytes < 10 * 1024 * 1024
      && Number.isFinite(captureTimestamp) && captureTimestamp > 0 && item.idDocumentType === documentType;
  });
}

function signerFor(contract: ContractData, signerId: string): SignatureEvidence | undefined {
  const signers = Array.isArray(contract.signers) ? contract.signers : [];
  return signers.find((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId) as SignatureEvidence | undefined;
}

function isExternalSigner(signer: SignatureEvidence | undefined): boolean {
  return signer?.signerRole !== "broker";
}

async function requireSigningOtp(contractId: string, signerId: string, uid: string, verificationToken: string): Promise<{ verifiedAt: number }> {
  const otpSnapshot = await db.doc(`signingOtps/${contractId}_${signerId}`).get();
  const otp = otpSnapshot.data() ?? {};
  const verifiedAt = Number(otp.verifiedAt ?? 0);
  const tokenMatches = Boolean(verificationToken) && otp.verificationTokenHash === hashVerificationToken(contractId, signerId, verificationToken);
  if (!otpSnapshot.exists || verifiedAt <= 0 || Date.now() > Number(otp.expiresAt ?? 0) || (uid !== signerId && !tokenMatches)) {
    throw new HttpsError("failed-precondition", "A valid phone OTP verification is required for external signers.");
  }
  return { verifiedAt };
}

async function dispatchSms(phone: string, code: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return false;

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `CampuStay: Ο κωδικός υπογραφής σας είναι ${code}. Ισχύει για 10 λεπτά.`,
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
  const isDevelopment = process.env.FUNCTIONS_EMULATOR === "true" || (process.env.NODE_ENV !== "production" && process.env.SIGNING_OTP_ALLOW_DEBUG === "true");
  if (!delivered && !isDevelopment) {
    logger.error("Signing OTP provider is not configured", { contractId, signerId });
    throw new HttpsError("failed-precondition", "SMS delivery is not configured.");
  }
  if (!delivered) logger.warn("Signing OTP is available only through the development response", { contractId, signerId });
  return { delivered, expiresInSeconds: OTP_TTL_MS / 1000, ...(isDevelopment ? { debugCode: code } : {}) };
});

export const verifySigningOtp = onCall(async (request) => {
  const { uid, contractRef, contract, signerId } = await loadAuthorizedContract(request);
  if (isExternalSigner(signerFor(contract, signerId)) && uid !== signerId) throw new HttpsError("permission-denied", "Only the signer can verify an external signing OTP.");
  const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "A six-digit code is required.");
  const otpRef = db.doc(`signingOtps/${contractRef.id}_${signerId}`);
  return db.runTransaction(async (transaction) => {
    const [latestOtpSnapshot, contractSnapshot] = await Promise.all([transaction.get(otpRef), transaction.get(contractRef)]);
    if (!latestOtpSnapshot.exists || !contractSnapshot.exists) throw new HttpsError("failed-precondition", "No active verification request exists.");
    const now = Date.now();
    const otp = latestOtpSnapshot.data() ?? {};
    if (Number(otp.verifiedAt ?? 0) > 0) return { verified: true, verifiedAt: Number(otp.verifiedAt), verificationId: typeof otp.verificationId === "string" ? otp.verificationId : undefined };
    if (now > Number(otp.expiresAt ?? 0)) throw new HttpsError("deadline-exceeded", "The verification code has expired.");
    const attempts = Number(otp.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS || otp.codeHash === null) throw new HttpsError("resource-exhausted", "Too many invalid verification attempts.");
    if (otp.codeHash !== hashCode(contractRef.id, signerId, code)) {
      const nextAttempts = attempts + 1;
      transaction.update(otpRef, { attempts: nextAttempts, ...(nextAttempts >= MAX_ATTEMPTS ? { codeHash: null, invalidatedAt: now } : {}) });
      throw new HttpsError(nextAttempts >= MAX_ATTEMPTS ? "resource-exhausted" : "invalid-argument", nextAttempts >= MAX_ATTEMPTS ? "Too many invalid verification attempts." : "The verification code is incorrect.");
    }
    const verifiedAt = now;
    const verificationToken = randomUUID();
    const verificationId = randomUUID();
    transaction.update(otpRef, { verifiedAt, verifiedByUid: uid, verificationId, verificationTokenHash: hashVerificationToken(contractRef.id, signerId, verificationToken) });
    transaction.update(contractRef, { updatedAt: verifiedAt });
    return { verified: true, verifiedAt, verificationId, verificationToken };
  });
});

export const recordSigningEvidence = onCall(async (request) => {
  const { uid, contractRef, contract, signerId } = await loadAuthorizedContract(request);
  const originalSigner = signerFor(contract, signerId);
  if (!originalSigner) throw new HttpsError("permission-denied", "Signer is not part of this contract.");
  const evidence = request.data?.evidence as SignatureEvidence | undefined;
  if (!evidence || evidence.signerId !== signerId || typeof evidence.signatureBase64 !== "string" || evidence.signatureBase64.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Complete signature evidence is required.");
  }
  const signatureBase64 = evidence.signatureBase64.trim();
  if (signatureBase64.length > 700_000) throw new HttpsError("invalid-argument", "The signature evidence is too large.");
  const idCaptureTimestamp = Number(evidence.idCaptureTimestamp);
  const idDocumentType = evidence.idDocumentType === "passport" || evidence.idDocumentType === "national_id" ? evidence.idDocumentType : undefined;
  const idCaptureMetadata = evidence.idCaptureMetadata;
  const idCardPhotoUrl = sanitizeText(evidence.idCardPhotoUrl, 2048);
  const idCardBackPhotoUrl = sanitizeText(evidence.idCardBackPhotoUrl, 2048);
  if (!idCardPhotoUrl || !idCardBackPhotoUrl || !idDocumentType || !Number.isFinite(idCaptureTimestamp) || idCaptureTimestamp <= 0 || !isValidIdCaptureMetadata(idCaptureMetadata, idDocumentType)) {
    throw new HttpsError("invalid-argument", "Both ID images and valid capture metadata are required.");
  }
  const coords = evidence.locationCoords as { latitude?: unknown; longitude?: unknown; accuracyMeters?: unknown } | undefined;
  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  const accuracyMeters = Number(coords?.accuracyMeters);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new HttpsError("invalid-argument", "Valid GPS evidence is required.");
  const pdfStoragePath = typeof request.data?.pdfStoragePath === "string" ? request.data.pdfStoragePath.trim() : "";
  const pdfSha256Hash = typeof request.data?.pdfSha256Hash === "string" ? request.data.pdfSha256Hash.trim() : "";
  if (!pdfStoragePath.startsWith(`contracts/${contractRef.id}/source/`) || !/^[a-f0-9]{64}$/i.test(pdfSha256Hash)) throw new HttpsError("invalid-argument", "A valid contract PDF and SHA-256 hash are required.");
  const authoritativePdfHash = await getAuthoritativePdfHash(pdfStoragePath, pdfSha256Hash);
  const otp = isExternalSigner(originalSigner)
    ? await requireSigningOtp(contractRef.id, signerId, uid, typeof request.data?.verificationToken === "string" ? request.data.verificationToken.trim() : "")
    : undefined;
  const serverTimestamp = Timestamp.now();
  const evidenceId = randomUUID();
  const ledgerEvidence: LedgerEvidence = {
    signerId,
    signerName: sanitizeText(originalSigner.signerName, 200) ?? "Signer",
    signerRole: sanitizeText(originalSigner.signerRole, 32) ?? "unknown",
    signerPhone: sanitizeText(originalSigner.signerPhone, 64) ?? "",
    signerEmail: sanitizeText(originalSigner.signerEmail, 320) ?? "",
    ...(sanitizeText(evidence.signerAfm, 32) ? { signerAfm: sanitizeText(evidence.signerAfm, 32) } : {}),
    ...(sanitizeText(evidence.signerIdCardNumber, 64) ? { signerIdCardNumber: sanitizeText(evidence.signerIdCardNumber, 64) } : {}),
    signatureBase64,
    serverTimestamp,
    ...(getRequestIp(request) ? { ipAddress: getRequestIp(request) } : {}),
    evidenceId,
    ...(sanitizeText(evidence.deviceInfo, 256) ? { deviceAttestation: sanitizeText(evidence.deviceInfo, 256) } : {}),
    gpsCoordinates: { latitude, longitude, accuracyMeters, classification: "corroborating" },
    otpVerified: Boolean(otp),
    ...(otp && typeof evidence.otpVerificationId === "string" && evidence.otpVerificationId.trim() ? { otpVerificationId: evidence.otpVerificationId.trim() } : {}),
    ...(otp ? { otpVerifiedAt: otp.verifiedAt } : {}),
    idCardPhotoUrl,
    idCardBackPhotoUrl,
    idCaptureTimestamp,
    idDocumentType,
    idCaptureMetadata: idCaptureMetadata as LedgerEvidence["idCaptureMetadata"],
    pdfStoragePath,
    pdfSha256Hash: authoritativePdfHash,
  };

  const updated = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(contractRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Contract not found.");
    const current = snapshot.data() as ContractData;
    if (current.status === "cancelled") throw new HttpsError("failed-precondition", "Contract is cancelled.");
    const currentSigners = Array.isArray(current.signers) ? current.signers : [];
    const requiredSignerIds = Array.isArray(current.requiredSignerIds) ? current.requiredSignerIds.filter((value): value is string => typeof value === "string") : [];
    const ledgerSnapshot = await transaction.get(contractRef.collection("signatures_ledger"));
    if (currentSigners.some((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId && typeof (entry as { signatureBase64?: unknown }).signatureBase64 === "string" && (entry as { signatureBase64: string }).signatureBase64.trim().length > 0)
      || ledgerSnapshot.docs.some((entry) => entry.data().signerId === signerId)) {
      throw new HttpsError("failed-precondition", "This signer has already signed the contract.");
    }
    const signedSignerIds = new Set(ledgerSnapshot.docs.map((entry) => entry.data().signerId).filter((value): value is string => typeof value === "string"));
    signedSignerIds.add(signerId);
    const allSigned = requiredSignerIds.length > 0 && requiredSignerIds.every((requiredId) => signedSignerIds.has(requiredId));
    const now = serverTimestamp.toMillis();
    const ledgerBySigner = new Map<string, Record<string, unknown>>();
    for (const ledgerEntry of ledgerSnapshot.docs) {
      const entry = ledgerEntry.data();
      if (typeof entry.signerId === "string") ledgerBySigner.set(entry.signerId, entry);
    }
    for (const entry of currentSigners) {
      if (!entry || typeof entry !== "object") continue;
      const signer = entry as Record<string, unknown>;
      if (typeof signer.signerId === "string") ledgerBySigner.set(signer.signerId, signer);
    }
    const currentEvidence = { ...(ledgerBySigner.get(signerId) ?? {}), ...(currentSigners.find((entry) => entry && typeof entry === "object" && (entry as { signerId?: unknown }).signerId === signerId) as Record<string, unknown> ?? {}), ...evidence, signerId };
    ledgerBySigner.set(signerId, currentEvidence);
    const projectedSigners = currentSigners.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const signer = entry as Record<string, unknown>;
      const ledger = typeof signer.signerId === "string" ? ledgerBySigner.get(signer.signerId) : undefined;
      return ledger ? { ...signer, ...ledger } : entry;
    });
    const validatedTemplate = allSigned
      ? validateContractTemplate({ ...current, signers: projectedSigners, contractPayload: current.contractPayload })
      : undefined;
    transaction.create(contractRef.collection("signatures_ledger").doc(evidenceId), ledgerEvidence);
    const updates = {
      status: allSigned ? "signed" : "pending_signatures",
      updatedAt: now,
      ...(allSigned ? { completedAt: now } : {}),
      pdfStoragePath,
      pdfSha256Hash: authoritativePdfHash,
      ...(allSigned ? { finalDocumentHash: authoritativePdfHash } : {}),
      ...(validatedTemplate ? { contractPayload: validatedTemplate.payload } : {}),
    };
    transaction.update(contractRef, updates);
    return { id: contractRef.id, ...current, ...updates, evidenceId, serverTimestamp: now };
  });
  return updated;
});

export const getContractDownloadUrl = onCall(async (request) => {
  const uid = requireAuth(request);
  const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
  if (!contractId) throw new HttpsError("invalid-argument", "Contract is required.");
  const contractSnapshot = await db.doc(`contracts/${contractId}`).get();
  if (!contractSnapshot.exists) throw new HttpsError("not-found", "Contract not found.");
  const contract = contractSnapshot.data() as ContractData;
  if (contract.status !== "signed") throw new HttpsError("failed-precondition", "Only completed contracts can be downloaded.");
  const requiredSignerIds = Array.isArray(contract.requiredSignerIds) ? contract.requiredSignerIds : [];
  const directParticipant = [contract.createdByUserId, contract.brokerId, contract.clientId, contract.ownerId].includes(uid) || requiredSignerIds.includes(uid);
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const user = userSnapshot.data() ?? {};
  const agencyStaff = user.agencyId === contract.agencyId && (user.is_broker === true || isExecutiveRole(user.agencyRole) || isExecutiveRole(user.role));
  if (!directParticipant && !agencyStaff) throw new HttpsError("permission-denied", "You cannot download this contract.");
  const storagePath = typeof contract.finalPdfStoragePath === "string" && contract.finalPdfStoragePath.trim()
    ? contract.finalPdfStoragePath.trim()
    : typeof contract.pdfStoragePath === "string" ? contract.pdfStoragePath.trim() : "";
  if (!storagePath) throw new HttpsError("failed-precondition", "The contract has no downloadable document.");
  const url = await getShortLivedStorageUrl(storagePath);
  return { url, expiresAt: Date.now() + 60 * 60 * 1000 };
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
  const allowedKeys = new Set(["commissionRatePercentage", "commissionAmountCalculated", "customTerms", "monthlyRentOrPrice", "houseRulesConfig", "holdingDepositAmount", "assignmentMode", "agreedListingPrice", "durationMonths", "utilitySplitPercentages", "holdingDepositTerms", "bankReference", "cashReceiptNote", "refundabilityConditions"]);
  const payload = Object.fromEntries(Object.entries(requestedPayload as Record<string, unknown>).filter(([key]) => allowedKeys.has(key)));
  const currentPayload = contract.contractPayload && typeof contract.contractPayload === "object" && !Array.isArray(contract.contractPayload)
    ? contract.contractPayload as Record<string, unknown>
    : {};
  const now = Date.now();
  const updated = { id: contractRef.id, ...contract, contractPayload: { ...currentPayload, ...payload }, updatedAt: now };
  await contractRef.update({ contractPayload: updated.contractPayload, updatedAt: now });
  return updated;
});