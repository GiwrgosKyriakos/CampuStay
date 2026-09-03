"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLeadInactivityDispatch = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
function isStale(data, cutoff) {
    if (data.status !== "assigned" || data.lastContactTimestamp != null)
        return false;
    const assignedAt = data.assignedAt;
    if (assignedAt && typeof assignedAt.toMillis === "function")
        return assignedAt.toMillis() < cutoff;
    if (typeof assignedAt === "number")
        return assignedAt < cutoff;
    if (typeof assignedAt === "string")
        return Date.parse(assignedAt) < cutoff;
    return false;
}
async function resetLead(snapshot, cutoff) {
    const leadRef = snapshot.ref;
    const result = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(leadRef);
        if (!currentSnapshot.exists)
            return null;
        const data = currentSnapshot.data() ?? {};
        if (!isStale(data, cutoff))
            return null;
        const eventRef = leadRef.collection("reallocationEvents").doc();
        transaction.update(leadRef, {
            status: "unassigned_pool",
            assignedBrokerId: null,
            assignedAt: null,
            reallocatedAt: Date.now(),
            reallocationReason: "24h_inactivity",
            updatedAt: Date.now(),
        });
        transaction.set(eventRef, {
            type: "inactivity_reallocation",
            previousAssignedBrokerId: typeof data.assignedBrokerId === "string" ? data.assignedBrokerId : null,
            occurredAt: Date.now(),
            reason: "24h_inactivity",
        });
        return typeof data.agencyId === "string" ? data.agencyId : null;
    });
    return result;
}
exports.processLeadInactivityDispatch = (0, scheduler_1.onSchedule)("every 1 hours", async () => {
    const cutoff = Date.now() - INACTIVITY_WINDOW_MS;
    const snapshot = await db.collection("leads").where("status", "==", "assigned").where("lastContactTimestamp", "==", null).get();
    const reallocated = await Promise.all(snapshot.docs.filter((lead) => isStale(lead.data(), cutoff)).map(async (lead) => ({ lead, agencyId: await resetLead(lead, cutoff) })));
    const agencyIds = new Set(reallocated.filter((item) => item.agencyId).map((item) => item.agencyId));
    await Promise.all([...agencyIds].map(async (agencyId) => {
        const staff = await db.collection("users").where("agencyId", "==", agencyId).get();
        await Promise.all(staff.docs.filter((user) => ["ceo", "secretary", "secretariat"].includes(user.data().agencyRole) || user.data().role === "secretariat").map((user) => (0, push_1.sendPushToUser)(user.id, "Lead επιστράφηκε στο Pool", "Ένα lead επέστρεψε στο αδιάθετο pool μετά από 24 ώρες χωρίς επικοινωνία.", { type: "lead_inactivity_reallocated", agencyId })));
    }));
});
//# sourceMappingURL=leadInactivityDispatch.js.map