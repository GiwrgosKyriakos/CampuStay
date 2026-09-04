"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContractPayload = exports.getContractDownloadUrl = exports.recordSigningEvidence = exports.verifySigningOtp = exports.sendSigningOtp = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const contractTemplates_1 = require("../lib/contractTemplates");
const mailOutbox_1 = require("../lib/mailOutbox");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    return uid;
}
function isExecutiveRole(value) {
    return value === "ceo" || value === "secretary" || value === "secretariat";
}
function sanitizeText(value, maxLength) {
    if (typeof value !== "string")
        return undefined;
    const sanitized = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
    return sanitized || undefined;
}
function getRequestIp(request) {
    const directIp = sanitizeText(request.rawRequest?.ip, 64);
    if (directIp)
        return directIp;
    const forwarded = request.rawRequest?.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return sanitizeText(typeof forwardedValue === "string" ? forwardedValue.split(",")[0] : undefined, 64);
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
function hashVerificationToken(contractId, signerId, token) {
    const secret = process.env.SIGNING_OTP_SECRET || "campustay-signing-otp";
    return (0, node_crypto_1.createHash)("sha256").update(`${secret}:verification:${contractId}:${signerId}:${token}`).digest("hex");
}
async function getAuthoritativePdfHash(storagePath, submittedHash) {
    const file = (0, storage_1.getStorage)().bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists)
        throw new https_1.HttpsError("failed-precondition", "The uploaded PDF could not be found.");
    let contents;
    try {
        [contents] = await file.download();
    }
    catch (error) {
        firebase_functions_1.logger.error("Failed to download source PDF for hash validation", { storagePath, error });
        throw new https_1.HttpsError("internal", "The uploaded PDF could not be validated.");
    }
    const authoritativeHash = (0, node_crypto_1.createHash)("sha256").update(contents).digest("hex");
    if (authoritativeHash !== submittedHash.toLowerCase())
        throw new https_1.HttpsError("invalid-argument", "The submitted PDF hash does not match the uploaded bytes.");
    return authoritativeHash;
}
function isValidIdCaptureMetadata(value, documentType) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const metadata = value;
    return ["front", "back"].every((side) => {
        const entry = metadata[side];
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            return false;
        const item = entry;
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
function signerFor(contract, signerId) {
    const signers = Array.isArray(contract.signers) ? contract.signers : [];
    return signers.find((entry) => entry && typeof entry === "object" && entry.signerId === signerId);
}
function isExternalSigner(signer) {
    return signer?.signerRole !== "broker";
}
async function requireSigningOtp(contractId, signerId, uid, verificationToken) {
    const otpSnapshot = await db.doc(`signingOtps/${contractId}_${signerId}`).get();
    const otp = otpSnapshot.data() ?? {};
    const verifiedAt = Number(otp.verifiedAt ?? 0);
    const tokenMatches = Boolean(verificationToken) && otp.verificationTokenHash === hashVerificationToken(contractId, signerId, verificationToken);
    if (!otpSnapshot.exists || verifiedAt <= 0 || Date.now() > Number(otp.expiresAt ?? 0) || (uid !== signerId && !tokenMatches)) {
        throw new https_1.HttpsError("failed-precondition", "A valid phone OTP verification is required for external signers.");
    }
    return { verifiedAt };
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
    const isDevelopment = process.env.FUNCTIONS_EMULATOR === "true" || (process.env.NODE_ENV !== "production" && process.env.SIGNING_OTP_ALLOW_DEBUG === "true");
    if (!delivered && !isDevelopment) {
        firebase_functions_1.logger.error("Signing OTP provider is not configured", { contractId, signerId });
        throw new https_1.HttpsError("failed-precondition", "SMS delivery is not configured.");
    }
    if (!delivered)
        firebase_functions_1.logger.warn("Signing OTP is available only through the development response", { contractId, signerId });
    return { delivered, expiresInSeconds: OTP_TTL_MS / 1000, ...(isDevelopment ? { debugCode: code } : {}) };
});
exports.verifySigningOtp = (0, https_1.onCall)(async (request) => {
    const { uid, contractRef, contract, signerId } = await loadAuthorizedContract(request);
    if (isExternalSigner(signerFor(contract, signerId)) && uid !== signerId)
        throw new https_1.HttpsError("permission-denied", "Only the signer can verify an external signing OTP.");
    const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
    if (!/^\d{6}$/.test(code))
        throw new https_1.HttpsError("invalid-argument", "A six-digit code is required.");
    const otpRef = db.doc(`signingOtps/${contractRef.id}_${signerId}`);
    return db.runTransaction(async (transaction) => {
        const [latestOtpSnapshot, contractSnapshot] = await Promise.all([transaction.get(otpRef), transaction.get(contractRef)]);
        if (!latestOtpSnapshot.exists || !contractSnapshot.exists)
            throw new https_1.HttpsError("failed-precondition", "No active verification request exists.");
        const now = Date.now();
        const otp = latestOtpSnapshot.data() ?? {};
        if (Number(otp.verifiedAt ?? 0) > 0)
            return { verified: true, verifiedAt: Number(otp.verifiedAt), verificationId: typeof otp.verificationId === "string" ? otp.verificationId : undefined };
        if (now > Number(otp.expiresAt ?? 0))
            throw new https_1.HttpsError("deadline-exceeded", "The verification code has expired.");
        const attempts = Number(otp.attempts ?? 0);
        if (attempts >= MAX_ATTEMPTS || otp.codeHash === null)
            throw new https_1.HttpsError("resource-exhausted", "Too many invalid verification attempts.");
        if (otp.codeHash !== hashCode(contractRef.id, signerId, code)) {
            const nextAttempts = attempts + 1;
            transaction.update(otpRef, { attempts: nextAttempts, ...(nextAttempts >= MAX_ATTEMPTS ? { codeHash: null, invalidatedAt: now } : {}) });
            throw new https_1.HttpsError(nextAttempts >= MAX_ATTEMPTS ? "resource-exhausted" : "invalid-argument", nextAttempts >= MAX_ATTEMPTS ? "Too many invalid verification attempts." : "The verification code is incorrect.");
        }
        const verifiedAt = now;
        const verificationToken = (0, node_crypto_1.randomUUID)();
        const verificationId = (0, node_crypto_1.randomUUID)();
        transaction.update(otpRef, { verifiedAt, verifiedByUid: uid, verificationId, verificationTokenHash: hashVerificationToken(contractRef.id, signerId, verificationToken) });
        transaction.update(contractRef, { updatedAt: verifiedAt });
        return { verified: true, verifiedAt, verificationId, verificationToken };
    });
});
exports.recordSigningEvidence = (0, https_1.onCall)(async (request) => {
    const { uid, contractRef, contract, signerId } = await loadAuthorizedContract(request);
    const originalSigner = signerFor(contract, signerId);
    if (!originalSigner)
        throw new https_1.HttpsError("permission-denied", "Signer is not part of this contract.");
    const evidence = request.data?.evidence;
    if (!evidence || evidence.signerId !== signerId || typeof evidence.signatureBase64 !== "string" || evidence.signatureBase64.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Complete signature evidence is required.");
    }
    const signatureBase64 = evidence.signatureBase64.trim();
    if (signatureBase64.length > 700_000)
        throw new https_1.HttpsError("invalid-argument", "The signature evidence is too large.");
    const idCaptureTimestamp = Number(evidence.idCaptureTimestamp);
    const idDocumentType = evidence.idDocumentType === "passport" || evidence.idDocumentType === "national_id" ? evidence.idDocumentType : undefined;
    const idCaptureMetadata = evidence.idCaptureMetadata;
    const idCardPhotoUrl = sanitizeText(evidence.idCardPhotoUrl, 2048);
    const idCardBackPhotoUrl = sanitizeText(evidence.idCardBackPhotoUrl, 2048);
    if (!idCardPhotoUrl || !idCardBackPhotoUrl || !idDocumentType || !Number.isFinite(idCaptureTimestamp) || idCaptureTimestamp <= 0 || !isValidIdCaptureMetadata(idCaptureMetadata, idDocumentType)) {
        throw new https_1.HttpsError("invalid-argument", "Both ID images and valid capture metadata are required.");
    }
    const coords = evidence.locationCoords;
    const latitude = Number(coords?.latitude);
    const longitude = Number(coords?.longitude);
    const accuracyMeters = Number(coords?.accuracyMeters);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
        throw new https_1.HttpsError("invalid-argument", "Valid GPS evidence is required.");
    const pdfStoragePath = typeof request.data?.pdfStoragePath === "string" ? request.data.pdfStoragePath.trim() : "";
    const pdfSha256Hash = typeof request.data?.pdfSha256Hash === "string" ? request.data.pdfSha256Hash.trim() : "";
    if (!pdfStoragePath.startsWith(`contracts/${contractRef.id}/source/`) || !/^[a-f0-9]{64}$/i.test(pdfSha256Hash))
        throw new https_1.HttpsError("invalid-argument", "A valid contract PDF and SHA-256 hash are required.");
    const authoritativePdfHash = await getAuthoritativePdfHash(pdfStoragePath, pdfSha256Hash);
    const otp = isExternalSigner(originalSigner)
        ? await requireSigningOtp(contractRef.id, signerId, uid, typeof request.data?.verificationToken === "string" ? request.data.verificationToken.trim() : "")
        : undefined;
    const serverTimestamp = firestore_1.Timestamp.now();
    const evidenceId = (0, node_crypto_1.randomUUID)();
    const ledgerEvidence = {
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
        idCaptureMetadata: idCaptureMetadata,
        pdfStoragePath,
        pdfSha256Hash: authoritativePdfHash,
    };
    const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(contractRef);
        if (!snapshot.exists)
            throw new https_1.HttpsError("not-found", "Contract not found.");
        const current = snapshot.data();
        if (current.status === "cancelled")
            throw new https_1.HttpsError("failed-precondition", "Contract is cancelled.");
        const currentSigners = Array.isArray(current.signers) ? current.signers : [];
        const requiredSignerIds = Array.isArray(current.requiredSignerIds) ? current.requiredSignerIds.filter((value) => typeof value === "string") : [];
        const ledgerSnapshot = await transaction.get(contractRef.collection("signatures_ledger"));
        if (currentSigners.some((entry) => entry && typeof entry === "object" && entry.signerId === signerId && typeof entry.signatureBase64 === "string" && entry.signatureBase64.trim().length > 0)
            || ledgerSnapshot.docs.some((entry) => entry.data().signerId === signerId)) {
            throw new https_1.HttpsError("failed-precondition", "This signer has already signed the contract.");
        }
        const signedSignerIds = new Set(ledgerSnapshot.docs.map((entry) => entry.data().signerId).filter((value) => typeof value === "string"));
        signedSignerIds.add(signerId);
        const allSigned = requiredSignerIds.length > 0 && requiredSignerIds.every((requiredId) => signedSignerIds.has(requiredId));
        const now = serverTimestamp.toMillis();
        const ledgerBySigner = new Map();
        for (const ledgerEntry of ledgerSnapshot.docs) {
            const entry = ledgerEntry.data();
            if (typeof entry.signerId === "string")
                ledgerBySigner.set(entry.signerId, entry);
        }
        for (const entry of currentSigners) {
            if (!entry || typeof entry !== "object")
                continue;
            const signer = entry;
            if (typeof signer.signerId === "string")
                ledgerBySigner.set(signer.signerId, signer);
        }
        const currentEvidence = { ...(ledgerBySigner.get(signerId) ?? {}), ...(currentSigners.find((entry) => entry && typeof entry === "object" && entry.signerId === signerId) ?? {}), ...evidence, signerId };
        ledgerBySigner.set(signerId, currentEvidence);
        const projectedSigners = currentSigners.map((entry) => {
            if (!entry || typeof entry !== "object")
                return entry;
            const signer = entry;
            const ledger = typeof signer.signerId === "string" ? ledgerBySigner.get(signer.signerId) : undefined;
            return ledger ? { ...signer, ...ledger } : entry;
        });
        const validatedTemplate = allSigned
            ? (0, contractTemplates_1.validateContractTemplate)({ ...current, signers: projectedSigners, contractPayload: current.contractPayload })
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
exports.getContractDownloadUrl = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
    if (!contractId)
        throw new https_1.HttpsError("invalid-argument", "Contract is required.");
    const contractSnapshot = await db.doc(`contracts/${contractId}`).get();
    if (!contractSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Contract not found.");
    const contract = contractSnapshot.data();
    if (contract.status !== "signed")
        throw new https_1.HttpsError("failed-precondition", "Only completed contracts can be downloaded.");
    const requiredSignerIds = Array.isArray(contract.requiredSignerIds) ? contract.requiredSignerIds : [];
    const directParticipant = [contract.createdByUserId, contract.brokerId, contract.clientId, contract.ownerId].includes(uid) || requiredSignerIds.includes(uid);
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const user = userSnapshot.data() ?? {};
    const agencyStaff = user.agencyId === contract.agencyId && (user.is_broker === true || isExecutiveRole(user.agencyRole) || isExecutiveRole(user.role));
    if (!directParticipant && !agencyStaff)
        throw new https_1.HttpsError("permission-denied", "You cannot download this contract.");
    const storagePath = typeof contract.finalPdfStoragePath === "string" && contract.finalPdfStoragePath.trim()
        ? contract.finalPdfStoragePath.trim()
        : typeof contract.pdfStoragePath === "string" ? contract.pdfStoragePath.trim() : "";
    if (!storagePath)
        throw new https_1.HttpsError("failed-precondition", "The contract has no downloadable document.");
    const url = await (0, mailOutbox_1.getShortLivedStorageUrl)(storagePath);
    return { url, expiresAt: Date.now() + 60 * 60 * 1000 };
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
    const allowedKeys = new Set(["commissionRatePercentage", "commissionAmountCalculated", "customTerms", "monthlyRentOrPrice", "houseRulesConfig", "holdingDepositAmount", "assignmentMode", "agreedListingPrice", "durationMonths", "utilitySplitPercentages", "holdingDepositTerms", "bankReference", "cashReceiptNote", "refundabilityConditions"]);
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