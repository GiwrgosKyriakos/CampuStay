import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/src/config/firebase";

function safeTimestampToMillis(value: unknown, fallback: number): number {
  if (!value) return fallback;
  try {
    if (typeof (value as any).toMillis === "function") {
      const millis = (value as any).toMillis();
      return Number.isFinite(millis) ? millis : fallback;
    }
  } catch {
    // Pending Firestore timestamps can expose an unavailable delegate.
  }
  try {
    if (typeof (value as any).seconds === "number") {
      const nanos = typeof (value as any).nanoseconds === "number" ? (value as any).nanoseconds : 0;
      return (value as any).seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  } catch {
    return fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Permanently hard-deletes messages sent at/before the oldest clearedAt among all
 * chat participants, once every participant has cleared the chat at least once.
 */
export async function cleanupObsoleteChatMessages(chatRoomId: string): Promise<void> {
  if (!chatRoomId) return;

  try {
    const chatRef = doc(db, "chats", chatRoomId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) return;

    const chatData = chatSnap.data();
    const users: string[] = Array.isArray(chatData.users) ? chatData.users : [];
    if (users.length < 2) return;

    const clearedAtMap = (chatData.clearedAt as Record<string, unknown>) || {};

    const allUsersCleared = users.every((uid) => safeTimestampToMillis(clearedAtMap[uid], 0) > 0);
    if (!allUsersCleared) return;

    const clearTimestamps = users.map((uid) => safeTimestampToMillis(clearedAtMap[uid], 0));
    const minClearedAt = Math.min(...clearTimestamps);
    if (minClearedAt <= 0) return;

    const messagesSnap = await getDocs(collection(db, "chats", chatRoomId, "messages"));
    if (messagesSnap.empty) return;

    const obsoleteDocs = messagesSnap.docs.filter((msgDoc) => {
      const msgData = msgDoc.data();
      const msgCreatedAt = safeTimestampToMillis(msgData.createdAt, 0);
      return msgCreatedAt > 0 && msgCreatedAt <= minClearedAt;
    });

    if (obsoleteDocs.length === 0) return;

    const batch = writeBatch(db);
    obsoleteDocs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
    console.log(`[ChatCleanup] Permanently deleted ${obsoleteDocs.length} obsolete messages from chat ${chatRoomId} prior to ${new Date(minClearedAt).toISOString()}`);
  } catch (error) {
    console.warn("[ChatCleanup] Failed to clean up obsolete messages:", error);
  }
}
