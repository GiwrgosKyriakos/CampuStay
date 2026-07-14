import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
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

export async function wipeUserFirestoreFootprint(uid: string): Promise<void> {
  // 1) Remove apartments created/owned by this user.
  await deleteByUidVariants("apartments", uid);

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
