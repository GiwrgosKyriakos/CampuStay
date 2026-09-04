import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";

import { sendPushToUser, type UnifiedNotificationPayload } from "../lib/push";
import { logAnalyticsEvent, type StandardLeadSource } from "../lib/analyticsEvents";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type UserData = DocumentData;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

async function notifyUsers(userIds: Iterable<string>, payload: UnifiedNotificationPayload, channelId = "deals_pipeline"): Promise<void> {
  await Promise.all([...new Set([...userIds].filter(Boolean))].map((userId) => sendPushToUser(userId, payload, channelId)));
}

function appointmentPayload(type: "visit_confirmed" | "visit_cancelled", data: DocumentData, appointmentId: string, action?: string): UnifiedNotificationPayload {
  const chatId = stringValue(data.chatRoomId);
  const statusText = type === "visit_cancelled" ? "Το ραντεβού υπόδειξης ακυρώθηκε." : "Το ραντεβού υπόδειξης επιβεβαιώθηκε.";
  return {
    type,
    title: type === "visit_cancelled" ? "Ακύρωση ραντεβού" : "Επιβεβαίωση υπόδειξης",
    body: statusText,
    screen: chatId ? "chat/[id]" : "calendar",
    params: { appointmentId, ...(chatId ? { chatId } : {}) },
    entityId: appointmentId,
    ...(action ? { action } : {}),
  };
}

function appointmentUsers(data: DocumentData): string[] {
  return [stringValue(data.brokerId), stringValue(data.clientId), stringValue(data.listingBrokerId), stringValue(data.buyerBrokerId), stringValue(data.coveringBrokerId)].filter(Boolean);
}

export const onAppointmentCreated = onDocumentCreated("appointments/{appointmentId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== "confirmed") return;
  await notifyUsers(appointmentUsers(data), appointmentPayload("visit_confirmed", data, event.params.appointmentId), "visit_reminders");
});

export const onAppointmentUpdated = onDocumentUpdated("appointments/{appointmentId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const appointmentId = event.params.appointmentId;
  if (before.status === "pending" && after.status === "confirmed") {
    await notifyUsers(appointmentUsers(after), appointmentPayload("visit_confirmed", after, appointmentId), "visit_reminders");
    return;
  }
  if (before.status !== "cancelled" && after.status === "cancelled") {
    await notifyUsers(appointmentUsers(after), appointmentPayload("visit_cancelled", after, appointmentId), "visit_reminders");
  }
});

function offerPayload(data: DocumentData, offerId: string, action: string): UnifiedNotificationPayload {
  const chatId = stringValue(data.chatRoomId || data.conversationId);
  const apartmentId = stringValue(data.apartmentId || data.listingId);
  const clientId = stringValue(data.clientId || data.clientUserId);
  const brokerId = stringValue(data.brokerId || data.hostId);
  return {
    type: "new_offer",
    title: action === "response" ? "Απάντηση σε προσφορά" : "Νέα προσφορά",
    body: action === "response" ? "Υπάρχει νέα απάντηση στην προσφορά σας." : "Έχετε λάβει νέα προσφορά για ακίνητο.",
    screen: chatId ? "chat/[id]" : brokerId ? "broker-client-detail" : "apartment-detail",
    params: { offerId, ...(chatId ? { chatId } : {}), ...(apartmentId ? { apartmentId } : {}), ...(clientId ? { clientId } : {}) },
    entityId: offerId,
    action,
  };
}

function offerRecipients(data: DocumentData, response: boolean): string[] {
  const senderId = stringValue(data.senderId || data.createdBy || data.updatedBy);
  const clientId = stringValue(data.clientId || data.clientUserId);
  const brokerId = stringValue(data.brokerId || data.hostId);
  if (response) return [clientId || (senderId === brokerId ? "" : brokerId)];
  return [brokerId || stringValue(data.recipientId) || (senderId === clientId ? "" : clientId)];
}

export const onOfferCreated = onDocumentCreated("offers/{offerId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await notifyUsers(offerRecipients(data, false), offerPayload(data, event.params.offerId, "open"));
  const agencyId = stringValue(data.agencyId);
  if (!agencyId) return;
  const source = data.source as StandardLeadSource;
  await logAnalyticsEvent({
    agencyId,
    eventType: "offer_submitted",
    timestamp: Date.now(),
    listingId: stringValue(data.apartmentId || data.listingId) || undefined,
    leadId: stringValue(data.leadId) || undefined,
    brokerId: stringValue(data.brokerId || data.createdBy) || undefined,
    source: ["spitogatos", "xe_gr", "meta_ads", "google_ads", "agency_website", "referral", "walk_in", "signboard", "other"].includes(source) ? source : "other",
    transactionType: data.transactionType === "sale" || data.transactionType === "rent" ? data.transactionType : undefined,
    amount: typeof data.amount === "number" ? data.amount : typeof data.offerAmount === "number" ? data.offerAmount : undefined,
    metadata: { offerId: event.params.offerId },
  });
});

export const onOfferUpdated = onDocumentUpdated("offers/{offerId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  await notifyUsers(offerRecipients(after, true), offerPayload(after, event.params.offerId, "response"));
});

async function notifyApprovedOffer(eventData: DocumentData | undefined, conversationId: string, offerId: string): Promise<void> {
  if (!eventData) return;
  const chatSnapshot = await db.doc(`chats/${conversationId}`).get();
  const users = stringValues(chatSnapshot.data()?.users);
  const clientId = stringValue(eventData.clientUserId || eventData.clientId);
  const recipients = users.filter((userId) => userId !== clientId);
  await notifyUsers(recipients, offerPayload({ ...eventData, chatRoomId: conversationId, clientId }, offerId, "open"));
}

export const onApprovedOfferCreated = onDocumentCreated("chats/{conversationId}/approvedOffers/{offerId}", async (event) => {
  await notifyApprovedOffer(event.data?.data(), event.params.conversationId, event.params.offerId);
});

export const onApprovedOfferUpdated = onDocumentUpdated("chats/{conversationId}/approvedOffers/{offerId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  await notifyApprovedOffer(after, event.params.conversationId, event.params.offerId);
});

function documentKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .map(([key]) => key);
}

export const onListingDocumentsUpdated = onDocumentUpdated("apartments/{apartmentId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const beforeDocuments = JSON.stringify(before.documents ?? {});
  const afterDocuments = JSON.stringify(after.documents ?? {});
  if (beforeDocuments === afterDocuments) return;
  const beforeDocumentMap = before.documents && typeof before.documents === "object" ? before.documents as Record<string, unknown> : {};
  const afterDocumentMap = after.documents && typeof after.documents === "object" ? after.documents as Record<string, unknown> : {};
  const changedCategories = [...new Set([...documentKeys(before.documents), ...documentKeys(after.documents)])]
    .filter((key) => JSON.stringify(beforeDocumentMap[key] ?? []) !== JSON.stringify(afterDocumentMap[key] ?? []) && Array.isArray(afterDocumentMap[key]) && afterDocumentMap[key].length > 0);
  if (changedCategories.length === 0) return;
  const recipients = [
    stringValue(after.ownerId || after.hostId),
    ...stringValues(after.assignedBrokerIds),
    stringValue(after.rentedToUserId || after.clientId),
  ];
  await notifyUsers(recipients, {
    type: "document_required",
    title: "Νέα έγγραφα ακινήτου",
    body: `Προστέθηκαν έγγραφα προς έλεγχο: ${changedCategories.join(", ")}.`,
    screen: "apartment-detail",
    params: { apartmentId: event.params.apartmentId, categories: changedCategories },
    entityId: event.params.apartmentId,
    action: "verify_document",
  });
});

function contractUsers(data: DocumentData): string[] {
  return [stringValue(data.brokerId), stringValue(data.clientId), stringValue(data.ownerId), stringValue(data.createdByUserId), ...stringValues(data.requiredSignerIds)];
}

function contractPayload(data: DocumentData, contractId: string, action: string): UnifiedNotificationPayload {
  const chatId = stringValue(data.chatRoomId);
  return {
    type: "document_required",
    title: action === "signed" ? "Το έγγραφο υπογράφηκε" : "Απαιτείται υπογραφή εγγράφου",
    body: action === "signed" ? "Το συμβαλλόμενο έγγραφο ολοκληρώθηκε." : `Απαιτείται ενέργεια στο έγγραφο «${stringValue(data.title) || "Έγγραφο"}».`,
    screen: chatId ? "chat/[id]" : "broker-client-detail",
    params: { contractId, ...(chatId ? { chatId } : {}) },
    entityId: contractId,
    action,
  };
}

export const onContractStatusUpdatedForNotification = onDocumentUpdated("contracts/{contractId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (!before.requestSentAt && after.requestSentAt) {
    const recipients = stringValues(after.requiredSignerIds);
    await notifyUsers(recipients.length > 0 ? recipients : contractUsers(after), contractPayload(after, event.params.contractId, "sign"));
    return;
  }
  if (before.status !== after.status && after.status === "signed") {
    await notifyUsers(contractUsers(after), contractPayload(after, event.params.contractId, "signed"));
  }
});

export const onBrokerApprovalUpdated = onDocumentUpdated("users/{brokerId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.agencyStatus === after.agencyStatus || (after.agencyStatus !== "approved" && after.agencyStatus !== "none")) return;
  const approved = after.agencyStatus === "approved";
  await notifyUsers([event.params.brokerId], {
    type: "broker_approved",
    title: approved ? "Η αίτηση εγκρίθηκε" : "Η αίτηση απορρίφθηκε",
    body: approved ? "Η αίτησή σας για ένταξη στο γραφείο εγκρίθηκε." : "Η αίτησή σας για ένταξη στο γραφείο απορρίφθηκε.",
    screen: "profile",
    params: { agencyId: stringValue(after.agencyId), status: after.agencyStatus },
    entityId: event.params.brokerId,
    action: approved ? "approved" : "rejected",
  });
});

function dealUsers(data: DocumentData): string[] {
  return [stringValue(data.brokerId), stringValue(data.clientId), stringValue(data.ownerId), stringValue(data.listingBrokerId), stringValue(data.buyerBrokerId), stringValue(data.coveringBrokerId)];
}

function dealBrokerUsers(data: DocumentData): string[] {
  return [stringValue(data.listingBrokerId), stringValue(data.buyerBrokerId), stringValue(data.coveringBrokerId)].filter(Boolean);
}

async function agencyReviewers(agencyId: string): Promise<string[]> {
  if (!agencyId) return [];
  const staff = await db.collection("users").where("agencyId", "==", agencyId).get();
  return staff.docs
    .filter((user) => ["ceo", "secretary", "secretariat", "admin"].includes(stringValue(user.data().agencyRole)) || ["ceo", "secretary", "secretariat", "admin"].includes(stringValue(user.data().role)))
    .map((user) => user.id);
}

async function checklistRoleRecipients(role: string, deal: DocumentData): Promise<string[]> {
  if (role === "client") return [stringValue(deal.clientId)].filter(Boolean);
  if (role === "owner") return [stringValue(deal.ownerId || deal.hostId)].filter(Boolean);
  if (role === "broker") return dealBrokerUsers(deal);
  return agencyReviewers(stringValue(deal.agencyId));
}

function checklistPayload(type: "document_required" | "document_rejected" | "document_verified" | "notary_ready", title: string, body: string, dealId: string, clientId: string, itemId: string, action: string): UnifiedNotificationPayload {
  return {
    type,
    title,
    body,
    screen: "broker-client-detail",
    params: { dealId, clientId, highlightItemId: itemId },
    entityId: dealId,
    action,
  };
}

export const onChecklistItemUpdated = onDocumentUpdated("deals/{dealId}/checklist/{itemId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  const dealSnapshot = await db.doc(`deals/${event.params.dealId}`).get();
  if (!dealSnapshot.exists) return;
  const deal = dealSnapshot.data() ?? {};
  const title = stringValue(after.title) || "Έγγραφο";
  const itemId = event.params.itemId;

  if (after.status === "uploaded") {
    await notifyUsers(dealBrokerUsers(deal), checklistPayload("document_required", "Νέο έγγραφο προς έλεγχο", `Νέο έγγραφο προς έλεγχο: ${title}`, event.params.dealId, stringValue(deal.clientId), itemId, "review_checklist_document"));
  }
  if (after.status === "rejected") {
    const reason = stringValue(after.rejectionReason) || "Απαιτείται διόρθωση ή νέο αρχείο.";
    const recipients = await checklistRoleRecipients(stringValue(after.assignedToRole), deal);
    await notifyUsers(recipients, checklistPayload("document_rejected", "Απόρριψη εγγράφου", `Το έγγραφο ${title} απορρίφθηκε: ${reason}`, event.params.dealId, stringValue(deal.clientId), itemId, "replace_checklist_document"));
  }
  if (after.status !== "verified" || before.status === "verified") return;
  await notifyUsers(
    await checklistRoleRecipients(stringValue(after.assignedToRole), deal),
    checklistPayload("document_verified", "Το έγγραφο εγκρίθηκε", `Το έγγραφο ${title} εγκρίθηκε.`, event.params.dealId, stringValue(deal.clientId), itemId, "view_checklist_document"),
  );
  const checklist = await db.collection(`deals/${event.params.dealId}/checklist`).get();
  const items = checklist.docs.map((item) => item.data());
  const stage90Complete = items.some((item) => Number(item.requiredForStage) <= 90) && items.filter((item) => Number(item.requiredForStage) <= 90).every((item) => item.status === "verified");
  const stage100Complete = items.length > 0 && items.every((item) => item.status === "verified");
  const reviewers = await agencyReviewers(stringValue(deal.agencyId));
  if (stage90Complete) {
    await notifyUsers(reviewers, checklistPayload("notary_ready", "Έτοιμο για Προσύμφωνο", "Όλα τα τεχνικά και νομικά προαπαιτούμενα επαληθεύτηκαν. Συντονίστε το προσύμφωνο.", event.params.dealId, stringValue(deal.clientId), itemId, "schedule_notarial_appointment"));
  }
  if (stage100Complete) {
    await notifyUsers(reviewers, checklistPayload("notary_ready", "Έτοιμο για Οριστικό Συμβόλαιο", "Όλα τα έγγραφα του deal επαληθεύτηκαν. Συντονίστε το οριστικό συμβόλαιο και την εκκαθάριση.", event.params.dealId, stringValue(deal.clientId), itemId, "settle_deal"));
  }
});

export const onCanonicalDealStageUpdated = onDocumentUpdated("deals/{dealId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.stage === after.stage) return;
  const stage = Number(after.stage);
  if (stage !== 90 && stage !== 100) return;
  await notifyUsers(dealUsers(after), {
    type: "deal_stage_update",
    title: stage === 90 ? "Το deal έφτασε στο Προσύμφωνο" : "Το deal έφτασε στο Οριστικό Συμβόλαιο",
    body: stage === 90 ? "Τα προαπαιτούμενα επαληθεύτηκαν και το deal προχώρησε στο στάδιο προσυμφώνου." : "Το deal προχώρησε στο στάδιο οριστικού συμβολαίου.",
    screen: "broker-client-detail",
    params: { dealId: event.params.dealId, stage },
    entityId: event.params.dealId,
    action: stage === 90 ? "schedule_notarial_appointment" : "settle_deal",
  });
});

export const onDealRecordCreated = onDocumentWritten("deals/{dealId}", async (event) => {
  const before = event.data?.before.data();
  const data = event.data?.after.data();
  if (!data || data.status !== "closed" || before?.status === "closed") return;
  const apartmentId = stringValue(data.apartmentId);
  const payload: UnifiedNotificationPayload = {
    type: "closed_deal",
    title: "Ολοκληρώθηκε deal",
    body: `Το deal για το ακίνητο «${stringValue(data.apartmentTitle) || "Ακίνητο"}» ολοκληρώθηκε.`,
    screen: "agency-management",
    params: { dealId: event.params.dealId, ...(apartmentId ? { apartmentId } : {}) },
    entityId: event.params.dealId,
    action: "invoice_required",
  };
  const agencyId = stringValue(data.agencyId);
  const staff = agencyId ? await db.collection("users").where("agencyId", "==", agencyId).get() : null;
  const adminIds = staff?.docs.filter((user) => ["ceo", "secretary", "secretariat"].includes(stringValue(user.data().agencyRole)) || user.data().role === "secretariat").map((user) => user.id) ?? [];
  await notifyUsers([...dealUsers(data), ...adminIds], payload);
});
