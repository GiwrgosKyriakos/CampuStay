import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { dispatchMailOutboxMessage, getShortLivedStorageUrl, type ContractMailOutboxRecord } from "../lib/mailOutbox";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type SignerRecord = {
  signerId?: unknown;
  signerEmail?: unknown;
  idCardPhotoUrl?: unknown;
  idCardBackPhotoUrl?: unknown;
};

type ContractRecord = {
  agencyId?: unknown;
  title?: unknown;
  contractType?: unknown;
  completedAt?: unknown;
  status?: unknown;
  pdfStoragePath?: unknown;
  pdfSha256Hash?: unknown;
  finalDocumentHash?: unknown;
  clientId?: unknown;
  clientProfileId?: unknown;
  apartmentId?: unknown;
  dealId?: unknown;
  brokerId?: unknown;
  createdByUserId?: unknown;
  createdAt?: unknown;
  signers?: unknown;
};

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getContractTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export const onContractCompleted = onDocumentUpdated("contracts/{contractId}", async (event) => {
  const before = event.data?.before.data() as ContractRecord | undefined;
  const after = event.data?.after.data() as ContractRecord | undefined;
  if (!before || !after || after.status !== "signed" || before.status === "signed") return;

  const contractId = event.params.contractId;
  const agencyId = nonEmptyString(after.agencyId);
  const sourcePath = nonEmptyString(after.pdfStoragePath);
  if (!agencyId || !sourcePath) {
    logger.error("Signed contract is missing agency or source PDF path", { contractId, agencyId, sourcePath });
    return;
  }

  const bucket = getStorage().bucket();
  const sourceFile = bucket.file(sourcePath);
  const [sourceExists] = await sourceFile.exists();
  if (!sourceExists) {
    logger.error("Signed contract source PDF was not found", { contractId, sourcePath });
    return;
  }
  const [sourceContents] = await sourceFile.download();
  const authoritativeHash = createHash("sha256").update(sourceContents).digest("hex");
  const submittedHash = nonEmptyString(after.pdfSha256Hash).toLowerCase();
  const finalHash = nonEmptyString(after.finalDocumentHash).toLowerCase();
  if (!submittedHash || submittedHash !== authoritativeHash || (finalHash && finalHash !== authoritativeHash)) {
    logger.error("Signed contract PDF hash validation failed", { contractId, sourcePath });
    throw new Error("Signed contract PDF hash validation failed.");
  }

  const ledgerSnapshot = await db.collection(`contracts/${contractId}/signatures_ledger`).get();
  const signersById = new Map<string, SignerRecord>();
  const legacySigners = Array.isArray(after.signers) ? after.signers as SignerRecord[] : [];
  for (const signer of legacySigners) {
    const signerId = nonEmptyString(signer.signerId);
    if (signerId) signersById.set(signerId, signer);
  }
  for (const ledgerEntry of ledgerSnapshot.docs) {
    const signer = ledgerEntry.data() as SignerRecord;
    const signerId = nonEmptyString(signer.signerId);
    if (signerId) signersById.set(signerId, signer);
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
  const finalUrl = await getShortLivedStorageUrl(finalPath);
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
    if (brokerEmail) recipients.add(brokerEmail);
  }
  const apartmentId = nonEmptyString(after.apartmentId);
  const dealId = nonEmptyString(after.dealId);
  const outboxId = `contract_${contractId}`;
  const now = Date.now();
  const outboxMessage: ContractMailOutboxRecord = {
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
  const transactionRefs = [apartmentRef, dealRef, profileRef, clientRef, outboxRef].filter((ref): ref is NonNullable<typeof ref> => ref !== null);

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(transactionRefs.map((ref) => transaction.get(ref)));
    const snapshotByPath = new Map(transactionRefs.map((ref, index) => [ref.path, snapshots[index]]));
    if (apartmentRef && snapshotByPath.get(apartmentRef.path)?.exists) {
      transaction.update(apartmentRef, {
        contracts: FieldValue.arrayUnion(documentReference),
        "documents.signedContracts": FieldValue.arrayUnion(documentReference),
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
        documents: FieldValue.arrayUnion(documentReference),
        signedMandateHistory: FieldValue.arrayUnion(documentReference),
        updatedAt: now,
      });
    }
    if (clientRef && snapshotByPath.get(clientRef.path)?.exists) {
      transaction.update(clientRef, {
        contractDocuments: FieldValue.arrayUnion(documentReference),
        documents: FieldValue.arrayUnion(documentReference),
        updatedAt: now,
      });
    }
    if (!snapshotByPath.get(outboxRef.path)?.exists) transaction.create(outboxRef, outboxMessage);
  });

  await dispatchMailOutboxMessage(outboxId);

  await event.data!.after.ref.set({
    finalPdfStoragePath: finalPath,
    finalDocumentHash: authoritativeHash,
    pdfStorageUrl: finalUrl,
    archivedAt: Date.now(),
    updatedAt: now,
  }, { merge: true });
});