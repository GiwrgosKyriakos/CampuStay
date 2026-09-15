import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { sendPushToUser } from "../lib/push";
import type { UnifiedNotificationType } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

function messagePreview(data: Record<string, unknown>): string {
  switch (data.type) {
    case "filter_set_share":
    case "filter_share": return "🔍 Διαμοιρασμός Φίλτρων Αναζήτησης";
    case "assignment_request": return "📋 Νέα Ανάθεση Ακινήτου";
    case "appointment_proposal":
    case "visit_request": return "Νέο αίτημα για ραντεβού επίσκεψης";
    case "appointment_accepted":
    case "visit_confirmed": return "Το ραντεβού επιβεβαιώθηκε!";
    case "visit_rescheduled": return "⚠️ Αλλαγή Ραντεβού Υπόδειξης";
    case "visit_cancelled": return "Ακύρωση Ραντεβού Υπόδειξης";
    case "price_offer":
    case "price_proposal": return "Νέα πρόταση τιμής";
    case "price_offer_accepted": return "Η πρόταση τιμής έγινε δεκτή!";
    case "address_revealed": return "Ο μεσίτης σας κοινοποίησε την ακριβή τοποθεσία.";
    default: return typeof data.text === "string" ? data.text : "Νέο μήνυμα";
  }
}

function messageNotificationType(data: Record<string, unknown>): UnifiedNotificationType {
  switch (data.type) {
    case "appointment_proposal":
    case "visit_request": return "appointment_proposal";
    case "appointment_accepted":
    case "visit_confirmed": return "appointment_accepted";
    case "price_offer":
    case "price_proposal": return "price_offer";
    case "price_offer_accepted": return "price_offer_accepted";
    default: return "chat_message";
  }
}

export const onNewChatMessage = onDocumentCreated({ document: "chats/{conversationId}/messages/{messageId}", region: "europe-west1" }, async (event) => {
  const message = event.data?.data() as Record<string, unknown> | undefined;
  if (!message) return;
  const conversationId = event.params.conversationId;
  const chatSnapshot = await db.doc(`chats/${conversationId}`).get();
  if (!chatSnapshot.exists) return;
  const chat = chatSnapshot.data() ?? {};
  const senderId = typeof message.senderId === "string" ? message.senderId : "";
  const explicitRecipient = typeof message.receiverId === "string" ? message.receiverId : "";
  const recipients = explicitRecipient
    ? [explicitRecipient]
    : (Array.isArray(chat.users) ? chat.users.filter((userId): userId is string => typeof userId === "string" && userId !== senderId) : []);
  const preview = messagePreview(message);
  const notificationType = messageNotificationType(message);
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata as Record<string, unknown> : {};
  const apartmentId = typeof message.apartmentId === "string"
    ? message.apartmentId
    : typeof metadata.apartmentId === "string" ? metadata.apartmentId : undefined;
  const senderSnapshot = senderId ? await db.doc(`users/${senderId}`).get() : null;
  const senderData = senderSnapshot?.data() ?? {};
  const senderName = typeof senderData.name === "string" && senderData.name.trim() ? senderData.name.trim() : "CampuStay";

  await Promise.all(recipients.map(async (recipientId) => {
    const recipient = await db.doc(`users/${recipientId}`).get();
    const recipientData = recipient.data() ?? {};
    if (recipientData.activeChatId === conversationId) {
      console.log("Recipient is actively in chat. Suppressing push notification.");
      return;
    }
    const settings = await db.doc(`settings/${recipientId}`).get();
    const notifications = { ...(recipientData.notifications ?? {}), ...(settings.data()?.notifications ?? {}) };
    if (notifications.direct_messages === false || recipientData.directMessagesEnabled === false || notifications.mute_all_notifications === true) return;
    const mutedChats = Array.isArray(notifications.muted_chat_ids) ? notifications.muted_chat_ids : [];
    if (mutedChats.includes(conversationId) || chat.mutedByUsers?.[recipientId] === true) return;
    await sendPushToUser(recipientId, {
      type: notificationType,
      title: senderName,
      body: preview,
      screen: "chat/[id]",
      params: {
        chatId: conversationId,
        messageId: event.params.messageId,
        messageType: typeof message.type === "string" ? message.type : "chat_message",
        ...(apartmentId ? { apartmentId } : {}),
      },
      entityId: event.params.messageId,
      action: "scroll_to_message",
    });
  }));

  const senderIsBroker = senderData.is_broker === true || senderData.agencyRole === "ceo" || senderData.agencyRole === "secretary" || senderData.agencyRole === "secretariat" || senderData.role === "ceo" || senderData.role === "secretary" || senderData.role === "secretariat";
  if (senderId && senderIsBroker && message.type === "text") {
    const matchingLeads = await db.collection("leads").where("chatRoomId", "==", conversationId).where("status", "==", "assigned").get();
    await Promise.all(matchingLeads.docs.map((lead) => lead.ref.update({ lastContactTimestamp: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })));
  }
});
