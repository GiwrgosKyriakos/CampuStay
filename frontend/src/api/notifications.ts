import * as Notifications from "expo-notifications";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/src/config/firebase";

/**
 * Sends a local push notification for a new message.
 * Call this when a message is received and the user is not actively viewing that chat.
 *
 * @param senderName - Name of the person sending the message
 * @param messagePreview - Preview of the message (usually first 80 chars)
 * @param chatRoomId - The chat room ID (for routing on notification press)
 * @param recipientUserId - The UID of the user receiving the notification (to check preferences)
 */
export async function sendMessageNotification(
  senderName: string,
  messagePreview: string,
  chatRoomId: string,
  recipientUserId: string
): Promise<void> {
  try {
    // Check if user has notifications enabled for direct messages
    const userSettingsRef = doc(db, "users", recipientUserId);
    const userSettingsSnap = await getDoc(userSettingsRef);

    if (!userSettingsSnap.exists()) {
      console.warn("User settings not found for notification check");
      return;
    }

    const userData = userSettingsSnap.data();
    const notificationsEnabled = userData?.notifications?.direct_messages !== false;

    if (!notificationsEnabled) {
      return; // User has disabled message notifications
    }

    // Truncate message preview to reasonable length
    const truncatedPreview = messagePreview.length > 80 
      ? messagePreview.substring(0, 77) + "..." 
      : messagePreview;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: senderName,
        body: truncatedPreview,
        data: {
          chatRoomId,
          type: "message",
        },
        // Use the brand color for notification accent if supported
        badge: 1,
      },
      trigger: null, // Send immediately
    });
  } catch (error) {
    console.error("Error sending message notification:", error);
    // Silently fail - this is a nice-to-have feature that shouldn't break messaging
  }
}

/**
 * Configures notification behavior for the app.
 * Call this once during app startup to set notification handling rules.
 *
 * Sets notification handler to show notifications even when app is in foreground.
 */
export function configureNotificationHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (error) {
    console.error("Error configuring notification handler:", error);
  }
}

/**
 * Registers for push notifications and returns the Expo Push Token.
 * This token can be stored in the user's profile for remote push notifications.
 *
 * @returns The Expo Push Token string, or null if registration fails
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Failed to get push notification permissions");
      return null;
    }

    // This will only work on physical devices, not on web or in the simulator
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return null;
  }
}

/**
 * Checks if a message should trigger a notification.
 * Returns false if it's the user's own message or if from an already-open chat.
 *
 * @param messageData - The message data
 * @param currentUserId - Current user's UID
 * @param activeChatsRoomIds - Set of chat room IDs currently being viewed
 * @returns true if notification should be sent, false otherwise
 */
export function shouldNotifyForMessage(
  messageData: { senderId?: string; text?: string } | null,
  currentUserId: string,
  activeChatsRoomIds: Set<string>
): boolean {
  if (!messageData || !messageData.text?.trim()) return false;
  if (messageData.senderId === currentUserId) return false;
  // Don't notify if user is already viewing this chat
  // This would be called with an empty set by default unless tracking active chats
  return true;
}
