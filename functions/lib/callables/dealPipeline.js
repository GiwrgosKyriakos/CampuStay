"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeChecklistDocumentUploadCallable = exports.advanceDealStageCallable = exports.reviewChecklistDocumentCallable = exports.recordAcceptedOfferCallable = exports.initializeDealCallable = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const https_1 = require("firebase-functions/v2/https");
const dealChecklist_1 = require("../lib/dealChecklist");
const analyticsEvents_1 = require("../lib/analyticsEvents");
const leadAttribution_1 = require("../lib/leadAttribution");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const bucket = (0, storage_1.getStorage)().bucket();
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat", "admin"]);
const LOST_DEAL_REASONS = new Set(["price_dispute", "legal_defect", "competitor_won", "buyer_withdrew", "owner_cancelled", "financial_issue"]);
function dataOf(request) {
    return request.data && typeof request.data === "object" ? request.data : {};
}
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    return value.trim();
}
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    return uid;
}
function roleOf(user) {
    return typeof user.agencyRole === "string" ? user.agencyRole : typeof user.role === "string" ? user.role : "";
}
async function getUser(uid) {
    const snapshot = await db.doc(`users/${uid}`).get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("permission-denied", "User profile not found.");
    return snapshot.data();
}
function isDealBroker(uid, deal) {
    return [deal.listingBrokerId, deal.buyerBrokerId, deal.coveringBrokerId].includes(uid);
}
function isDealParticipant(uid, deal) {
    return [deal.listingBrokerId, deal.buyerBrokerId, deal.coveringBrokerId, deal.clientId, deal.ownerId, deal.hostId].includes(uid);
}
async function requireDealReviewer(uid, deal) {
    const user = await getUser(uid);
    const agencyId = typeof deal.agencyId === "string" ? deal.agencyId : "";
    const sameAgency = agencyId.length > 0 && user.agencyId === agencyId;
    const role = roleOf(user);
    const executive = sameAgency && EXECUTIVE_ROLES.has(role);
    const broker = sameAgency && user.is_broker === true && isDealBroker(uid, deal);
    if (!executive && !broker)
        throw new https_1.HttpsError("permission-denied", "Only a deal broker, Secretariat, or administrator can review documents.");
}
async function getDeal(dealId) {
    const snapshot = await db.doc(`deals/${dealId}`).get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("not-found", "Deal not found.");
    return snapshot.data() ?? {};
}
function initialStage(value) {
    if (value === undefined)
        return 0;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 89) {
        throw new https_1.HttpsError("invalid-argument", "initialStage must be an integer between 0 and 89.");
    }
    return value;
}
function canonicalProfileStage(targetStage, isLoss) {
    if (isLoss)
        return "closed_lost";
    if (targetStage >= 100)
        return "closed_won";
    if (targetStage >= 90)
        return "under_contract";
    if (targetStage >= 65)
        return "offer_made";
    if (targetStage >= 35)
        return "showing_scheduled";
    if (targetStage >= 10)
        return "contacted";
    return "new_lead";
}
exports.initializeDealCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const brokerId = requiredString(data.brokerId, "brokerId");
    const clientId = requiredString(data.clientId, "clientId");
    const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
    if (!apartmentSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Apartment not found.");
    const apartment = apartmentSnapshot.data() ?? {};
    const broker = await getUser(brokerId);
    const agencyId = typeof apartment.agencyId === "string" && apartment.agencyId.trim()
        ? apartment.agencyId.trim()
        : typeof broker.agencyId === "string" && broker.agencyId.trim()
            ? broker.agencyId.trim()
            : null;
    const leadId = await (0, leadAttribution_1.resolveLeadId)({ explicitLeadId: data.leadId, agencyId, apartmentId, clientId, brokerId });
    if (!leadId)
        throw new https_1.HttpsError("failed-precondition", "A canonical lead is required before initializing a deal.");
    const leadSource = await (0, leadAttribution_1.getLeadSource)(leadId);
    const assignedBrokerIds = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds : [];
    const brokerManagesApartment = assignedBrokerIds.includes(brokerId) || apartment.ownerId === brokerId || apartment.hostId === brokerId;
    if (!brokerManagesApartment || (uid !== brokerId && uid !== clientId))
        throw new https_1.HttpsError("permission-denied", "You cannot initialize this deal.");
    if (broker.is_broker !== true || (agencyId !== null && broker.agencyId !== agencyId))
        throw new https_1.HttpsError("permission-denied", "The broker is not part of this agency.");
    const dealId = `${apartmentId}_${clientId}`;
    const dealRef = db.doc(`deals/${dealId}`);
    const requestedStage = initialStage(data.initialStage);
    await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(dealRef);
        const current = existing.data() ?? {};
        const currentStage = typeof current.stage === "number" ? current.stage : 0;
        transaction.set(dealRef, {
            apartmentId,
            apartmentTitle: typeof data.apartmentTitle === "string" ? data.apartmentTitle.trim() : typeof apartment.title === "string" ? apartment.title : "Ακίνητο",
            clientId,
            leadId,
            source: leadSource,
            ...(agencyId === null ? {} : { agencyId }),
            listingBrokerId: typeof current.listingBrokerId === "string" ? current.listingBrokerId : brokerId,
            buyerBrokerId: typeof current.buyerBrokerId === "string" ? current.buyerBrokerId : brokerId,
            ...(typeof apartment.ownerId === "string" ? { ownerId: apartment.ownerId } : typeof apartment.hostId === "string" ? { ownerId: apartment.hostId } : {}),
            ...(typeof data.clientName === "string" ? { clientName: data.clientName.trim() } : {}),
            ...(typeof data.dealAmount === "number" && Number.isFinite(data.dealAmount) ? { dealAmount: data.dealAmount } : {}),
            stage: Math.max(currentStage, requestedStage),
            status: current.status ?? "active",
            commissionTotal: typeof current.commissionTotal === "number" ? current.commissionTotal : 0,
            agencyCutPercentage: typeof current.agencyCutPercentage === "number" ? current.agencyCutPercentage : 50,
            agencyCutAmount: typeof current.agencyCutAmount === "number" ? current.agencyCutAmount : 0,
            brokerSplits: Array.isArray(current.brokerSplits) ? current.brokerSplits : [],
            ...(!existing.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    await (0, dealChecklist_1.seedDealChecklist)(dealId);
    return { dealId };
});
exports.recordAcceptedOfferCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const clientId = requiredString(data.clientId, "clientId");
    const listingBrokerId = requiredString(data.listingBrokerId, "listingBrokerId");
    const acceptedOfferPrice = data.acceptedOfferPrice;
    if (typeof acceptedOfferPrice !== "number" || !Number.isFinite(acceptedOfferPrice) || acceptedOfferPrice <= 0) {
        throw new https_1.HttpsError("invalid-argument", "acceptedOfferPrice must be a positive number.");
    }
    const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
    if (!apartmentSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Apartment not found.");
    const apartment = apartmentSnapshot.data() ?? {};
    const broker = await getUser(listingBrokerId);
    const agencyId = typeof apartment.agencyId === "string" && apartment.agencyId.trim()
        ? apartment.agencyId.trim()
        : typeof broker.agencyId === "string" && broker.agencyId.trim()
            ? broker.agencyId.trim()
            : null;
    const leadId = await (0, leadAttribution_1.resolveLeadId)({ explicitLeadId: data.leadId, agencyId, apartmentId, clientId, brokerId: listingBrokerId });
    if (!leadId)
        throw new https_1.HttpsError("failed-precondition", "A canonical lead is required before accepting an offer.");
    const assignedBrokerIds = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds : [];
    if (!assignedBrokerIds.includes(listingBrokerId) && apartment.ownerId !== listingBrokerId && apartment.hostId !== listingBrokerId) {
        throw new https_1.HttpsError("permission-denied", "The broker does not manage this apartment.");
    }
    if (uid !== listingBrokerId && uid !== clientId)
        throw new https_1.HttpsError("permission-denied", "Only the broker or client can accept this offer.");
    const dealId = `${apartmentId}_${clientId}`;
    const dealRef = db.doc(`deals/${dealId}`);
    const offerRef = db.doc(`offers/${dealId}_accepted`);
    await db.runTransaction(async (transaction) => {
        const dealSnapshot = await transaction.get(dealRef);
        const current = dealSnapshot.data() ?? {};
        const currentValue = typeof current.dealValue === "number" && current.dealValue > 0
            ? current.dealValue
            : typeof current.dealAmount === "number" && current.dealAmount > 0
                ? current.dealAmount
                : typeof apartment.rent === "number" && apartment.rent > 0
                    ? apartment.rent
                    : acceptedOfferPrice;
        const currentCommission = typeof current.commissionTotal === "number" && current.commissionTotal > 0 ? current.commissionTotal : null;
        const configuredRate = typeof current.commissionRatePercentage === "number" && current.commissionRatePercentage > 0 ? current.commissionRatePercentage : null;
        const commissionRate = configuredRate ?? (currentCommission && currentValue > 0 ? currentCommission / currentValue * 100 : 2);
        const commissionTotal = Math.round(acceptedOfferPrice * commissionRate) / 100;
        const buyerBrokerId = typeof current.buyerBrokerId === "string" && current.buyerBrokerId.trim() ? current.buyerBrokerId : listingBrokerId;
        const brokerIds = Array.from(new Set([listingBrokerId, buyerBrokerId, current.coveringBrokerId].filter((brokerId) => typeof brokerId === "string" && brokerId.trim().length > 0)));
        const profileRefs = brokerIds.map((brokerId) => db.doc(`brokerClientProfiles/${brokerId}_${clientId}`));
        const profileSnapshots = await Promise.all(profileRefs.map((profileRef) => transaction.get(profileRef)));
        transaction.set(dealRef, {
            apartmentId,
            clientId,
            leadId,
            ...(agencyId === null ? {} : { agencyId }),
            listingBrokerId,
            buyerBrokerId,
            acceptedOfferPrice,
            dealValue: acceptedOfferPrice,
            dealAmount: acceptedOfferPrice,
            offerAcceptedAt: firestore_1.FieldValue.serverTimestamp(),
            status: "offer_accepted",
            stage: Math.max(typeof current.stage === "number" ? current.stage : 0, 65),
            commissionRatePercentage: commissionRate,
            commissionTotal,
            agencyCutPercentage: 50,
            agencyCutAmount: Math.round(commissionTotal * 50) / 100,
            brokerSplits: [
                { brokerId: listingBrokerId, brokerName: "Listing broker", role: "listing_agent", percentage: 25, amount: Math.round(commissionTotal * 25) / 100 },
                { brokerId: buyerBrokerId, brokerName: "Buyer broker", role: "buyer_agent", percentage: 25, amount: Math.round(commissionTotal * 25) / 100 },
            ],
            ...(!dealSnapshot.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(offerRef, {
            offerId: offerRef.id,
            apartmentId,
            clientId,
            brokerId: listingBrokerId,
            ...(agencyId === null ? {} : { agencyId }),
            amount: acceptedOfferPrice,
            status: "accepted",
            dealId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            ...(!dealSnapshot.exists ? { createdAt: firestore_1.FieldValue.serverTimestamp() } : {}),
        }, { merge: true });
        profileRefs.forEach((profileRef, index) => {
            transaction.set(profileRef, {
                brokerId: brokerIds[index],
                contactUserId: clientId,
                clientId,
                clientUserId: clientId,
                contactRole: "client",
                role: "client",
                dealIds: firestore_1.FieldValue.arrayUnion(dealId),
                pipelineStage: "offer_made",
                stageUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                lastContactAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                ...(!profileSnapshots[index].exists ? { createdAt: firestore_1.FieldValue.serverTimestamp(), agencyId } : {}),
            }, { merge: true });
        });
    });
    return { dealId, offerId: offerRef.id };
});
exports.reviewChecklistDocumentCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const dealId = requiredString(data.dealId, "dealId");
    const itemId = requiredString(data.itemId, "itemId");
    const action = data.action;
    if (action !== "verify" && action !== "reject")
        throw new https_1.HttpsError("invalid-argument", "action must be verify or reject.");
    const deal = await getDeal(dealId);
    await requireDealReviewer(uid, deal);
    const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim() : "";
    if (action === "reject" && !rejectionReason)
        throw new https_1.HttpsError("invalid-argument", "rejectionReason is required when rejecting a document.");
    const itemRef = db.doc(`deals/${dealId}/checklist/${itemId}`);
    await db.runTransaction(async (transaction) => {
        const itemSnapshot = await transaction.get(itemRef);
        if (!itemSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Checklist item not found.");
        if (itemSnapshot.data()?.status !== "uploaded")
            throw new https_1.HttpsError("failed-precondition", "Only an uploaded checklist document can be reviewed.");
        transaction.update(itemRef, action === "verify"
            ? { status: "verified", verifiedBy: uid, verifiedAt: firestore_1.FieldValue.serverTimestamp(), rejectionReason: firestore_1.FieldValue.delete() }
            : { status: "rejected", rejectionReason, verifiedBy: firestore_1.FieldValue.delete(), verifiedAt: firestore_1.FieldValue.delete() });
    });
    return { dealId, itemId, status: action === "verify" ? "verified" : "rejected" };
});
exports.advanceDealStageCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const dealId = requiredString(data.dealId, "dealId");
    const targetStage = data.targetStage;
    const requestedStatus = data.status;
    const isLoss = requestedStatus === "lost" || requestedStatus === "cancelled";
    if (typeof targetStage !== "number" || !Number.isInteger(targetStage) || targetStage < 0 || targetStage > 100)
        throw new https_1.HttpsError("invalid-argument", "targetStage must be an integer between 0 and 100.");
    if (requestedStatus !== undefined && !isLoss)
        throw new https_1.HttpsError("invalid-argument", "status must be lost or cancelled.");
    if (isLoss && (typeof data.lostReason !== "string" || !LOST_DEAL_REASONS.has(data.lostReason.trim())))
        throw new https_1.HttpsError("invalid-argument", "A valid lostReason is required when a deal is lost or cancelled.");
    const deal = await getDeal(dealId);
    if (targetStage >= 90)
        await requireDealReviewer(uid, deal);
    else if (!isDealParticipant(uid, deal))
        throw new https_1.HttpsError("permission-denied", "Only a deal participant can advance this stage.");
    const dealRef = db.doc(`deals/${dealId}`);
    let previousStage = 0;
    await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(dealRef);
        if (!currentSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Deal not found.");
        const current = currentSnapshot.data() ?? {};
        const currentStage = typeof current.stage === "number" ? current.stage : 0;
        previousStage = currentStage;
        if (targetStage < currentStage)
            throw new https_1.HttpsError("failed-precondition", "A deal stage cannot move backwards.");
        if (targetStage >= 90) {
            const checklistSnapshot = await transaction.get(db.collection(`deals/${dealId}/checklist`));
            const items = checklistSnapshot.docs.map((item) => item.data());
            const requiredItems = items.filter((item) => Number(item.requiredForStage) <= (targetStage === 100 ? 100 : 90));
            if (targetStage === 90 && requiredItems.some((item) => item.status !== "verified")) {
                throw new https_1.HttpsError("failed-precondition", "Cannot advance to Stage 90%: Missing verified technical or legal documents.");
            }
            if (targetStage === 100 && (items.length === 0 || items.some((item) => item.status !== "verified"))) {
                throw new https_1.HttpsError("failed-precondition", "Cannot advance to Stage 100%: All checklist documents must be verified.");
            }
        }
        const clientId = typeof current.clientId === "string" ? current.clientId.trim() : "";
        const brokerIds = Array.from(new Set([current.listingBrokerId, current.buyerBrokerId, current.coveringBrokerId].filter((brokerId) => typeof brokerId === "string" && brokerId.trim().length > 0)));
        const profileRefs = clientId ? brokerIds.map((brokerId) => db.doc(`brokerClientProfiles/${brokerId}_${clientId}`)) : [];
        const profileSnapshots = await Promise.all(profileRefs.map((profileRef) => transaction.get(profileRef)));
        const pipelineStage = canonicalProfileStage(targetStage, isLoss);
        transaction.update(dealRef, {
            stage: targetStage,
            ...(targetStage === 90 ? { status: "under_negotiation" } : {}),
            ...(isLoss ? { status: requestedStatus, lostReason: data.lostReason.trim(), lostAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        profileRefs.forEach((profileRef, index) => {
            transaction.set(profileRef, {
                brokerId: brokerIds[index],
                contactUserId: clientId,
                clientId,
                clientUserId: clientId,
                contactRole: "client",
                role: "client",
                dealIds: firestore_1.FieldValue.arrayUnion(dealId),
                pipelineStage,
                stageUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                ...(!profileSnapshots[index].exists ? { createdAt: firestore_1.FieldValue.serverTimestamp(), agencyId: typeof current.agencyId === "string" ? current.agencyId : null } : {}),
            }, { merge: true });
        });
    });
    await (0, analyticsEvents_1.logAnalyticsEvent)({
        agencyId: typeof deal.agencyId === "string" ? deal.agencyId : "",
        eventType: isLoss ? "deal_lost" : "deal_stage_changed",
        timestamp: Date.now(),
        listingId: typeof deal.apartmentId === "string" ? deal.apartmentId : undefined,
        leadId: typeof deal.leadId === "string" ? deal.leadId : undefined,
        brokerId: typeof deal.listingBrokerId === "string" ? deal.listingBrokerId : undefined,
        transactionType: deal.transactionType === "sale" || deal.transactionType === "rent" ? deal.transactionType : undefined,
        stageFrom: previousStage,
        stageTo: targetStage,
        ...(isLoss ? { lostReason: data.lostReason.trim() } : {}),
    });
    return { dealId, stage: targetStage };
});
exports.finalizeChecklistDocumentUploadCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const dealId = requiredString(data.dealId, "dealId");
    const itemId = requiredString(data.itemId, "itemId");
    const fileUrl = requiredString(data.fileUrl, "fileUrl");
    const fileName = requiredString(data.fileName, "fileName");
    const storagePath = requiredString(data.storagePath, "storagePath");
    const expectedPrefix = `deals/${dealId}/${itemId}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
        throw new https_1.HttpsError("invalid-argument", "storagePath is invalid.");
    }
    const deal = await getDeal(dealId);
    if (!isDealParticipant(uid, deal))
        throw new https_1.HttpsError("permission-denied", "You cannot upload a document for this deal.");
    const itemRef = db.doc(`deals/${dealId}/checklist/${itemId}`);
    let previousStoragePath = "";
    await db.runTransaction(async (transaction) => {
        const itemSnapshot = await transaction.get(itemRef);
        if (!itemSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Checklist item not found.");
        const item = itemSnapshot.data() ?? {};
        if (item.status === "verified")
            throw new https_1.HttpsError("failed-precondition", "Verified documents cannot be replaced.");
        previousStoragePath = typeof item.storagePath === "string" ? item.storagePath : "";
        transaction.update(itemRef, {
            status: "uploaded",
            fileUrl,
            fileName,
            storagePath,
            uploadedAt: firestore_1.FieldValue.serverTimestamp(),
            uploadedBy: uid,
            rejectionReason: firestore_1.FieldValue.delete(),
        });
    });
    if (previousStoragePath && previousStoragePath !== storagePath && previousStoragePath.startsWith(expectedPrefix) && !previousStoragePath.includes("..")) {
        await bucket.file(previousStoragePath).delete({ ignoreNotFound: true });
    }
    return { dealId, itemId, status: "uploaded" };
});
//# sourceMappingURL=dealPipeline.js.map