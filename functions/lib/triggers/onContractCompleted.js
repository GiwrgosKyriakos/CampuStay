"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onContractCompleted = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const storage_1 = require("firebase-admin/storage");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const mailOutbox_1 = require("../lib/mailOutbox");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function nonEmptyString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function getContractTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (value && typeof value === "object" && typeof value.toMillis === "function") {
        return value.toMillis();
    }
    return Date.now();
}
exports.onContractCompleted = (0, firestore_2.onDocumentUpdated)("contracts/{contractId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || after.status !== "signed" || before.status === "signed")
        return;
    const contractId = event.params.contractId;
    const agencyId = nonEmptyString(after.agencyId);
    const sourcePath = nonEmptyString(after.pdfStoragePath);
    if (!agencyId || !sourcePath) {
        firebase_functions_1.logger.error("Signed contract is missing agency or source PDF path", { contractId, agencyId, sourcePath });
        return;
    }
    const bucket = (0, storage_1.getStorage)().bucket();
    const sourceFile = bucket.file(sourcePath);
    const [sourceExists] = await sourceFile.exists();
    if (!sourceExists) {
        firebase_functions_1.logger.error("Signed contract source PDF was not found", { contractId, sourcePath });
        return;
    }
    const [sourceContents] = await sourceFile.download();
    const authoritativeHash = (0, node_crypto_1.createHash)("sha256").update(sourceContents).digest("hex");
    const submittedHash = nonEmptyString(after.pdfSha256Hash).toLowerCase();
    const finalHash = nonEmptyString(after.finalDocumentHash).toLowerCase();
    if (!submittedHash || submittedHash !== authoritativeHash || (finalHash && finalHash !== authoritativeHash)) {
        firebase_functions_1.logger.error("Signed contract PDF hash validation failed", { contractId, sourcePath });
        throw new Error("Signed contract PDF hash validation failed.");
    }
    const ledgerSnapshot = await db.collection(`contracts/${contractId}/signatures_ledger`).get();
    const signersById = new Map();
    const legacySigners = Array.isArray(after.signers) ? after.signers : [];
    for (const signer of legacySigners) {
        const signerId = nonEmptyString(signer.signerId);
        if (signerId)
            signersById.set(signerId, signer);
    }
    for (const ledgerEntry of ledgerSnapshot.docs) {
        const signer = ledgerEntry.data();
        const signerId = nonEmptyString(signer.signerId);
        if (signerId)
            signersById.set(signerId, signer);
    }
    const signers = Array.from(signersById.values());
    const finalPath = `agencies/${agencyId}/contracts/${contractId}.pdf`;
    const finalFile = bucket.file(finalPath);
    await sourceFile.copy(finalFile);
    await finalFile.setMetadata({
        contentType: "application/pdf",
        cacheControl: "private, max-age=31536000, immutable",
        metadata: { contractId, sha256Hash: authoritativeHash, immutable: "true" },
    });
    const finalUrl = await (0, mailOutbox_1.getShortLivedStorageUrl)(finalPath);
    const idCardPhotoUrls = signers.flatMap((signer) => [nonEmptyString(signer.idCardPhotoUrl), nonEmptyString(signer.idCardBackPhotoUrl)]).filter(Boolean);
    const signedAt = getContractTimestamp(after.completedAt);
    const documentReference = {
        contractId,
        type: nonEmptyString(after.contractType),
        signedAt,
        documentUrl: finalUrl,
        contractType: nonEmptyString(after.contractType),
        title: nonEmptyString(after.title) || "Υπογεγραμμένο έγγραφο",
        url: finalUrl,
        sha256Hash: authoritativeHash,
        createdAt: getContractTimestamp(after.createdAt),
        idCardPhotoUrls,
    };
    const clientId = nonEmptyString(after.clientId);
    const clientProfileId = nonEmptyString(after.clientProfileId) || (clientId && nonEmptyString(after.brokerId) ? `${nonEmptyString(after.brokerId)}_${clientId}` : clientId);
    const recipients = new Set(signers.map((signer) => nonEmptyString(signer.signerEmail)).filter(Boolean));
    const brokerId = nonEmptyString(after.brokerId) || nonEmptyString(after.createdByUserId);
    if (brokerId) {
        const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
        const brokerEmail = nonEmptyString(brokerSnapshot.data()?.email);
        if (brokerEmail)
            recipients.add(brokerEmail);
    }
    const apartmentId = nonEmptyString(after.apartmentId);
    const dealId = nonEmptyString(after.dealId);
    const outboxId = `contract_${contractId}`;
    const now = Date.now();
    const outboxMessage = {
        contractId,
        recipients: Array.from(recipients),
        title: documentReference.title,
        pdfStoragePath: finalPath,
        pdfSha256Hash: authoritativeHash,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
    };
    const apartmentRef = apartmentId ? db.doc(`apartments/${apartmentId}`) : null;
    const dealRef = dealId ? db.doc(`deals/${dealId}`) : null;
    const profileRef = clientProfileId ? db.doc(`brokerClientProfiles/${clientProfileId}`) : null;
    const clientRef = clientId ? db.doc(`users/${clientId}`) : null;
    const outboxRef = db.doc(`mail_outbox/${outboxId}`);
    const transactionRefs = [apartmentRef, dealRef, profileRef, clientRef, outboxRef].filter((ref) => ref !== null);
    await db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(transactionRefs.map((ref) => transaction.get(ref)));
        const snapshotByPath = new Map(transactionRefs.map((ref, index) => [ref.path, snapshots[index]]));
        if (apartmentRef && snapshotByPath.get(apartmentRef.path)?.exists) {
            transaction.update(apartmentRef, {
                contracts: firestore_1.FieldValue.arrayUnion(documentReference),
                "documents.signedContracts": firestore_1.FieldValue.arrayUnion(documentReference),
                updatedAt: now,
            });
        }
        if (dealRef && snapshotByPath.get(dealRef.path)?.exists) {
            const deal = snapshotByPath.get(dealRef.path)?.data() ?? {};
            const currentStage = typeof deal.stage === "number" && Number.isFinite(deal.stage) ? deal.stage : 0;
            transaction.update(dealRef, {
                contractId,
                contractReference: documentReference,
                contractCompleted: true,
                signedContractVerified: true,
                signedContractVerifiedAt: now,
                "prerequisites.signedContract": true,
                stage: Math.max(currentStage, 90),
                updatedAt: now,
            });
        }
        if (profileRef && snapshotByPath.get(profileRef.path)?.exists) {
            transaction.update(profileRef, {
                documents: firestore_1.FieldValue.arrayUnion(documentReference),
                signedMandateHistory: firestore_1.FieldValue.arrayUnion(documentReference),
                updatedAt: now,
            });
        }
        if (clientRef && snapshotByPath.get(clientRef.path)?.exists) {
            transaction.update(clientRef, {
                contractDocuments: firestore_1.FieldValue.arrayUnion(documentReference),
                documents: firestore_1.FieldValue.arrayUnion(documentReference),
                updatedAt: now,
            });
        }
        if (!snapshotByPath.get(outboxRef.path)?.exists)
            transaction.create(outboxRef, outboxMessage);
    });
    await (0, mailOutbox_1.dispatchMailOutboxMessage)(outboxId);
    await event.data.after.ref.set({
        finalPdfStoragePath: finalPath,
        finalDocumentHash: authoritativeHash,
        pdfStorageUrl: finalUrl,
        archivedAt: Date.now(),
        updatedAt: now,
    }, { merge: true });
});
//# sourceMappingURL=onContractCompleted.js.map