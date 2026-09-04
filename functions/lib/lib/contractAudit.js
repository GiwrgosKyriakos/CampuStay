"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyContractSignatureAuditTrail = verifyContractSignatureAuditTrail;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function nonEmptyString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function hasTimestamp(value) {
    if (typeof value === "number")
        return Number.isFinite(value) && value > 0;
    return Boolean(value && typeof value === "object" && typeof value.toMillis === "function" && Number.isFinite(value.toMillis()) && value.toMillis() > 0);
}
async function verifyContractSignatureAuditTrail(contractId) {
    const auditTrail = [];
    const normalizedContractId = contractId.trim();
    if (!normalizedContractId)
        return { isValid: false, auditTrail: [{ check: "contract_id", valid: false, reason: "Contract id is required." }] };
    try {
        const contractSnapshot = await db.doc(`contracts/${normalizedContractId}`).get();
        if (!contractSnapshot.exists)
            return { isValid: false, auditTrail: [{ check: "contract", valid: false, reason: "Contract not found." }] };
        const contract = contractSnapshot.data() ?? {};
        const statusValid = contract.status === "signed";
        auditTrail.push({ check: "contract_status", valid: statusValid, status: contract.status ?? null });
        const expectedHash = nonEmptyString(contract.finalDocumentHash).toLowerCase();
        const storagePath = nonEmptyString(contract.finalPdfStoragePath) || nonEmptyString(contract.pdfStoragePath);
        let actualHash = "";
        let pdfValid = false;
        if (!expectedHash || !storagePath) {
            auditTrail.push({ check: "pdf_hash", valid: false, reason: "Final document hash or Storage path is missing." });
        }
        else {
            const file = (0, storage_1.getStorage)().bucket().file(storagePath);
            const [exists] = await file.exists();
            if (!exists) {
                auditTrail.push({ check: "pdf_hash", valid: false, storagePath, reason: "The PDF does not exist in Storage." });
            }
            else {
                const [contents] = await file.download();
                actualHash = (0, node_crypto_1.createHash)("sha256").update(contents).digest("hex");
                pdfValid = actualHash === expectedHash;
                auditTrail.push({ check: "pdf_hash", valid: pdfValid, storagePath, expectedHash, actualHash });
            }
        }
        const requiredSignerIds = Array.isArray(contract.requiredSignerIds)
            ? Array.from(new Set(contract.requiredSignerIds.filter((value) => typeof value === "string" && value.trim().length > 0)))
            : [];
        const ledgerSnapshot = await db.collection(`contracts/${normalizedContractId}/signatures_ledger`).get();
        for (const signerId of requiredSignerIds) {
            const matches = ledgerSnapshot.docs.filter((entry) => entry.data()?.signerId === signerId);
            const entry = matches[0]?.data() ?? {};
            const timestampValid = hasTimestamp(entry.serverTimestamp);
            const ipAddress = nonEmptyString(entry.ipAddress);
            const immutableEvidenceId = matches.length === 1 && nonEmptyString(entry.evidenceId) === matches[0].id;
            auditTrail.push({
                check: "ledger_entry",
                signerId,
                valid: matches.length === 1 && timestampValid && Boolean(ipAddress) && immutableEvidenceId,
                ledgerEntryCount: matches.length,
                evidenceId: nonEmptyString(entry.evidenceId) || null,
                timestampValid,
                ipAddressPresent: Boolean(ipAddress),
                immutableEvidenceId,
            });
        }
        if (requiredSignerIds.length === 0)
            auditTrail.push({ check: "required_signers", valid: false, reason: "No required signers are recorded." });
        return {
            isValid: statusValid && pdfValid && requiredSignerIds.length > 0 && auditTrail.every((entry) => entry.valid === true),
            auditTrail,
        };
    }
    catch (error) {
        auditTrail.push({ check: "audit_execution", valid: false, reason: error instanceof Error ? error.message : "Audit verification failed." });
        return { isValid: false, auditTrail };
    }
}
//# sourceMappingURL=contractAudit.js.map