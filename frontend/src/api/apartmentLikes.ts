import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

export type ApartmentLikeDoc = {
  userId: string;
  apartmentId: string;
  timestamp: ReturnType<typeof serverTimestamp>;
};

function buildLikeDocId(userId: string, apartmentId: string): string {
  return `${userId}_${apartmentId}`;
}

export async function setApartmentLike(userId: string, apartmentId: string): Promise<void> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));
  await runTransaction(db, async (tx) => {
    tx.set(likeRef, {
      userId,
      apartmentId,
      timestamp: serverTimestamp(),
    } satisfies ApartmentLikeDoc);
  });
}

export async function deleteApartmentLike(userId: string, apartmentId: string): Promise<void> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));
  await runTransaction(db, async (tx) => {
    tx.delete(likeRef);
  });
}

export async function toggleApartmentLike(userId: string, apartmentId: string): Promise<boolean> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(likeRef);
    if (snap.exists()) {
      tx.delete(likeRef);
      return false;
    }

    tx.set(likeRef, {
      userId,
      apartmentId,
      timestamp: serverTimestamp(),
    } satisfies ApartmentLikeDoc);
    return true;
  });
}

export function subscribeUserLikedApartmentIds(
  userId: string,
  onChange: (apartmentIds: Set<string>) => void,
): () => void {
  const likesQ = query(collection(db, "liked_apartments"), where("userId", "==", userId));
  return onSnapshot(likesQ, (snapshot) => {
    const ids = new Set<string>();
    snapshot.forEach((item) => {
      const apartmentId = item.data()?.apartmentId;
      if (typeof apartmentId === "string" && apartmentId) ids.add(apartmentId);
    });
    onChange(ids);
  });
}

export async function getApartmentLikeCount(apartmentId: string): Promise<number> {
  const likesQ = query(collection(db, "liked_apartments"), where("apartmentId", "==", apartmentId));
  const countSnap = await getCountFromServer(likesQ);
  return countSnap.data().count;
}
