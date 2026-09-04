"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDealStagnation = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const STAGNATION_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;
function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
}
function numberValue(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (value && typeof value.toMillis === "function")
        return value.toMillis();
    return null;
}
function reminderIntervalMinutes(data) {
    const settings = data.brokerStagnationSettings && typeof data.brokerStagnationSettings === "object" ? data.brokerStagnationSettings : {};
    const configured = Number(settings.stagnationAlertIntervalMinutes ?? data.dealStagnationReminderMinutes);
    return configured === 15 ? 15 : 60;
}
exports.processDealStagnation = (0, scheduler_1.onSchedule)("every 15 minutes", async () => {
    const now = Date.now();
    const profiles = await db.collection("brokerClientProfiles").where("role", "==", "client").get();
    await Promise.all(profiles.docs.map(async (profileSnapshot) => {
        const profile = profileSnapshot.data();
        const brokerId = stringValue(profile.brokerId);
        const clientId = stringValue(profile.clientId || profile.clientUserId);
        const stage = stringValue(profile.pipelineStage);
        const stageUpdatedAt = numberValue(profile.stageUpdatedAt);
        if (!brokerId || !clientId || !stageUpdatedAt || stage === "closed_won" || stage === "closed_lost" || now - stageUpdatedAt < STAGNATION_THRESHOLD_MS)
            return;
        const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
        if (!brokerSnapshot.exists)
            return;
        const broker = brokerSnapshot.data() ?? {};
        const settings = broker.brokerStagnationSettings && typeof broker.brokerStagnationSettings === "object" ? broker.brokerStagnationSettings : {};
        if (settings.stagnationAlertsEnabled === false)
            return;
        const intervalMinutes = reminderIntervalMinutes(broker);
        const lastSentAt = numberValue(profile.lastDealStagnationNotificationAt) ?? 0;
        if (now - lastSentAt < intervalMinutes * 60 * 1000)
            return;
        const claimed = await db.runTransaction(async (transaction) => {
            const current = await transaction.get(profileSnapshot.ref);
            if (!current.exists)
                return false;
            const currentData = current.data() ?? {};
            const currentLastSentAt = numberValue(currentData.lastDealStagnationNotificationAt) ?? 0;
            const currentStageUpdatedAt = numberValue(currentData.stageUpdatedAt);
            if (!currentStageUpdatedAt || now - currentStageUpdatedAt < STAGNATION_THRESHOLD_MS || now - currentLastSentAt < intervalMinutes * 60 * 1000)
                return false;
            transaction.update(profileSnapshot.ref, { lastDealStagnationNotificationAt: now });
            return true;
        });
        if (!claimed)
            return;
        const apartmentId = stringValue(profile.apartmentId || (Array.isArray(profile.apartmentIds) ? profile.apartmentIds[0] : ""));
        await (0, push_1.sendPushToUser)(brokerId, {
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
//# sourceMappingURL=dealStagnation.js.map