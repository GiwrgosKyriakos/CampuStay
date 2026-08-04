import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { getUserSettings } from "@/src/api/accountSettings";

interface FirestoreChatBlockDoc {
  users?: string[];
  blockedByUsers?: Record<string, boolean>;
}

interface FirestorePublicUserDoc {
  blockedUserIds?: string[];
}

export async function getExcludedUserIds(currentUserId: string): Promise<Set<string>> {
  const excludedUserIds = new Set<string>();
  if (!currentUserId) return excludedUserIds;

  const settings = await getUserSettings(currentUserId).catch(() => null);
  const blockedByMe = settings?.privacy?.blocked_profiles ?? [];
  blockedByMe.forEach((entry) => {
    if (entry.id && entry.id !== currentUserId) {
      excludedUserIds.add(entry.id);
    }
  });

  try {
    const blockedByUsersSnap = await getDocs(
      query(collection(db, "users"), where("blockedUserIds", "array-contains", currentUserId)),
    );

    blockedByUsersSnap.docs.forEach((userDoc) => {
      if (userDoc.id !== currentUserId) {
        excludedUserIds.add(userDoc.id);
      }
      const data = userDoc.data() as FirestorePublicUserDoc;
      const ids = Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [];
      if (ids.includes(currentUserId) && userDoc.id !== currentUserId) {
        excludedUserIds.add(userDoc.id);
      }
    });
  } catch {
    // Ignore blocked-by query failures and keep local blocked users fallback.
  }

  try {
    const chatsSnap = await getDocs(
      query(collection(db, "chats"), where("users", "array-contains", currentUserId)),
    );

    chatsSnap.docs.forEach((chatDoc) => {
      const data = chatDoc.data() as FirestoreChatBlockDoc;
      const users = Array.isArray(data.users) ? data.users : [];
      const counterpartId = users.find((uid) => uid !== currentUserId);
      if (!counterpartId) return;

      const blockedMap = data.blockedByUsers ?? {};
      if (blockedMap[currentUserId] === true || blockedMap[counterpartId] === true) {
        excludedUserIds.add(counterpartId);
      }
    });
  } catch {
    // Ignore chat fallback failures.
  }

  return excludedUserIds;
}