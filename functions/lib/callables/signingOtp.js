"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContractPayload = exports.recordSigningEvidence = exports.verifySigningOtp = exports.sendSigningOtp = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    return uid;
}
function isExecutiveRole(value) {
    return value === "ceo" || value === "secretary" || value === "secretariat";
}
async function canOperateContract(uid, contract, signerId) {
    if (uid === signerId || uid === contract.brokerId || uid === contract.createdByUserId)
        return true;
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const user = userSnapshot.data();
    return user?.agencyId === contract.agencyId && (user?.is_broker === true || isExecutiveRole(user?.agencyRole) || isExecutiveRole(user?.role));
}
async function loadAuthorizedContract(request) {
    const uid = requireAuth(request);
    const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
    const signerId = typeof request.data?.signerId === "string" ? request.data.signerId.trim() : "";
    if (!contractId || !signerId)
        throw new https_1.HttpsError("invalid-argument", "Contract and signer are required.");
    const contractRef = db.doc(`contracts/${contractId}`);
    const snapshot = await contractRef.get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("not-found", "Contract not found.");
    const contract = snapshot.data();
    if (contract.status === "cancelled")
        throw new https_1.HttpsError("failed-precondition", "Contract is cancelled.");
    const signers = Array.isArray(contract.signers) ? contract.signers : [];
    if (!signers.some((signer) => signer && typeof signer === "object" && signer.signerId === signerId)) {
        throw new https_1.HttpsError("permission-denied", "Signer is not part of this contract.");
    }
    if (!(await canOperateContract(uid, contract, signerId)))
        throw new https_1.HttpsError("permission-denied", "You cannot operate this contract.");
    return { uid, contractRef, contract, signerId };
}
function hashCode(contractId, signerId, code) {
    const secret = process.env.SIGNING_OTP_SECRET || "campustay-signing-otp";
    return (0, node_crypto_1.createHash)("sha256").update(`${secret}:${contractId}:${signerId}:${code}`).digest("hex");
}
async function dispatchSms(phone, code) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!accountSid || !authToken || !from)
        return false;
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
        firebase_functions_1.logger.error("Signing OTP SMS provider rejected the request", { status: response.status });
        throw new https_1.HttpsError("internal", "The SMS provider rejected the request.");
    }
    return true;
}
exports.sendSigningOtp = (0, https_1.onCall)(async (request) => {
    const { contractRef, contract, signerId } = await loadAuthorizedContract(request);
    const signers = Array.isArray(contract.signers) ? contract.signers : [];
    const signer = signers.find((entry) => entry && typeof entry === "object" && entry.signerId === signerId);
    const phone = typeof signer?.signerPhone === "string" ? signer.signerPhone.trim() : "";
    if (!phone)
        throw new https_1.HttpsError("failed-precondition", "The signer has no phone number.");
    const contractId = contractRef.id;
    const otpRef = db.doc(`signingOtps/${contractId}_${signerId}`);
    const existing = await otpRef.get();
    const lastSentAt = Number(existing.data()?.sentAt ?? 0);
    if (Date.now() - lastSentAt < 30_000)
        throw new https_1.HttpsError("resource-exhausted", "Please wait before requesting another code.");
    const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
    const expiresAt = Date.now() + OTP_TTL_MS;
    await otpRef.set({ contractId, signerId, codeHash: hashCode(contractId, signerId, code), sentAt: Date.now(), expiresAt, attempts: 0, verifiedAt: null }, { merge: true });
    const delivered = await dispatchSms(phone, code);
    const isDevelopment = process.env.FUNCTIONS_EMULATOR === "true" || process.env.SIGNING_OTP_ALLOW_DEBUG === "true";
    if (!delivered && !isDevelopment) {
        firebase_functions_1.logger.error("Signing OTP provider is not configured", { contractId, signerId });
        throw new https_1.HttpsError("failed-precondition", "SMS delivery is not configured.");
    }
    if (!delivered)
        firebase_functions_1.logger.warn("Signing OTP is available only through the development response", { contractId, signerId });
    return { delivered, expiresInSeconds: OTP_TTL_MS / 1000, ...(isDevelopment ? { debugCode: code } : {}) };
});
exports.verifySigningOtp = (0, https_1.onCall)(async (request) => {
    const { contractRef, signerId } = await loadAuthorizedContract(request);
    const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
    if (!/^\d{6}$/.test(code))
        throw new https_1.HttpsError("invalid-argument", "A six-digit code is required.");
    const otpRef = db.doc(`signingOtps/${contractRef.id}_${signerId}`);
    const now = Date.now();
    const otpSnapshot = await otpRef.get();
    if (!otpSnapshot.exists)
        throw new https_1.HttpsError("failed-precondition", "No active verification request exists.");
    const otp = otpSnapshot.data() ?? {};
    if (Number(otp.verifiedAt ?? 0) > 0)
        return { verified: true, verifiedAt: Number(otp.verifiedAt) };
    if (now > Number(otp.expiresAt ?? 0))
        throw new https_1.HttpsError("deadline-exceeded", "The verification code has expired.");
    const attempts = Number(otp.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS)
        throw new https_1.HttpsError("resource-exhausted", "Too many invalid verification attempts.");
    if (otp.codeHash !== hashCode(contractRef.id, signerId, code)) {
        await otpRef.update({ attempts: attempts + 1 });
        throw new https_1.HttpsError("invalid-argument", "The verification code is incorrect.");
    }
    return db.runTransaction(async (transaction) => {
        const [latestOtpSnapshot, contractSnapshot] = await Promise.all([transaction.get(otpRef), transaction.get(contractRef)]);
        if (!latestOtpSnapshot.exists || !contractSnapshot.exists)
            throw new https_1.HttpsError("failed-precondition", "No active verification request exists.");
        if (Number(latestOtpSnapshot.data()?.verifiedAt ?? 0) > 0)
            return { verified: true, verifiedAt: Number(latestOtpSnapshot.data()?.verifiedAt) };
        const verifiedAt = Date.now();
        const contractData = contractSnapshot.data();
        const signers = Array.isArray(contractData.signers) ? contractData.signers : [];
        const nextSigners = signers.map((signer) => signer && typeof signer === "object" && signer.signerId === signerId
            ? { ...signer, otpVerified: true, otpVerifiedAt: verifiedAt }
            : signer);
        transaction.update(otpRef, { verifiedAt });
        transaction.update(contractRef, { signers: nextSigners, updatedAt: verifiedAt });
        return { verified: true, verifiedAt };
    });
});
exports.recordSigningEvidence = (0, https_1.onCall)(async (request) => {
    const { contractRef, signerId } = await loadAuthorizedContract(request);
    const evidence = request.data?.evidence;
    if (!evidence || evidence.signerId !== signerId || typeof evidence.signatureBase64 !== "string" || evidence.signatureBase64.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Complete signature evidence is required.");
    }
    const signedAt = Number(evidence.signedAt);
    const coords = evidence.locationCoords;
    const latitude = Number(coords?.latitude);
    const longitude = Number(coords?.longitude);
    const accuracyMeters = Number(coords?.accuracyMeters);
    if (!Number.isFinite(signedAt) || signedAt <= 0 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
        throw new https_1.HttpsError("invalid-argument", "Valid timestamp and GPS evidence are required.");
    }
    const pdfStoragePath = typeof request.data?.pdfStoragePath === "string" ? request.data.pdfStoragePath.trim() : "";
    const pdfStorageUrl = typeof request.data?.pdfStorageUrl === "string" ? request.data.pdfStorageUrl.trim() : "";
    const pdfSha256Hash = typeof request.data?.pdfSha256Hash === "string" ? request.data.pdfSha256Hash.trim() : "";
    if (pdfStoragePath && !pdfStoragePath.startsWith(`contracts/${contractRef.id}/source/`)) {
        throw new https_1.HttpsError("invalid-argument", "The PDF source does not belong to this contract.");
    }
    if (pdfSha256Hash && !/^[a-f0-9]{64}$/i.test(pdfSha256Hash)) {
        throw new https_1.HttpsError("invalid-argument", "A valid SHA-256 hash is required.");
    }
    const otpVerified = evidence.otpVerified === true;
    if (otpVerified) {
        const otpSnapshot = await db.doc(`signingOtps/${contractRef.id}_${signerId}`).get();
        if (!otpSnapshot.exists || Number(otpSnapshot.data()?.verifiedAt ?? 0) <= 0) {
            throw new https_1.HttpsError("failed-precondition", "OTP verification evidence is not valid.");
        }
    }
    const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(contractRef);
        if (!snapshot.exists)
            throw new https_1.HttpsError("not-found", "Contract not found.");
        const current = snapshot.data();
        if (current.status === "cancelled")
            throw new https_1.HttpsError("failed-precondition", "Contract is cancelled.");
        const currentSigners = Array.isArray(current.signers) ? current.signers : [];
        const originalSigner = currentSigners.find((entry) => entry && typeof entry === "object" && entry.signerId === signerId);
        if (!originalSigner) {
            throw new https_1.HttpsError("permission-denied", "Signer is not part of this contract.");
        }
        const nextSigners = currentSigners.map((entry) => entry && typeof entry === "object" && entry.signerId === signerId
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
        const requiredSignerIds = Array.isArray(current.requiredSignerIds) ? current.requiredSignerIds.filter((value) => typeof value === "string") : [];
        const allSigned = requiredSignerIds.length > 0 && requiredSignerIds.every((requiredId) => nextSigners.some((entry) => entry && typeof entry === "object" && entry.signerId === requiredId && typeof entry.signatureBase64 === "string" && entry.signatureBase64.trim().length > 0));
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
exports.updateContractPayload = (0, https_1.onCall)(async (request) => {
    const { uid, contractRef, contract } = await loadAuthorizedContract(request);
    if (uid !== contract.brokerId && uid !== contract.createdByUserId)
        throw new https_1.HttpsError("permission-denied", "Only the contract creator can edit contract details.");
    if (contract.status !== "pending_signatures")
        throw new https_1.HttpsError("failed-precondition", "Only pending contracts can be edited.");
    const signers = Array.isArray(contract.signers) ? contract.signers : [];
    if (signers.some((entry) => entry && typeof entry === "object" && typeof entry.signatureBase64 === "string" && entry.signatureBase64.trim().length > 0)) {
        throw new https_1.HttpsError("failed-precondition", "The contract cannot be edited after a signature has been recorded.");
    }
    const requestedPayload = request.data?.payload;
    if (!requestedPayload || typeof requestedPayload !== "object" || Array.isArray(requestedPayload)) {
        throw new https_1.HttpsError("invalid-argument", "A contract payload is required.");
    }
    const allowedKeys = new Set(["commissionRatePercentage", "commissionAmountCalculated", "customTerms", "monthlyRentOrPrice", "houseRulesConfig", "holdingDepositAmount", "assignmentMode"]);
    const payload = Object.fromEntries(Object.entries(requestedPayload).filter(([key]) => allowedKeys.has(key)));
    const currentPayload = contract.contractPayload && typeof contract.contractPayload === "object" && !Array.isArray(contract.contractPayload)
        ? contract.contractPayload
        : {};
    const now = Date.now();
    const updated = { id: contractRef.id, ...contract, contractPayload: { ...currentPayload, ...payload }, updatedAt: now };
    await contractRef.update({ contractPayload: updated.contractPayload, updatedAt: now });
    return updated;
});
//# sourceMappingURL=signingOtp.js.map