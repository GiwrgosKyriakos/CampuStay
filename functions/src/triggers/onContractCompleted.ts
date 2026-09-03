import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

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
  status?: unknown;
  pdfStoragePath?: unknown;
  pdfSha256Hash?: unknown;
  clientId?: unknown;
  clientProfileId?: unknown;
  apartmentId?: unknown;
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

async function getArchiveUrl(file: ReturnType<ReturnType<typeof getStorage>["bucket"]>["file"] extends (...args: never[]) => infer T ? T : never): Promise<string> {
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5 });
  return url;
}

async function dispatchContractEmail(params: { recipients: string[]; title: string; contractId: string; url: string; pdfBase64: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("Contract completed without email provider configuration", { contractId: params.contractId });
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
    logger.error("Contract email provider rejected the request", { contractId: params.contractId, status: response.status });
    return false;
  }
  return true;
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
  const signers = Array.isArray(after.signers) ? after.signers as SignerRecord[] : [];
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
    await db.doc(`brokerClientProfiles/${clientProfileId}`).set({ documents: FieldValue.arrayUnion(documentReference), updatedAt: Date.now() }, { merge: true });
  }
  const apartmentId = nonEmptyString(after.apartmentId);
  if (apartmentId) {
    await db.doc(`apartments/${apartmentId}`).set({ "documents.signedContracts": FieldValue.arrayUnion(documentReference), updatedAt: Date.now() }, { merge: true });
  }

  const recipients = new Set(signers.map((signer) => nonEmptyString(signer.signerEmail)).filter(Boolean));
  const brokerId = nonEmptyString(after.brokerId) || nonEmptyString(after.createdByUserId);
  if (brokerId) {
    const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
    const brokerEmail = nonEmptyString(brokerSnapshot.data()?.email);
    if (brokerEmail) recipients.add(brokerEmail);
  }
  const emailDispatched = recipients.size > 0
    ? await dispatchContractEmail({ recipients: Array.from(recipients), title: documentReference.title, contractId, url: finalUrl, pdfBase64: contents.toString("base64") })
    : false;

  await event.data!.after.ref.set({
    finalPdfStoragePath: finalPath,
    pdfStorageUrl: finalUrl,
    archivedAt: Date.now(),
    ...(emailDispatched ? { emailDispatchedAt: Date.now() } : {}),
    updatedAt: Date.now(),
  }, { merge: true });
});