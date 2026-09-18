"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAgencyPoolBrokers = notifyAgencyPoolBrokers;
exports.notifyAgencyAssignmentRequested = notifyAgencyAssignmentRequested;
exports.notifyAgencyAssignmentApproved = notifyAgencyAssignmentApproved;
exports.agencyNotificationTitle = agencyNotificationTitle;
exports.agencyNotificationBrokerName = agencyNotificationBrokerName;
const firestore_1 = require("firebase-admin/firestore");
const push_1 = require("./push");
const db = (0, firestore_1.getFirestore)();
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat", "owner", "sec", "admin"]);
const BROKER_ROLES = new Set(["broker", "agent"]);
function stringValue(value, fallback = "") {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}
function roleOf(data) {
    return stringValue(data.agencyRole || data.role).toLocaleLowerCase();
}
function isActive(data) {
    const status = stringValue(data.agencyStatus || data.status).toLocaleLowerCase();
    return status.length === 0 || status === "approved" || status === "active";
}
function localeOf(data) {
    const locale = stringValue(data.locale || data.language || data.preferredLanguage).toLocaleLowerCase();
    return locale.startsWith("en") ? "en" : "el";
}
function isAgencyBroker(data) {
    return isActive(data) && (data.is_broker === true || BROKER_ROLES.has(roleOf(data)));
}
function isAgencyExecutive(data) {
    return isActive(data) && EXECUTIVE_ROLES.has(roleOf(data));
}
async function getAgencyRecipients(agencyId, predicate) {
    if (!agencyId.trim())
        return [];
    const snapshot = await db.collection("users").where("agencyId", "==", agencyId).get();
    return snapshot.docs
        .map((user) => ({ id: user.id, data: user.data() }))
        .filter((user) => predicate(user.data));
}
function notificationCopy(kind, locale, title, brokerName) {
    if (kind === "pool") {
        return locale === "en"
            ? { title: "New Pool Listing", body: `Listing "${title}" is available for assignment in your agency pool.` }
            : { title: "Νέο ακίνητο στο Pool", body: `Το ακίνητο «${title}» είναι διαθέσιμο για ανάθεση στο γραφείο σας.` };
    }
    if (kind === "requested") {
        return locale === "en"
            ? { title: "Assignment Requested", body: `${brokerName || "A broker"} requested assignment for listing "${title}".` }
            : { title: "Αίτημα ανάθεσης ακινήτου", body: `${brokerName || "Ο/Η μεσίτης"} ζήτησε την ανάθεση του ακινήτου «${title}».` };
    }
    return locale === "en"
        ? { title: "Assignment Approved", body: `Your request for listing "${title}" has been approved.` }
        : { title: "Έγκριση ανάθεσης", body: `Το αίτημά σας για την ανάθεση του ακινήτου «${title}» εγκρίθηκε.` };
}
function buildPayload(kind, recipient, context) {
    const copy = notificationCopy(kind, localeOf(recipient.data), context.title, context.brokerName);
    const type = kind === "pool"
        ? "agency_pool_new_item"
        : kind === "requested"
            ? "agency_assignment_requested"
            : "agency_assignment_approved";
    const screen = kind === "pool" ? "apartments" : kind === "requested" ? "agency-management" : "apartment-detail";
    const params = kind === "pool"
        ? { agencyId: context.agencyId, apartmentId: context.apartmentId, targetScreen: "apartments", filter: "pool" }
        : kind === "requested"
            ? { agencyId: context.agencyId, apartmentId: context.apartmentId, requestId: context.requestId ?? "", targetScreen: "agency-management" }
            : { agencyId: context.agencyId, apartmentId: context.apartmentId, id: context.apartmentId, targetScreen: "apartment-detail", assignmentApproved: true, ...(context.approvedByUserId ? { approvedByUserId: context.approvedByUserId } : {}) };
    return {
        type,
        title: copy.title,
        body: copy.body,
        screen,
        params,
        metadata: params,
        entityId: context.apartmentId,
        action: kind === "pool" ? "open_pool" : kind === "requested" ? "review_assignment" : "open_assignment",
    };
}
async function notifyRecipients(kind, recipients, context) {
    await Promise.all(recipients.map((recipient) => (0, push_1.sendPushToUser)(recipient.id, buildPayload(kind, recipient, context), "deals_pipeline", { dedupeKey: `${context.dedupeKey}:${recipient.id}` })));
}
async function notifyAgencyPoolBrokers(context) {
    const recipients = await getAgencyRecipients(context.agencyId, isAgencyBroker);
    await notifyRecipients("pool", recipients, context);
}
async function notifyAgencyAssignmentRequested(context) {
    const recipients = await getAgencyRecipients(context.agencyId, isAgencyExecutive);
    await notifyRecipients("requested", recipients, context);
}
async function notifyAgencyAssignmentApproved(brokerId, context) {
    const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
    if (!brokerSnapshot.exists)
        return;
    await notifyRecipients("approved", [{ id: brokerSnapshot.id, data: brokerSnapshot.data() }], context);
}
function agencyNotificationTitle(data, fallback = "Ακίνητο") {
    return stringValue(data.title || data.apartmentTitle || data.clientName, fallback);
}
function agencyNotificationBrokerName(data, fallback = "Μεσίτης") {
    return stringValue(data.name || data.brokerName, fallback);
}
//# sourceMappingURL=agencyNotifications.js.map