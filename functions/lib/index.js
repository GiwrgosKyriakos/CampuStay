"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOwnerPerformanceReport = exports.generatePropertyListingCopy = exports.getComparativeMarketAnalysis = exports.getPropertyFeedbackSentiment = exports.buildOwnerActivityPdfReport = exports.analyzeShowingFeedbackSentiment = exports.generateListingCopywriting = exports.generateCmaReport = exports.reviewClaimCallable = exports.reviewChecklistDocumentCallable = exports.reassignLeadCallable = exports.recordShowingFeedbackCallable = exports.recordKeySafeActionCallable = exports.publishListingAssignmentCallable = exports.migrateLegacyDealsCallable = exports.initializeDealCallable = exports.finalizeCommissionSettlementCallable = exports.finalizeChecklistDocumentUploadCallable = exports.delegateShowingCallable = exports.createCrossBrokerShowingCallable = exports.claimPropertyCallable = exports.claimLeadCallable = exports.advanceDealStageCallable = exports.verifyContractSignatureAuditTrailCallable = exports.verifySigningOtp = exports.updateContractPayload = exports.sendSigningOtp = exports.recordSigningEvidence = exports.getContractDownloadUrl = exports.onContractCompleted = exports.onCanonicalDealStageUpdated = exports.onChecklistItemUpdated = exports.onDealRecordCreated = exports.onBrokerApprovalUpdated = exports.onContractStatusUpdatedForNotification = exports.onListingDocumentsUpdated = exports.onApprovedOfferUpdated = exports.onApprovedOfferCreated = exports.onOfferUpdated = exports.onOfferCreated = exports.onAppointmentUpdated = exports.onAppointmentCreated = exports.onListingWithdrawalEventCreated = exports.onListingWithdrawal = exports.onNewChatMessage = exports.processLeadInactivityDispatch = exports.scheduledMailOutbox = exports.scheduledAnalyticsAggregation = exports.scheduledDealStagnation = exports.scheduledVisitReminders = void 0;
exports.onBrokerRegistration = exports.onMatchCreated = exports.onApartmentUpdate = void 0;
exports.assertCanAccessApartment = assertCanAccessApartment;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const visitReminders_1 = require("./cron/visitReminders");
const dealStagnation_1 = require("./cron/dealStagnation");
const aggregateAnalytics_1 = require("./cron/aggregateAnalytics");
const push_1 = require("./lib/push");
const onNewChatMessage_1 = require("./triggers/onNewChatMessage");
Object.defineProperty(exports, "onNewChatMessage", { enumerable: true, get: function () { return onNewChatMessage_1.onNewChatMessage; } });
const onListingWithdrawal_1 = require("./triggers/onListingWithdrawal");
Object.defineProperty(exports, "onListingWithdrawal", { enumerable: true, get: function () { return onListingWithdrawal_1.onListingWithdrawal; } });
Object.defineProperty(exports, "onListingWithdrawalEventCreated", { enumerable: true, get: function () { return onListingWithdrawal_1.onListingWithdrawalEventCreated; } });
const leadInactivityDispatch_1 = require("./cron/leadInactivityDispatch");
Object.defineProperty(exports, "processLeadInactivityDispatch", { enumerable: true, get: function () { return leadInactivityDispatch_1.processLeadInactivityDispatch; } });
const mailOutbox_1 = require("./cron/mailOutbox");
const onContractCompleted_1 = require("./triggers/onContractCompleted");
Object.defineProperty(exports, "onContractCompleted", { enumerable: true, get: function () { return onContractCompleted_1.onContractCompleted; } });
const signingOtp_1 = require("./callables/signingOtp");
Object.defineProperty(exports, "getContractDownloadUrl", { enumerable: true, get: function () { return signingOtp_1.getContractDownloadUrl; } });
Object.defineProperty(exports, "recordSigningEvidence", { enumerable: true, get: function () { return signingOtp_1.recordSigningEvidence; } });
Object.defineProperty(exports, "sendSigningOtp", { enumerable: true, get: function () { return signingOtp_1.sendSigningOtp; } });
Object.defineProperty(exports, "updateContractPayload", { enumerable: true, get: function () { return signingOtp_1.updateContractPayload; } });
Object.defineProperty(exports, "verifySigningOtp", { enumerable: true, get: function () { return signingOtp_1.verifySigningOtp; } });
const contractAudit_1 = require("./callables/contractAudit");
Object.defineProperty(exports, "verifyContractSignatureAuditTrailCallable", { enumerable: true, get: function () { return contractAudit_1.verifyContractSignatureAuditTrailCallable; } });
const agencyCollaboration_1 = require("./callables/agencyCollaboration");
Object.defineProperty(exports, "claimLeadCallable", { enumerable: true, get: function () { return agencyCollaboration_1.claimLeadCallable; } });
Object.defineProperty(exports, "claimPropertyCallable", { enumerable: true, get: function () { return agencyCollaboration_1.claimPropertyCallable; } });
Object.defineProperty(exports, "createCrossBrokerShowingCallable", { enumerable: true, get: function () { return agencyCollaboration_1.createCrossBrokerShowingCallable; } });
Object.defineProperty(exports, "delegateShowingCallable", { enumerable: true, get: function () { return agencyCollaboration_1.delegateShowingCallable; } });
Object.defineProperty(exports, "finalizeCommissionSettlementCallable", { enumerable: true, get: function () { return agencyCollaboration_1.finalizeCommissionSettlementCallable; } });
Object.defineProperty(exports, "publishListingAssignmentCallable", { enumerable: true, get: function () { return agencyCollaboration_1.publishListingAssignmentCallable; } });
Object.defineProperty(exports, "recordKeySafeActionCallable", { enumerable: true, get: function () { return agencyCollaboration_1.recordKeySafeActionCallable; } });
Object.defineProperty(exports, "recordShowingFeedbackCallable", { enumerable: true, get: function () { return agencyCollaboration_1.recordShowingFeedbackCallable; } });
Object.defineProperty(exports, "reassignLeadCallable", { enumerable: true, get: function () { return agencyCollaboration_1.reassignLeadCallable; } });
Object.defineProperty(exports, "reviewClaimCallable", { enumerable: true, get: function () { return agencyCollaboration_1.reviewClaimCallable; } });
const dealPipeline_1 = require("./callables/dealPipeline");
Object.defineProperty(exports, "advanceDealStageCallable", { enumerable: true, get: function () { return dealPipeline_1.advanceDealStageCallable; } });
Object.defineProperty(exports, "finalizeChecklistDocumentUploadCallable", { enumerable: true, get: function () { return dealPipeline_1.finalizeChecklistDocumentUploadCallable; } });
Object.defineProperty(exports, "initializeDealCallable", { enumerable: true, get: function () { return dealPipeline_1.initializeDealCallable; } });
Object.defineProperty(exports, "reviewChecklistDocumentCallable", { enumerable: true, get: function () { return dealPipeline_1.reviewChecklistDocumentCallable; } });
const dealMigration_1 = require("./callables/dealMigration");
Object.defineProperty(exports, "migrateLegacyDealsCallable", { enumerable: true, get: function () { return dealMigration_1.migrateLegacyDealsCallable; } });
const cmaService_1 = require("./ai/cmaService");
Object.defineProperty(exports, "generateCmaReport", { enumerable: true, get: function () { return cmaService_1.generateCmaReport; } });
const copywriterService_1 = require("./ai/copywriterService");
Object.defineProperty(exports, "generateListingCopywriting", { enumerable: true, get: function () { return copywriterService_1.generateListingCopywriting; } });
const sentimentService_1 = require("./ai/sentimentService");
Object.defineProperty(exports, "analyzeShowingFeedbackSentiment", { enumerable: true, get: function () { return sentimentService_1.analyzeShowingFeedbackSentiment; } });
const ownerReportService_1 = require("./ai/ownerReportService");
Object.defineProperty(exports, "buildOwnerActivityPdfReport", { enumerable: true, get: function () { return ownerReportService_1.buildOwnerActivityPdfReport; } });
const notificationLifecycle_1 = require("./triggers/notificationLifecycle");
Object.defineProperty(exports, "onAppointmentCreated", { enumerable: true, get: function () { return notificationLifecycle_1.onAppointmentCreated; } });
Object.defineProperty(exports, "onAppointmentUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onAppointmentUpdated; } });
Object.defineProperty(exports, "onOfferCreated", { enumerable: true, get: function () { return notificationLifecycle_1.onOfferCreated; } });
Object.defineProperty(exports, "onOfferUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onOfferUpdated; } });
Object.defineProperty(exports, "onApprovedOfferCreated", { enumerable: true, get: function () { return notificationLifecycle_1.onApprovedOfferCreated; } });
Object.defineProperty(exports, "onApprovedOfferUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onApprovedOfferUpdated; } });
Object.defineProperty(exports, "onListingDocumentsUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onListingDocumentsUpdated; } });
Object.defineProperty(exports, "onContractStatusUpdatedForNotification", { enumerable: true, get: function () { return notificationLifecycle_1.onContractStatusUpdatedForNotification; } });
Object.defineProperty(exports, "onBrokerApprovalUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onBrokerApprovalUpdated; } });
Object.defineProperty(exports, "onDealRecordCreated", { enumerable: true, get: function () { return notificationLifecycle_1.onDealRecordCreated; } });
Object.defineProperty(exports, "onChecklistItemUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onChecklistItemUpdated; } });
Object.defineProperty(exports, "onCanonicalDealStageUpdated", { enumerable: true, get: function () { return notificationLifecycle_1.onCanonicalDealStageUpdated; } });
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const AI_DAILY_LIMIT = 15;
async function assertCanAccessApartment(apartmentId, authUid, allowedRoles = ["secretariat", "admin"]) {
    const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
    const apartment = apartmentSnapshot.data();
    if (!apartment)
        throw new https_1.HttpsError("permission-denied", "You do not have permission to run AI analysis on this property.");
    const userSnapshot = await db.doc(`users/${authUid}`).get();
    const user = userSnapshot.data() ?? {};
    const role = typeof user.role === "string" ? user.role : typeof user.agencyRole === "string" ? user.agencyRole : "";
    const isPrivileged = allowedRoles.includes(role);
    const isAssignedBroker = Array.isArray(apartment.assignedBrokerIds) && apartment.assignedBrokerIds.includes(authUid);
    const canAccess = apartment.ownerId === authUid || apartment.hostId === authUid || isAssignedBroker || isPrivileged;
    if (!canAccess)
        throw new https_1.HttpsError("permission-denied", "You do not have permission to run AI analysis on this property.");
}
async function consumeAiRateLimit(uid) {
    const day = new Date().toISOString().slice(0, 10);
    const rateLimitRef = db.doc(`ai_rate_limits/${uid}_${day}`);
    const allowed = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(rateLimitRef);
        const count = Number(snapshot.data()?.count ?? 0);
        if (count >= AI_DAILY_LIMIT)
            return false;
        transaction.set(rateLimitRef, { uid, day, count: count + 1, updatedAt: firestore_1.Timestamp.now() }, { merge: true });
        return true;
    });
    if (!allowed)
        throw new https_1.HttpsError("resource-exhausted", "Έχετε φτάσει το ημερήσιο όριο κλήσεων AI.");
}
async function auditAiInvocation(uid, apartmentId, feature, usage) {
    try {
        await db.collection("audit_logs").doc("ai_invocations").collection("events").add({
            uid,
            apartmentId,
            feature,
            tokenCount: Number.isFinite(usage.tokenCount) ? usage.tokenCount : 0,
            timestamp: firestore_1.Timestamp.now(),
        });
    }
    catch (error) {
        firebase_functions_1.logger.error("Failed to write AI invocation audit log", { uid, apartmentId, feature, error });
    }
}
async function runAuthorizedAiInvocation(params) {
    const uid = params.request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται σύνδεση χρήστη για την εκτέλεση της ενέργειας.");
    await assertCanAccessApartment(params.apartmentId, uid);
    await consumeAiRateLimit(uid);
    const usage = { tokenCount: 0 };
    try {
        return await params.execute(usage);
    }
    finally {
        await auditAiInvocation(uid, params.apartmentId, params.feature, usage);
    }
}
exports.scheduledVisitReminders = visitReminders_1.processScheduledVisitReminders;
exports.scheduledDealStagnation = dealStagnation_1.processDealStagnation;
exports.scheduledAnalyticsAggregation = aggregateAnalytics_1.aggregateAnalytics;
exports.scheduledMailOutbox = mailOutbox_1.processMailOutbox;
exports.getPropertyFeedbackSentiment = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    const apartmentId = request.data?.apartmentId;
    if (typeof apartmentId !== "string" || apartmentId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId: apartmentId.trim(), feature: "sentiment", execute: (usage) => (0, sentimentService_1.analyzeShowingFeedbackSentiment)(apartmentId.trim(), usage) });
});
exports.getComparativeMarketAnalysis = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    const data = request.data;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    if (!apartmentId)
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος apartmentId είναι υποχρεωτική.");
    if (data?.transactionType !== "sale" && data?.transactionType !== "rent")
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος transactionType πρέπει να είναι sale ή rent.");
    for (const field of ["targetPrice", "sqm", "rooms", "floor"]) {
        const value = data?.[field];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
            throw new https_1.HttpsError("invalid-argument", `Η παράμετρος ${field} πρέπει να είναι έγκυρος μη αρνητικός αριθμός.`);
        }
    }
    if (data?.area !== undefined && typeof data.area !== "string")
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος area πρέπει να είναι κείμενο.");
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "cma", execute: async (usage) => {
            const result = await (0, cmaService_1.analyzeComparativeMarket)({
                apartmentId,
                transactionType: data.transactionType,
                targetPrice: typeof data?.targetPrice === "number" ? data.targetPrice : undefined,
                area: typeof data?.area === "string" ? data.area.trim() || undefined : undefined,
                sqm: typeof data?.sqm === "number" ? data.sqm : undefined,
                rooms: typeof data?.rooms === "number" ? data.rooms : undefined,
                floor: typeof data?.floor === "number" ? data.floor : undefined,
            }, usage);
            const history = await (0, cmaService_1.persistCmaHistory)(apartmentId, data.transactionType, result);
            return { ...result, ...history };
        } });
});
exports.generatePropertyListingCopy = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    const data = request.data;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const area = typeof data?.area === "string" ? data.area.trim() : "";
    const features = Array.isArray(data?.features) && data.features.every((feature) => typeof feature === "string") ? data.features : null;
    const sqm = data?.sqm;
    const bedrooms = data?.bedrooms;
    const price = data?.price;
    if (!apartmentId || !title || !area || !features || typeof sqm !== "number" || !Number.isFinite(sqm) || sqm <= 0 || typeof bedrooms !== "number" || !Number.isFinite(bedrooms) || bedrooms < 0 || typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new https_1.HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId, title, area, sqm, bedrooms, price και features.");
    }
    if (data?.tone !== undefined && data.tone !== "professional" && data.tone !== "luxury" && data.tone !== "student_friendly") {
        throw new https_1.HttpsError("invalid-argument", "Η παράμετρος tone δεν είναι έγκυρη.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "copywriter", execute: (usage) => (0, copywriterService_1.generatePropertyListingCopy)({ apartmentId, title, area, sqm, bedrooms, price, features, tone: data?.tone }, usage) });
});
exports.generateOwnerPerformanceReport = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], cors: true }, async (request) => {
    const data = request.data;
    const apartmentId = typeof data?.apartmentId === "string" ? data.apartmentId.trim() : "";
    const timeRangeDays = data?.timeRangeDays;
    if (!apartmentId || (timeRangeDays !== undefined && (typeof timeRangeDays !== "number" || !Number.isFinite(timeRangeDays) || timeRangeDays <= 0))) {
        throw new https_1.HttpsError("invalid-argument", "Απαιτούνται έγκυρα apartmentId και timeRangeDays.");
    }
    return runAuthorizedAiInvocation({ request, apartmentId, feature: "owner_report", execute: async (usage) => {
            const days = typeof timeRangeDays === "number" ? Math.round(timeRangeDays) : 30;
            const result = await (0, ownerReportService_1.generateOwnerPerformanceReport)({ apartmentId, timeRangeDays: days }, usage);
            const history = await (0, ownerReportService_1.persistOwnerReport)(apartmentId, days, result);
            return { ...result, ...history };
        } });
});
async function notifyFavoriteUsers(apartmentId, payload, channelId) {
    const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
    await Promise.all(likes.docs.map((like) => {
        const userId = like.data().userId;
        return typeof userId === "string" ? (0, push_1.sendPushToUser)(userId, payload, channelId) : Promise.resolve();
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
    await notifyFavoriteUsers(event.params.apartmentId, { type: "price_drop", title: "Μείωση τιμής", body: `Μείωση τιμής σε αποθηκευμένο ακίνητο: ${title} τώρα στα €${newPrice}`, screen: "apartment-detail", params: { apartmentId: event.params.apartmentId }, entityId: event.params.apartmentId });
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
        await (0, push_1.sendPushToUser)(clientId, { type: "high_match", title: `🔥 Match ${score}%`, body: "Βρήκαμε ένα ακίνητο που ταιριάζει πολύ στα κριτήριά σου.", screen: "apartment-detail", params: { apartmentId: listingId }, entityId: listingId }, "high_matches");
        if (brokerId)
            await (0, push_1.sendPushToUser)(brokerId, { type: "high_match", title: `🔥 Match ${score}%`, body: "Ένας πελάτης ταιριάζει πολύ με το ακίνητό σου.", screen: "broker-client-detail", params: { apartmentId: listingId, clientId }, entityId: listingId }, "high_matches");
    }
    if (Number(data.roommateScore ?? data.score) === 100) {
        const recipientId = typeof data.recipientId === "string" ? data.recipientId : typeof data.targetUserId === "string" ? data.targetUserId : "";
        const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof data.userId === "string" && data.userId !== recipientId ? data.userId : "";
        if (recipientId)
            await (0, push_1.sendPushToUser)(recipientId, { type: "high_match", title: "100% Roommate Match", body: "Βρέθηκε τέλειο ταίριασμα συγκατοίκησης.", screen: "roomie-profile", params: { matchId: event.params.matchId, candidateId }, entityId: event.params.matchId, action: "add_roommate", categoryId: "ROOMMATE_MATCH_100" }, "high_matches");
    }
});
exports.onBrokerRegistration = (0, firestore_2.onDocumentCreated)("users/{userId}", async (event) => {
    const data = event.data?.data();
    if (!data || data.is_broker !== true || data.agencyStatus !== "pending" || typeof data.agencyId !== "string")
        return;
    const recipients = await db.collection("users").where("agencyId", "==", data.agencyId).get();
    const name = typeof data.name === "string" ? data.name : "Νέος μεσίτης";
    await Promise.all(recipients.docs.filter((user) => user.data().agencyRole === "ceo" || user.data().agencyRole === "secretary" || user.data().role === "secretariat").map((user) => (0, push_1.sendPushToUser)(user.id, { type: "broker_registration", title: "Νέο αίτημα εγγραφής μεσίτη", body: `Νέο αίτημα εγγραφής μεσίτη από ${name} προς έγκριση.`, screen: "agency-management", params: { brokerId: event.params.userId }, entityId: event.params.userId }, "deals_pipeline")));
});
firebase_functions_1.logger.info("CampuStay notification functions loaded");
//# sourceMappingURL=index.js.map