"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeCommissionSettlementCallable = exports.createCrossBrokerShowingCallable = exports.recordShowingFeedbackCallable = exports.delegateShowingCallable = exports.recordKeySafeActionCallable = exports.claimLeadCallable = exports.reassignLeadCallable = exports.reviewClaimCallable = exports.publishListingAssignmentCallable = exports.claimPropertyCallable = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const push_1 = require("../lib/push");
const dealChecklist_1 = require("../lib/dealChecklist");
const analyticsEvents_1 = require("../lib/analyticsEvents");
const leadAttribution_1 = require("../lib/leadAttribution");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat"]);
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    return uid;
}
function dataOf(request) {
    return request.data && typeof request.data === "object" ? request.data : {};
}
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    }
    return value.trim();
}
function optionalString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function roleOf(user) {
    return typeof user?.agencyRole === "string" ? user.agencyRole : typeof user?.role === "string" ? user.role : "";
}
async function getUser(uid) {
    const snapshot = await db.doc(`users/${uid}`).get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("permission-denied", "User profile not found.");
    return snapshot.data();
}
async function requireAgencyStaff(uid, agencyId, executiveOnly = false) {
    const user = await getUser(uid);
    const userAgencyId = typeof user.agencyId === "string" ? user.agencyId.trim() : "";
    const role = roleOf(user);
    const isStaff = userAgencyId === agencyId
        && (user.agencyStatus === "approved" || EXECUTIVE_ROLES.has(role))
        && (user.is_broker === true || EXECUTIVE_ROLES.has(role));
    if (!isStaff || (executiveOnly && !EXECUTIVE_ROLES.has(role))) {
        throw new https_1.HttpsError("permission-denied", "You cannot perform this agency operation.");
    }
    return user;
}
async function requireSameAgencyBroker(uid, agencyId) {
    const user = await requireAgencyStaff(uid, agencyId);
    if (user.is_broker !== true && !EXECUTIVE_ROLES.has(roleOf(user))) {
        throw new https_1.HttpsError("permission-denied", "A broker account is required.");
    }
    return user;
}
async function notifyUser(userId, title, body, action, data) {
    await (0, push_1.sendPushToUser)(userId, { type: "deal_stage_update", title, body, screen: "broker", params: data, entityId: String(data.apartmentId ?? data.dealId ?? data.appointmentId ?? ""), action });
}
async function addOwnerToBrokerClients(brokerId, apartmentId, apartment) {
    const ownerId = typeof apartment.ownerId === "string" && apartment.ownerId.trim() ? apartment.ownerId.trim() : typeof apartment.hostId === "string" ? apartment.hostId.trim() : "";
    if (!ownerId || ownerId === brokerId)
        return;
    const profileRef = db.doc(`brokerClientProfiles/${brokerId}_${ownerId}`);
    await profileRef.set({
        brokerId,
        clientId: ownerId,
        clientUserId: ownerId,
        ...(typeof apartment.ownerDetails?.name === "string" && apartment.ownerDetails.name.trim() ? { clientName: apartment.ownerDetails.name.trim() } : {}),
        role: "owner",
        apartmentIds: firestore_1.FieldValue.arrayUnion(apartmentId),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
exports.claimPropertyCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const apartmentRef = db.doc(`apartments/${apartmentId}`);
    const apartment = await apartmentRef.get();
    if (!apartment.exists)
        throw new https_1.HttpsError("not-found", "Apartment not found.");
    const apartmentData = apartment.data() ?? {};
    const agencyId = requiredString(apartmentData.agencyId, "agencyId");
    const broker = await requireSameAgencyBroker(uid, agencyId);
    const brokerName = typeof broker.name === "string" && broker.name.trim() ? broker.name.trim() : "Μεσίτης";
    const claimRef = db.collection("agency_claims").doc();
    await db.runTransaction(async (transaction) => {
        const currentApartment = await transaction.get(apartmentRef);
        if (!currentApartment.exists)
            throw new https_1.HttpsError("not-found", "Apartment not found.");
        const current = currentApartment.data() ?? {};
        const status = typeof current.assignmentStatus === "string" ? current.assignmentStatus : "";
        const poolAvailable = status === "pool" || status === "unassigned_pool";
        const pending = typeof current.pendingClaimBrokerId === "string" ? current.pendingClaimBrokerId : "";
        const rejected = Array.isArray(current.rejectedBrokerIds) ? current.rejectedBrokerIds : [];
        if (!poolAvailable && status !== "pending_review" && status !== "claim_pending") {
            throw new https_1.HttpsError("failed-precondition", "The apartment is not available for claiming.");
        }
        if (rejected.includes(uid))
            throw new https_1.HttpsError("failed-precondition", "The apartment is not available for claiming.");
        if (pending && pending !== uid)
            throw new https_1.HttpsError("aborted", "Another claim is already under review.");
        if (status === "pending_review" && pending === uid)
            throw new https_1.HttpsError("already-exists", "Your claim is already under review.");
        transaction.update(apartmentRef, {
            assignmentStatus: "claim_pending",
            pendingClaimBrokerId: uid,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.set(claimRef, {
            agencyId,
            apartmentId,
            apartmentTitle: typeof current.title === "string" ? current.title : "Ακίνητο",
            brokerId: uid,
            brokerName,
            status: "pending",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    const staff = await db.collection("users").where("agencyId", "==", agencyId).get();
    await Promise.all(staff.docs
        .filter((item) => EXECUTIVE_ROLES.has(roleOf(item.data())) && item.id !== uid)
        .map((item) => notifyUser(item.id, "Νέο αίτημα ανάθεσης", `${brokerName} ζήτησε ένα ακίνητο από το pool.`, "claim_pending", { claimId: claimRef.id, apartmentId })));
    return { claimId: claimRef.id, status: "claim_pending" };
});
exports.publishListingAssignmentCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const mode = data.mode;
    if (mode !== "direct" && mode !== "pool")
        throw new https_1.HttpsError("invalid-argument", "mode must be direct or pool.");
    const apartmentRef = db.doc(`apartments/${apartmentId}`);
    const snapshot = await apartmentRef.get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("not-found", "Apartment not found.");
    const apartment = snapshot.data() ?? {};
    const agencyId = requiredString(apartment.agencyId, "agencyId");
    await requireSameAgencyBroker(uid, agencyId);
    if (apartment.hostId !== uid && apartment.ownerId !== uid && !(Array.isArray(apartment.assignedBrokerIds) && apartment.assignedBrokerIds.includes(uid))) {
        throw new https_1.HttpsError("permission-denied", "You do not manage this listing.");
    }
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(apartmentRef);
        if (!current.exists)
            throw new https_1.HttpsError("not-found", "Apartment not found.");
        transaction.update(apartmentRef, {
            assignedBrokerIds: mode === "direct" ? [uid] : [],
            assignmentStatus: mode === "direct" ? "assigned" : "unassigned_pool",
            pendingClaimBrokerId: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    if (mode === "direct")
        await addOwnerToBrokerClients(uid, apartmentId, apartment);
    return { apartmentId, mode };
});
exports.reviewClaimCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const claimId = requiredString(data.claimId, "claimId");
    if (typeof data.approved !== "boolean")
        throw new https_1.HttpsError("invalid-argument", "approved must be a boolean.");
    const claimRef = db.doc(`agency_claims/${claimId}`);
    const claimSnapshot = await claimRef.get();
    if (!claimSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Claim not found.");
    const claim = claimSnapshot.data() ?? {};
    const agencyId = requiredString(claim.agencyId, "agencyId");
    await requireAgencyStaff(uid, agencyId, true);
    const apartmentId = requiredString(claim.apartmentId, "apartmentId");
    const brokerId = requiredString(claim.brokerId, "brokerId");
    const apartmentRef = db.doc(`apartments/${apartmentId}`);
    await db.runTransaction(async (transaction) => {
        const currentClaim = await transaction.get(claimRef);
        const currentApartment = await transaction.get(apartmentRef);
        if (!currentClaim.exists || !currentApartment.exists)
            throw new https_1.HttpsError("not-found", "Claim or apartment not found.");
        const currentClaimData = currentClaim.data() ?? {};
        const apartment = currentApartment.data() ?? {};
        const pending = typeof apartment.pendingClaimBrokerId === "string" ? apartment.pendingClaimBrokerId : "";
        if (currentClaimData.status !== "pending" || pending !== brokerId)
            throw new https_1.HttpsError("failed-precondition", "The claim is no longer available.");
        const assigned = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds.filter((id) => typeof id === "string") : [];
        const rejected = Array.isArray(apartment.rejectedBrokerIds) ? apartment.rejectedBrokerIds.filter((id) => typeof id === "string") : [];
        transaction.update(apartmentRef, data.approved ? {
            assignedBrokerIds: Array.from(new Set([...assigned, brokerId])),
            assignmentStatus: "assigned",
            pendingClaimBrokerId: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        } : {
            assignedBrokerIds: assigned.filter((id) => id !== brokerId),
            assignmentStatus: "unassigned_pool",
            pendingClaimBrokerId: firestore_1.FieldValue.delete(),
            rejectedBrokerIds: Array.from(new Set([...rejected, brokerId])),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(claimRef, {
            status: data.approved ? "approved" : "rejected",
            resolvedAt: firestore_1.FieldValue.serverTimestamp(),
            resolvedBy: uid,
        });
    });
    if (data.approved) {
        const apartmentSnapshot = await apartmentRef.get();
        if (apartmentSnapshot.exists)
            await addOwnerToBrokerClients(brokerId, apartmentId, apartmentSnapshot.data() ?? {});
    }
    const title = typeof claim.apartmentTitle === "string" ? claim.apartmentTitle : "Ακίνητο";
    await notifyUser(brokerId, data.approved ? `Το αίτημα διαχείρισης για το ακίνητο «${title}» εγκρίθηκε!` : "Το αίτημα ανάθεσης απορρίφθηκε", data.approved ? `Μπορείτε πλέον να διαχειρίζεστε το ακίνητο «${title}».` : `Η ανάθεση για το «${title}» απορρίφθηκε από τη Γραμματεία.`, data.approved ? "claim_approved" : "claim_rejected", { apartmentId });
    return { status: data.approved ? "assigned" : "unassigned_pool" };
});
exports.reassignLeadCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const leadId = requiredString(data.leadId, "leadId");
    const targetBrokerId = requiredString(data.targetBrokerId, "targetBrokerId");
    const leadRef = db.doc(`leads/${leadId}`);
    const leadSnapshot = await leadRef.get();
    if (!leadSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Lead not found.");
    const lead = leadSnapshot.data() ?? {};
    const agencyId = requiredString(lead.agencyId, "agencyId");
    await requireAgencyStaff(uid, agencyId, true);
    await requireSameAgencyBroker(targetBrokerId, agencyId);
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(leadRef);
        if (!current.exists || current.data()?.agencyId !== agencyId)
            throw new https_1.HttpsError("failed-precondition", "The lead is no longer available.");
        transaction.update(leadRef, { status: "assigned", assignedBrokerId: targetBrokerId, assignedAt: firestore_1.FieldValue.serverTimestamp(), lastContactTimestamp: null, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    });
    if (typeof lead.clientId === "string" && lead.clientId.trim()) {
        await db.doc(`brokerClientProfiles/${targetBrokerId}_${lead.clientId}`).set({
            brokerId: targetBrokerId,
            clientId: lead.clientId,
            clientUserId: lead.clientId,
            clientName: typeof lead.clientName === "string" ? lead.clientName : "Πελάτης",
            role: "client",
            ...(typeof lead.apartmentId === "string" ? { apartmentId: lead.apartmentId } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return { leadId, targetBrokerId };
});
exports.claimLeadCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const leadId = requiredString(data.leadId, "leadId");
    const leadRef = db.doc(`leads/${leadId}`);
    const leadSnapshot = await leadRef.get();
    if (!leadSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Lead not found.");
    const agencyId = requiredString(leadSnapshot.data()?.agencyId, "agencyId");
    await requireSameAgencyBroker(uid, agencyId);
    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(leadRef);
        if (!current.exists || current.data()?.status !== "unassigned_pool")
            throw new https_1.HttpsError("failed-precondition", "The lead is no longer available.");
        transaction.update(leadRef, { status: "assigned", assignedBrokerId: uid, assignedAt: firestore_1.FieldValue.serverTimestamp(), lastContactTimestamp: null, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    });
    const clientId = leadSnapshot.data()?.clientId;
    if (typeof clientId === "string" && clientId.trim()) {
        await db.doc(`brokerClientProfiles/${uid}_${clientId}`).set({
            brokerId: uid,
            clientId,
            clientUserId: clientId,
            clientName: typeof leadSnapshot.data()?.clientName === "string" ? leadSnapshot.data()?.clientName : "Πελάτης",
            role: "client",
            ...(typeof leadSnapshot.data()?.apartmentId === "string" ? { apartmentId: leadSnapshot.data()?.apartmentId } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return { leadId, assignedBrokerId: uid };
});
exports.recordKeySafeActionCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const action = data.action;
    if (action !== "checkout" && action !== "checkin")
        throw new https_1.HttpsError("invalid-argument", "action must be checkout or checkin.");
    const apartmentRef = db.doc(`apartments/${apartmentId}`);
    const apartment = await apartmentRef.get();
    if (!apartment.exists)
        throw new https_1.HttpsError("not-found", "Apartment not found.");
    const agencyId = requiredString(apartment.data()?.agencyId, "agencyId");
    const user = await requireAgencyStaff(uid, agencyId);
    const brokerName = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "Μεσίτης";
    const notes = optionalString(data.notes);
    const entry = { id: `${uid}_${Date.now()}`, brokerId: uid, brokerName, action, timestamp: Date.now(), checkedOutAt: Date.now(), ...(notes ? { notes } : {}) };
    await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(apartmentRef);
        if (!currentSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Apartment not found.");
        const current = currentSnapshot.data() ?? {};
        const logs = Array.isArray(current.keySafeLogs) ? current.keySafeLogs : [];
        const currentHolder = typeof current.currentKeyHolderId === "string" ? current.currentKeyHolderId : "";
        const legacyActiveLog = [...logs].reverse().find((log) => log && typeof log === "object" && !log.returnedAt && log.action !== "checkin");
        const activeHolder = currentHolder || (typeof legacyActiveLog?.brokerId === "string" ? legacyActiveLog.brokerId : "");
        if (action === "checkout" && activeHolder)
            throw new https_1.HttpsError("failed-precondition", "The keys are already checked out.");
        if (action === "checkin" && activeHolder !== uid)
            throw new https_1.HttpsError("permission-denied", "Only the current key holder can check the keys in.");
        const nextLogs = action === "checkin"
            ? logs.map((log) => log && typeof log === "object" && log.brokerId === uid && !log.returnedAt
                ? { ...log, returnedAt: Date.now() }
                : log)
            : logs;
        transaction.update(apartmentRef, {
            keySafeLogs: [...nextLogs, entry],
            ...(action === "checkout" ? { currentKeyHolderId: uid } : { currentKeyHolderId: firestore_1.FieldValue.delete() }),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { entry };
});
exports.delegateShowingCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const appointmentId = requiredString(data.appointmentId, "appointmentId");
    const coveringBrokerId = requiredString(data.coveringBrokerId, "coveringBrokerId");
    const appointmentRef = db.doc(`appointments/${appointmentId}`);
    const appointmentSnapshot = await appointmentRef.get();
    if (!appointmentSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Appointment not found.");
    const appointment = appointmentSnapshot.data() ?? {};
    const agencyId = requiredString(appointment.agencyId, "agencyId");
    await requireAgencyStaff(uid, agencyId);
    const participants = [appointment.brokerId, appointment.listingBrokerId, appointment.buyerBrokerId].filter((id) => typeof id === "string");
    if (!participants.includes(uid))
        throw new https_1.HttpsError("permission-denied", "Only an appointment participant can delegate it.");
    const coveringBroker = await requireAgencyStaff(coveringBrokerId, agencyId);
    const coveringBrokerName = typeof coveringBroker.name === "string" && coveringBroker.name.trim() ? coveringBroker.name.trim() : "Μεσίτης";
    await appointmentRef.update({ coveringBrokerId, coveringBrokerName, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    const linkedNotes = await db.collectionGroup("calendarNotes").where("appointmentId", "==", appointmentId).get();
    await Promise.all(linkedNotes.docs.map((note) => note.ref.delete()));
    await notifyUser(coveringBrokerId, "Νέα κάλυψη υπόδειξης", "Σας ανατέθηκε κάλυψη για ένα ραντεβού υπόδειξης.", "showing_delegated", { appointmentId });
    return { appointmentId, coveringBrokerId, coveringBrokerName };
});
exports.recordShowingFeedbackCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const appointmentId = requiredString(data.appointmentId, "appointmentId");
    const appointmentRef = db.doc(`appointments/${appointmentId}`);
    let completedAppointment = {};
    await db.runTransaction(async (transaction) => {
        const appointmentSnapshot = await transaction.get(appointmentRef);
        if (!appointmentSnapshot.exists)
            throw new https_1.HttpsError("not-found", "Appointment not found.");
        const appointment = appointmentSnapshot.data() ?? {};
        completedAppointment = appointment;
        const participants = [appointment.brokerId, appointment.clientId, appointment.listingBrokerId, appointment.buyerBrokerId, appointment.coveringBrokerId];
        if (!participants.includes(uid))
            throw new https_1.HttpsError("permission-denied", "Only an appointment participant can submit feedback.");
        const feedbackSubmittedBy = appointment.feedbackSubmittedBy && typeof appointment.feedbackSubmittedBy === "object" ? appointment.feedbackSubmittedBy : {};
        transaction.update(appointmentRef, { feedbackSubmittedBy: { ...feedbackSubmittedBy, [uid]: true }, status: "completed", updatedAt: firestore_1.FieldValue.serverTimestamp() });
    });
    if (typeof completedAppointment.agencyId === "string") {
        await (0, analyticsEvents_1.logAnalyticsEvent)({
            agencyId: completedAppointment.agencyId,
            eventType: "showing_conducted",
            timestamp: Date.now(),
            listingId: typeof completedAppointment.apartmentId === "string" ? completedAppointment.apartmentId : undefined,
            leadId: typeof completedAppointment.leadId === "string" ? completedAppointment.leadId : undefined,
            brokerId: typeof completedAppointment.coveringBrokerId === "string" ? completedAppointment.coveringBrokerId : typeof completedAppointment.brokerId === "string" ? completedAppointment.brokerId : undefined,
            transactionType: completedAppointment.transactionType === "sale" || completedAppointment.transactionType === "rent" ? completedAppointment.transactionType : undefined,
            metadata: { appointmentId },
        }, `showing_conducted_${appointmentId}`);
    }
    return { appointmentId, submittedBy: uid };
});
exports.createCrossBrokerShowingCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const agencyId = requiredString(data.agencyId, "agencyId");
    const apartmentId = requiredString(data.apartmentId, "apartmentId");
    const listingBrokerId = requiredString(data.listingBrokerId, "listingBrokerId");
    const buyerBrokerId = requiredString(data.buyerBrokerId, "buyerBrokerId");
    const clientId = requiredString(data.clientId, "clientId");
    const leadId = await (0, leadAttribution_1.resolveLeadId)({ explicitLeadId: data.leadId, agencyId, apartmentId, clientId });
    if (!leadId)
        throw new https_1.HttpsError("failed-precondition", "A canonical lead is required before scheduling a showing.");
    const appointmentDate = requiredString(data.appointmentDate, "appointmentDate");
    if (uid !== buyerBrokerId || !Number.isFinite(Date.parse(appointmentDate)))
        throw new https_1.HttpsError("invalid-argument", "The buyer broker and appointment date are invalid.");
    await requireSameAgencyBroker(listingBrokerId, agencyId);
    await requireSameAgencyBroker(buyerBrokerId, agencyId);
    const apartmentRef = db.doc(`apartments/${apartmentId}`);
    const apartmentSnapshot = await apartmentRef.get();
    if (!apartmentSnapshot.exists || apartmentSnapshot.data()?.agencyId !== agencyId)
        throw new https_1.HttpsError("failed-precondition", "The apartment is not part of this agency.");
    const apartment = apartmentSnapshot.data() ?? {};
    const assigned = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds : [];
    if (!assigned.includes(listingBrokerId) && apartment.ownerId !== listingBrokerId && apartment.hostId !== listingBrokerId)
        throw new https_1.HttpsError("permission-denied", "The listing broker does not manage this apartment.");
    const apartmentTitle = optionalString(data.apartmentTitle) ?? "Ακίνητο";
    const clientName = optionalString(data.clientName) ?? "Πελάτης";
    const appointmentRef = db.collection("appointments").doc();
    const dealRef = db.doc(`deals/${apartmentId}_${clientId}`);
    await db.runTransaction(async (transaction) => {
        transaction.set(appointmentRef, {
            chatRoomId: `cross_broker_${apartmentId}_${clientId}`,
            brokerId: buyerBrokerId,
            clientId,
            leadId,
            listingBrokerId,
            buyerBrokerId,
            agencyId,
            apartmentId,
            apartmentTitle,
            apartmentAddress: optionalString(data.apartmentAddress) ?? "",
            appointmentDate,
            status: "confirmed",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.set(dealRef, {
            apartmentId,
            apartmentTitle,
            clientId,
            leadId,
            clientName,
            agencyId,
            listingBrokerId,
            buyerBrokerId,
            stage: 40,
            status: "active",
            appointmentId: appointmentRef.id,
            commissionTotal: 0,
            agencyCutPercentage: 50,
            agencyCutAmount: 0,
            brokerSplits: [],
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    await (0, dealChecklist_1.seedDealChecklist)(dealRef.id);
    await Promise.all([
        db.doc(`brokerClientProfiles/${buyerBrokerId}_${clientId}`).set({ brokerId: buyerBrokerId, clientId, clientUserId: clientId, clientName, role: "client", apartmentId, apartmentTitle, ...(typeof data.apartmentPrice === "number" ? { rent: data.apartmentPrice } : {}), updatedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true }),
        db.doc(`brokerClientProfiles/${listingBrokerId}_${clientId}`).set({ brokerId: listingBrokerId, clientId, clientUserId: clientId, clientName, role: "client", apartmentId, apartmentTitle, ...(typeof data.apartmentPrice === "number" ? { rent: data.apartmentPrice } : {}), updatedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return { appointmentId: appointmentRef.id };
});
function numberInput(data, key, fallback) {
    const value = data[key] === undefined ? fallback : data[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new https_1.HttpsError("invalid-argument", `${key} must be a number between 0 and 100.`);
    }
    return value;
}
function calculateSettlement(data, deal) {
    const officePercentage = numberInput(data, "officePercentage", typeof deal.agencyCutPercentage === "number" ? deal.agencyCutPercentage : 50);
    const listingPercentage = numberInput(data, "listingBrokerPercentage", 25);
    const sellingPercentage = numberInput(data, "sellingBrokerPercentage", 25);
    const coveringPercentage = data.coveringBrokerPercentage === undefined ? 0 : numberInput(data, "coveringBrokerPercentage");
    const total = officePercentage + listingPercentage + sellingPercentage + coveringPercentage;
    if (Math.round(total * 100) !== 10000)
        throw new https_1.HttpsError("invalid-argument", "Settlement shares must sum exactly to 100%.");
    const commissionTotal = Number(deal.commissionTotal);
    if (!Number.isFinite(commissionTotal) || commissionTotal < 0)
        throw new https_1.HttpsError("failed-precondition", "The deal has no valid commission total.");
    const round = (value) => Math.round(value * 100) / 100;
    const listingBrokerId = requiredString(deal.listingBrokerId, "listingBrokerId");
    const buyerBrokerId = requiredString(deal.buyerBrokerId, "buyerBrokerId");
    const listingName = typeof deal.listingBrokerName === "string" ? deal.listingBrokerName : "Listing broker";
    const buyerName = typeof deal.buyerBrokerName === "string" ? deal.buyerBrokerName : "Buyer broker";
    const brokerSplits = [
        { brokerId: listingBrokerId, brokerName: listingName, role: "listing_agent", percentage: listingPercentage, amount: round(commissionTotal * listingPercentage / 100) },
        { brokerId: buyerBrokerId, brokerName: buyerName, role: "buyer_agent", percentage: sellingPercentage, amount: round(commissionTotal * sellingPercentage / 100) },
    ];
    const coveringBrokerId = optionalString(deal.coveringBrokerId);
    if (coveringBrokerId && coveringPercentage > 0)
        brokerSplits.push({ brokerId: coveringBrokerId, brokerName: typeof deal.coveringBrokerName === "string" ? deal.coveringBrokerName : "Covering broker", role: "covering_agent", percentage: coveringPercentage, amount: round(commissionTotal * coveringPercentage / 100) });
    return { agencyAmount: round(commissionTotal * officePercentage / 100), brokerSplits, officePercentage };
}
exports.finalizeCommissionSettlementCallable = (0, https_1.onCall)(async (request) => {
    const uid = requireAuth(request);
    const data = dataOf(request);
    const action = data.action;
    if (!["submit", "approve", "issue", "settle"].includes(action))
        throw new https_1.HttpsError("invalid-argument", "Invalid settlement action.");
    let dealId;
    let dealRef;
    let settlementRef;
    let deal;
    if (action === "submit") {
        const agencyId = requiredString(data.agencyId, "agencyId");
        const broker = await requireSameAgencyBroker(uid, agencyId);
        const apartmentId = requiredString(data.apartmentId, "apartmentId");
        const clientId = requiredString(data.clientId, "clientId");
        const leadId = await (0, leadAttribution_1.resolveLeadId)({ explicitLeadId: data.leadId, agencyId, apartmentId, clientId });
        if (!leadId)
            throw new https_1.HttpsError("failed-precondition", "A canonical lead is required before submitting settlement.");
        const listingBrokerId = requiredString(data.listingBrokerId, "listingBrokerId");
        const buyerBrokerId = requiredString(data.buyerBrokerId, "buyerBrokerId");
        await requireSameAgencyBroker(listingBrokerId, agencyId);
        await requireSameAgencyBroker(buyerBrokerId, agencyId);
        if (broker.agencyId !== agencyId)
            throw new https_1.HttpsError("permission-denied", "The broker does not belong to this agency.");
        dealId = optionalString(data.dealId) ?? `${apartmentId}_${clientId}`;
        dealRef = db.doc(`deals/${dealId}`);
        try {
            await (0, dealChecklist_1.assertChecklistVerified)(dealId, 100);
        }
        catch (error) {
            if (error instanceof Error)
                throw new https_1.HttpsError("failed-precondition", error.message);
            throw error;
        }
        settlementRef = db.doc(`agencies/${agencyId}/commission_settlements/${dealId}`);
        const dealAmount = data.dealAmount;
        if (typeof dealAmount !== "number" || !Number.isFinite(dealAmount) || dealAmount < 0)
            throw new https_1.HttpsError("invalid-argument", "dealAmount must be a non-negative number.");
        const commissionRate = typeof data.commissionRate === "number" && Number.isFinite(data.commissionRate) ? data.commissionRate : 1;
        deal = {
            apartmentId,
            ...(optionalString(data.apartmentTitle) ? { apartmentTitle: optionalString(data.apartmentTitle) } : {}),
            clientId,
            leadId,
            ...(optionalString(data.clientName) ? { clientName: optionalString(data.clientName) } : {}),
            agencyId,
            listingBrokerId,
            buyerBrokerId,
            ...(optionalString(data.coveringBrokerId) ? { coveringBrokerId: optionalString(data.coveringBrokerId) } : {}),
            stage: 100,
            status: "closed",
            settlementStatus: "pending_review",
            dealAmount,
            commissionTotal: dealAmount * commissionRate,
            agencyCutPercentage: 50,
            agencyCutAmount: 0,
            brokerSplits: [],
        };
        const result = await db.runTransaction(async (transaction) => {
            const existing = await transaction.get(dealRef);
            if (existing.exists && existing.data()?.settlementStatus && existing.data()?.settlementStatus !== "pending_review")
                throw new https_1.HttpsError("already-exists", "The settlement has already advanced.");
            transaction.set(dealRef, { ...deal, createdAt: existing.exists ? existing.data()?.createdAt : firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(settlementRef, { id: dealId, dealId, apartmentId, apartmentTitle: deal.apartmentTitle ?? "Ακίνητο", totalDealAmount: dealAmount, totalCommission: deal.commissionTotal, agencyShare: 0, brokerSplits: [], invoiceStatus: "pending_review", createdAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
            return { status: "pending_review" };
        });
        return result;
    }
    const suppliedDealId = requiredString(data.dealId, "dealId");
    dealId = suppliedDealId;
    dealRef = db.doc(`deals/${dealId}`);
    const dealSnapshot = await dealRef.get();
    if (!dealSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Deal not found.");
    deal = dealSnapshot.data() ?? {};
    const agencyId = requiredString(deal.agencyId, "agencyId");
    await requireAgencyStaff(uid, agencyId, action === "approve" || action === "settle");
    settlementRef = db.doc(`agencies/${agencyId}/commission_settlements/${dealId}`);
    const currentStatus = deal.settlementStatus === "pending_invoice" ? "pending_review" : deal.settlementStatus ?? "pending_review";
    const expected = { submit: null, approve: "pending_review", issue: "approved", settle: "issued" };
    if (currentStatus !== expected[action])
        throw new https_1.HttpsError("failed-precondition", `Settlement must be ${expected[action]} before ${action}.`);
    const calculation = action === "approve" || action === "issue" || action === "settle" ? calculateSettlement(data, deal) : null;
    const nextStatus = action === "approve" ? "approved" : action === "issue" ? "issued" : "settled";
    await db.runTransaction(async (transaction) => {
        const currentDeal = await transaction.get(dealRef);
        const currentSettlement = await transaction.get(settlementRef);
        if (!currentDeal.exists || !currentSettlement.exists)
            throw new https_1.HttpsError("not-found", "Settlement not found.");
        const liveStatus = currentDeal.data()?.settlementStatus === "pending_invoice" ? "pending_review" : currentDeal.data()?.settlementStatus ?? "pending_review";
        if (liveStatus !== expected[action])
            throw new https_1.HttpsError("aborted", "The settlement changed. Please reload.");
        transaction.update(dealRef, {
            settlementStatus: nextStatus,
            ...(calculation ? { agencyCutPercentage: calculation.officePercentage, agencyCutAmount: calculation.agencyAmount, brokerSplits: calculation.brokerSplits } : {}),
            ...(action === "issue" ? { invoiceNumber: optionalString(data.invoiceNumber) ?? `INV-${Date.now()}`, issuedAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            ...(action === "settle" ? { settledAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        transaction.update(settlementRef, {
            invoiceStatus: nextStatus,
            ...(calculation ? { agencyShare: calculation.agencyAmount, brokerSplits: calculation.brokerSplits } : {}),
            ...(action === "issue" ? { invoiceNumber: optionalString(data.invoiceNumber) ?? `INV-${Date.now()}`, issuedAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            ...(action === "settle" ? { settledAt: firestore_1.FieldValue.serverTimestamp() } : {}),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    if (action === "settle") {
        const recipients = [deal.listingBrokerId, deal.buyerBrokerId, deal.coveringBrokerId].filter((id) => typeof id === "string");
        await Promise.all(recipients.map((brokerId) => notifyUser(brokerId, "Η εκκαθάριση ολοκληρώθηκε", "Η εκκαθάριση του deal ολοκληρώθηκε.", "commission_settled", { dealId })));
        await (0, analyticsEvents_1.logAnalyticsEvent)({
            agencyId,
            eventType: "deal_closed",
            timestamp: Date.now(),
            listingId: typeof deal.apartmentId === "string" ? deal.apartmentId : undefined,
            leadId: typeof deal.leadId === "string" ? deal.leadId : undefined,
            brokerId: typeof deal.listingBrokerId === "string" ? deal.listingBrokerId : undefined,
            transactionType: deal.transactionType === "sale" || deal.transactionType === "rent" ? deal.transactionType : undefined,
            amount: typeof deal.commissionTotal === "number" ? deal.commissionTotal : undefined,
            stageTo: 100,
            metadata: {
                settlementStatus: "settled",
                settlementId: dealId,
                agencyRetainedShare: calculation?.agencyAmount ?? (typeof deal.agencyCutAmount === "number" ? deal.agencyCutAmount : 0),
                brokerSplitPayouts: calculation?.brokerSplits.reduce((sum, split) => sum + (typeof split.amount === "number" ? split.amount : 0), 0) ?? 0,
                dealId,
            },
        }, `deal_closed_${dealId}`);
    }
    return { status: nextStatus, dealId };
});
//# sourceMappingURL=agencyCollaboration.js.map