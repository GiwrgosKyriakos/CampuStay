import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { processScheduledVisitReminders } from "./cron/visitReminders";
import { processDealStagnation } from "./cron/dealStagnation";
import { aggregateAnalytics } from "./cron/aggregateAnalytics";
import { sendPushToUser } from "./lib/push";
import { onNewChatMessage } from "./triggers/onNewChatMessage";
import { onListingWithdrawal, onListingWithdrawalEventCreated } from "./triggers/onListingWithdrawal";
import { processLeadInactivityDispatch } from "./cron/leadInactivityDispatch";
import { processMailOutbox } from "./cron/mailOutbox";
import { onContractCompleted } from "./triggers/onContractCompleted";
import { getContractDownloadUrl, recordSigningEvidence, sendSigningOtp, updateContractPayload, verifySigningOtp } from "./callables/signingOtp";
import { verifyContractSignatureAuditTrailCallable } from "./callables/contractAudit";
import { claimLeadCallable, claimPropertyCallable, createCrossBrokerShowingCallable, delegateShowingCallable, finalizeCommissionSettlementCallable, publishListingAssignmentCallable, recordKeySafeActionCallable, recordShowingFeedbackCallable, reassignLeadCallable, reviewClaimCallable } from "./callables/agencyCollaboration";
import { advanceDealStageCallable, finalizeChecklistDocumentUploadCallable, initializeDealCallable, reviewChecklistDocumentCallable } from "./callables/dealPipeline";
import { migrateLegacyDealsCallable } from "./callables/dealMigration";
import { analyzeComparativeMarket, generateCmaReport, persistCmaHistory } from "./ai/cmaService";
import { generateListingCopywriting, generatePropertyListingCopy as generatePropertyListingCopyService } from "./ai/copywriterService";
import { analyzeShowingFeedbackSentiment } from "./ai/sentimentService";
import { buildOwnerActivityPdfReport, generateOwnerPerformanceReport as generateOwnerPerformanceReportService, persistOwnerReport } from "./ai/ownerReportService";
import {
  onAppointmentCreated,
  onAppointmentUpdated,
  onOfferCreated,
  onOfferUpdated,
  onApprovedOfferCreated,
  onApprovedOfferUpdated,
  onListingDocumentsUpdated,
  onContractStatusUpdatedForNotification,
  onBrokerApprovalUpdated,
  onDealRecordCreated,
  onChecklistItemUpdated,
  onCanonicalDealStageUpdated,
} from "./triggers/notificationLifecycle";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type AiFeature = "sentiment" | "cma" | "copywriter" | "owner_report";
interface AiUsage { tokenCount: number }

const AI_DAILY_LIMIT = 15;

export async function assertCanAccessApartment(apartmentId: string, authUid: string, allowedRoles = ["secretariat", "admin"]): Promise<void> {
  const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
  const apartment = apartmentSnapshot.data();
  if (!apartment) throw new HttpsError("permission-denied", "You do not have permission to run AI analysis on this property.");

  const userSnapshot = await db.doc(`users/${authUid}`).get();
  const user = userSnapshot.data() ?? {};
  const role = typeof user.role === "string" ? user.role : typeof user.agencyRole === "string" ? user.agencyRole : "";
  const isPrivileged = allowedRoles.includes(role);
  const isAssignedBroker = Array.isArray(apartment.assignedBrokerIds) && apartment.assignedBrokerIds.includes(authUid);
  const canAccess = apartment.ownerId === authUid || apartment.hostId === authUid || isAssignedBroker || isPrivileged;
  if (!canAccess) throw new HttpsError("permission-denied", "You do not have permission to run AI analysis on this property.");
}

async function consumeAiRateLimit(uid: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const rateLimitRef = db.doc(`ai_rate_limits/${uid}_${day}`);
  const allowed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateLimitRef);
    const count = Number(snapshot.data()?.count ?? 0);
    if (count >= AI_DAILY_LIMIT) return false;
    transaction.set(rateLimitRef, { uid, day, count: count + 1, updatedAt: Timestamp.now() }, { merge: true });
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", "Έχετε φτάσει το ημερήσιο όριο κλήσεων AI.");
}

async function auditAiInvocation(uid: string, apartmentId: string, feature: AiFeature, usage: AiUsage): Promise<void> {
  try {
    await db.collection("audit_logs").doc("ai_invocations").collection("events").add({
      uid,
      apartmentId,
      feature,
      tokenCount: Number.isFinite(usage.tokenCount) ? usage.tokenCount : 0,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    logger.error("Failed to write AI invocation audit log", { uid, apartmentId, feature, error });
  }
}

async function runAuthorizedAiInvocation<T>(params: {
  request: CallableRequest<unknown>;
  apartmentId: string;
  feature: AiFeature;
  execute: (usage: AiUsage) => Promise<T>;
}): Promise<T> {
  const uid = params.request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
  await assertCanAccessApartment(params.apartmentId, uid);
  await consumeAiRateLimit(uid);
  const usage: AiUsage = { tokenCount: 0 };
  try {
    return await params.execute(usage);
  } finally {
    await auditAiInvocation(uid, params.apartmentId, params.feature, usage);
  }
}

export const scheduledVisitReminders = processScheduledVisitReminders;
export const scheduledDealStagnation = processDealStagnation;
export const scheduledAnalyticsAggregation = aggregateAnalytics;
export const scheduledMailOutbox = processMailOutbox;
export { processLeadInactivityDispatch };
export { onNewChatMessage, onListingWithdrawal, onListingWithdrawalEventCreated };
export {
  onAppointmentCreated,
  onAppointmentUpdated,
  onOfferCreated,
  onOfferUpdated,
  onApprovedOfferCreated,
  onApprovedOfferUpdated,
  onListingDocumentsUpdated,
  onContractStatusUpdatedForNotification,
  onBrokerApprovalUpdated,
  onDealRecordCreated,
  onChecklistItemUpdated,
  onCanonicalDealStageUpdated,
};
export { onContractCompleted, getContractDownloadUrl, recordSigningEvidence, sendSigningOtp, updateContractPayload, verifySigningOtp, verifyContractSignatureAuditTrailCallable };
export { advanceDealStageCallable, claimLeadCallable, claimPropertyCallable, createCrossBrokerShowingCallable, delegateShowingCallable, finalizeChecklistDocumentUploadCallable, finalizeCommissionSettlementCallable, initializeDealCallable, migrateLegacyDealsCallable, publishListingAssignmentCallable, recordKeySafeActionCallable, recordShowingFeedbackCallable, reassignLeadCallable, reviewChecklistDocumentCallable, reviewClaimCallable };
export { generateCmaReport, generateListingCopywriting, analyzeShowingFeedbackSentiment, buildOwnerActivityPdfReport };

export const getPropertyFeedbackSentiment = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const apartmentId = request.data?.apartmentId;
    if (typeof apartmentId !== "string" || apartmentId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId: apartmentId.trim(), feature: "sentiment", execute: (usage) => analyzeShowingFeedbackSentiment(apartmentId.trim(), usage) });
  },
);

export const getComparativeMarketAnalysis = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const data = request.data as Record<string, unknown> | undefined;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    if (!apartmentId) throw new HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    if (data?.transactionType !== "sale" && data?.transactionType !== "rent") throw new HttpsError("invalid-argument", "Η παράμετρος transactionType πρέπει να είναι sale ή rent.");
    for (const field of ["targetPrice", "sqm", "rooms", "floor"] as const) {
      const value = data?.[field];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        throw new HttpsError("invalid-argument", `Η παράμετρος ${field} πρέπει να είναι έγκυρος μη αρνητικός αριθμός.`);
      }
    }
    if (data?.area !== undefined && typeof data.area !== "string") throw new HttpsError("invalid-argument", "Η παράμετρος area πρέπει να είναι κείμενο.");
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "cma", execute: async (usage) => {
      const result = await analyzeComparativeMarket({
      apartmentId,
      transactionType: data.transactionType as "sale" | "rent",
      targetPrice: typeof data?.targetPrice === "number" ? data.targetPrice : undefined,
      area: typeof data?.area === "string" ? data.area.trim() || undefined : undefined,
      sqm: typeof data?.sqm === "number" ? data.sqm : undefined,
      rooms: typeof data?.rooms === "number" ? data.rooms : undefined,
      floor: typeof data?.floor === "number" ? data.floor : undefined,
      }, usage);
      const history = await persistCmaHistory(apartmentId, data.transactionType as "sale" | "rent", result);
      return { ...result, ...history };
    } });
  },
);

export const generatePropertyListingCopy = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const data = request.data as Record<string, unknown> | undefined;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const area = typeof data?.area === "string" ? data.area.trim() : "";
    const features = Array.isArray(data?.features) && data.features.every((feature) => typeof feature === "string") ? data.features as string[] : null;
    const sqm = data?.sqm;
    const bedrooms = data?.bedrooms;
    const price = data?.price;
    if (!apartmentId || !title || !area || !features || typeof sqm !== "number" || !Number.isFinite(sqm) || sqm <= 0 || typeof bedrooms !== "number" || !Number.isFinite(bedrooms) || bedrooms < 0 || typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      throw new HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId, title, area, sqm, bedrooms, price και features.");
    }
    if (data?.tone !== undefined && data.tone !== "professional" && data.tone !== "luxury" && data.tone !== "student_friendly") {
      throw new HttpsError("invalid-argument", "Η παράμετρος tone δεν είναι έγκυρη.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "copywriter", execute: (usage) => generatePropertyListingCopyService({ apartmentId, title, area, sqm, bedrooms, price, features, tone: data?.tone as "professional" | "luxury" | "student_friendly" | undefined }, usage) });
  },
);

export const generateOwnerPerformanceReport = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const data = request.data as Record<string, unknown> | undefined;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const timeRangeDays = data?.timeRangeDays;
    if (!apartmentId || (timeRangeDays !== undefined && (typeof timeRangeDays !== "number" || !Number.isFinite(timeRangeDays) || timeRangeDays <= 0))) {
      throw new HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId και timeRangeDays.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "owner_report", execute: async (usage) => {
      const days = typeof timeRangeDays === "number" ? Math.round(timeRangeDays) : 30;
      const result = await generateOwnerPerformanceReportService({ apartmentId, timeRangeDays: days }, usage);
      const history = await persistOwnerReport(apartmentId, days, result);
      return { ...result, ...history };
    } });
  },
);

async function notifyFavoriteUsers(apartmentId: string, payload: Parameters<typeof sendPushToUser>[1], channelId?: string): Promise<void> {
  const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
  await Promise.all(likes.docs.map((like) => {
    const userId = like.data().userId;
    return typeof userId === "string" ? sendPushToUser(userId, payload, channelId) : Promise.resolve();
  }));
}

export const onApartmentUpdate = onDocumentUpdated("apartments/{apartmentId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const oldPrice = Number(before.rent ?? before.price);
  const newPrice = Number(after.rent ?? after.price);
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || newPrice >= oldPrice) return;
  const title = typeof after.title === "string" ? after.title : "Ακίνητο";
  await notifyFavoriteUsers(event.params.apartmentId, { type: "price_drop", title: "Μείωση τιμής", body: `Μείωση τιμής σε αποθηκευμένο ακίνητο: ${title} τώρα στα €${newPrice}`, screen: "apartment-detail", params: { apartmentId: event.params.apartmentId }, entityId: event.params.apartmentId });
});

export const onMatchCreated = onDocumentCreated("matches/{matchId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const score = Number(data.score ?? data.compatibilityScore ?? data.matchScore);
  const listingId = typeof data.apartmentId === "string" ? data.apartmentId : typeof data.listingId === "string" ? data.listingId : "";
  const clientId = typeof data.clientId === "string" ? data.clientId : typeof data.userId === "string" ? data.userId : "";
  const brokerId = typeof data.brokerId === "string" ? data.brokerId : "";
  if (listingId && clientId && score > 90) {
    await sendPushToUser(clientId, { type: "high_match", title: `🔥 Match ${score}%`, body: "Βρήκαμε ένα ακίνητο που ταιριάζει πολύ στα κριτήριά σου.", screen: "apartment-detail", params: { apartmentId: listingId }, entityId: listingId }, "high_matches");
    if (brokerId) await sendPushToUser(brokerId, { type: "high_match", title: `🔥 Match ${score}%`, body: "Ένας πελάτης ταιριάζει πολύ με το ακίνητό σου.", screen: "broker-client-detail", params: { apartmentId: listingId, clientId }, entityId: listingId }, "high_matches");
  }
  if (Number(data.roommateScore ?? data.score) === 100) {
    const recipientId = typeof data.recipientId === "string" ? data.recipientId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof data.userId === "string" && data.userId !== recipientId ? data.userId : "";
    if (recipientId) await sendPushToUser(recipientId, { type: "high_match", title: "100% Roommate Match", body: "Βρέθηκε τέλειο ταίριασμα συγκατοίκησης.", screen: "roomie-profile", params: { matchId: event.params.matchId, candidateId }, entityId: event.params.matchId, action: "add_roommate", categoryId: "ROOMMATE_MATCH_100" }, "high_matches");
  }
});

export const onBrokerRegistration = onDocumentCreated("users/{userId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.is_broker !== true || data.agencyStatus !== "pending" || typeof data.agencyId !== "string") return;
  const recipients = await db.collection("users").where("agencyId", "==", data.agencyId).get();
  const name = typeof data.name === "string" ? data.name : "Νέος μεσίτης";
  await Promise.all(recipients.docs.filter((user) => user.data().agencyRole === "ceo" || user.data().agencyRole === "secretary" || user.data().role === "secretariat").map((user) => sendPushToUser(user.id, { type: "broker_registration", title: "Νέο αίτημα εγγραφής μεσίτη", body: `Νέο αίτημα εγγραφής μεσίτη από ${name} προς έγκριση.`, screen: "agency-management", params: { brokerId: event.params.userId }, entityId: event.params.userId }, "deals_pipeline")));
});

logger.info("CampuStay notification functions loaded");
