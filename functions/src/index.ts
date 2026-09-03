import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { processScheduledVisitReminders } from "./cron/visitReminders";
import { sendPushToUser } from "./lib/push";
import { onNewChatMessage } from "./triggers/onNewChatMessage";
import { onListingWithdrawal } from "./triggers/onListingWithdrawal";
import { processLeadInactivityDispatch } from "./cron/leadInactivityDispatch";
import { onContractCompleted } from "./triggers/onContractCompleted";
import { recordSigningEvidence, sendSigningOtp, updateContractPayload, verifySigningOtp } from "./callables/signingOtp";
import { analyzeComparativeMarket, generateCmaReport } from "./ai/cmaService";
import { generateListingCopywriting, generatePropertyListingCopy as generatePropertyListingCopyService } from "./ai/copywriterService";
import { analyzeShowingFeedbackSentiment } from "./ai/sentimentService";
import { buildOwnerActivityPdfReport, generateOwnerPerformanceReport as generateOwnerPerformanceReportService } from "./ai/ownerReportService";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type PushData = Record<string, string | number | boolean | undefined>;

export const scheduledVisitReminders = processScheduledVisitReminders;
export { processLeadInactivityDispatch };
export { onNewChatMessage, onListingWithdrawal };
export { onContractCompleted, recordSigningEvidence, sendSigningOtp, updateContractPayload, verifySigningOtp };
export { generateCmaReport, generateListingCopywriting, analyzeShowingFeedbackSentiment, buildOwnerActivityPdfReport };

export const getPropertyFeedbackSentiment = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    }
    const apartmentId = request.data?.apartmentId;
    if (typeof apartmentId !== "string" || apartmentId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    }
    try {
      return await analyzeShowingFeedbackSentiment(apartmentId.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Σφάλμα κατά την ανάλυση συναισθήματος μέσω AI.";
      throw new HttpsError("internal", message);
    }
  },
);

export const getComparativeMarketAnalysis = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data as Record<string, unknown> | undefined;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    if (!apartmentId) throw new HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    for (const field of ["targetPrice", "sqm", "rooms", "floor"] as const) {
      const value = data?.[field];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        throw new HttpsError("invalid-argument", `Η παράμετρος ${field} πρέπει να είναι έγκυρος μη αρνητικός αριθμός.`);
      }
    }
    if (data?.area !== undefined && typeof data.area !== "string") throw new HttpsError("invalid-argument", "Η παράμετρος area πρέπει να είναι κείμενο.");
    return analyzeComparativeMarket({
      apartmentId,
      targetPrice: typeof data?.targetPrice === "number" ? data.targetPrice : undefined,
      area: typeof data?.area === "string" ? data.area.trim() || undefined : undefined,
      sqm: typeof data?.sqm === "number" ? data.sqm : undefined,
      rooms: typeof data?.rooms === "number" ? data.rooms : undefined,
      floor: typeof data?.floor === "number" ? data.floor : undefined,
    });
  },
);

export const generatePropertyListingCopy = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data as Record<string, unknown> | undefined;
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const area = typeof data?.area === "string" ? data.area.trim() : "";
    const features = Array.isArray(data?.features) && data.features.every((feature) => typeof feature === "string") ? data.features as string[] : null;
    const sqm = data?.sqm;
    const bedrooms = data?.bedrooms;
    const price = data?.price;
    if (!title || !area || !features || typeof sqm !== "number" || !Number.isFinite(sqm) || sqm <= 0 || typeof bedrooms !== "number" || !Number.isFinite(bedrooms) || bedrooms < 0 || typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      throw new HttpsError("invalid-argument", "Απαιτούνται έγκυρα title, area, sqm, bedrooms, price και features.");
    }
    if (data?.tone !== undefined && data.tone !== "professional" && data.tone !== "luxury" && data.tone !== "student_friendly") {
      throw new HttpsError("invalid-argument", "Η παράμετρος tone δεν είναι έγκυρη.");
    }
    return generatePropertyListingCopyService({ apartmentId: typeof data?.apartmentId === "string" ? data.apartmentId.trim() : undefined, title, area, sqm, bedrooms, price, features, tone: data?.tone as "professional" | "luxury" | "student_friendly" | undefined });
  },
);

export const generateOwnerPerformanceReport = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data as Record<string, unknown> | undefined;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const timeRangeDays = data?.timeRangeDays;
    if (!apartmentId || (timeRangeDays !== undefined && (typeof timeRangeDays !== "number" || !Number.isFinite(timeRangeDays) || timeRangeDays <= 0))) {
      throw new HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId και timeRangeDays.");
    }
    return generateOwnerPerformanceReportService({ apartmentId, timeRangeDays: typeof timeRangeDays === "number" ? timeRangeDays : undefined });
  },
);

async function notifyFavoriteUsers(apartmentId: string, title: string, body: string, data: PushData): Promise<void> {
  const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
  await Promise.all(likes.docs.map((like) => {
    const userId = like.data().userId;
    return typeof userId === "string" ? sendPushToUser(userId, title, body, data) : Promise.resolve();
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
  await notifyFavoriteUsers(event.params.apartmentId, "Μείωση τιμής", `Μείωση τιμής σε αποθηκευμένο ακίνητο: ${title} τώρα στα €${newPrice}`, { type: "price_drop", apartmentId: event.params.apartmentId });
});

export const onDealUpdate = onDocumentUpdated("brokerClientProfiles/{profileId}/deals/{dealId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const beforeStage = before.stage ?? before.pipelineStage;
  const afterStage = after.stage ?? after.pipelineStage;
  if (beforeStage === afterStage) return;
  const apartmentId = typeof after.apartmentId === "string" ? after.apartmentId : event.params.dealId;
  if (!apartmentId) return;
  const listing = await db.doc(`apartments/${apartmentId}`).get();
  const title = listing.data()?.title ?? "Ακίνητο";
  const stage = afterStage === "negotiation_agreement" ? 90 : afterStage === "deal_closed" ? 100 : afterStage;
  if (stage === 90 || stage === 100) {
    await notifyFavoriteUsers(apartmentId, "Αλλαγή κατάστασης", `Το ακίνητο ${title} βρίσκεται πλέον σε νέο στάδιο διαπραγμάτευσης.`, { type: "deal_stage_update", apartmentId, stage });
  }
  if (stage === 100) {
    const profile = await db.doc(`brokerClientProfiles/${event.params.profileId}`).get();
    const brokerId = profile.data()?.brokerId;
    const broker = typeof brokerId === "string" ? await db.doc(`users/${brokerId}`).get() : null;
    const agencyId = after.agencyId ?? broker?.data()?.agencyId;
    const staff = typeof agencyId === "string" && agencyId ? await db.collection("users").where("agencyId", "==", agencyId).get() : { docs: [] };
    await Promise.all(staff.docs.map((user) => sendPushToUser(user.id, "Ολοκληρώθηκε deal", `Το deal για το ακίνητο ${title} ολοκληρώθηκε (100%). Απαιτείται έκδοση τιμολογίου & υπολογισμός προμήθειας.`, { type: "closed_deal", apartmentId, channelId: "deals_pipeline" })));
  }
});

export const onMatchCreated = onDocumentCreated("matches/{matchId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const score = Number(data.score ?? data.compatibilityScore ?? data.matchScore);
  const listingId = typeof data.apartmentId === "string" ? data.apartmentId : typeof data.listingId === "string" ? data.listingId : "";
  const clientId = typeof data.clientId === "string" ? data.clientId : typeof data.userId === "string" ? data.userId : "";
  const brokerId = typeof data.brokerId === "string" ? data.brokerId : "";
  if (listingId && clientId && score > 90) {
    await sendPushToUser(clientId, `🔥 Match ${score}%`, "Βρήκαμε ένα ακίνητο που ταιριάζει πολύ στα κριτήριά σου.", { type: "high_match", apartmentId: listingId, route: "/apartment-detail", channelId: "high_matches" });
    if (brokerId) await sendPushToUser(brokerId, `🔥 Match ${score}%`, "Ένας πελάτης ταιριάζει πολύ με το ακίνητό σου.", { type: "high_match", apartmentId: listingId, clientId, route: "/broker-client-detail", channelId: "high_matches" });
  }
  if (Number(data.roommateScore ?? data.score) === 100) {
    const recipientId = typeof data.recipientId === "string" ? data.recipientId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof data.userId === "string" && data.userId !== recipientId ? data.userId : "";
    if (recipientId) await sendPushToUser(recipientId, "100% Roommate Match", "Βρέθηκε τέλειο ταίριασμα συγκατοίκησης.", { type: "roommate_match", matchId: event.params.matchId, action: "add_match", candidateId, categoryId: "ROOMMATE_MATCH_100" });
  }
});

export const onBrokerRegistration = onDocumentCreated("users/{userId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.is_broker !== true || data.agencyStatus !== "pending" || typeof data.agencyId !== "string") return;
  const recipients = await db.collection("users").where("agencyId", "==", data.agencyId).get();
  const name = typeof data.name === "string" ? data.name : "Νέος μεσίτης";
  await Promise.all(recipients.docs.filter((user) => user.data().agencyRole === "ceo" || user.data().agencyRole === "secretary" || user.data().role === "secretariat").map((user) => sendPushToUser(user.id, "Νέο αίτημα εγγραφής μεσίτη", `Νέο αίτημα εγγραφής μεσίτη από ${name} προς έγκριση.`, { type: "broker_registration", brokerId: event.params.userId, channelId: "deals_pipeline" })));
});

logger.info("CampuStay notification functions loaded");
