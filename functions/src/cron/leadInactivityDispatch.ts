import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

function isStale(data: DocumentData, cutoff: number): boolean {
  if (data.status !== "assigned" || data.lastContactTimestamp != null) return false;
  const assignedAt = data.assignedAt;
  if (assignedAt && typeof assignedAt.toMillis === "function") return assignedAt.toMillis() < cutoff;
  if (typeof assignedAt === "number") return assignedAt < cutoff;
  if (typeof assignedAt === "string") return Date.parse(assignedAt) < cutoff;
  return false;
}

type ReallocatedLead = {
  agencyId: string;
  brokerId: string;
  leadId: string;
  leadName: string;
};

async function resetLead(snapshot: QueryDocumentSnapshot<DocumentData>, cutoff: number): Promise<ReallocatedLead | null> {
  const leadRef = snapshot.ref;
  const result = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(leadRef);
    if (!currentSnapshot.exists) return null;
    const data = currentSnapshot.data() ?? {};
    if (!isStale(data, cutoff)) return null;
    const agencyId = typeof data.agencyId === "string" ? data.agencyId.trim() : "";
    const brokerId = typeof data.assignedBrokerId === "string" ? data.assignedBrokerId.trim() : "";
    if (!agencyId || !brokerId) return null;
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
    return {
      agencyId,
      brokerId,
      leadId: snapshot.id,
      leadName: typeof data.leadName === "string" && data.leadName.trim()
        ? data.leadName.trim()
        : typeof data.clientName === "string" && data.clientName.trim()
          ? data.clientName.trim()
          : "Χωρίς όνομα",
    };
  });
  return result;
}

export const processLeadInactivityDispatch = onSchedule("every 1 hours", async () => {
  const cutoff = Date.now() - INACTIVITY_WINDOW_MS;
  const snapshot = await db.collection("leads").where("status", "==", "assigned").where("lastContactTimestamp", "==", null).get();
  const reallocated = await Promise.all(snapshot.docs.filter((lead) => isStale(lead.data(), cutoff)).map(async (lead) => ({ lead, agencyId: await resetLead(lead, cutoff) })));
  await Promise.all(reallocated.filter((item): item is { lead: QueryDocumentSnapshot<DocumentData>; agencyId: ReallocatedLead } => item.agencyId !== null).map(({ agencyId }) => sendPushToUser(agencyId.brokerId, {
    type: "deal_stage_update",
    title: "Το lead επανήλθε στην κοινή δεξαμενή",
    body: `Το lead ${agencyId.leadName} επανήλθε στην κοινή δεξαμενή λόγω αδράνειας 24 ωρών`,
    screen: "broker",
    params: { agencyId: agencyId.agencyId, leadId: agencyId.leadId },
    entityId: agencyId.leadId,
    action: "lead_inactivity_reallocated",
  }, "deals_pipeline")));
  const agencyIds = new Set(reallocated.filter((item) => item.agencyId).map((item) => (item.agencyId as ReallocatedLead).agencyId));
  await Promise.all([...agencyIds].map(async (agencyId) => {
    const staff = await db.collection("users").where("agencyId", "==", agencyId).get();
    await Promise.all(staff.docs.filter((user) => ["ceo", "secretary", "secretariat"].includes(user.data().agencyRole) || user.data().role === "secretariat").map((user) => sendPushToUser(user.id, { type: "deal_stage_update", title: "Lead επιστράφηκε στο Pool", body: "Ένα lead επέστρεψε στο αδιάθετο pool μετά από 24 ώρες χωρίς επικοινωνία.", screen: "broker", params: { agencyId }, action: "lead_inactivity_reallocated" })));
  }));
});