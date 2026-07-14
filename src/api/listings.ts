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

  if (apartmentId) {
    const aptRef = doc(db, "apartments", apartmentId);
    await setDoc(
      aptRef,
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return apartmentId;
  }

  const newRef = doc(collection(db, "apartments"));
  await setDoc(newRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newRef.id;
}
