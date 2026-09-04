import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";

const db = getFirestore();
const MAX_ATTEMPTS = 4;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 60 * 1000;

export type ContractMailOutboxRecord = {
  contractId: string;
  recipients: string[];
  title: string;
  pdfStoragePath: string;
  pdfSha256Hash: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: number;
  leaseUntil?: number;
};

export async function getShortLivedStorageUrl(storagePath: string): Promise<string> {
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The contract document does not exist.");
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
  return url;
}

function retryAt(attempt: number): number {
  return Date.now() + RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1));
}

async function sendContractEmail(messageId: string, message: ContractMailOutboxRecord): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  if (message.recipients.length === 0) throw new Error("No contract email recipients were found.");

  const file = getStorage().bucket().file(message.pdfStoragePath);
  const [contents] = await file.download();
  const url = await getShortLivedStorageUrl(message.pdfStoragePath);
  const from = process.env.RESEND_FROM_EMAIL || "CampuStay Contracts <contracts@campustay.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": messageId,
    },
    body: JSON.stringify({
      from,
      to: message.recipients,
      subject: `Υπογεγραμμένο έγγραφο: ${message.title}`,
      html: `<p>Το έγγραφο <strong>${message.title}</strong> ολοκληρώθηκε και επισυνάπτεται σε πιστοποιημένο αντίγραφο.</p><p>Η ακεραιότητα του αρχείου επαληθεύεται με SHA-256. Ο ασφαλής σύνδεσμος ισχύει για μία ώρα: <a href="${url}">${url}</a></p><p>Το παρόν email αποτελεί αυτοματοποιημένη αποστολή του αρχείου eIDAS audit trail.</p>`,
      attachments: [{ filename: `${message.contractId}.pdf`, content: contents.toString("base64") }],
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected the request with status ${response.status}.`);
}

export async function dispatchMailOutboxMessage(messageId: string): Promise<void> {
  const messageRef = db.doc(`mail_outbox/${messageId}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(messageRef);
    if (!snapshot.exists) return null;
    const message = snapshot.data() as ContractMailOutboxRecord;
    if (message.status === "sent") return null;
    const now = Date.now();
    if (typeof message.leaseUntil === "number" && message.leaseUntil > now) return null;
    const attempts = Number(message.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      transaction.update(messageRef, { status: "failed", nextAttemptAt: null, leaseUntil: FieldValue.delete() });
      return null;
    }
    transaction.update(messageRef, {
      status: "pending",
      attempts: attempts + 1,
      lastAttemptAt: now,
      leaseUntil: now + LEASE_MS,
    });
    return { message, attempt: attempts + 1 };
  });

  if (!claimed) return;
  try {
    await sendContractEmail(messageId, claimed.message);
    await messageRef.update({ status: "sent", sentAt: Date.now(), emailDispatchedAt: Date.now(), leaseUntil: FieldValue.delete(), nextAttemptAt: null, lastError: FieldValue.delete() });
    await db.doc(`contracts/${claimed.message.contractId}`).set({ emailDispatchedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    const terminal = claimed.attempt >= MAX_ATTEMPTS;
    logger.error("Contract email dispatch failed", { messageId, attempt: claimed.attempt, error });
    await messageRef.update({
      status: "failed",
      nextAttemptAt: terminal ? null : retryAt(claimed.attempt),
      leaseUntil: FieldValue.delete(),
      lastError: error instanceof Error ? error.message : "Unknown email dispatch error",
    });
  }
}
