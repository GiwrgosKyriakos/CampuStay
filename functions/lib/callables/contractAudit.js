"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyContractSignatureAuditTrailCallable = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const contractAudit_1 = require("../lib/contractAudit");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function isExecutiveRole(value) {
    return value === "ceo" || value === "secretary" || value === "secretariat";
}
exports.verifyContractSignatureAuditTrailCallable = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
    if (!contractId)
        throw new https_1.HttpsError("invalid-argument", "Contract id is required.");
    const contractSnapshot = await db.doc(`contracts/${contractId}`).get();
    if (!contractSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Contract not found.");
    const contract = contractSnapshot.data() ?? {};
    const requiredSignerIds = Array.isArray(contract.requiredSignerIds) ? contract.requiredSignerIds : [];
    const directParticipant = [contract.createdByUserId, contract.brokerId, contract.clientId, contract.ownerId].includes(uid)
        || requiredSignerIds.includes(uid);
    const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
    const agencyStaff = user.agencyId === contract.agencyId
        && (user.is_broker === true || isExecutiveRole(user.agencyRole) || isExecutiveRole(user.role));
    if (!directParticipant && !agencyStaff)
        throw new https_1.HttpsError("permission-denied", "You cannot audit this contract.");
    return (0, contractAudit_1.verifyContractSignatureAuditTrail)(contractId);
});
//# sourceMappingURL=contractAudit.js.map