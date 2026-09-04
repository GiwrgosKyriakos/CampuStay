import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { logAnalyticsEvent } from "@/src/api/analyticsEvents";
import type { BrokerCommissionSplit, Deal } from "@/src/types/deal";
import type { CommissionSettlementInvoice } from "@/src/types/commission";
import type { KeySafeLogEntry, OpenHouseConfig } from "@/src/types/apartment";
import type { StandardLeadSource } from "@/src/types/analytics";

export interface AgencyStaffMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  agencyId: string;
  agencyRole?: string;
  agencyStatus?: string;
  isBroker: boolean;
}

export interface AgencyClaimRecord {
  id: string;
  agencyId: string;
  apartmentId: string;
  apartmentTitle: string;
  brokerId: string;
  brokerName: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: unknown;
  resolvedAt?: unknown;
}

export interface AgencyLead {
  id: string;
  agencyId: string;
  apartmentId?: string;
  clientId?: string;
  clientName: string;
  phone?: string;
  email?: string;
  budget?: number;
  status: "unassigned_pool" | "assigned" | "closed";
  assignedBrokerId?: string;
  assignedAt?: unknown;
  lastContactTimestamp?: unknown;
  source?: StandardLeadSource;
  registeredByBrokerId?: string;
  chatRoomId?: string;
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileAvatar(data: Record<string, unknown>): string {
  if (typeof data.photoUrl === "string" && data.photoUrl.trim()) return data.photoUrl.trim();
  if (typeof data.avatar === "string" && data.avatar.trim()) return data.avatar.trim();
  return Array.isArray(data.photos) ? String(data.photos.find((photo) => typeof photo === "string" && photo.trim()) ?? "") : "";
}

async function getUserAgencyData(userId: string): Promise<Record<string, unknown> | null> {
  if (!userId.trim()) return null;
  const snapshot = await getDoc(doc(db, "users", userId));
  return snapshot.exists() ? snapshot.data() as Record<string, unknown> : null;
}

export async function getAgencyStaff(agencyId: string, includePending = false): Promise<AgencyStaffMember[]> {
  if (!agencyId.trim()) return [];
  const snapshot = await getDocs(query(collection(db, "users"), where("agencyId", "==", agencyId)));
  return snapshot.docs.flatMap((userSnapshot) => {
    const data = userSnapshot.data() as Record<string, unknown>;
    const status = requiredString(data.agencyStatus);
    if (!includePending && status !== "approved") return [];
    const agencyRole = requiredString(data.agencyRole) || requiredString(data.role);
    const isBroker = data.is_broker === true || ["broker", "ceo", "secretary", "secretariat"].includes(agencyRole);
    if (!isBroker) return [];
    return [{
      id: userSnapshot.id,
      name: requiredString(data.name) || "Συνεργάτης",
      ...(requiredString(data.email) ? { email: requiredString(data.email) } : {}),
      ...(profileAvatar(data) ? { avatar: profileAvatar(data) } : {}),
      agencyId,
      ...(agencyRole ? { agencyRole } : {}),
      ...(status ? { agencyStatus: status } : {}),
      isBroker: data.is_broker === true,
    } satisfies AgencyStaffMember];
  });
}

export async function getAgencyCoAssignedStaff(agencyId: string, currentUserId: string, apartmentIds: string[]): Promise<AgencyStaffMember[]> {
  const scopedApartmentIds = Array.from(new Set(apartmentIds.filter((apartmentId) => apartmentId.trim())));
  if (!agencyId.trim() || !currentUserId.trim() || scopedApartmentIds.length === 0) return [];
  const snapshots = await Promise.all(scopedApartmentIds.map((apartmentId) => getDoc(doc(db, "apartments", apartmentId))));
  const coAssignedIds = new Set<string>();
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data() as Record<string, unknown>;
    if (data.agencyId !== agencyId) return;
    const assignedBrokerIds = Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds : [];
    assignedBrokerIds.forEach((brokerId) => {
      if (typeof brokerId === "string" && brokerId !== currentUserId) coAssignedIds.add(brokerId);
    });
  });
  if (coAssignedIds.size === 0) return [];
  const staff = await getAgencyStaff(agencyId);
  return staff.filter((member) => coAssignedIds.has(member.id));
}

export async function publishListingAssignment(params: {
  apartmentId: string;
  brokerId: string;
  mode: "direct" | "pool";
}): Promise<void> {
  const callable = httpsCallable<{ apartmentId: string; mode: "direct" | "pool" }, { apartmentId: string; mode: "direct" | "pool" }>(firebaseFunctions, "publishListingAssignmentCallable");
  await callable({ apartmentId: params.apartmentId, mode: params.mode });
}

export async function claimApartmentFromPool(params: { apartmentId: string; brokerId: string }): Promise<string> {
  const callable = httpsCallable<{ apartmentId: string }, { claimId: string }>(firebaseFunctions, "claimPropertyCallable");
  const result = await callable({ apartmentId: params.apartmentId });
  return result.data.claimId;
}

export async function getAgencyClaimRecords(agencyId: string): Promise<AgencyClaimRecord[]> {
  if (!agencyId) return [];
  const snapshot = await getDocs(query(collection(db, "agency_claims"), where("agencyId", "==", agencyId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AgencyClaimRecord, "id">) })).sort((a, b) => Number((b.createdAt as { seconds?: number })?.seconds ?? 0) - Number((a.createdAt as { seconds?: number })?.seconds ?? 0));
}

export function subscribeAgencyClaimRecords(agencyId: string, onChange: (claims: AgencyClaimRecord[]) => void): () => void {
  if (!agencyId) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(query(collection(db, "agency_claims"), where("agencyId", "==", agencyId)), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AgencyClaimRecord, "id">) })).sort((a, b) => Number((b.createdAt as { seconds?: number })?.seconds ?? 0) - Number((a.createdAt as { seconds?: number })?.seconds ?? 0)));
  }, () => onChange([]));
}

export async function resolveApartmentClaim(params: { claimId: string; reviewerId: string; approved: boolean }): Promise<void> {
  const callable = httpsCallable<{ claimId: string; approved: boolean }, { status: string }>(firebaseFunctions, "reviewClaimCallable");
  await callable({ claimId: params.claimId, approved: params.approved });
}

export async function getAgencyPoolApartments(agencyId: string, brokerId: string): Promise<(Record<string, unknown> & { id: string })[]> {
  if (!agencyId || !brokerId) return [];
  const snapshot = await getDocs(query(collection(db, "apartments"), where("agencyId", "==", agencyId)));
  return snapshot.docs.flatMap((item) => {
    const data = item.data() as Record<string, unknown>;
    const status = requiredString(data.assignmentStatus);
    const pendingForCurrentBroker = requiredString(data.pendingClaimBrokerId) === brokerId;
    if (status !== "unassigned_pool" && status !== "claim_pending") return [];
    return [{ id: item.id, ...data, pendingForCurrentBroker }];
  });
}

export async function checkoutKeySafe(params: { apartmentId: string; brokerId: string; brokerName: string; notes?: string }): Promise<KeySafeLogEntry> {
  const callable = httpsCallable<{ apartmentId: string; action: "checkout"; notes?: string }, { entry: KeySafeLogEntry }>(firebaseFunctions, "recordKeySafeActionCallable");
  const result = await callable({ apartmentId: params.apartmentId, action: "checkout", ...(params.notes ? { notes: params.notes } : {}) });
  return result.data.entry;
}

export async function returnKeySafe(params: { apartmentId: string; brokerId: string }): Promise<void> {
  const callable = httpsCallable<{ apartmentId: string; action: "checkin" }, { status: string }>(firebaseFunctions, "recordKeySafeActionCallable");
  await callable({ apartmentId: params.apartmentId, action: "checkin" });
}

export async function delegateShowing(params: { appointmentId: string; coveringBrokerId: string }): Promise<void> {
  const callable = httpsCallable<{ appointmentId: string; coveringBrokerId: string }, { appointmentId: string; coveringBrokerId: string }>(firebaseFunctions, "delegateShowingCallable");
  await callable(params);
}

export function calculateCommissionSplits(params: { totalCommission: number; agencyCutPercentage: number; listingPercentage: number; buyerPercentage: number; listingBroker: { id: string; name: string }; buyerBroker: { id: string; name: string }; coveringBroker?: { id: string; name: string; percentage: number } }): { agencyAmount: number; brokerSplits: BrokerCommissionSplit[] } {
  const totalCommission = Number(params.totalCommission);
  const agencyCutPercentage = Number(params.agencyCutPercentage);
  const listingPercentage = Number(params.listingPercentage);
  const buyerPercentage = Number(params.buyerPercentage);
  const coveringPercentage = params.coveringBroker ? Number(params.coveringBroker.percentage) : 0;
  const percentages = [agencyCutPercentage, listingPercentage, buyerPercentage, coveringPercentage];
  if (!Number.isFinite(totalCommission) || totalCommission < 0 || percentages.some((percentage) => !Number.isFinite(percentage) || percentage < 0 || percentage > 100) || Math.round(percentages.reduce((sum, percentage) => sum + percentage, 0) * 100) !== 10000) {
    throw new Error("Τα ποσοστά εκκαθάρισης πρέπει να είναι έγκυρα και να αθροίζουν ακριβώς 100%.");
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const splits: BrokerCommissionSplit[] = [
    { brokerId: params.listingBroker.id, brokerName: params.listingBroker.name, role: "listing_agent", percentage: listingPercentage, amount: round(totalCommission * listingPercentage / 100) },
    { brokerId: params.buyerBroker.id, brokerName: params.buyerBroker.name, role: "buyer_agent", percentage: buyerPercentage, amount: round(totalCommission * buyerPercentage / 100) },
  ];
  if (params.coveringBroker) splits.push({ brokerId: params.coveringBroker.id, brokerName: params.coveringBroker.name, role: "covering_agent", percentage: coveringPercentage, amount: round(totalCommission * coveringPercentage / 100) });
  return { agencyAmount: round(totalCommission * agencyCutPercentage / 100), brokerSplits: splits };
}

export async function getAgencyClosedDeals(agencyId: string): Promise<Deal[]> {
  if (!agencyId) return [];
  const snapshot = await getDocs(query(collection(db, "deals"), where("agencyId", "==", agencyId), where("status", "==", "closed")));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Deal, "id">) }));
}

export function subscribeAgencyClosedDeals(agencyId: string, onChange: (deals: Deal[]) => void): () => void {
  if (!agencyId.trim()) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(query(collection(db, "deals"), where("agencyId", "==", agencyId), where("status", "==", "closed")), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Deal, "id">) })));
  }, () => onChange([]));
}

export async function issueCommissionSettlement(params: { agencyId: string; deal: Deal; apartmentTitle?: string; invoiceNumber?: string; agencyShare: number; agencyCutPercentage?: number; brokerSplits: BrokerCommissionSplit[] }): Promise<CommissionSettlementInvoice> {
  const callable = httpsCallable<Record<string, unknown>, { status: string; dealId: string }>(firebaseFunctions, "finalizeCommissionSettlementCallable");
  const settlementArguments = { dealId: params.deal.id, officePercentage: params.agencyCutPercentage ?? params.deal.agencyCutPercentage, listingBrokerPercentage: params.brokerSplits.find((split) => split.role === "listing_agent")?.percentage ?? 0, sellingBrokerPercentage: params.brokerSplits.find((split) => split.role === "buyer_agent")?.percentage ?? 0, ...(params.brokerSplits.find((split) => split.role === "covering_agent") ? { coveringBrokerPercentage: params.brokerSplits.find((split) => split.role === "covering_agent")?.percentage ?? 0 } : {}) };
  const currentStatus = params.deal.settlementStatus ?? "pending_review";
  if (currentStatus === "pending_review") await callable({ action: "approve", ...settlementArguments });
  const invoiceNumber = params.invoiceNumber?.trim() || `INV-${Date.now()}`;
  if (currentStatus === "pending_review" || currentStatus === "approved") await callable({ action: "issue", ...settlementArguments, invoiceNumber });
  if (currentStatus !== "settled" && currentStatus !== "issued") await callable({ action: "settle", ...settlementArguments });
  if (currentStatus === "issued") await callable({ action: "settle", ...settlementArguments });
  return { id: params.deal.id, dealId: params.deal.id, apartmentId: params.deal.apartmentId, apartmentTitle: params.apartmentTitle?.trim() || params.deal.apartmentTitle || "Ακίνητο", totalDealAmount: params.deal.dealAmount ?? params.deal.commissionTotal, totalCommission: params.deal.commissionTotal, agencyShare: params.agencyShare, brokerSplits: params.brokerSplits, invoiceNumber, invoiceStatus: "settled", issuedAt: Date.now(), settledAt: Date.now(), createdAt: Date.now() };
}

export async function createOrGetColleagueChat(params: { currentUserId: string; colleagueId: string }): Promise<string> {
  const [currentUser, colleague] = await Promise.all([getUserAgencyData(params.currentUserId), getUserAgencyData(params.colleagueId)]);
  const agencyId = requiredString(currentUser?.agencyId);
  if (!agencyId || agencyId !== requiredString(colleague?.agencyId)) throw new Error("Οι χρήστες δεν ανήκουν στο ίδιο γραφείο.");
  const chatId = `colleague_${[params.currentUserId, params.colleagueId].sort().join("_")}`;
  await setDoc(doc(db, "chats", chatId), { users: [params.currentUserId, params.colleagueId], type: "colleague", colleagueChat: true, agencyId, status: "active", lastMessage: "", lastMessageText: "", lastMessageTimestamp: serverTimestamp(), updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  return chatId;
}

export async function getSharedCoManagedListings(agencyId: string, brokerIds: string[]): Promise<(Record<string, unknown> & { id: string })[]> {
  if (!agencyId || brokerIds.length < 2) return [];
  const snapshot = await getDocs(query(collection(db, "apartments"), where("agencyId", "==", agencyId)));
  return snapshot.docs.flatMap((item) => {
    const data = item.data() as Record<string, unknown>;
    const assigned = Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((id): id is string => typeof id === "string") : [];
    return brokerIds.every((id) => assigned.includes(id)) ? [{ id: item.id, ...data }] : [];
  });
}

export async function claimAgencyLead(params: { leadId: string; brokerId: string }): Promise<void> {
  const callable = httpsCallable<{ leadId: string }, { leadId: string; assignedBrokerId: string }>(firebaseFunctions, "claimLeadCallable");
  await callable({ leadId: params.leadId });
}

export async function getAgencyLeads(agencyId: string): Promise<AgencyLead[]> {
  if (!agencyId) return [];
  const snapshot = await getDocs(query(collection(db, "leads"), where("agencyId", "==", agencyId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AgencyLead, "id">) }));
}

export function subscribeAgencyLeads(agencyId: string, onChange: (leads: AgencyLead[]) => void): () => void {
  if (!agencyId) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(query(collection(db, "leads"), where("agencyId", "==", agencyId)), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AgencyLead, "id">) })));
  }, () => onChange([]));
}

export async function registerOpenHouseLead(params: { agencyId: string; apartmentId: string; apartmentTitle?: string; clientName: string; phone?: string; email?: string; budget?: number; source?: StandardLeadSource; registeredByBrokerId: string }): Promise<string> {
  const source = params.source ?? "other";
  const leadRef = await addDoc(collection(db, "leads"), { agencyId: params.agencyId, apartmentId: params.apartmentId, apartmentTitle: params.apartmentTitle || "Ακίνητο", clientName: params.clientName.trim(), phone: params.phone?.trim() || null, email: params.email?.trim() || null, budget: params.budget, source, registeredByBrokerId: params.registeredByBrokerId, status: "assigned", assignedBrokerId: params.registeredByBrokerId, assignedAt: serverTimestamp(), lastContactTimestamp: null, createdAt: serverTimestamp() });
  await logAnalyticsEvent({ agencyId: params.agencyId, eventType: "lead_inquiry", timestamp: Date.now(), listingId: params.apartmentId, leadId: leadRef.id, brokerId: params.registeredByBrokerId, source });
  return leadRef.id;
}

export async function updateOpenHouseConfig(apartmentId: string, config: OpenHouseConfig): Promise<void> {
  await updateDoc(doc(db, "apartments", apartmentId), { openHouseConfig: config, updatedAt: serverTimestamp() });
}

export async function createCrossBrokerShowing(params: {
  agencyId: string;
  apartmentId: string;
  apartmentTitle: string;
  apartmentAddress: string;
  listingBrokerId: string;
  buyerBrokerId: string;
  clientId: string;
  clientName: string;
  appointmentDate: string;
  apartmentPrice?: number;
}): Promise<string> {
  const callable = httpsCallable<typeof params, { appointmentId: string }>(firebaseFunctions, "createCrossBrokerShowingCallable");
  const result = await callable(params);
  return result.data.appointmentId;
}

export async function reassignAgencyLead(params: { leadId: string; reviewerId: string; targetBrokerId: string }): Promise<void> {
  const callable = httpsCallable<{ leadId: string; targetBrokerId: string }, { leadId: string; targetBrokerId: string }>(firebaseFunctions, "reassignLeadCallable");
  await callable({ leadId: params.leadId, targetBrokerId: params.targetBrokerId });
}

export function subscribeAgencyPoolApartments(agencyId: string, brokerId: string, onChange: (apartments: (Record<string, unknown> & { id: string })[]) => void): () => void {
  if (!agencyId || !brokerId) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(query(collection(db, "apartments"), where("agencyId", "==", agencyId)), (snapshot) => {
    const apartments = snapshot.docs.flatMap((item) => {
      const data = item.data() as Record<string, unknown>;
      const status = requiredString(data.assignmentStatus);
      const pendingBrokerId = requiredString(data.pendingClaimBrokerId);
      if (status !== "unassigned_pool" && status !== "claim_pending") return [];
      if (status === "claim_pending" && !pendingBrokerId) return [];
      return [{ id: item.id, ...data }];
    });
    onChange(apartments);
  }, () => onChange([]));
}