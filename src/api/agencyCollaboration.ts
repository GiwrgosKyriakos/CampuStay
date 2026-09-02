import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import {
  getBrokerClientProfileId,
  syncBrokerClientProfile,
  upsertBrokerClientProfile,
} from "@/src/api/brokerClientProfiles";
import type { BrokerCommissionSplit, Deal } from "@/src/types/deal";
import type { CommissionSettlementInvoice } from "@/src/types/commission";
import type { KeySafeLogEntry, OpenHouseConfig } from "@/src/types/apartment";
import { createVisitAppointment } from "@/src/api/visitAppointments";
import { saveBrokerNote } from "@/src/api/brokerCalendar";
import { sendPushNotification } from "@/src/utils/notificationService";

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
  source?: string;
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

async function getAgencyIdForUser(userId: string): Promise<string> {
  const data = await getUserAgencyData(userId);
  return requiredString(data?.agencyId);
}

async function addOwnerToBrokerClients(brokerId: string, apartmentId: string, apartmentData: Record<string, unknown>): Promise<void> {
  const ownerId = requiredString(apartmentData.ownerId) || requiredString(apartmentData.hostId);
  if (!ownerId || ownerId === brokerId) return;
  await syncBrokerClientProfile({
    brokerId,
    clientId: ownerId,
    role: "owner",
    apartmentId,
    apartmentTitle: requiredString(apartmentData.title) || "Ακίνητο",
    rent: typeof apartmentData.rent === "number" ? apartmentData.rent : typeof apartmentData.price === "number" ? apartmentData.price : 0,
    ownerId,
  });
}

async function removeOwnerFromBrokerClients(brokerId: string, apartmentId: string, ownerId: string): Promise<void> {
  if (!brokerId || !ownerId || brokerId === ownerId) return;
  const profileRef = doc(db, "brokerClientProfiles", getBrokerClientProfileId(brokerId, ownerId));
  const profileSnapshot = await getDoc(profileRef);
  if (!profileSnapshot.exists()) return;
  const profileData = profileSnapshot.data() as { apartmentIds?: string[] };
  const remainingApartmentIds = (Array.isArray(profileData.apartmentIds) ? profileData.apartmentIds : []).filter((id) => id !== apartmentId);
  if (remainingApartmentIds.length > 0) {
    await updateDoc(profileRef, { apartmentIds: remainingApartmentIds, updatedAt: serverTimestamp() });
    await deleteDoc(doc(profileRef, "deals", apartmentId)).catch(() => undefined);
    return;
  }
  await deleteDoc(profileRef);
}

export async function publishListingAssignment(params: {
  apartmentId: string;
  brokerId: string;
  mode: "direct" | "pool";
}): Promise<void> {
  const apartmentRef = doc(db, "apartments", params.apartmentId);
  const snapshot = await getDoc(apartmentRef);
  if (!snapshot.exists()) throw new Error("Το ακίνητο δεν βρέθηκε.");
  const data = snapshot.data() as Record<string, unknown>;
  const agencyId = await getAgencyIdForUser(params.brokerId);
  if (!agencyId || requiredString(data.agencyId) !== agencyId) throw new Error("Το ακίνητο δεν ανήκει στο γραφείο σας.");
  const assignedBrokerIds = params.mode === "direct" ? [params.brokerId] : [];
  await updateDoc(apartmentRef, {
    assignedBrokerIds,
    assignmentStatus: params.mode === "direct" ? "assigned" : "unassigned_pool",
    pendingClaimBrokerId: deleteField(),
    rejectedBrokerIds: params.mode === "direct" ? [] : (Array.isArray(data.rejectedBrokerIds) ? data.rejectedBrokerIds : []),
    updatedAt: serverTimestamp(),
  });
  if (params.mode === "direct") await addOwnerToBrokerClients(params.brokerId, params.apartmentId, data);
}

export async function claimApartmentFromPool(params: { apartmentId: string; brokerId: string }): Promise<string> {
  const agencyId = await getAgencyIdForUser(params.brokerId);
  if (!agencyId) throw new Error("Ο λογαριασμός δεν ανήκει σε agency.");
  const apartmentRef = doc(db, "apartments", params.apartmentId);
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) throw new Error("Το ακίνητο δεν βρέθηκε.");
    const data = snapshot.data() as Record<string, unknown>;
    if (requiredString(data.agencyId) !== agencyId) throw new Error("Το ακίνητο δεν ανήκει στο γραφείο σας.");
    const assignmentStatus = requiredString(data.assignmentStatus);
    if (assignmentStatus !== "unassigned_pool" && assignmentStatus !== "claim_pending") throw new Error("Το ακίνητο δεν είναι διαθέσιμο προς ανάθεση.");
    const rejectedBrokerIds = Array.isArray(data.rejectedBrokerIds) ? data.rejectedBrokerIds.filter((id): id is string => typeof id === "string") : [];
    if (rejectedBrokerIds.includes(params.brokerId)) throw new Error("Το ακίνητο δεν είναι διαθέσιμο προς ανάθεση.");
    const pendingBrokerId = requiredString(data.pendingClaimBrokerId);
    if (pendingBrokerId && pendingBrokerId !== params.brokerId) throw new Error("Το αίτημα ανάθεσης βρίσκεται σε διαπραγμάτευση.");
    const assignedBrokerIds = Array.from(new Set([
      ...(Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((id): id is string => typeof id === "string") : []),
      params.brokerId,
    ]));
    transaction.update(apartmentRef, {
      assignedBrokerIds,
      assignmentStatus: "claim_pending",
      pendingClaimBrokerId: params.brokerId,
      updatedAt: serverTimestamp(),
    });
    return { data, title: requiredString(data.title) || "Ακίνητο" };
  });

  const brokerName = requiredString((await getUserAgencyData(params.brokerId))?.name) || "Μεσίτης";
  const claimRef = await addDoc(collection(db, "agency_claims"), {
    agencyId,
    apartmentId: params.apartmentId,
    apartmentTitle: result.title,
    brokerId: params.brokerId,
    brokerName,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await addOwnerToBrokerClients(params.brokerId, params.apartmentId, result.data);
  const staff = await getAgencyStaff(agencyId);
  await Promise.all(staff.filter((member) => member.id !== params.brokerId && ["ceo", "secretary", "secretariat"].includes(member.agencyRole || "")).map((member) => addDoc(collection(db, "users", member.id, "notifications"), {
    type: "agency_claim_pending",
    title: "Νέο αίτημα ανάθεσης",
    body: `Ο/Η ${brokerName} ζήτησε το ακίνητο «${result.title}».`,
    createdAt: serverTimestamp(),
    isRead: false,
    data: { claimId: claimRef.id, apartmentId: params.apartmentId },
  })));
  return claimRef.id;
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
  const reviewer = await getUserAgencyData(params.reviewerId);
  const agencyId = requiredString(reviewer?.agencyId);
  const reviewerRole = requiredString(reviewer?.agencyRole) || requiredString(reviewer?.role);
  if (!agencyId || !["ceo", "secretary", "secretariat"].includes(reviewerRole)) throw new Error("Δεν έχετε δικαίωμα έγκρισης αιτημάτων.");
  const claimRef = doc(db, "agency_claims", params.claimId);
  const claimSnapshot = await getDoc(claimRef);
  if (!claimSnapshot.exists()) throw new Error("Το αίτημα δεν βρέθηκε.");
  const claim = claimSnapshot.data() as { agencyId?: string; apartmentId?: string; brokerId?: string; apartmentTitle?: string; status?: string };
  if (claim.agencyId !== agencyId || claim.status !== "pending") throw new Error("Το αίτημα δεν είναι πλέον διαθέσιμο.");
  const apartmentRef = doc(db, "apartments", claim.apartmentId || "");
  await runTransaction(db, async (transaction) => {
    const currentClaimSnapshot = await transaction.get(claimRef);
    if (!currentClaimSnapshot.exists || currentClaimSnapshot.data()?.status !== "pending") throw new Error("Το αίτημα δεν είναι πλέον διαθέσιμο.");
    const apartmentSnapshot = await transaction.get(apartmentRef);
    if (!apartmentSnapshot.exists()) throw new Error("Το ακίνητο δεν βρέθηκε.");
    const data = apartmentSnapshot.data() as Record<string, unknown>;
    const assignedBrokerIds = Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((id): id is string => typeof id === "string") : [];
    const brokerId = claim.brokerId || "";
    const rejectedBrokerIds = Array.isArray(data.rejectedBrokerIds) ? data.rejectedBrokerIds.filter((id): id is string => typeof id === "string") : [];
    transaction.update(apartmentRef, params.approved ? {
      assignedBrokerIds: Array.from(new Set([...assignedBrokerIds, brokerId])),
      assignmentStatus: "assigned",
      pendingClaimBrokerId: deleteField(),
      updatedAt: serverTimestamp(),
    } : {
      assignedBrokerIds: assignedBrokerIds.filter((id) => id !== brokerId),
      assignmentStatus: "unassigned_pool",
      pendingClaimBrokerId: deleteField(),
      rejectedBrokerIds: Array.from(new Set([...rejectedBrokerIds, brokerId])),
      updatedAt: serverTimestamp(),
    });
    transaction.update(claimRef, { status: params.approved ? "approved" : "rejected", resolvedAt: serverTimestamp(), resolvedBy: params.reviewerId });
  });

  const brokerId = claim.brokerId || "";
  const apartmentId = claim.apartmentId || "";
  if (brokerId && apartmentId) {
    const apartmentSnapshot = await getDoc(apartmentRef);
    const apartmentData = apartmentSnapshot.exists() ? apartmentSnapshot.data() as Record<string, unknown> : {};
    const ownerId = requiredString(apartmentData.ownerId) || requiredString(apartmentData.hostId);
    if (params.approved) await addOwnerToBrokerClients(brokerId, apartmentId, apartmentData);
    else await removeOwnerFromBrokerClients(brokerId, apartmentId, ownerId);
  }
  if (!params.approved && brokerId) {
    const brokerSnapshot = await getDoc(doc(db, "users", brokerId));
    const pushToken = brokerSnapshot.exists() && typeof brokerSnapshot.data()?.expoPushToken === "string" ? brokerSnapshot.data()?.expoPushToken.trim() : "";
    if (pushToken) {
      await sendPushNotification(pushToken, "Το αίτημα ανάθεσης απορρίφθηκε", `Το αίτημα ανάθεσης για το ακίνητο «${claim.apartmentTitle || "Ακίνητο"}» απορρίφθηκε από τη Γραμματεία.`, { type: "agency_claim_rejected", apartmentId });
    }
    await addDoc(collection(db, "users", brokerId, "notifications"), {
      type: "agency_claim_rejected",
      title: "Το αίτημα ανάθεσης απορρίφθηκε",
      body: `Το αίτημα ανάθεσης για το ακίνητο «${claim.apartmentTitle || "Ακίνητο"}» απορρίφθηκε από τη Γραμματεία.`,
      createdAt: serverTimestamp(),
      isRead: false,
      data: { apartmentId },
    });
  }
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
  const apartmentRef = doc(db, "apartments", params.apartmentId);
  const entry: KeySafeLogEntry = { id: `${params.brokerId}_${Date.now()}`, brokerId: params.brokerId, brokerName: params.brokerName, checkedOutAt: Date.now(), ...(params.notes ? { notes: params.notes } : {}) };
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) throw new Error("Το ακίνητο δεν βρέθηκε.");
    const data = snapshot.data() as { keySafeLogs?: KeySafeLogEntry[] };
    const logs = Array.isArray(data.keySafeLogs) ? data.keySafeLogs : [];
    if (logs.some((log) => !log.returnedAt)) throw new Error("Τα κλειδιά έχουν ήδη παραληφθεί.");
    transaction.update(apartmentRef, { keySafeLogs: [...logs, entry], updatedAt: serverTimestamp() });
  });
  return entry;
}

export async function returnKeySafe(params: { apartmentId: string; brokerId: string }): Promise<void> {
  const apartmentRef = doc(db, "apartments", params.apartmentId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) throw new Error("Το ακίνητο δεν βρέθηκε.");
    const data = snapshot.data() as { keySafeLogs?: KeySafeLogEntry[] };
    const logs = Array.isArray(data.keySafeLogs) ? data.keySafeLogs : [];
    let returned = false;
    const nextLogs = logs.map((log) => {
      if (!returned && log.brokerId === params.brokerId && !log.returnedAt) {
        returned = true;
        return { ...log, returnedAt: Date.now() };
      }
      return log;
    });
    if (!returned) throw new Error("Δεν βρέθηκε ενεργή παραλαβή κλειδιών.");
    transaction.update(apartmentRef, { keySafeLogs: nextLogs, updatedAt: serverTimestamp() });
  });
}

export function calculateCommissionSplits(params: { totalCommission: number; agencyCutPercentage: number; listingPercentage: number; buyerPercentage: number; listingBroker: { id: string; name: string }; buyerBroker: { id: string; name: string }; coveringBroker?: { id: string; name: string; percentage: number } }): { agencyAmount: number; brokerSplits: BrokerCommissionSplit[] } {
  const totalCommission = Math.max(0, Number(params.totalCommission) || 0);
  const agencyCutPercentage = Math.min(100, Math.max(0, Number(params.agencyCutPercentage) || 0));
  const remaining = totalCommission * (1 - agencyCutPercentage / 100);
  const round = (value: number) => Math.round(value * 100) / 100;
  const splits: BrokerCommissionSplit[] = [
    { brokerId: params.listingBroker.id, brokerName: params.listingBroker.name, role: "listing_agent", percentage: params.listingPercentage, amount: round(remaining * Math.max(0, params.listingPercentage) / 100) },
    { brokerId: params.buyerBroker.id, brokerName: params.buyerBroker.name, role: "buyer_agent", percentage: params.buyerPercentage, amount: round(remaining * Math.max(0, params.buyerPercentage) / 100) },
  ];
  if (params.coveringBroker) splits.push({ brokerId: params.coveringBroker.id, brokerName: params.coveringBroker.name, role: "covering_agent", percentage: params.coveringBroker.percentage, amount: round(remaining * Math.max(0, params.coveringBroker.percentage) / 100) });
  return { agencyAmount: round(totalCommission * agencyCutPercentage / 100), brokerSplits: splits };
}

export async function getAgencyClosedDeals(agencyId: string): Promise<Deal[]> {
  if (!agencyId) return [];
  const snapshot = await getDocs(query(collection(db, "deals"), where("agencyId", "==", agencyId), where("status", "==", "closed")));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Deal, "id">) }));
}

export async function issueCommissionSettlement(params: { agencyId: string; deal: Deal; apartmentTitle?: string; invoiceNumber?: string; agencyShare: number; brokerSplits: BrokerCommissionSplit[] }): Promise<CommissionSettlementInvoice> {
  const now = Date.now();
  const apartmentSnapshot = await getDoc(doc(db, "apartments", params.deal.apartmentId));
  const apartmentTitle = params.apartmentTitle?.trim() || (apartmentSnapshot.exists() ? requiredString(apartmentSnapshot.data().title) : "") || "Ακίνητο";
  const invoice: CommissionSettlementInvoice = {
    id: params.deal.id,
    dealId: params.deal.id,
    apartmentId: params.deal.apartmentId,
    apartmentTitle,
    totalDealAmount: params.deal.dealAmount ?? params.deal.commissionTotal,
    totalCommission: params.deal.commissionTotal,
    agencyShare: params.agencyShare,
    brokerSplits: params.brokerSplits,
    invoiceNumber: params.invoiceNumber?.trim() || `INV-${now}`,
    invoiceStatus: "settled",
    issuedAt: now,
    settledAt: now,
    createdAt: now,
  };
  await setDoc(doc(db, "agencies", params.agencyId, "commission_settlements", params.deal.id), { ...invoice, issuedAt: serverTimestamp(), settledAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, "deals", params.deal.id), { status: "closed", settlementStatus: "settled", invoiceNumber: invoice.invoiceNumber, updatedAt: serverTimestamp() }, { merge: true });
  const recipients = new Set([params.deal.listingBrokerId, params.deal.buyerBrokerId, params.deal.coveringBrokerId].filter((id): id is string => Boolean(id)));
  await Promise.all([...recipients].map((brokerId) => addDoc(collection(db, "users", brokerId, "notifications"), { type: "commission_settled", title: "Η εκκαθάριση ολοκληρώθηκε", body: `Η εκκαθάριση ${invoice.invoiceNumber} ολοκληρώθηκε.`, createdAt: serverTimestamp(), isRead: false, data: { dealId: params.deal.id } })));
  return invoice;
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
  const agencyId = await getAgencyIdForUser(params.brokerId);
  if (!agencyId) throw new Error("Ο λογαριασμός δεν ανήκει σε agency.");
  const leadRef = doc(db, "leads", params.leadId);
  const lead = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists()) throw new Error("Το lead δεν βρέθηκε.");
    const data = snapshot.data() as AgencyLead;
    if (data.agencyId !== agencyId || data.status !== "unassigned_pool") throw new Error("Το lead δεν είναι πλέον διαθέσιμο.");
    transaction.update(leadRef, { status: "assigned", assignedBrokerId: params.brokerId, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return data;
  });
  if (lead.clientId) await upsertBrokerClientProfile({ brokerId: params.brokerId, clientId: lead.clientId, role: "client", clientName: lead.clientName, apartmentId: lead.apartmentId });
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

export async function registerOpenHouseLead(params: { agencyId: string; apartmentId: string; apartmentTitle?: string; clientName: string; phone?: string; email?: string; budget?: number; registeredByBrokerId: string }): Promise<string> {
  const leadRef = await addDoc(collection(db, "leads"), { agencyId: params.agencyId, apartmentId: params.apartmentId, apartmentTitle: params.apartmentTitle || "Ακίνητο", clientName: params.clientName.trim(), phone: params.phone?.trim() || null, email: params.email?.trim() || null, budget: params.budget, source: "open_house", registeredByBrokerId: params.registeredByBrokerId, status: "assigned", assignedBrokerId: params.registeredByBrokerId, assignedAt: serverTimestamp(), lastContactTimestamp: null, createdAt: serverTimestamp() });
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
  const [listing, buyerBroker, listingBroker] = await Promise.all([
    getDoc(doc(db, "apartments", params.apartmentId)),
    getUserAgencyData(params.buyerBrokerId),
    getUserAgencyData(params.listingBrokerId),
  ]);
  const listingData = listing.exists() ? listing.data() as Record<string, unknown> : null;
  const assignedBrokerIds = Array.isArray(listingData?.assignedBrokerIds)
    ? listingData.assignedBrokerIds.filter((id): id is string => typeof id === "string")
    : [];
  const listingOwnerId = requiredString(listingData?.ownerId) || requiredString(listingData?.hostId);
  if (!listingData || requiredString(listingData.agencyId) !== params.agencyId || (!assignedBrokerIds.includes(params.listingBrokerId) && listingOwnerId !== params.listingBrokerId)) {
    throw new Error("Το ακίνητο δεν είναι διαθέσιμο από τον συγκεκριμένο listing broker.");
  }
  if (requiredString(buyerBroker?.agencyId) !== params.agencyId || requiredString(listingBroker?.agencyId) !== params.agencyId) {
    throw new Error("Οι brokers δεν ανήκουν στο ίδιο γραφείο.");
  }
  const appointmentId = await createVisitAppointment({
    chatRoomId: `cross_broker_${params.apartmentId}_${params.clientId}`,
    brokerId: params.buyerBrokerId,
    clientId: params.clientId,
    listingBrokerId: params.listingBrokerId,
    buyerBrokerId: params.buyerBrokerId,
    agencyId: params.agencyId,
    apartmentId: params.apartmentId,
    apartmentTitle: params.apartmentTitle,
    apartmentAddress: params.apartmentAddress,
    appointmentDate: params.appointmentDate,
  });
  const date = params.appointmentDate.slice(0, 10);
  const time = params.appointmentDate.slice(11, 16);
  const noteBase = {
    title: `Επίσκεψη: ${params.apartmentTitle}`,
    type: "showing" as const,
    category: "showing" as const,
    apartmentId: params.apartmentId,
    apartmentTitle: params.apartmentTitle,
    apartmentPrice: params.apartmentPrice,
    scheduledDate: date,
    scheduledTime: time,
    date,
    time,
    timestamp: new Date(params.appointmentDate).getTime(),
    appointmentId,
    clientId: params.clientId,
    clientName: params.clientName,
    primaryBrokerId: params.buyerBrokerId,
    primaryBrokerName: requiredString(buyerBroker?.name) || "Buyer broker",
    listingBrokerId: params.listingBrokerId,
    buyerBrokerId: params.buyerBrokerId,
    agencyId: params.agencyId,
  };
  await Promise.all([
    saveBrokerNote(params.buyerBrokerId, { ...noteBase, brokerId: params.buyerBrokerId, calendarOwnerId: params.buyerBrokerId, counterpartId: params.listingBrokerId, counterpartName: "Listing broker" }),
    saveBrokerNote(params.listingBrokerId, { ...noteBase, brokerId: params.buyerBrokerId, calendarOwnerId: params.listingBrokerId, counterpartId: params.buyerBrokerId, counterpartName: "Buyer broker" }),
    upsertBrokerClientProfile({ brokerId: params.buyerBrokerId, clientId: params.clientId, clientName: params.clientName, role: "client", apartmentId: params.apartmentId, apartmentTitle: params.apartmentTitle, rent: params.apartmentPrice }),
    upsertBrokerClientProfile({ brokerId: params.listingBrokerId, clientId: params.clientId, clientName: params.clientName, role: "client", apartmentId: params.apartmentId, apartmentTitle: params.apartmentTitle, rent: params.apartmentPrice }),
  ]);
  await setDoc(doc(db, "deals", `${params.apartmentId}_${params.clientId}`), {
    apartmentId: params.apartmentId,
    clientId: params.clientId,
    agencyId: params.agencyId,
    listingBrokerId: params.listingBrokerId,
    buyerBrokerId: params.buyerBrokerId,
    stage: 40,
    status: "active",
    appointmentId,
    commissionTotal: 0,
    agencyCutPercentage: 50,
    agencyCutAmount: 0,
    brokerSplits: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return appointmentId;
}

export async function reassignAgencyLead(params: { leadId: string; reviewerId: string; targetBrokerId: string }): Promise<void> {
  const reviewer = await getUserAgencyData(params.reviewerId);
  const target = await getUserAgencyData(params.targetBrokerId);
  const agencyId = requiredString(reviewer?.agencyId);
  const reviewerRole = requiredString(reviewer?.agencyRole) || requiredString(reviewer?.role);
  if (!agencyId || !["ceo", "secretary", "secretariat"].includes(reviewerRole) || agencyId !== requiredString(target?.agencyId)) throw new Error("Δεν έχετε δικαίωμα ανάθεσης αυτού του lead.");
  const leadRef = doc(db, "leads", params.leadId);
  const lead = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(leadRef);
    if (!snapshot.exists()) throw new Error("Το lead δεν βρέθηκε.");
    const data = snapshot.data() as AgencyLead;
    if (data.agencyId !== agencyId) throw new Error("Το lead δεν ανήκει στο γραφείο σας.");
    transaction.update(leadRef, { status: "assigned", assignedBrokerId: params.targetBrokerId, assignedAt: serverTimestamp(), lastContactTimestamp: null, updatedAt: serverTimestamp() });
    return data;
  });
  if (lead.clientId) await upsertBrokerClientProfile({ brokerId: params.targetBrokerId, clientId: lead.clientId, role: "client", clientName: lead.clientName, apartmentId: lead.apartmentId });
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