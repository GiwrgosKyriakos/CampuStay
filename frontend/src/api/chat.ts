import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  updateDoc,
  batch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/config/firebase";

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
