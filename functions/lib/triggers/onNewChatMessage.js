"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewChatMessage = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function messagePreview(data) {
    switch (data.type) {
        case "filter_set_share":
        case "filter_share": return "🔍 Διαμοιρασμός Φίλτρων Αναζήτησης";
        case "assignment_request": return "📋 Νέα Ανάθεση Ακινήτου";
        case "visit_confirmed": return "📅 Επιβεβαιωμένη Υπόδειξη";
        case "visit_rescheduled": return "⚠️ Αλλαγή Ραντεβού Υπόδειξης";
        case "visit_cancelled": return "Ακύρωση Ραντεβού Υπόδειξης";
        case "address_revealed": return "Ο μεσίτης σας κοινοποίησε την ακριβή τοποθεσία.";
        default: return typeof data.text === "string" ? data.text : "Νέο μήνυμα";
    }
}
exports.onNewChatMessage = (0, firestore_2.onDocumentCreated)("chats/{conversationId}/messages/{messageId}", async (event) => {
    const message = event.data?.data();
    if (!message)
        return;
    const conversationId = event.params.conversationId;
    const chatSnapshot = await db.doc(`chats/${conversationId}`).get();
    if (!chatSnapshot.exists)
        return;
    const chat = chatSnapshot.data() ?? {};
    const senderId = typeof message.senderId === "string" ? message.senderId : "";
    const explicitRecipient = typeof message.receiverId === "string" ? message.receiverId : "";
    const recipients = explicitRecipient
        ? [explicitRecipient]
        : (Array.isArray(chat.users) ? chat.users.filter((userId) => typeof userId === "string" && userId !== senderId) : []);
    const preview = messagePreview(message);
    await Promise.all(recipients.map(async (recipientId) => {
        const recipient = await db.doc(`users/${recipientId}`).get();
        if (recipient.data()?.activeChatId === conversationId) {
            console.log("Recipient is actively in chat. Suppressing push notification.");
            return;
        }
        const settings = await db.doc(`settings/${recipientId}`).get();
        const notifications = settings.data()?.notifications ?? recipient.data()?.notifications ?? {};
        if (notifications.direct_messages === false || notifications.mute_all_notifications === true)
            return;
        const mutedChats = Array.isArray(notifications.muted_chat_ids) ? notifications.muted_chat_ids : [];
        if (mutedChats.includes(conversationId) || chat.mutedByUsers?.[recipientId] === true)
            return;
        await (0, push_1.sendPushToUser)(recipientId, { type: "chat_message", title: "Νέα ενημέρωση στο CampuStay", body: preview, screen: "chat/[id]", params: { chatId: conversationId, messageId: event.params.messageId }, entityId: event.params.messageId, action: "scroll_to_message" });
    }));
    const senderSnapshot = senderId ? await db.doc(`users/${senderId}`).get() : null;
    const senderData = senderSnapshot?.data() ?? {};
    const senderIsBroker = senderData.is_broker === true || senderData.agencyRole === "ceo" || senderData.agencyRole === "secretary" || senderData.agencyRole === "secretariat" || senderData.role === "ceo" || senderData.role === "secretary" || senderData.role === "secretariat";
    if (senderId && senderIsBroker && message.type === "text") {
        const matchingLeads = await db.collection("leads").where("chatRoomId", "==", conversationId).where("status", "==", "assigned").get();
        await Promise.all(matchingLeads.docs.map((lead) => lead.ref.update({ lastContactTimestamp: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() })));
    }
});
//# sourceMappingURL=onNewChatMessage.js.map