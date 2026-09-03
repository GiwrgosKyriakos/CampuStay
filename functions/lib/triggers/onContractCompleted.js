"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onContractCompleted = void 0;
const app_1 = require("firebase-admin/app");
const storage_1 = require("firebase-admin/storage");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
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
async function getArchiveUrl(file) {
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5 });
    return url;
}
async function dispatchContractEmail(params) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        firebase_functions_1.logger.warn("Contract completed without email provider configuration", { contractId: params.contractId });
        return false;
    }
    const from = process.env.RESEND_FROM_EMAIL || "CampuStay Contracts <contracts@campustay.com>";
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from,
            to: params.recipients,
            subject: `Υπογεγραμμένο έγγραφο: ${params.title}`,
            html: `<p>Το έγγραφο <strong>${params.title}</strong> ολοκληρώθηκε και επισυνάπτεται σε πιστοποιημένο αντίγραφο.</p><p>Η ακεραιότητα του αρχείου επαληθεύεται με SHA-256. Διαθέσιμο και από τον ασφαλή σύνδεσμο: <a href="${params.url}">${params.url}</a></p><p>Το παρόν email αποτελεί αυτοματοποιημένη αποστολή του αρχείου eIDAS audit trail.</p>`,
            attachments: [{ filename: `${params.contractId}.pdf`, content: params.pdfBase64 }],
        }),
    });
    if (!response.ok) {
        firebase_functions_1.logger.error("Contract email provider rejected the request", { contractId: params.contractId, status: response.status });
        return false;
    }
    return true;
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
    const finalPath = `agencies/${agencyId}/contracts/${contractId}.pdf`;
    const finalFile = bucket.file(finalPath);
    await sourceFile.copy(finalFile);
    await finalFile.setMetadata({
        contentType: "application/pdf",
        cacheControl: "private, max-age=31536000, immutable",
        metadata: { contractId, sha256Hash: nonEmptyString(after.pdfSha256Hash), immutable: "true" },
    });
    const finalUrl = await getArchiveUrl(finalFile);
    const [contents] = await finalFile.download();
    const signers = Array.isArray(after.signers) ? after.signers : [];
    const idCardPhotoUrls = signers.flatMap((signer) => [nonEmptyString(signer.idCardPhotoUrl), nonEmptyString(signer.idCardBackPhotoUrl)]).filter(Boolean);
    const documentReference = {
        contractId,
        contractType: nonEmptyString(after.contractType),
        title: nonEmptyString(after.title) || "Υπογεγραμμένο έγγραφο",
        url: finalUrl,
        sha256Hash: nonEmptyString(after.pdfSha256Hash),
        createdAt: getContractTimestamp(after.createdAt),
        idCardPhotoUrls,
    };
    const clientId = nonEmptyString(after.clientId);
    const clientProfileId = nonEmptyString(after.clientProfileId) || (clientId && nonEmptyString(after.brokerId) ? `${nonEmptyString(after.brokerId)}_${clientId}` : clientId);
    if (clientProfileId) {
        await db.doc(`brokerClientProfiles/${clientProfileId}`).set({ documents: firestore_1.FieldValue.arrayUnion(documentReference), updatedAt: Date.now() }, { merge: true });
    }
    const apartmentId = nonEmptyString(after.apartmentId);
    if (apartmentId) {
        await db.doc(`apartments/${apartmentId}`).set({ "documents.signedContracts": firestore_1.FieldValue.arrayUnion(documentReference), updatedAt: Date.now() }, { merge: true });
    }
    const recipients = new Set(signers.map((signer) => nonEmptyString(signer.signerEmail)).filter(Boolean));
    const brokerId = nonEmptyString(after.brokerId) || nonEmptyString(after.createdByUserId);
    if (brokerId) {
        const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
        const brokerEmail = nonEmptyString(brokerSnapshot.data()?.email);
        if (brokerEmail)
            recipients.add(brokerEmail);
    }
    const emailDispatched = recipients.size > 0
        ? await dispatchContractEmail({ recipients: Array.from(recipients), title: documentReference.title, contractId, url: finalUrl, pdfBase64: contents.toString("base64") })
        : false;
    await event.data.after.ref.set({
        finalPdfStoragePath: finalPath,
        pdfStorageUrl: finalUrl,
        archivedAt: Date.now(),
        ...(emailDispatched ? { emailDispatchedAt: Date.now() } : {}),
        updatedAt: Date.now(),
    }, { merge: true });
});
//# sourceMappingURL=onContractCompleted.js.map