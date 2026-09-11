import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { sendPushToUser } from "../lib/push";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_WRITES = 450;
const OPERATIONS_PER_LEAD = 2;
const MAX_LEADS_PER_BATCH = Math.floor(MAX_BATCH_WRITES / OPERATIONS_PER_LEAD);

type ExpiredLead = {
  snapshot: QueryDocumentSnapshot<DocumentData>;
  agencyId: string;
  clientName: string;
  previousBrokerId: string | null;
  assignedAtMillis: number;
};

function timestampMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") {
      return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return 0;
}

function toExpiredLead(snapshot: QueryDocumentSnapshot<DocumentData>, cutoffMillis: number): ExpiredLead | null {
  const data = snapshot.data();
  const agencyId = typeof data.agencyId === "string" ? data.agencyId.trim() : "";
  const assignedAtMillis = timestampMillis(data.assignedAt);
  if (!agencyId || assignedAtMillis <= 0 || assignedAtMillis >= cutoffMillis) return null;

  return {
    snapshot,
    agencyId,
    clientName: typeof data.clientName === "string" && data.clientName.trim() ? data.clientName.trim() : "Άγνωστος",
    previousBrokerId: typeof data.assignedBrokerId === "string" && data.assignedBrokerId.trim() ? data.assignedBrokerId.trim() : null,
    assignedAtMillis,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export const reassignExpiredLeadsCron = onSchedule(
  { schedule: "every 1 hours", timeZone: "Europe/Athens", region: "europe-west1" },
  async () => {
    const cutoffMillis = Date.now() - INACTIVITY_WINDOW_MS;
    const cutoffTimestamp = Timestamp.fromMillis(cutoffMillis);
    const leadsSnapshot = await db
      .collectionGroup("leads")
      .where("status", "==", "assigned")
      .where("lastContactTimestamp", "==", null)
      .where("assignedAt", "<=", cutoffTimestamp)
      .get();

    const expiredLeads = leadsSnapshot.docs
      .map((snapshot) => toExpiredLead(snapshot, cutoffMillis))
      .filter((lead): lead is ExpiredLead => lead !== null);

    if (expiredLeads.length === 0) {
      logger.info("No expired leads found during scheduled check.");
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
          reassignedAt: FieldValue.serverTimestamp(),
          reassignmentReason: "automatic_inactivity_24h",
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(auditRef, {
          type: "lead_auto_reassigned",
          leadId: lead.snapshot.id,
          clientName: lead.clientName,
          previousBrokerId: lead.previousBrokerId,
          timestamp: FieldValue.serverTimestamp(),
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
      await Promise.all(recipients.map((recipient) => sendPushToUser(
        recipient.id,
        {
          type: "deal_stage_update",
          title: "Lead επέστρεψε στο Pool",
          body: `${agencyLeads.length} lead${agencyLeads.length === 1 ? "" : "s"} επέστρεψαν στο αδιάθετο pool μετά από 24 ώρες χωρίς επικοινωνία.`,
          screen: "broker",
          params: { agencyId },
          action: "lead_auto_reassigned",
        },
        "deals_pipeline",
      )));
    }));

    logger.info(`Successfully recycled ${expiredLeads.length} expired leads back to pool.`);
  },
);
