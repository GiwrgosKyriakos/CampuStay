"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onListingWithdrawalEventCreated = exports.onListingWithdrawal = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
async function notifyFavoriteUsers(apartmentId, title) {
    const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
    const userIds = [...new Set(likes.docs.map((like) => like.data().userId).filter((userId) => typeof userId === "string" && userId.length > 0))];
    await Promise.all(userIds.map((userId) => (0, push_1.sendPushToUser)(userId, { type: "price_drop", title: "Απόσυρση Αγγελίας", body: `Η αποθηκευμένη αγγελία «${title}» δεν είναι πλέον διαθέσιμη.`, screen: "apartment-detail", params: { apartmentId }, entityId: apartmentId, action: "listing_withdrawn" }, "deals_pipeline")));
}
async function dispatchListingWithdrawal(apartmentId, title, brokerIds = []) {
    await Promise.all([
        notifyFavoriteUsers(apartmentId, title),
        ...brokerIds.map((brokerId) => (0, push_1.sendPushToUser)(brokerId, { type: "price_drop", title: "Απόσυρση Αγγελίας", body: `Η αγγελία «${title}» αποσύρθηκε από άλλον μεσίτη που διαχειριζόταν το ακίνητο.`, screen: "apartment-detail", params: { apartmentId }, entityId: apartmentId, action: "listing_withdrawn" }, "deals_pipeline")),
    ]);
}
exports.onListingWithdrawal = (0, firestore_2.onDocumentUpdated)("apartments/{apartmentId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const terminalStatuses = new Set(["withdrawn", "rented", "sold", "closed_deal"]);
    const wasUnavailable = terminalStatuses.has(before.status) || before.isOffMarket === true || before.isDeleted === true;
    const isUnavailable = terminalStatuses.has(after.status) || after.isOffMarket === true || after.isDeleted === true;
    if (wasUnavailable || !isUnavailable)
        return;
    const initiatorId = after.withdrawalMetadata?.withdrawnByUserId;
    const brokerIds = Array.isArray(after.assignedBrokerIds) ? after.assignedBrokerIds.filter((id) => typeof id === "string") : [];
    const affectedBrokerIds = brokerIds.filter((id) => id !== initiatorId);
    const title = typeof after.title === "string" ? after.title : "Ακίνητο";
    await dispatchListingWithdrawal(event.params.apartmentId, title, affectedBrokerIds);
});
exports.onListingWithdrawalEventCreated = (0, firestore_2.onDocumentCreated)("listingWithdrawalEvents/{apartmentId}", async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const title = typeof data.apartmentTitle === "string" && data.apartmentTitle.trim() ? data.apartmentTitle : "Ακίνητο";
    await dispatchListingWithdrawal(event.params.apartmentId, title);
});
//# sourceMappingURL=onListingWithdrawal.js.map