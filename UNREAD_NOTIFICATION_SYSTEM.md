# Real-Time Unread Message Notification System - Implementation Guide

## Overview
This implementation adds a complete real-time unread message tracking system using Firebase Firestore with:
- **Automatic read state tracking** on messages
- **Real-time unread indicator** (orange dot) in chat list
- **Automatic marking as read** when user opens a chat
- **Push notification support** (optional integration)

## Architecture

### Data Model Updates

#### Firestore Message Document Structure
```typescript
// /chats/[chatRoomId]/messages/[messageId]
{
  text: string;                  // Message content
  senderId: string;              // UID of sender
  receiverId: string;            // UID of receiver
  createdAt: Timestamp;          // Server timestamp
  isRead: boolean;               // NEW: Track read status
  readAt?: Timestamp;            // NEW: When message was marked as read
  readBy?: string[];             // NEW: Array of UIDs who read this message
}
```

**Key Point**: Messages are created with `isRead: false` and marked as `true` when the recipient enters the chat.

---

## Implementation Details

### 1. Chat Messaging API (`/frontend/src/api/chat.ts`)

#### Core Functions

**`markIncomingMessagesAsRead(chatRoomId, currentUserId, counterpartUserId)`**
- Triggered when user enters a chat room
- Queries all unread messages from the counterparty
- Batch updates them to `isRead: true`
- Sets `readAt` timestamp and `readBy` array
- Non-blocking; silently fails if there's an error

```typescript
// Called automatically in chat screen when chat loads
useEffect(() => {
  if (!currentUserId || !chatRoomId || !id) return;
  void markIncomingMessagesAsRead(chatRoomId, currentUserId, id);
}, [chatRoomId, currentUserId, id]);
```

**`isMessageUnread(messageData, currentUserId)`**
- Checks if a message is unread by the current user
- Used by matches list to determine if unread indicator should show
- Has fallback checks for multiple read-tracking patterns

**`hasUnreadMessagesFrom(chatRoomId, senderUserId)`**
- Utility to check if unread messages exist from a specific sender
- Useful for filtering or counting unread conversations

---

### 2. Chat Screen Updates (`/frontend/app/chat/[id].tsx`)

#### Changes Made

1. **Import Chat API**
```typescript
import { markIncomingMessagesAsRead } from "@/src/api/chat";
```

2. **Updated Message Interface**
```typescript
interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
  isRead?: boolean;  // NEW
}
```

3. **Mark Messages as Read on Entry** (NEW)
```typescript
// Add this useEffect after the main messages listener
useEffect(() => {
  if (!currentUserId || !chatRoomId || !id) return;
  void markIncomingMessagesAsRead(chatRoomId, currentUserId, id);
}, [chatRoomId, currentUserId, id]);
```

4. **Send Messages with `isRead: false`** (UPDATED)
```typescript
await addDoc(collection(db, "chats", chatRoomId, "messages"), {
  text: trimmed,
  senderId: currentUserId,
  receiverId: id,
  createdAt: serverTimestamp(),
  isRead: false,  // NEW: Mark as unread when sent
});
```

5. **Map Message Data with `isRead`** (UPDATED)
```typescript
const fetched: Message[] = snapshot.docs.map((doc) => {
  const data = doc.data() as FirestoreMessageDoc;
  return {
    id: doc.id,
    text: data.text ?? "",
    senderId: data.senderId ?? "",
    createdAt: data.createdAt ?? 0,
    isRead: data.isRead ?? true,  // NEW
  };
});
```

---

### 3. Matches Screen (`/frontend/app/(tabs)/matches.tsx`)

**No Changes Required** ✅

The matches screen already has the correct logic to display the unread indicator:

```typescript
const unreadFromCounterparty =
  !isPending &&
  !!lastMessage &&
  lastMessage.senderId !== currentUserId &&
  !lastMessage.isRead;

// Then renders:
{unreadFromCounterparty ? (
  <View style={styles.unreadDot} testID={`chat-unread-dot-${p.id}`} />
) : (
  <Ionicons name="paper-plane-outline" size={22} color={colors.onSurfaceTertiary} />
)}
```

The orange dot will automatically show once the message data includes `isRead: false`.

---

### 4. Push Notifications (`/frontend/src/api/notifications.ts`)

#### Optional Integration

Created helper functions for push notification support:

**`sendMessageNotification(senderName, messagePreview, chatRoomId, recipientUserId)`**
- Sends local push notification when message arrives
- Checks user's notification preference before sending
- Truncates message preview to 80 characters
- Includes chat room ID for routing

**`configureNotificationHandler()`**
- Configure notification behavior for app
- Shows notifications even when app is in foreground
- Call once during app startup

**`registerForPushNotificationsAsync()`**
- Request notification permissions
- Returns Expo Push Token for remote push notifications
- Can be stored in user profile for backend push services

#### Integration (Optional)

To integrate push notifications into the chat flow:

1. **In your message listener** (in a backend or cloud function):
```typescript
// When a new message arrives
if (messageData.senderId !== currentUserId) {
  await sendMessageNotification(
    senderName,
    messageData.text,
    chatRoomId,
    messageData.receiverId
  );
}
```

2. **In app initialization** (e.g., in auth context or main layout):
```typescript
configureNotificationHandler();
const token = await registerForPushNotificationsAsync();
// Optionally save token to user profile
```

---

## Data Flow Diagram

```
User A sends message to User B
        ↓
   Message created with: isRead: false
        ↓
   Matches screen shows orange dot (last message unread)
        ↓
   User B taps chat room
        ↓
   Chat screen loads
        ↓
   useEffect triggers markIncomingMessagesAsRead()
        ↓
   Firestore: Update all messages from User A → isRead: true
        ↓
   Real-time listener updates → orange dot disappears
        ↓
   Matches screen: Shows paper-plane icon (all read)
```

---

## Real-Time Flow

The entire system is real-time thanks to Firestore's `onSnapshot` listeners:

1. **Message Sent** → Firestore document created with `isRead: false`
2. **Real-time Sync** → Matches screen's last-message listener picks up change
3. **Orange Dot Appears** → `unreadFromCounterparty` becomes `true`
4. **User Opens Chat** → `markIncomingMessagesAsRead()` runs
5. **Messages Updated** → Batch update sets `isRead: true`
6. **Real-time Sync** → Matches screen listener sees updated state
7. **Orange Dot Disappears** → `unreadFromCounterparty` becomes `false`

---

## Key Features

✅ **Real-time Updates** - Uses Firestore onSnapshot listeners  
✅ **Automatic Read Tracking** - Messages marked as read when chat is opened  
✅ **Non-blocking** - Batch operations won't freeze UI  
✅ **Backward Compatible** - Existing read-tracking patterns still work  
✅ **Optional Notifications** - Push notification helpers available but not required  
✅ **Clean Data Model** - Clear `isRead` boolean field with timestamps  
✅ **Existing UI Preserved** - No changes to component styles or layouts  

---

## Testing Checklist

- [ ] Send a message from User A to User B
- [ ] Check Matches screen - orange dot should appear next to User B
- [ ] Tap chat room for User B
- [ ] Check Firestore console - messages should have `isRead: true` after ~100ms
- [ ] Check Matches screen - orange dot should disappear
- [ ] Repeat with reversed roles (B sends to A)
- [ ] Test with multiple conversations simultaneously
- [ ] Test with account deletion (deleted user messages should still work)

---

## Configuration Notes

### Firestore Rules
Ensure your Firestore security rules allow:
- Reading messages from chats user is part of
- Writing `isRead` and `readAt` fields to messages
- Batch updates to messages in user's chats

Example:
```
match /chats/{chatId}/messages/{messageId} {
  allow read: if request.auth.uid in resource.data.get(['senderId', 'receiverId']);
  allow update: if request.auth.uid in resource.data.get(['senderId', 'receiverId']);
}
```

### Performance Notes
- Batch updates limited to ~400 documents per batch (built-in to SDK)
- Queries use composite index on (senderId, isRead, createdAt)
- Firestore will auto-create index as needed
- Real-time listeners scale well with number of active chats

---

## Migration from Existing Messages

If you have existing messages without the `isRead` field:

```typescript
// One-time migration script (run in backend or Cloud Function)
const chatsSnap = await getDocs(collection(db, "chats"));
for (const chatDoc of chatsSnap.docs) {
  const messagesSnap = await getDocs(
    collection(db, "chats", chatDoc.id, "messages")
  );
  const batch = writeBatch(db);
  messagesSnap.docs.forEach((msgDoc) => {
    if (!msgDoc.data().hasOwnProperty('isRead')) {
      batch.update(msgDoc.ref, { isRead: true }); // Mark existing as read
    }
  });
  await batch.commit();
}
```

This marks all existing messages as read, which is safe since they're in the past.

---

## Files Modified

1. **Created**: `/frontend/src/api/chat.ts` - Chat messaging API
2. **Created**: `/frontend/src/api/notifications.ts` - Push notification helpers
3. **Updated**: `/frontend/app/chat/[id].tsx` - Message read marking logic
4. **No Changes**: `/frontend/app/(tabs)/matches.tsx` - Already had unread UI

---

## Next Steps (Optional Enhancements)

- [ ] Add Cloud Functions to trigger push notifications server-side
- [ ] Implement read receipts (show "read" status indicator in messages)
- [ ] Add typing indicators
- [ ] Implement message reaction system
- [ ] Add delivery status (sent, delivered, read)
- [ ] Create admin dashboard to view unread message statistics
