import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import type { BrokerClientProfile, BrokerContactRole, CanonicalBrokerPipelineStage } from "@/src/types/brokerClientProfile";
import { scanHighMatchForBrokerClient } from "@/src/utils/brokerAutomations";

export type { BrokerClientProfile } from "@/src/types/brokerClientProfile";
export type BrokerRelationshipRole = BrokerContactRole;
export type BrokerPipelineStage = CanonicalBrokerPipelineStage;
type BrokerPipelineInputStage = BrokerPipelineStage | "showing_planned" | "showing_completed" | "offer" | "negotiation_agreement";

export type DealPipelineStage = "liked" | "lead" | "showing_scheduled" | "offer_made" | "negotiation_agreement" | "deal_closed" | "lost";

export interface BrokerDeal {
  id: string;
  dealId?: string;
  brokerId: string;
  clientId: string;
  role?: BrokerRelationshipRole;
  ownerId?: string;
  listingOwnerId?: string;
  apartmentId: string;
  apartmentTitle?: string;
  clientName?: string;
  clientAvatar?: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  leadReadiness?: "cold" | "warm" | "hot";
  activeApartmentTitle?: string | null;
  rent?: number;
  acceptedOfferPrice?: number;
  pipelineStage: DealPipelineStage;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HydratedDeal extends BrokerDeal {
  clientName: string;
  clientAvatar: string;
  clientPhone: string | null;
  clientEmail: string | null;
  leadReadiness: "cold" | "warm" | "hot";
  activeApartmentTitle: string | null;
}

interface UserProfileData {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  photoUrl?: string | null;
  avatar?: string | null;
  photos?: string[];
}

export function getBrokerClientProfileId(brokerId: string, clientId: string): string {
  return `${brokerId}_${clientId}`;
}

function getInitialStage(stage?: BrokerPipelineInputStage): number | undefined {
  if (stage === "showing_scheduled" || stage === "showing_planned" || stage === "showing_completed") return 35;
  if (stage === "offer_made" || stage === "offer") return 65;
  if (stage === "new_lead") return 10;
  return undefined;
}

function getProfileAvatar(data: UserProfileData | null): string {
  if (!data) return "";
  return data.photoUrl?.trim() || data.avatar?.trim() || data.photos?.find((photo) => photo.trim().length > 0)?.trim() || "";
}

export async function upsertBrokerClientProfile(input: BrokerClientProfileSyncInput): Promise<void> {
  const contactUserId = (input.contactUserId ?? input.clientId ?? "").trim();
  const contactRole = input.contactRole ?? input.role ?? "client";
  if (!input.brokerId.trim() || !contactUserId || input.brokerId === contactUserId) return;

  const ensureRelationship = httpsCallable<{
    brokerId: string;
    contactUserId: string;
    contactRole: BrokerRelationshipRole;
    chatRoomId?: string;
    apartmentId?: string;
    listingId?: string;
    appointmentId?: string;
    apartmentTitle?: string;
    displayName?: string;
  }, { profileId: string; leadId: string; agencyId: string | null }>(firebaseFunctions, "ensureBrokerClientRelationshipCallable");
  const ensured = await ensureRelationship({
    brokerId: input.brokerId,
    contactUserId,
    contactRole,
    ...(input.chatRoomId?.trim() ? { chatRoomId: input.chatRoomId.trim() } : {}),
    ...(input.apartmentId?.trim() ? { apartmentId: input.apartmentId.trim() } : {}),
    ...(input.listingId?.trim() ? { listingId: input.listingId.trim() } : {}),
    ...(input.appointmentId?.trim() ? { appointmentId: input.appointmentId.trim() } : {}),
    ...(input.apartmentTitle?.trim() ? { apartmentTitle: input.apartmentTitle.trim() } : {}),
    ...(input.displayName?.trim() || input.clientName?.trim() ? { displayName: input.displayName?.trim() || input.clientName?.trim() } : {}),
  });
  const profileRef = doc(db, "brokerClientProfiles", getBrokerClientProfileId(input.brokerId, contactUserId));
  const existingSnapshot = await getDoc(profileRef).catch(() => null);
  const contactSnapshot = await getDoc(doc(db, "users", contactUserId)).catch(() => null);
  const contactData = contactSnapshot?.exists() ? contactSnapshot.data() as UserProfileData : null;
  const displayName = input.displayName?.trim() || input.clientName?.trim() || contactData?.name?.trim() || "Πελάτης";
  const clientAvatar = input.clientAvatar?.trim() || getProfileAvatar(contactData);
  const canonicalStage = toCanonicalStage(input.pipelineStage);
  const listingId = input.listingId?.trim() || input.apartmentId?.trim();

  await setDoc(profileRef, {
    brokerId: input.brokerId,
    contactUserId,
    clientId: contactUserId,
    clientUserId: contactUserId,
    contactRole,
    role: contactRole,
    agencyId: ensured.data.agencyId,
    displayName,
    clientName: displayName,
    ...(clientAvatar ? { clientAvatar } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    leadIds: arrayUnion(ensured.data.leadId),
    activeLeadId: ensured.data.leadId,
    ...(input.chatRoomId?.trim() ? { chatRoomIds: arrayUnion(input.chatRoomId.trim()), chatRoomId: input.chatRoomId.trim() } : {}),
    ...(input.appointmentId?.trim() ? { appointmentIds: arrayUnion(input.appointmentId.trim()) } : {}),
    ...(listingId ? { listingIds: arrayUnion(listingId), apartmentIds: arrayUnion(listingId) } : {}),
    ...(contactRole === "owner" && listingId ? { activeApartmentId: listingId, activeApartmentTitle: input.apartmentTitle?.trim() || null } : {}),
    ...(input.pipelineStage ? { pipelineStage: canonicalStage, stageUpdatedAt: Date.now() } : {}),
    ...(input.leadReadiness ? { leadReadiness: input.leadReadiness } : {}),
    ...(!existingSnapshot?.exists() ? { createdAt: serverTimestamp() } : {}),
    lastContactAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (input.apartmentId?.trim() && contactRole === "client") {
    const initializeDeal = httpsCallable<Record<string, unknown>, { dealId: string }>(firebaseFunctions, "initializeDealCallable");
    const startingStage = getInitialStage(input.pipelineStage);
    await initializeDeal({
      apartmentId: input.apartmentId.trim(),
      brokerId: input.brokerId,
      clientId: contactUserId,
      leadId: ensured.data.leadId,
      ...(input.apartmentTitle?.trim() ? { apartmentTitle: input.apartmentTitle.trim() } : {}),
      ...(typeof input.rent === "number" && Number.isFinite(input.rent) ? { dealAmount: input.rent } : {}),
      ...(startingStage === undefined ? {} : { initialStage: startingStage }),
    });
  }

  if (contactRole === "client") void scanHighMatchForBrokerClient(input.brokerId, contactUserId, displayName).catch(() => undefined);
}

export async function enrollClaimedPropertyOwner(brokerId: string, apartmentId: string, agencyId: string | null): Promise<void> {
  const normalizedBrokerId = brokerId.trim();
  const normalizedApartmentId = apartmentId.trim();
  if (!normalizedBrokerId || !normalizedApartmentId) return;

  const apartmentSnapshot = await getDoc(doc(db, "apartments", normalizedApartmentId));
  if (!apartmentSnapshot.exists()) return;
  const apartmentData = apartmentSnapshot.data() as Record<string, unknown>;
  if (agencyId?.trim() && apartmentData.agencyId !== agencyId.trim()) return;
  const ownerId = typeof apartmentData.ownerId === "string" && apartmentData.ownerId.trim()
    ? apartmentData.ownerId.trim()
    : typeof apartmentData.hostId === "string" ? apartmentData.hostId.trim() : "";
  if (!ownerId || ownerId === normalizedBrokerId) return;

  const ownerDetails = apartmentData.ownerDetails && typeof apartmentData.ownerDetails === "object" && !Array.isArray(apartmentData.ownerDetails)
    ? apartmentData.ownerDetails as Record<string, unknown>
    : {};
  const ownerSnapshot = await getDoc(doc(db, "users", ownerId));
  const ownerData = ownerSnapshot.exists() ? ownerSnapshot.data() as Record<string, unknown> : {};
  const ownerName = typeof ownerDetails.name === "string" && ownerDetails.name.trim()
    ? ownerDetails.name.trim()
    : typeof ownerData.displayName === "string" && ownerData.displayName.trim()
      ? ownerData.displayName.trim()
      : typeof ownerData.name === "string" ? ownerData.name.trim() : "";
  const ownerPhone = typeof ownerDetails.phone === "string" && ownerDetails.phone.trim()
    ? ownerDetails.phone.trim()
    : typeof ownerData.phone === "string" ? ownerData.phone.trim() : typeof ownerData.phone_number === "string" ? ownerData.phone_number.trim() : "";
  const ownerEmail = typeof ownerDetails.email === "string" && ownerDetails.email.trim()
    ? ownerDetails.email.trim()
    : typeof ownerData.email === "string" ? ownerData.email.trim() : "";

  await upsertBrokerClientProfile({
    brokerId: normalizedBrokerId,
    contactUserId: ownerId,
    contactRole: "owner",
    role: "owner",
    displayName: ownerName || "Ιδιοκτήτης Ακινήτου",
    clientName: ownerName || "Ιδιοκτήτης Ακινήτου",
    phone: ownerPhone || null,
    email: ownerEmail || null,
    apartmentId: normalizedApartmentId,
    listingId: normalizedApartmentId,
    apartmentTitle: typeof apartmentData.title === "string" ? apartmentData.title : "",
    pipelineStage: "contacted",
    leadReadiness: "warm",
  });
}

export async function syncBrokerClientProfile(input: BrokerClientProfileSyncInput): Promise<void> {
  const contactUserId = (input.contactUserId ?? input.clientId ?? "").trim();
  if (!contactUserId) return;
  const clientSnapshot = await getDoc(doc(db, "users", contactUserId));
  const clientData = clientSnapshot.exists() ? (clientSnapshot.data() as UserProfileData) : null;
  let apartmentData: { title?: unknown; rent?: unknown; price?: unknown; ownerId?: unknown } | null = null;
  if (input.apartmentId?.trim()) {
    const apartmentSnapshot = await getDoc(doc(db, "apartments", input.apartmentId.trim()));
    if (apartmentSnapshot.exists()) apartmentData = apartmentSnapshot.data() as { title?: unknown; rent?: unknown; price?: unknown; ownerId?: unknown };
  }

  await upsertBrokerClientProfile({
    ...input,
    contactUserId,
    clientName: clientData?.name,
    clientAvatar: getProfileAvatar(clientData),
    displayName: input.displayName ?? clientData?.name,
    apartmentTitle: input.apartmentTitle ?? (typeof apartmentData?.title === "string" ? apartmentData.title : null),
    rent: input.rent ?? (typeof apartmentData?.rent === "number" ? apartmentData.rent : typeof apartmentData?.price === "number" ? apartmentData.price : null),
    ownerId: input.ownerId ?? (typeof apartmentData?.ownerId === "string" ? apartmentData.ownerId : null),
  });
}

export async function getBrokerClientProfiles(brokerId: string): Promise<BrokerClientProfile[]> {
  if (!brokerId.trim()) return [];

  const snapshot = await getDocs(
    query(collection(db, "brokerClientProfiles"), where("brokerId", "==", brokerId)),
  );

  const profiles = snapshot.docs.map((profileSnapshot) => mapBrokerClientProfile(profileSnapshot.id, profileSnapshot.data() as Record<string, unknown>)).filter((profile) => profile.contactUserId.length > 0);

  return Promise.all(profiles.map(async (profile) => {
    if (profile.displayName.trim() && profile.clientAvatar?.trim()) return profile;

    try {
      const userSnapshot = await getDoc(doc(db, "users", profile.contactUserId));
      if (!userSnapshot.exists()) return profile;
      const userData = userSnapshot.data() as UserProfileData;
      const displayName = profile.displayName.trim() || userData.name?.trim() || "Πελάτης";
      return {
        ...profile,
        displayName,
        clientName: displayName,
        clientAvatar: profile.clientAvatar?.trim() || getProfileAvatar(userData) || undefined,
      };
    } catch {
      return profile;
    }
  }));
}

function mapAuthoritativeDeal(dealId: string, data: Record<string, unknown>, brokerId: string): BrokerDeal | null {
  const clientId = typeof data.clientId === "string" ? data.clientId : "";
  const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId : "";
  if (!clientId || !apartmentId) return null;
  const stage = typeof data.stage === "number" ? data.stage : 0;
  const pipelineStage: DealPipelineStage = data.status === "closed" || stage >= 100
    ? "deal_closed"
    : stage >= 80
      ? "negotiation_agreement"
      : stage >= 60
        ? "offer_made"
        : stage >= 40
          ? "showing_scheduled"
          : "lead";
  return {
    id: dealId,
    dealId,
    brokerId,
    clientId,
    role: "client",
    apartmentId,
    ...(typeof data.apartmentTitle === "string" ? { apartmentTitle: data.apartmentTitle } : {}),
    ...(typeof data.acceptedOfferPrice === "number" ? { acceptedOfferPrice: data.acceptedOfferPrice, rent: data.acceptedOfferPrice } : typeof data.dealValue === "number" ? { rent: data.dealValue } : typeof data.dealAmount === "number" ? { rent: data.dealAmount } : {}),
    pipelineStage,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getBrokerDeals(brokerId: string, agencyId?: string): Promise<HydratedDeal[]> {
  if (!brokerId.trim()) return [];
  const snapshots = await Promise.all(["listingBrokerId", "buyerBrokerId", "coveringBrokerId"].map((field) => getDocs(query(collection(db, "deals"), where(field, "==", brokerId)))));
  const uniqueDeals = new Map<string, BrokerDeal>();
  snapshots.flatMap((snapshot) => snapshot.docs).forEach((dealSnapshot) => {
    const data = dealSnapshot.data() as Record<string, unknown>;
    if (agencyId?.trim() && data.agencyId !== agencyId.trim()) return;
    const deal = mapAuthoritativeDeal(dealSnapshot.id, data, brokerId);
    if (deal) uniqueDeals.set(deal.id, deal);
  });
  return Promise.all(Array.from(uniqueDeals.values()).map((deal) => hydrateDealWithClientData(deal, brokerId)));
}

export function subscribeBrokerDeals(agencyId: string, brokerId: string, onChange: (deals: HydratedDeal[]) => void): () => void {
  if (!brokerId.trim()) {
    onChange([]);
    return () => undefined;
  }
  let active = true;
  let hydrationVersion = 0;
  const liveByField = new Map<string, BrokerDeal[]>();
  const emit = () => {
    if (!active) return;
    const uniqueDeals = new Map<string, BrokerDeal>();
    liveByField.forEach((deals) => deals.forEach((deal) => uniqueDeals.set(deal.id, deal)));
    const version = hydrationVersion + 1;
    hydrationVersion = version;
    void Promise.all(Array.from(uniqueDeals.values()).map((deal) => hydrateDealWithClientData(deal, brokerId)))
      .then((hydratedDeals) => {
        if (active && version === hydrationVersion) onChange(hydratedDeals);
      })
      .catch(() => {
        if (active && version === hydrationVersion) onChange([]);
      });
  };
  const unsubscribes = ["listingBrokerId", "buyerBrokerId", "coveringBrokerId"].map((field) => {
    return onSnapshot(
      query(collection(db, "deals"), where(field, "==", brokerId)),
      (snapshot) => {
        liveByField.set(field, snapshot.docs.flatMap((dealSnapshot) => {
          const data = dealSnapshot.data() as Record<string, unknown>;
          if (agencyId.trim() && data.agencyId !== agencyId.trim()) return [];
          const deal = mapAuthoritativeDeal(dealSnapshot.id, data, brokerId);
          return deal ? [deal] : [];
        }));
        emit();
      },
      () => {
        liveByField.set(field, []);
        emit();
      },
    );
  });
  return () => {
    active = false;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export async function getBrokerClientDeals(brokerId: string, clientId: string, apartmentIds: string[] = []): Promise<HydratedDeal[]> {
  if (!brokerId.trim() || !clientId.trim() || apartmentIds.length === 0) return [];
  const snapshots = await Promise.all(apartmentIds.map((apartmentId) => getDoc(doc(db, "deals", `${apartmentId}_${clientId}`)).catch(() => null)));
  const deals = snapshots.flatMap((dealSnapshot) => {
    if (!dealSnapshot?.exists()) return [];
    const data = dealSnapshot.data() as Record<string, unknown>;
    if (![data.listingBrokerId, data.buyerBrokerId, data.coveringBrokerId].includes(brokerId)) return [];
    const deal = mapAuthoritativeDeal(dealSnapshot.id, data, brokerId);
    return deal ? [deal] : [];
  });
  return Promise.all(deals.map((deal) => hydrateDealWithClientData(deal, brokerId)));
}

function toCanonicalStage(stage?: BrokerPipelineInputStage): BrokerPipelineStage {
  if (stage === "showing_planned" || stage === "showing_completed") return "showing_scheduled";
  if (stage === "offer" || stage === "negotiation_agreement") return "offer_made";
  if (stage === "contacted") return "contacted";
  if (stage === "showing_scheduled") return "showing_scheduled";
  if (stage === "offer_made") return "offer_made";
  if (stage === "under_contract") return "under_contract";
  if (stage === "closed_won") return "closed_won";
  if (stage === "closed_lost") return "closed_lost";
  return "new_lead";
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function getProfileTimestamp(value: unknown): BrokerClientProfile["createdAt"] {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") return value as BrokerClientProfile["createdAt"];
  return new Date(0);
}

function mapBrokerClientProfile(id: string, raw: Record<string, unknown>): BrokerClientProfile {
  const contactUserId = typeof raw.contactUserId === "string" ? raw.contactUserId : typeof raw.clientId === "string" ? raw.clientId : typeof raw.clientUserId === "string" ? raw.clientUserId : "";
  const displayName = typeof raw.displayName === "string" ? raw.displayName : typeof raw.clientName === "string" ? raw.clientName : "";
  const contactRole: BrokerContactRole = raw.contactRole === "owner" || raw.role === "owner" ? "owner" : "client";
  const chatRoomIds = Array.from(new Set([...getStringArray(raw.chatRoomIds), ...(typeof raw.chatRoomId === "string" && raw.chatRoomId.trim() ? [raw.chatRoomId.trim()] : [])]));
  const listingIds = Array.from(new Set([...getStringArray(raw.listingIds), ...getStringArray(raw.apartmentIds)]));
  return {
    id,
    brokerId: typeof raw.brokerId === "string" ? raw.brokerId : "",
    contactUserId,
    contactRole,
    agencyId: typeof raw.agencyId === "string" ? raw.agencyId : null,
    displayName,
    ...(typeof raw.phone === "string" ? { phone: raw.phone } : {}),
    ...(typeof raw.email === "string" ? { email: raw.email } : {}),
    leadIds: getStringArray(raw.leadIds),
    activeLeadId: typeof raw.activeLeadId === "string" ? raw.activeLeadId : null,
    chatRoomIds,
    appointmentIds: getStringArray(raw.appointmentIds),
    dealIds: getStringArray(raw.dealIds),
    contractIds: getStringArray(raw.contractIds),
    listingIds,
    pipelineStage: toCanonicalStage(raw.pipelineStage as BrokerPipelineInputStage | undefined),
    leadReadiness: raw.leadReadiness === "cold" || raw.leadReadiness === "warm" || raw.leadReadiness === "hot" ? raw.leadReadiness : null,
    activeApartmentId: typeof raw.activeApartmentId === "string" ? raw.activeApartmentId : null,
    activeApartmentTitle: typeof raw.activeApartmentTitle === "string" ? raw.activeApartmentTitle : null,
    dealCommission: typeof raw.dealCommission === "number" ? raw.dealCommission : null,
    lastContactAt: getProfileTimestamp(raw.lastContactAt ?? raw.updatedAt),
    createdAt: getProfileTimestamp(raw.createdAt),
    updatedAt: getProfileTimestamp(raw.updatedAt),
    clientId: contactUserId,
    clientUserId: contactUserId,
    ...(displayName ? { clientName: displayName } : {}),
    ...(typeof raw.clientAvatar === "string" ? { clientAvatar: raw.clientAvatar } : {}),
    role: contactRole,
    ...(chatRoomIds[0] ? { chatRoomId: chatRoomIds[0] } : {}),
    apartmentIds: listingIds,
  };
}

export interface BrokerClientProfileSyncInput {
  brokerId: string;
  contactUserId?: string;
  clientId?: string;
  contactRole?: BrokerRelationshipRole;
  role?: BrokerRelationshipRole;
  clientName?: string | null;
  clientAvatar?: string | null;
  chatRoomId?: string | null;
  appointmentId?: string | null;
  apartmentId?: string | null;
  listingId?: string | null;
  pipelineStage?: BrokerPipelineInputStage;
  leadReadiness?: "cold" | "warm" | "hot" | null;
  apartmentTitle?: string | null;
  rent?: number | null;
  ownerId?: string | null;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
}

function toDealPipelineStage(stage: BrokerPipelineInputStage | null | undefined, fallback: DealPipelineStage): DealPipelineStage {
  switch (stage) {
    case "closed_won":
      return "deal_closed";
    case "closed_lost":
      return "lost";
    case "under_contract":
      return "negotiation_agreement";
    case "offer_made":
      return "offer_made";
    case "showing_scheduled":
    case "showing_planned":
    case "showing_completed":
      return "showing_scheduled";
    case "contacted":
    case "new_lead":
      return "lead";
    case "offer":
    case "negotiation_agreement":
      return stage === "negotiation_agreement" ? "negotiation_agreement" : "offer_made";
    default:
      return fallback;
  }
}

export async function getBrokerClientProfile(brokerId: string, clientId: string): Promise<BrokerClientProfile | null> {
  if (!brokerId.trim() || !clientId.trim()) return null;
  const snapshot = await getDoc(doc(db, "brokerClientProfiles", getBrokerClientProfileId(brokerId, clientId))).catch(() => null);
  return snapshot?.exists() ? mapBrokerClientProfile(snapshot.id, snapshot.data() as Record<string, unknown>) : null;
}

export async function hydrateDealWithClientData(deal: BrokerDeal, brokerId: string): Promise<HydratedDeal> {
  const contactUserId = deal.clientId.trim();
  const profile = await getBrokerClientProfile(brokerId, contactUserId);
  const needsUserFallback = !profile?.displayName?.trim() || !profile.clientAvatar?.trim() || !profile.phone?.trim() || !profile.email?.trim();
  const userSnapshot = needsUserFallback
    ? await getDoc(doc(db, "users", contactUserId)).catch(() => null)
    : null;
  const user = userSnapshot?.exists() ? userSnapshot.data() as UserProfileData : null;
  const clientName = profile?.displayName?.trim() || user?.name?.trim() || "Πελάτης";
  const clientAvatar = profile?.clientAvatar?.trim() || getProfileAvatar(user);
  const clientPhone = profile?.phone?.trim() || user?.phone?.trim() || user?.phone_number?.trim() || null;
  const clientEmail = profile?.email?.trim() || user?.email?.trim() || null;
  const activeApartmentTitle = profile?.activeApartmentTitle?.trim() || deal.apartmentTitle?.trim() || null;

  return {
    ...deal,
    clientName,
    clientAvatar,
    clientPhone,
    clientEmail,
    leadReadiness: profile?.leadReadiness ?? "warm",
    activeApartmentTitle,
    pipelineStage: toDealPipelineStage(profile?.pipelineStage, deal.pipelineStage),
  };
}