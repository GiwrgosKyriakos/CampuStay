import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

async function notifyFavoriteUsers(apartmentId: string, title: string): Promise<void> {
  const likes = await db.collection("liked_apartments").where("apartmentId", "==", apartmentId).get();
  const userIds = [...new Set(likes.docs.map((like) => like.data().userId).filter((userId): userId is string => typeof userId === "string" && userId.length > 0))];
  await Promise.all(userIds.map((userId) => sendPushToUser(
    userId,
    { type: "price_drop", title: "Απόσυρση Αγγελίας", body: `Η αποθηκευμένη αγγελία «${title}» δεν είναι πλέον διαθέσιμη.`, screen: "apartment-detail", params: { apartmentId }, entityId: apartmentId, action: "listing_withdrawn" },
    "deals_pipeline",
  )));
}

async function dispatchListingWithdrawal(apartmentId: string, title: string, brokerIds: string[] = []): Promise<void> {
  await Promise.all([
    notifyFavoriteUsers(apartmentId, title),
    ...brokerIds.map((brokerId) => sendPushToUser(
      brokerId,
      { type: "price_drop", title: "Απόσυρση Αγγελίας", body: `Η αγγελία «${title}» αποσύρθηκε από άλλον μεσίτη που διαχειριζόταν το ακίνητο.`, screen: "apartment-detail", params: { apartmentId }, entityId: apartmentId, action: "listing_withdrawn" },
      "deals_pipeline",
    )),
  ]);
}

export const onListingWithdrawal = onDocumentUpdated("apartments/{apartmentId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const terminalStatuses = new Set(["withdrawn", "rented", "sold", "closed_deal"]);
  const wasUnavailable = terminalStatuses.has(before.status) || before.isOffMarket === true || before.isDeleted === true;
  const isUnavailable = terminalStatuses.has(after.status) || after.isOffMarket === true || after.isDeleted === true;
  if (wasUnavailable || !isUnavailable) return;

  const initiatorId = after.withdrawalMetadata?.withdrawnByUserId;
  const brokerIds = Array.isArray(after.assignedBrokerIds) ? after.assignedBrokerIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const affectedBrokerIds = brokerIds.filter((id: string) => id !== initiatorId);

  const title = typeof after.title === "string" ? after.title : "Ακίνητο";
  await dispatchListingWithdrawal(event.params.apartmentId, title, affectedBrokerIds);
});

export const onListingWithdrawalEventCreated = onDocumentCreated("listingWithdrawalEvents/{apartmentId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const title = typeof data.apartmentTitle === "string" && data.apartmentTitle.trim() ? data.apartmentTitle : "Ακίνητο";
  await dispatchListingWithdrawal(event.params.apartmentId, title);
});
