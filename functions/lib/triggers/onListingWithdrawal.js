"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onListingWithdrawal = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-functions/v2/firestore");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
exports.onListingWithdrawal = (0, firestore_1.onDocumentUpdated)("apartments/{apartmentId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const terminalStatuses = new Set(["withdrawn", "rented", "sold", "closed_deal"]);
    if (before.status !== "active" || !terminalStatuses.has(after.status))
        return;
    const initiatorId = after.withdrawalMetadata?.withdrawnByUserId;
    const brokerIds = Array.isArray(after.assignedBrokerIds) ? after.assignedBrokerIds.filter((id) => typeof id === "string") : [];
    const affectedBrokerIds = brokerIds.filter((id) => id !== initiatorId);
    if (affectedBrokerIds.length === 0)
        return;
    const title = typeof after.title === "string" ? after.title : "Ακίνητο";
    await Promise.all(affectedBrokerIds.map((brokerId) => (0, push_1.sendPushToUser)(brokerId, "Απόσυρση Αγγελίας", `Η αγγελία «${title}» αποσύρθηκε από άλλον μεσίτη που διαχειριζόταν το ακίνητο.`, { type: "LISTING_WITHDRAWN", apartmentId: event.params.apartmentId, channelId: "deals_pipeline" })));
});
//# sourceMappingURL=onListingWithdrawal.js.map