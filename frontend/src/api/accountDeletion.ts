import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteUser, getAuth } from "firebase/auth";

import { db } from "@/src/config/firebase";

const DELETED_ACCOUNT_LABEL = "Deleted Account";

async function deleteDocsByQuery(q: ReturnType<typeof query>): Promise<void> {
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const docs = snapshot.docs;
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

async function tombstoneChatsForDeletedUser(uid: string): Promise<void> {
  const chatsQ = query(collection(db, "chats"), where("users", "array-contains", uid));
  const chatsSnap = await getDocs(chatsQ);
  if (chatsSnap.empty) return;

  for (let i = 0; i < chatsSnap.docs.length; i += 400) {
    const batch = writeBatch(db);
    chatsSnap.docs.slice(i, i + 400).forEach((chatDoc) => {
      batch.set(
        chatDoc.ref,
        {
          deletedUsers: {
            [uid]: true,
          },
          participantDisplayNames: {
            [uid]: DELETED_ACCOUNT_LABEL,
          },
          // Remove common per-user avatar metadata keys if present.
          participantPhotoUrls: {
            [uid]: deleteField(),
          },
          participantPhotos: {
            [uid]: deleteField(),
          },
          participantAvatars: {
            [uid]: deleteField(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

async function deleteFirebaseAuthCredentials(uid: string): Promise<void> {
  const auth = getAuth();
  const current = auth.currentUser;
  if (!current) return;
  if (current.uid !== uid) return;
  await deleteUser(current);
}

export async function deleteAccountDeep(uid: string): Promise<void> {
  // Keep chat rooms/messages for counterpart continuity, but tombstone deleted participant metadata.
  await tombstoneChatsForDeletedUser(uid);

  await Promise.all([
    deleteDoc(doc(db, "users", uid)),
    deleteDoc(doc(db, "quiz_answers", uid)),
    deleteDocsByQuery(query(collection(db, "liked_apartments"), where("userId", "==", uid))),
    deleteDocsByQuery(query(collection(db, "swipes"), where("fromUid", "==", uid))),
    deleteDocsByQuery(query(collection(db, "swipes"), where("toUid", "==", uid))),
  ]);

  await deleteFirebaseAuthCredentials(uid);
}

export { DELETED_ACCOUNT_LABEL };
