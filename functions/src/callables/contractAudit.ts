import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifyContractSignatureAuditTrail } from "../lib/contractAudit";

if (getApps().length === 0) initializeApp();

const db = getFirestore();

function isExecutiveRole(value: unknown): boolean {
  return value === "ceo" || value === "secretary" || value === "secretariat";
}

export const verifyContractSignatureAuditTrailCallable = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const contractId = typeof request.data?.contractId === "string" ? request.data.contractId.trim() : "";
  if (!contractId) throw new HttpsError("invalid-argument", "Contract id is required.");

  const contractSnapshot = await db.doc(`contracts/${contractId}`).get();
  if (!contractSnapshot.exists) throw new HttpsError("not-found", "Contract not found.");
  const contract = contractSnapshot.data() ?? {};
  const requiredSignerIds = Array.isArray(contract.requiredSignerIds) ? contract.requiredSignerIds : [];
  const directParticipant = [contract.createdByUserId, contract.brokerId, contract.clientId, contract.ownerId].includes(uid)
    || requiredSignerIds.includes(uid);
  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const agencyStaff = user.agencyId === contract.agencyId
    && (user.is_broker === true || isExecutiveRole(user.agencyRole) || isExecutiveRole(user.role));
  if (!directParticipant && !agencyStaff) throw new HttpsError("permission-denied", "You cannot audit this contract.");

  return verifyContractSignatureAuditTrail(contractId);
});
