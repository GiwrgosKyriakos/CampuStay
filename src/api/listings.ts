import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

/**
 * Καθαρίζει αναδρομικά το αντικείμενο από πεδία που έχουν τιμή `undefined`,
 * ώστε το Firestore setDoc() να μην πετάει σφάλμα.
 */
function sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }

    // Εξαίρεση για Firestore FieldValues (όπως serverTimestamp, deleteField, arrayUnion)
    const isFirestoreFieldValue =
      value !== null &&
      typeof value === "object" &&
      ("_methodName" in value || (value as { constructor?: { name?: string } }).constructor?.name === "FieldValue");

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !isFirestoreFieldValue &&
      typeof (value as { toMillis?: unknown }).toMillis !== "function"
    ) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

async function deleteListingLikes(apartmentId: string): Promise<void> {
  const likesQ = query(collection(db, "liked_apartments"), where("apartmentId", "==", apartmentId));
  const likesSnap = await getDocs(likesQ);

  if (likesSnap.empty) return;

  let batch = writeBatch(db);
  let opCount = 0;

  for (const likeDoc of likesSnap.docs) {
    batch.delete(likeDoc.ref);
    opCount += 1;

    if (opCount >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

async function markHostChatsUnavailable(apartmentId: string): Promise<void> {
  const hostChatsQ = query(
    collection(db, "chats"),
    where("type", "==", "host"),
    where("apartmentId", "==", apartmentId),
  );
  const chatsSnap = await getDocs(hostChatsQ);

  if (chatsSnap.empty) return;

  let batch = writeBatch(db);
  let opCount = 0;

  for (const chatDoc of chatsSnap.docs) {
    batch.set(
      chatDoc.ref,
      {
        apartmentTitle: "",
        apartmentUnavailable: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    opCount += 1;

    if (opCount >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

export async function deleteListingPermanently(apartmentId: string): Promise<void> {
  await Promise.all([deleteListingLikes(apartmentId), markHostChatsUnavailable(apartmentId)]);
  await deleteDoc(doc(db, "apartments", apartmentId));
}

export async function upsertListing(params: {
  apartmentId?: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const { apartmentId, payload } = params;

  // 🎯 Αφαίρεση όλων των undefined πεδίων πριν την αποθήκευση
  const cleanPayload = sanitizePayload(payload);

  if (apartmentId) {
    const aptRef = doc(db, "apartments", apartmentId);
    await setDoc(
      aptRef,
      {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return apartmentId;
  }

  const newRef = doc(collection(db, "apartments"));
  await setDoc(newRef, {
    ...cleanPayload,
    createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newRef.id;
}