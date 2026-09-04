import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const QUARTER_HOUR_MS = 15 * 60 * 1000;

type ReminderPhase = "24h" | "2h" | "postVisit";

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function appointmentDate(data: DocumentData): Date | null {
  return toDate(data.timestamp) ?? toDate(data.appointmentDate);
}

function isInWindow(date: Date, now: number, offsetMs: number): boolean {
  const target = now + offsetMs;
  return date.getTime() >= target - QUARTER_HOUR_MS && date.getTime() < target + QUARTER_HOUR_MS;
}

async function claimPhase(appointmentId: string, phase: ReminderPhase, now: number): Promise<boolean> {
  const ref = db.doc(`appointments/${appointmentId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const data = snapshot.data() ?? {};
    if (data.status === "cancelled") return false;
    const flag = phase === "24h" ? "reminded24h" : phase === "2h" ? "reminded2h" : "feedbackPromptSent";
    if (data[flag] === true) return false;
    transaction.update(ref, { [flag]: true, [`${flag}At`]: now });
    return true;
  });
}

async function processAppointment(appointmentId: string, data: DocumentData, now: number): Promise<void> {
  if (data.status === "cancelled") return;
  const date = appointmentDate(data);
  if (!date) return;
  const brokerId = typeof data.brokerId === "string" ? data.brokerId : "";
  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  if (!brokerId || !clientId) return;

  const listingId = typeof data.apartmentId === "string" ? data.apartmentId : "";
  const listingSnapshot = listingId ? await db.doc(`apartments/${listingId}`).get() : null;
  const listing = listingSnapshot?.exists ? listingSnapshot.data() ?? {} : {};
  const address = typeof listing.exactAddress === "string" && listing.showExactAddress === true
    ? listing.exactAddress
    : [listing.area, listing.city].filter((value) => typeof value === "string" && value.trim()).join(", ");
  const title = typeof data.apartmentTitle === "string" ? data.apartmentTitle : "το ακίνητο";
  const time = date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });

  if (isInWindow(date, now, 24 * 60 * 60 * 1000) && await claimPhase(appointmentId, "24h", now)) {
    await Promise.all([
      sendPushToUser(brokerId, { type: "visit_reminder", title: "Υπόδειξη αύριο", body: `Υπόδειξη αύριο στις ${time} με τον πελάτη. Αποστείλατε την ακριβή διεύθυνση;`, screen: "chat/[id]", params: { appointmentId, apartmentId: listingId, clientId, chatId: data.chatRoomId }, entityId: appointmentId, action: "send_exact_address" }, "visit_reminders"),
      sendPushToUser(clientId, { type: "visit_reminder", title: "Υπενθύμιση υπόδειξης", body: `Υπενθύμιση υπόδειξης αύριο στις ${time} στην περιοχή ${address}.`, screen: "chat/[id]", params: { appointmentId, chatId: data.chatRoomId }, entityId: appointmentId }, "visit_reminders"),
    ]);
  }

  if (isInWindow(date, now, 2 * 60 * 60 * 1000) && await claimPhase(appointmentId, "2h", now)) {
    const encodedAddress = encodeURIComponent(address);
    await sendPushToUser(clientId, { type: "visit_navigation", title: "Η υπόδειξή σας είναι σε 2 ώρες", body: `Η επίσκεψη στο ${title} είναι στις ${time}.`, screen: "calendar", params: { appointmentId, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, appleMapsUrl: `maps://?q=${encodedAddress}` }, entityId: appointmentId }, "visit_reminders");
  }

  if (data.status === "completed" && isInWindow(date, now, -2 * 60 * 60 * 1000) && await claimPhase(appointmentId, "postVisit", now)) {
    await Promise.all([
      sendPushToUser(clientId, { type: "post_visit_rating", title: "Αξιολόγηση επίσκεψης", body: "Πώς ήταν η επίσκεψη στο ακίνητο; Βαθμολόγησε την εμπειρία σου", screen: "calendar", params: { appointmentId }, entityId: appointmentId, action: "open_modal" }, "visit_reminders"),
      sendPushToUser(brokerId, { type: "post_visit_rating", title: "Feedback υπόδειξης", body: "Ολοκληρώθηκε η υπόδειξη; Κατάγραψε feedback και τυχόν προφορική προσφορά", screen: "broker-client-detail", params: { appointmentId }, entityId: appointmentId, action: "open_modal" }, "visit_reminders"),
    ]);
  }
}

export const processScheduledVisitReminders = onSchedule("every 15 minutes", async () => {
  const now = Date.now();
  const [confirmed, completed] = await Promise.all([
    db.collection("appointments").where("status", "==", "confirmed").get(),
    db.collection("appointments").where("status", "==", "completed").get(),
  ]);
  const appointments = new Map([...confirmed.docs, ...completed.docs].map((snapshot) => [snapshot.id, snapshot]));
  await Promise.all([...appointments.values()].map((snapshot) => processAppointment(snapshot.id, snapshot.data(), now)));
});
