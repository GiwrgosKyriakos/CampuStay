import { getApps, initializeApp } from "firebase-admin/app";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();

export const onListingWithdrawal = onDocumentUpdated("apartments/{apartmentId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const terminalStatuses = new Set(["withdrawn", "rented", "sold", "closed_deal"]);
  if (before.status !== "active" || !terminalStatuses.has(after.status)) return;

  const initiatorId = after.withdrawalMetadata?.withdrawnByUserId;
  const brokerIds = Array.isArray(after.assignedBrokerIds) ? after.assignedBrokerIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const affectedBrokerIds = brokerIds.filter((id: string) => id !== initiatorId);
  if (affectedBrokerIds.length === 0) return;

  const title = typeof after.title === "string" ? after.title : "Ακίνητο";
  await Promise.all(affectedBrokerIds.map((brokerId: string) => sendPushToUser(
    brokerId,
    "Απόσυρση Αγγελίας",
    `Η αγγελία «${title}» αποσύρθηκε από άλλον μεσίτη που διαχειριζόταν το ακίνητο.`,
    { type: "LISTING_WITHDRAWN", apartmentId: event.params.apartmentId, channelId: "deals_pipeline" },
  )));
});
