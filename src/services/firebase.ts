import {
  collection,
  deleteDoc,
  doc,
  arrayRemove,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
  getDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

const BATCH_DELETE_LIMIT = 400;

type SnapshotDoc = QueryDocumentSnapshot<DocumentData>;

async function deleteDocuments(docs: SnapshotDoc[]): Promise<void> {
  if (!docs.length) return;

  for (let i = 0; i < docs.length; i += BATCH_DELETE_LIMIT) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_DELETE_LIMIT).forEach((snapshotDoc) => {
      batch.delete(snapshotDoc.ref);
    });
    await batch.commit();
  }
}

async function deleteByUidVariants(collectionName: string, uid: string): Promise<void> {
  const fieldVariants = ["uid", "userId", "user_id", "ownerId", "hostId"] as const;
  const snapshots = await Promise.all(
    fieldVariants.map((field) => getDocs(query(collection(db, collectionName), where(field, "==", uid)))),
  );

  const uniqueByPath = new Map<string, SnapshotDoc>();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((snapshotDoc) => {
      uniqueByPath.set(snapshotDoc.ref.path, snapshotDoc);
    });
  });

  await deleteDocuments(Array.from(uniqueByPath.values()));
}

async function deleteOwnedApartments(uid: string): Promise<void> {
  const apartmentsCollection = collection(db, "apartments");
  const [hostOwnedSnap, ownerOwnedSnap] = await Promise.all([
    getDocs(query(apartmentsCollection, where("hostId", "==", uid))),
    getDocs(query(apartmentsCollection, where("ownerId", "==", uid))),
  ]);

  const uniqueByPath = new Map<string, SnapshotDoc>();
  hostOwnedSnap.docs.forEach((snapshotDoc) => {
    uniqueByPath.set(snapshotDoc.ref.path, snapshotDoc);
  });
  ownerOwnedSnap.docs.forEach((snapshotDoc) => {
    uniqueByPath.set(snapshotDoc.ref.path, snapshotDoc);
  });

  await deleteDocuments(Array.from(uniqueByPath.values()));
}

export async function wipeUserFirestoreFootprint(uid: string): Promise<void> {
  const userSnapshot = await getDoc(doc(db, "users", uid));
  const userData = userSnapshot.exists() ? userSnapshot.data() : null;
  if (userData?.agencyId) {
    const agencyRef = doc(db, "agencies", userData.agencyId as string);
    await updateDoc(agencyRef, {
      activeBrokerIds: arrayRemove(uid),
      pendingBrokerIds: arrayRemove(uid),
      ...(userData.agencyRole === "ceo" ? { active: false, orphanedAt: new Date() } : {}),
    });
    const assignedListings = await getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", uid)));
    await Promise.all(assignedListings.docs.map((listing) => updateDoc(listing.ref, { assignedBrokerIds: arrayRemove(uid) })));
  }

  // 1) Remove apartments created/owned by this user.
  await deleteOwnedApartments(uid);

  // 2) Remove quiz answers and preference docs associated with this user.
  await Promise.all([
    deleteDoc(doc(db, "quiz_answers", uid)),
    deleteByUidVariants("quiz_answers", uid),
    deleteDoc(doc(db, "user_preferences", uid)),
    deleteByUidVariants("user_preferences", uid),
  ]);

  // 3) Remove the primary user document last.
  await deleteDoc(doc(db, "users", uid));
}
