"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBrokerClientRelationshipCallable = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    return value.trim();
}
function optionalString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function requestData(request) {
    return request.data && typeof request.data === "object" ? request.data : {};
}
function isBroker(data) {
    return data.is_broker === true || data.agencyRole === "ceo" || data.agencyRole === "secretary" || data.agencyRole === "secretariat" || data.role === "admin";
}
exports.ensureBrokerClientRelationshipCallable = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const actorId = request.auth?.uid;
    if (!actorId)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    const data = requestData(request);
    const brokerId = requiredString(data.brokerId, "brokerId");
    const contactUserId = requiredString(data.contactUserId ?? data.clientId, "contactUserId");
    const contactRole = data.contactRole ?? data.role;
    if (contactRole !== "client" && contactRole !== "owner")
        throw new https_1.HttpsError("invalid-argument", "contactRole must be client or owner.");
    if (actorId !== brokerId && actorId !== contactUserId)
        throw new https_1.HttpsError("permission-denied", "Only the broker or contact can establish this relationship.");
    const [brokerSnapshot, contactSnapshot] = await Promise.all([
        db.doc(`users/${brokerId}`).get(),
        db.doc(`users/${contactUserId}`).get(),
    ]);
    if (!brokerSnapshot.exists || !isBroker(brokerSnapshot.data() ?? {}))
        throw new https_1.HttpsError("permission-denied", "The broker account is not valid.");
    const broker = brokerSnapshot.data() ?? {};
    const contact = contactSnapshot.data() ?? {};
    const agencyId = typeof broker.agencyId === "string" && broker.agencyId.trim() ? broker.agencyId.trim() : null;
    const apartmentId = optionalString(data.apartmentId);
    const apartmentTitle = optionalString(data.apartmentTitle);
    const chatRoomId = optionalString(data.chatRoomId);
    const appointmentId = optionalString(data.appointmentId);
    const listingId = optionalString(data.listingId) ?? apartmentId;
    if (apartmentId) {
        const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
        if (!apartmentSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Apartment not found.");
        const apartment = apartmentSnapshot.data() ?? {};
        const assignedBrokerIds = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds : [];
        if (apartment.hostId !== brokerId && apartment.ownerId !== brokerId && !assignedBrokerIds.includes(brokerId)) {
            throw new https_1.HttpsError("permission-denied", "The broker does not manage this apartment.");
        }
    }
    const existingLeads = await db.collection("leads").where("brokerId", "==", brokerId).where("clientId", "==", contactUserId).get();
    const activeLead = existingLeads.docs.find((lead) => lead.data().status === "active" || lead.data().status === "assigned");
    const leadRef = activeLead?.ref ?? db.doc(`leads/${brokerId}_${contactUserId}`);
    const profileRef = db.doc(`brokerClientProfiles/${brokerId}_${contactUserId}`);
    const displayName = optionalString(data.displayName) ?? (typeof contact.name === "string" && contact.name.trim() ? contact.name.trim() : "Πελάτης");
    const now = firestore_1.FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
        const [leadSnapshot, profileSnapshot] = await Promise.all([transaction.get(leadRef), transaction.get(profileRef)]);
        const leadData = leadSnapshot.data() ?? {};
        const profileData = profileSnapshot.data() ?? {};
        transaction.set(leadRef, {
            brokerId,
            agencyId,
            clientId: contactUserId,
            contactUserId,
            status: "active",
            assignedBrokerId: brokerId,
            ...(apartmentId ? { apartmentId } : {}),
            ...(apartmentTitle ? { apartmentTitle } : {}),
            source: typeof leadData.source === "string" ? leadData.source : "direct_contact",
            ...(leadSnapshot.exists ? {} : { createdAt: now }),
            updatedAt: now,
            lastContactTimestamp: now,
        }, { merge: true });
        transaction.set(profileRef, {
            brokerId,
            contactUserId,
            contactRole: contactRole,
            agencyId,
            displayName,
            clientId: contactUserId,
            clientUserId: contactUserId,
            clientName: displayName,
            role: contactRole,
            leadIds: firestore_1.FieldValue.arrayUnion(leadRef.id),
            activeLeadId: leadRef.id,
            ...(chatRoomId ? { chatRoomIds: firestore_1.FieldValue.arrayUnion(chatRoomId), chatRoomId } : {}),
            ...(appointmentId ? { appointmentIds: firestore_1.FieldValue.arrayUnion(appointmentId) } : {}),
            ...(listingId ? { listingIds: firestore_1.FieldValue.arrayUnion(listingId), apartmentIds: firestore_1.FieldValue.arrayUnion(listingId) } : {}),
            pipelineStage: typeof profileData.pipelineStage === "string" ? profileData.pipelineStage : "new_lead",
            ...(profileSnapshot.exists ? {} : { createdAt: now }),
            lastContactAt: now,
            updatedAt: now,
        }, { merge: true });
    });
    return { profileId: profileRef.id, leadId: leadRef.id, agencyId };
});
//# sourceMappingURL=brokerClientRelationships.js.map