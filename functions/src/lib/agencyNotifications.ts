import { getFirestore, type DocumentData } from "firebase-admin/firestore";

import { sendPushToUser, type UnifiedNotificationPayload } from "./push";

const db = getFirestore();
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat", "owner", "sec", "admin"]);
const BROKER_ROLES = new Set(["broker", "agent"]);

type AgencyNotificationKind = "pool" | "requested" | "approved";
type SupportedLocale = "el" | "en";

interface AgencyUserData extends DocumentData {
  agencyId?: unknown;
  agencyRole?: unknown;
  role?: unknown;
  agencyStatus?: unknown;
  status?: unknown;
  is_broker?: unknown;
  name?: unknown;
  locale?: unknown;
  language?: unknown;
  preferredLanguage?: unknown;
}

interface AgencyRecipient {
  id: string;
  data: AgencyUserData;
}

interface AgencyNotificationContext {
  agencyId: string;
  apartmentId: string;
  title: string;
  brokerName?: string;
  requestId?: string;
  approvedByUserId?: string;
  dedupeKey: string;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function roleOf(data: AgencyUserData): string {
  return stringValue(data.agencyRole || data.role).toLocaleLowerCase();
}

function isActive(data: AgencyUserData): boolean {
  const status = stringValue(data.agencyStatus || data.status).toLocaleLowerCase();
  return status.length === 0 || status === "approved" || status === "active";
}

function localeOf(data: AgencyUserData): SupportedLocale {
  const locale = stringValue(data.locale || data.language || data.preferredLanguage).toLocaleLowerCase();
  return locale.startsWith("en") ? "en" : "el";
}

function isAgencyBroker(data: AgencyUserData): boolean {
  return isActive(data) && (data.is_broker === true || BROKER_ROLES.has(roleOf(data)));
}

function isAgencyExecutive(data: AgencyUserData): boolean {
  return isActive(data) && EXECUTIVE_ROLES.has(roleOf(data));
}

async function getAgencyRecipients(agencyId: string, predicate: (data: AgencyUserData) => boolean): Promise<AgencyRecipient[]> {
  if (!agencyId.trim()) return [];
  const snapshot = await db.collection("users").where("agencyId", "==", agencyId).get();
  return snapshot.docs
    .map((user) => ({ id: user.id, data: user.data() as AgencyUserData }))
    .filter((user) => predicate(user.data));
}

function notificationCopy(kind: AgencyNotificationKind, locale: SupportedLocale, title: string, brokerName?: string): { title: string; body: string } {
  if (kind === "pool") {
    return locale === "en"
      ? { title: "New Pool Listing", body: `Listing "${title}" is available for assignment in your agency pool.` }
      : { title: "Νέο ακίνητο στο Pool", body: `Το ακίνητο «${title}» είναι διαθέσιμο για ανάθεση στο γραφείο σας.` };
  }
  if (kind === "requested") {
    return locale === "en"
      ? { title: "Assignment Requested", body: `${brokerName || "A broker"} requested assignment for listing "${title}".` }
      : { title: "Αίτημα ανάθεσης ακινήτου", body: `${brokerName || "Ο/Η μεσίτης"} ζήτησε την ανάθεση του ακινήτου «${title}».` };
  }
  return locale === "en"
    ? { title: "Assignment Approved", body: `Your request for listing "${title}" has been approved.` }
    : { title: "Έγκριση ανάθεσης", body: `Το αίτημά σας για την ανάθεση του ακινήτου «${title}» εγκρίθηκε.` };
}

function buildPayload(kind: AgencyNotificationKind, recipient: AgencyRecipient, context: AgencyNotificationContext): UnifiedNotificationPayload {
  const copy = notificationCopy(kind, localeOf(recipient.data), context.title, context.brokerName);
  const type = kind === "pool"
    ? "agency_pool_new_item"
    : kind === "requested"
      ? "agency_assignment_requested"
      : "agency_assignment_approved";
  const screen = kind === "pool" ? "apartments" : kind === "requested" ? "agency-management" : "apartment-detail";
  const params: Record<string, unknown> = kind === "pool"
    ? { agencyId: context.agencyId, apartmentId: context.apartmentId, targetScreen: "apartments", filter: "pool" }
    : kind === "requested"
      ? { agencyId: context.agencyId, apartmentId: context.apartmentId, requestId: context.requestId ?? "", targetScreen: "agency-management" }
      : { agencyId: context.agencyId, apartmentId: context.apartmentId, id: context.apartmentId, targetScreen: "apartment-detail", assignmentApproved: true, ...(context.approvedByUserId ? { approvedByUserId: context.approvedByUserId } : {}) };

  return {
    type,
    title: copy.title,
    body: copy.body,
    screen,
    params,
    metadata: params,
    entityId: context.apartmentId,
    action: kind === "pool" ? "open_pool" : kind === "requested" ? "review_assignment" : "open_assignment",
  };
}

async function notifyRecipients(kind: AgencyNotificationKind, recipients: AgencyRecipient[], context: AgencyNotificationContext): Promise<void> {
  await Promise.all(recipients.map((recipient) => sendPushToUser(
    recipient.id,
    buildPayload(kind, recipient, context),
    "deals_pipeline",
    { dedupeKey: `${context.dedupeKey}:${recipient.id}` },
  )));
}

export async function notifyAgencyPoolBrokers(context: Omit<AgencyNotificationContext, "brokerName" | "requestId">): Promise<void> {
  const recipients = await getAgencyRecipients(context.agencyId, isAgencyBroker);
  await notifyRecipients("pool", recipients, context);
}

export async function notifyAgencyAssignmentRequested(context: AgencyNotificationContext): Promise<void> {
  const recipients = await getAgencyRecipients(context.agencyId, isAgencyExecutive);
  await notifyRecipients("requested", recipients, context);
}

export async function notifyAgencyAssignmentApproved(brokerId: string, context: AgencyNotificationContext): Promise<void> {
  const brokerSnapshot = await db.doc(`users/${brokerId}`).get();
  if (!brokerSnapshot.exists) return;
  await notifyRecipients("approved", [{ id: brokerSnapshot.id, data: brokerSnapshot.data() as AgencyUserData }], context);
}

export function agencyNotificationTitle(data: DocumentData, fallback = "Ακίνητο"): string {
  return stringValue(data.title || data.apartmentTitle || data.clientName, fallback);
}

export function agencyNotificationBrokerName(data: DocumentData, fallback = "Μεσίτης"): string {
  return stringValue(data.name || data.brokerName, fallback);
}
