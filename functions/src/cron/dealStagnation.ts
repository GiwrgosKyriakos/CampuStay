import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const STAGNATION_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  return null;
}

function reminderIntervalMinutes(data: DocumentData): number {
  const settings = data.brokerStagnationSettings && typeof data.brokerStagnationSettings === "object" ? data.brokerStagnationSettings as DocumentData : {};
  const configured = Number(settings.stagnationAlertIntervalMinutes ?? data.dealStagnationReminderMinutes);
  return configured === 15 ? 15 : 60;
}

export const processDealStagnation = onSchedule("every 15 minutes", async () => {
  const now = Date.now();
  const profiles = await db.collection("brokerClientProfiles").where("role", "==", "client").get();
  await Promise.all(profiles.docs.map(async (profileSnapshot) => {
    const profile = profileSnapshot.data();
    const brokerId = stringValue(profile.brokerId);
    const clientId = stringValue(profile.clientId || profile.clientUserId);
    const stage = stringValue(profile.pipelineStage);
    const stageUpdatedAt = numberValue(profile.stageUpdatedAt);
    if (!brokerId || !clientId || !stageUpdatedAt || stage === "closed_won" || stage === "closed_lost" || now - stageUpdatedAt < STAGNATION_THRESHOLD_MS) return;

    const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
    if (!brokerSnapshot.exists) return;
    const broker = brokerSnapshot.data() ?? {};
    const settings = broker.brokerStagnationSettings && typeof broker.brokerStagnationSettings === "object" ? broker.brokerStagnationSettings as DocumentData : {};
    if (settings.stagnationAlertsEnabled === false) return;
    const intervalMinutes = reminderIntervalMinutes(broker);
    const lastSentAt = numberValue(profile.lastDealStagnationNotificationAt) ?? 0;
    if (now - lastSentAt < intervalMinutes * 60 * 1000) return;

    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(profileSnapshot.ref);
      if (!current.exists) return false;
      const currentData = current.data() ?? {};
      const currentLastSentAt = numberValue(currentData.lastDealStagnationNotificationAt) ?? 0;
      const currentStageUpdatedAt = numberValue(currentData.stageUpdatedAt);
      if (!currentStageUpdatedAt || now - currentStageUpdatedAt < STAGNATION_THRESHOLD_MS || now - currentLastSentAt < intervalMinutes * 60 * 1000) return false;
      transaction.update(profileSnapshot.ref, { lastDealStagnationNotificationAt: now });
      return true;
    });
    if (!claimed) return;

    const apartmentId = stringValue(profile.apartmentId || (Array.isArray(profile.apartmentIds) ? profile.apartmentIds[0] : ""));
    await sendPushToUser(brokerId, {
      type: "deal_stage_update",
      title: "Deal σε στασιμότητα",
      body: `Ο πελάτης βρίσκεται στο στάδιο «${stage || "lead"}» για περισσότερες από 5 ημέρες.`,
      screen: "broker-client-detail",
      params: { profileId: profileSnapshot.id, clientId, ...(apartmentId ? { apartmentId } : {}) },
      entityId: profileSnapshot.id,
      action: "deal_stagnation",
    }, "deals_pipeline");
  }));
});
