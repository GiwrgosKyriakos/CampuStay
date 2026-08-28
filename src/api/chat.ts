import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { getUserSettings } from "@/src/api/accountSettings";
import { syncBrokerClientProfile } from "@/src/api/brokerClientProfiles";

/**
 * Marks all incoming messages from a specific sender as read within a chat room.
 * This is called when the current user enters a chat, ensuring the UI reflects
 * that they've read messages from the counterparty.
 *
 * @param chatRoomId - The Firestore chat room document ID
 * @param currentUserId - The UID of the current user
 * @param counterpartUserId - The UID of the sender whose messages should be marked as read
 */
export async function markIncomingMessagesAsRead(
  chatRoomId: string,
  currentUserId: string,
  counterpartUserId: string
): Promise<void> {
  try {
    // Query all unread messages from the counterparty in this chat
    const unreadMessagesQuery = query(
      collection(db, "chats", chatRoomId, "messages"),
      where("senderId", "==", counterpartUserId),
      where("isRead", "==", false)
    );

    const snapshot = await getDocs(unreadMessagesQuery);

    if (snapshot.empty) {
      return; // No unread messages to update
    }

    // Batch update all unread messages to mark them as read
    const batchUpdate = writeBatch(db);

    snapshot.docs.forEach((msgDoc) => {
      batchUpdate.update(msgDoc.ref, {
        isRead: true,
        readAt: Timestamp.now(),
        readBy: [currentUserId],
      });
    });

    await batchUpdate.commit();
  } catch (error) {
    console.error("Error marking messages as read:", error);
    // Silently fail - this is a non-critical operation that shouldn't break the UI
  }
}

/**
 * Checks if a message from a specific sender is unread by the current user.
 * Used to determine whether to show the unread indicator in the chat list.
 *
 * @param messageData - The message document data
 * @param currentUserId - The UID of the current user
 * @returns true if message is unread by current user, false otherwise
 */
export function isMessageUnread(
  messageData: {
    isRead?: boolean;
    read?: boolean;
    readAt?: any;
    readBy?: string[];
    seenBy?: string[];
  } | null,
  currentUserId: string
): boolean {
  if (!messageData) return false;

  // Check primary unread indicator
  if (messageData.isRead === false) return true;

  // Fallback checks for other read tracking patterns
  if (messageData.read === true) return false;
  if (messageData.readAt != null) return false;
  if (Array.isArray(messageData.readBy) && messageData.readBy.includes(currentUserId)) return false;
  if (Array.isArray(messageData.seenBy) && messageData.seenBy.includes(currentUserId)) return false;

  // Default to read if no unread indicators found
  return false;
}

/**
 * Checks if there are any unread messages from a specific user in a chat.
 * Useful for filtering chats with unread activity.
 *
 * @param chatRoomId - The Firestore chat room document ID
 * @param senderUserId - The UID of the sender to check unread messages from
 * @returns true if unread messages exist from the sender, false otherwise
 */
export async function hasUnreadMessagesFrom(
  chatRoomId: string,
  senderUserId: string
): Promise<boolean> {
  try {
    const unreadQuery = query(
      collection(db, "chats", chatRoomId, "messages"),
      where("senderId", "==", senderUserId),
      where("isRead", "==", false)
    );

    const snapshot = await getDocs(unreadQuery);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking for unread messages:", error);
    return false;
  }
}

function buildChatRoomId(userA: string, userB: string, apartmentId?: string): string {
  const parts = apartmentId ? [userA, userB, apartmentId] : [userA, userB];
  return parts.sort().join("_");
}

export interface BlockRelationshipState {
  isBlocker: boolean;
  isBlocked: boolean;
}

export async function getBlockRelationshipState(
  currentUserId: string,
  targetUserId: string,
): Promise<BlockRelationshipState> {
  try {
    const [currentSettings, targetSettings] = await Promise.all([
      getUserSettings(currentUserId).catch(() => null),
      getUserSettings(targetUserId).catch(() => null),
    ]);

    const currentBlocked = new Set(
      (currentSettings?.privacy?.blocked_profiles ?? []).map((entry) => entry.id),
    );
    const targetBlocked = new Set(
      (targetSettings?.privacy?.blocked_profiles ?? []).map((entry) => entry.id),
    );

    return {
      isBlocker: currentBlocked.has(targetUserId),
      isBlocked: targetBlocked.has(currentUserId),
    };
  } catch {
    return {
      isBlocker: false,
      isBlocked: false,
    };
  }
}

async function findExistingHostChatRoomId(params: {
  currentUserId: string;
  hostId: string;
  apartmentId: string;
}): Promise<string | null> {
  const { currentUserId, hostId, apartmentId } = params;
  const hostChatsQ = query(
    collection(db, "chats"),
    where("type", "==", "host"),
    where("apartmentId", "==", apartmentId),
    where("users", "array-contains", currentUserId),
  );
  const hostChatsSnap = await getDocs(hostChatsQ);
  const existing = hostChatsSnap.docs.find((chatDoc) => {
    const users = chatDoc.data()?.users;
    return Array.isArray(users) && users.includes(hostId);
  });
  return existing?.id ?? null;
}

export async function getOrCreateHostChat(params: {
  currentUserId: string;
  hostId: string;
  apartmentId: string;
  apartmentTitle?: string;
}): Promise<string> {
  const { currentUserId, hostId, apartmentId, apartmentTitle } = params;
  const blockState = await getBlockRelationshipState(currentUserId, hostId);
  const hostSnapshot = await getDoc(doc(db, "users", hostId));
  const hostData = hostSnapshot.exists() ? hostSnapshot.data() as { is_broker?: boolean } : null;
  const brokerChatRole = hostData?.is_broker === true ? "client" : undefined;
  const blockedByUsers = {
    [currentUserId]: blockState.isBlocker,
    [hostId]: blockState.isBlocked,
  };
  const existingRoomId = await findExistingHostChatRoomId({ currentUserId, hostId, apartmentId });
  if (existingRoomId) {
    await setDoc(
      doc(db, "chats", existingRoomId),
      {
        users: [currentUserId, hostId],
        type: "host",
        ...(brokerChatRole ? { brokerChatRole } : {}),
        apartmentId,
        apartmentTitle: apartmentTitle ?? "",
        blockedByUsers,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (brokerChatRole) {
      await syncBrokerClientProfile({
        brokerId: hostId,
        clientId: currentUserId,
        role: "client",
        chatRoomId: existingRoomId,
        apartmentId,
      });
    }
    return existingRoomId;
  }

  const chatRoomId = buildChatRoomId(currentUserId, hostId, apartmentId);
  const chatRef = doc(db, "chats", chatRoomId);
  const snapshot = await getDoc(chatRef);

  if (!snapshot.exists()) {
    await setDoc(
      chatRef,
      {
        users: [currentUserId, hostId],
        status: "active",
        initiatedBy: currentUserId,
        type: "host",
        ...(brokerChatRole ? { brokerChatRole } : {}),
        apartmentId,
        apartmentTitle: apartmentTitle ?? "",
        blockedByUsers,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (brokerChatRole) {
      await syncBrokerClientProfile({
        brokerId: hostId,
        clientId: currentUserId,
        role: "client",
        chatRoomId,
        apartmentId,
      });
    }
    return chatRoomId;
  }

  await setDoc(
    chatRef,
    {
      type: "host",
      ...(brokerChatRole ? { brokerChatRole } : {}),
      apartmentId,
      apartmentTitle: apartmentTitle ?? "",
      blockedByUsers,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (brokerChatRole) {
    await syncBrokerClientProfile({
      brokerId: hostId,
      clientId: currentUserId,
      role: "client",
      chatRoomId,
      apartmentId,
    });
  }

  return chatRoomId;
}

/**
 * Updates the block state for ALL chat rooms (roommate & host chats)
 * existing between two users.
 */
export async function setBlockStateBetweenUsers(
  currentUserId: string,
  targetUserId: string,
  isBlocked: boolean
): Promise<void> {
  try {
    const chatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", currentUserId)
    );
    const snapshot = await getDocs(chatsQ);

    const batch = writeBatch(db);
    let hasUpdates = false;

    snapshot.docs.forEach((chatDoc) => {
      const users = chatDoc.data()?.users;
      if (Array.isArray(users) && users.includes(targetUserId)) {
        hasUpdates = true;
        batch.set(
          chatDoc.ref,
          {
            [`blockedByUsers.${currentUserId}`]: isBlocked,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    if (hasUpdates) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Error setting block state between users:", error);
    throw error;
  }
}