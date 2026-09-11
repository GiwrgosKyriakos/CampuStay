"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reassignExpiredLeadsCron = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const push_1 = require("../lib/push");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_WRITES = 450;
const OPERATIONS_PER_LEAD = 2;
const MAX_LEADS_PER_BATCH = Math.floor(MAX_BATCH_WRITES / OPERATIONS_PER_LEAD);
function timestampMillis(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string")
        return Date.parse(value) || 0;
    if (value && typeof value === "object") {
        const timestamp = value;
        if (typeof timestamp.toMillis === "function")
            return timestamp.toMillis();
        if (typeof timestamp.seconds === "number") {
            return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
        }
    }
    return 0;
}
function toExpiredLead(snapshot, cutoffMillis) {
    const data = snapshot.data();
    const agencyId = typeof data.agencyId === "string" ? data.agencyId.trim() : "";
    const assignedAtMillis = timestampMillis(data.assignedAt);
    if (!agencyId || assignedAtMillis <= 0 || assignedAtMillis >= cutoffMillis)
        return null;
    return {
        snapshot,
        agencyId,
        clientName: typeof data.clientName === "string" && data.clientName.trim() ? data.clientName.trim() : "Άγνωστος",
        previousBrokerId: typeof data.assignedBrokerId === "string" && data.assignedBrokerId.trim() ? data.assignedBrokerId.trim() : null,
        assignedAtMillis,
    };
}
function chunks(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
}
exports.reassignExpiredLeadsCron = (0, scheduler_1.onSchedule)({ schedule: "every 1 hours", timeZone: "Europe/Athens", region: "europe-west1" }, async () => {
    const cutoffMillis = Date.now() - INACTIVITY_WINDOW_MS;
    const cutoffTimestamp = firestore_1.Timestamp.fromMillis(cutoffMillis);
    const leadsSnapshot = await db
        .collectionGroup("leads")
        .where("status", "==", "assigned")
        .where("lastContactTimestamp", "==", null)
        .where("assignedAt", "<=", cutoffTimestamp)
        .get();
    const expiredLeads = leadsSnapshot.docs
        .map((snapshot) => toExpiredLead(snapshot, cutoffMillis))
        .filter((lead) => lead !== null);
    if (expiredLeads.length === 0) {
        firebase_functions_1.logger.info("No expired leads found during scheduled check.");
        return;
    }
    for (const leadChunk of chunks(expiredLeads, MAX_LEADS_PER_BATCH)) {
        const batch = db.batch();
        for (const lead of leadChunk) {
            const leadData = lead.snapshot.data();
            const auditId = `lead_${lead.snapshot.id}_inactivity_${lead.assignedAtMillis}`;
            const auditRef = db.collection("agencies").doc(lead.agencyId).collection("auditLogs").doc(auditId);
            batch.update(lead.snapshot.ref, {
                status: "unassigned_pool",
                assignedBrokerId: null,
                previousBrokerId: lead.previousBrokerId,
                assignedAt: null,
                reassignedAt: firestore_1.FieldValue.serverTimestamp(),
                reassignmentReason: "automatic_inactivity_24h",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            batch.set(auditRef, {
                type: "lead_auto_reassigned",
                leadId: lead.snapshot.id,
                clientName: lead.clientName,
                previousBrokerId: lead.previousBrokerId,
                timestamp: firestore_1.FieldValue.serverTimestamp(),
                details: "Αυτόματη ανάκληση lead στο pool λόγω αδράνειας 24 ωρών.",
                source: "reassignExpiredLeadsCron",
                assignedAtMillis: lead.assignedAtMillis,
                ...(typeof leadData.apartmentId === "string" ? { apartmentId: leadData.apartmentId } : {}),
            });
        }
        await batch.commit();
    }
    const agencyIds = [...new Set(expiredLeads.map((lead) => lead.agencyId))];
    await Promise.all(agencyIds.map(async (agencyId) => {
        const staffSnapshot = await db.collection("users").where("agencyId", "==", agencyId).get();
        const recipients = staffSnapshot.docs.filter((user) => {
            const data = user.data();
            const role = typeof data.agencyRole === "string" ? data.agencyRole : typeof data.role === "string" ? data.role : "";
            return ["ceo", "secretary", "secretariat"].includes(role);
        });
        const agencyLeads = expiredLeads.filter((lead) => lead.agencyId === agencyId);
        const leadIds = agencyLeads.map((lead) => lead.snapshot.id).sort();
        await Promise.all(recipients.map((recipient) => (0, push_1.sendPushToUser)(recipient.id, {
            type: "deal_stage_update",
            title: "Lead επέστρεψε στο Pool",
            body: `${agencyLeads.length} lead${agencyLeads.length === 1 ? "" : "s"} επέστρεψαν στο αδιάθετο pool μετά από 24 ώρες χωρίς επικοινωνία.`,
            screen: "broker",
            params: { agencyId, leadIds },
            entityId: `lead-auto-reassigned:${agencyId}:${leadIds.join(",")}`,
            action: "lead_auto_reassigned",
        }, "deals_pipeline", {
            dedupeKey: `lead-auto-reassigned:${agencyId}:${leadIds.join(",")}`,
            recurringKey: `lead-auto-reassigned:${agencyId}:${leadIds.join(",")}:${recipient.id}`,
        })));
    }));
    firebase_functions_1.logger.info(`Successfully recycled ${expiredLeads.length} expired leads back to pool.`);
});
//# sourceMappingURL=reassignExpiredLeads.js.map