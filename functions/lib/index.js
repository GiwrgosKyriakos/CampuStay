"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBrokerRegistration = exports.onMatchCreated = exports.onDealUpdate = exports.onApartmentUpdate = exports.generateOwnerPerformanceReport = exports.generatePropertyListingCopy = exports.getComparativeMarketAnalysis = exports.getPropertyFeedbackSentiment = exports.buildOwnerActivityPdfReport = exports.analyzeShowingFeedbackSentiment = exports.generateListingCopywriting = exports.generateCmaReport = exports.verifySigningOtp = exports.updateContractPayload = exports.sendSigningOtp = exports.recordSigningEvidence = exports.onContractCompleted = exports.onListingWithdrawal = exports.onNewChatMessage = exports.processLeadInactivityDispatch = exports.scheduledVisitReminders = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const visitReminders_1 = require("./cron/visitReminders");
const push_1 = require("./lib/push");
const onNewChatMessage_1 = require("./triggers/onNewChatMessage");
Object.defineProperty(exports, "onNewChatMessage", { enumerable: true, get: function () { return onNewChatMessage_1.onNewChatMessage; } });
const onListingWithdrawal_1 = require("./triggers/onListingWithdrawal");
Object.defineProperty(exports, "onListingWithdrawal", { enumerable: true, get: function () { return onListingWithdrawal_1.onListingWithdrawal; } });
const leadInactivityDispatch_1 = require("./cron/leadInactivityDispatch");
Object.defineProperty(exports, "processLeadInactivityDispatch", { enumerable: true, get: function () { return leadInactivityDispatch_1.processLeadInactivityDispatch; } });
const onContractCompleted_1 = require("./triggers/onContractCompleted");
Object.defineProperty(exports, "onContractCompleted", { enumerable: true, get: function () { return onContractCompleted_1.onContractCompleted; } });
const signingOtp_1 = require("./callables/signingOtp");
Object.defineProperty(exports, "recordSigningEvidence", { enumerable: true, get: function () { return signingOtp_1.recordSigningEvidence; } });
Object.defineProperty(exports, "sendSigningOtp", { enumerable: true, get: function () { return signingOtp_1.sendSigningOtp; } });
Object.defineProperty(exports, "updateContractPayload", { enumerable: true, get: function () { return signingOtp_1.updateContractPayload; } });
Object.defineProperty(exports, "verifySigningOtp", { enumerable: true, get: function () { return signingOtp_1.verifySigningOtp; } });
const cmaService_1 = require("./ai/cmaService");
Object.defineProperty(exports, "generateCmaReport", { enumerable: true, get: function () { return cmaService_1.generateCmaReport; } });
const copywriterService_1 = require("./ai/copywriterService");
Object.defineProperty(exports, "generateListingCopywriting", { enumerable: true, get: function () { return copywriterService_1.generateListingCopywriting; } });
const sentimentService_1 = require("./ai/sentimentService");
Object.defineProperty(exports, "analyzeShowingFeedbackSentiment", { enumerable: true, get: function () { return sentimentService_1.analyzeShowingFeedbackSentiment; } });
const ownerReportService_1 = require("./ai/ownerReportService");
Object.defineProperty(exports, "buildOwnerActivityPdfReport", { enumerable: true, get: function () { return ownerReportService_1.buildOwnerActivityPdfReport; } });
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
exports.scheduledVisitReminders = visitReminders_1.processScheduledVisitReminders;
exports.getPropertyFeedbackSentiment = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    }
    const apartmentId = request.data?.apartmentId;
    if (typeof apartmentId !== "string" || apartmentId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    }
    try {
        return await (0, sentimentService_1.analyzeShowingFeedbackSentiment)(apartmentId.trim());
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Σφάλμα κατά την ανάλυση συναισθήματος μέσω AI.";
        throw new https_1.HttpsError("internal", message);
    }
});
exports.getComparativeMarketAnalysis = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    if (!apartmentId)
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    for (const field of ["targetPrice", "sqm", "rooms", "floor"]) {
        const value = data?.[field];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
            throw new https_1.HttpsError("invalid-argument", `Η παράμετρος ${field} πρέπει να είναι έγκυρος μη αρνητικός αριθμός.`);
        }
    }
    if (data?.area !== undefined && typeof data.area !== "string")
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος area πρέπει να είναι κείμενο.");
    return (0, cmaService_1.analyzeComparativeMarket)({
        apartmentId,
        targetPrice: typeof data?.targetPrice === "number" ? data.targetPrice : undefined,
        area: typeof data?.area === "string" ? data.area.trim() || undefined : undefined,
        sqm: typeof data?.sqm === "number" ? data.sqm : undefined,
        rooms: typeof data?.rooms === "number" ? data.rooms : undefined,
        floor: typeof data?.floor === "number" ? data.floor : undefined,
    });
});
exports.generatePropertyListingCopy = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data;
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const area = typeof data?.area === "string" ? data.area.trim() : "";
    const features = Array.isArray(data?.features) && data.features.every((feature) => typeof feature === "string") ? data.features : null;
    const sqm = data?.sqm;
    const bedrooms = data?.bedrooms;
    const price = data?.price;
    if (!title || !area || !features || typeof sqm !== "number" || !Number.isFinite(sqm) || sqm <= 0 || typeof bedrooms !== "number" || !Number.isFinite(bedrooms) || bedrooms < 0 || typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new https_1.HttpsError("invalid-argument", "Απαιτούνται έγκυρα title, area, sqm, bedrooms, price και features.");
    }
    if (data?.tone !== undefined && data.tone !== "professional" && data.tone !== "luxury" && data.tone !== "student_friendly") {
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος tone δεν είναι έγκυρη.");
    }
    return (0, copywriterService_1.generatePropertyListingCopy)({ apartmentId: typeof data?.apartmentId === "string" ? data.apartmentId.trim() : undefined, title, area, sqm, bedrooms, price, features, tone: data?.tone });
});
exports.generateOwnerPerformanceReport = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    const data = request.data;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const timeRangeDays = data?.timeRangeDays;
    if (!apartmentId || (timeRangeDays !== undefined && (typeof timeRangeDays !== "number" || !Number.isFinite(timeRangeDays) || timeRangeDays <= 0))) {
        throw new https_1.HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId και timeRangeDays.");
    }
    return (0, ownerReportService_1.generateOwnerPerformanceReport)({ apartmentId, timeRangeDays: typeof timeRangeDays === "number" ? timeRangeDays : undefined });
});
async function notifyFavoriteUsers(apartmentId, title, body, data) {
    const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
    await Promise.all(likes.docs.map((like) => {
        const userId = like.data().userId;
        return typeof userId === "string" ? (0, push_1.sendPushToUser)(userId, title, body, data) : Promise.resolve();
    }));
}
exports.onApartmentUpdate = (0, firestore_2.onDocumentUpdated)("apartments/{apartmentId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const oldPrice = Number(before.rent ?? before.price);
    const newPrice = Number(after.rent ?? after.price);
    if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || newPrice >= oldPrice)
        return;
    const title = typeof after.title === "string" ? after.title : "Ακίνητο";
    await notifyFavoriteUsers(event.params.apartmentId, "Μείωση τιμής", `Μείωση τιμής σε αποθηκευμένο ακίνητο: ${title} τώρα στα €${newPrice}`, { type: "price_drop", apartmentId: event.params.apartmentId });
});
exports.onDealUpdate = (0, firestore_2.onDocumentUpdated)("brokerClientProfiles/{profileId}/deals/{dealId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const beforeStage = before.stage ?? before.pipelineStage;
    const afterStage = after.stage ?? after.pipelineStage;
    if (beforeStage === afterStage)
        return;
    const apartmentId = typeof after.apartmentId === "string" ? after.apartmentId : event.params.dealId;
    if (!apartmentId)
        return;
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
        await Promise.all(staff.docs.map((user) => (0, push_1.sendPushToUser)(user.id, "Ολοκληρώθηκε deal", `Το deal για το ακίνητο ${title} ολοκληρώθηκε (100%). Απαιτείται έκδοση τιμολογίου & υπολογισμός προμήθειας.`, { type: "closed_deal", apartmentId, channelId: "deals_pipeline" })));
    }
});
exports.onMatchCreated = (0, firestore_2.onDocumentCreated)("matches/{matchId}", async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const score = Number(data.score ?? data.compatibilityScore ?? data.matchScore);
    const listingId = typeof data.apartmentId === "string" ? data.apartmentId : typeof data.listingId === "string" ? data.listingId : "";
    const clientId = typeof data.clientId === "string" ? data.clientId : typeof data.userId === "string" ? data.userId : "";
    const brokerId = typeof data.brokerId === "string" ? data.brokerId : "";
    if (listingId && clientId && score > 90) {
        await (0, push_1.sendPushToUser)(clientId, `🔥 Match ${score}%`, "Βρήκαμε ένα ακίνητο που ταιριάζει πολύ στα κριτήριά σου.", { type: "high_match", apartmentId: listingId, route: "/apartment-detail", channelId: "high_matches" });
        if (brokerId)
            await (0, push_1.sendPushToUser)(brokerId, `🔥 Match ${score}%`, "Ένας πελάτης ταιριάζει πολύ με το ακίνητό σου.", { type: "high_match", apartmentId: listingId, clientId, route: "/broker-client-detail", channelId: "high_matches" });
    }
    if (Number(data.roommateScore ?? data.score) === 100) {
        const recipientId = typeof data.recipientId === "string" ? data.recipientId : typeof data.targetUserId === "string" ? data.targetUserId : "";
        const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof data.userId === "string" && data.userId !== recipientId ? data.userId : "";
        if (recipientId)
            await (0, push_1.sendPushToUser)(recipientId, "100% Roommate Match", "Βρέθηκε τέλειο ταίριασμα συγκατοίκησης.", { type: "roommate_match", matchId: event.params.matchId, action: "add_match", candidateId, categoryId: "ROOMMATE_MATCH_100" });
    }
});
exports.onBrokerRegistration = (0, firestore_2.onDocumentCreated)("users/{userId}", async (event) => {
    const data = event.data?.data();
    if (!data || data.is_broker !== true || data.agencyStatus !== "pending" || typeof data.agencyId !== "string")
        return;
    const recipients = await db.collection("users").where("agencyId", "==", data.agencyId).get();
    const name = typeof data.name === "string" ? data.name : "Νέος μεσίτης";
    await Promise.all(recipients.docs.filter((user) => user.data().agencyRole === "ceo" || user.data().agencyRole === "secretary" || user.data().role === "secretariat").map((user) => (0, push_1.sendPushToUser)(user.id, "Νέο αίτημα εγγραφής μεσίτη", `Νέο αίτημα εγγραφής μεσίτη από ${name} προς έγκριση.`, { type: "broker_registration", brokerId: event.params.userId, channelId: "deals_pipeline" })));
});
firebase_functions_1.logger.info("CampuStay notification functions loaded");
//# sourceMappingURL=index.js.map