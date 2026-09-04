import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { scanHighMatchForBrokerClient } from "@/src/utils/brokerAutomations";

export type BrokerRelationshipRole = "client" | "owner";
export type BrokerPipelineStage =
  | "new_lead"
  | "showing_scheduled"
  | "offer_made"
  | "showing_planned"
  | "showing_completed"
  | "offer"
  | "negotiation_agreement"
  | "closed_won"
  | "closed_lost";

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
  rent?: number;
  pipelineStage: DealPipelineStage;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BrokerClientProfile {
  id: string;
  brokerId: string;
  clientId: string;
  clientName?: string;
  clientAvatar?: string;
  role?: BrokerRelationshipRole;
  chatRoomId?: string;
  pipelineStage?: BrokerPipelineStage;
  apartmentIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface UserProfileData {
  name?: string | null;
  photoUrl?: string | null;
  avatar?: string | null;
  photos?: string[];
}

export function getBrokerClientProfileId(brokerId: string, clientId: string): string {
  return `${brokerId}_${clientId}`;
}

function getInitialStage(stage?: BrokerPipelineStage): number | undefined {
  if (stage === "showing_scheduled" || stage === "showing_planned" || stage === "showing_completed") return 35;
  if (stage === "offer_made" || stage === "offer") return 65;
  if (stage === "new_lead") return 10;
  return undefined;
}

function getProfileAvatar(data: UserProfileData | null): string {
  if (!data) return "";
  return data.photoUrl?.trim() || data.avatar?.trim() || data.photos?.find((photo) => photo.trim().length > 0)?.trim() || "";
}

export async function upsertBrokerClientProfile(input: {
  brokerId: string;
  clientId: string;
  clientName?: string | null;
  clientAvatar?: string | null;
  role: BrokerRelationshipRole;
  chatRoomId?: string | null;
  apartmentId?: string | null;
  pipelineStage?: BrokerPipelineStage;
  apartmentTitle?: string | null;
  rent?: number | null;
  ownerId?: string | null;
}): Promise<void> {
  if (!input.brokerId.trim() || !input.clientId.trim() || input.brokerId === input.clientId) return;

  const profileRef = doc(db, "brokerClientProfiles", getBrokerClientProfileId(input.brokerId, input.clientId));
  const existingSnapshot = await getDoc(profileRef).catch(() => null);
  const existing = existingSnapshot?.exists() ? (existingSnapshot.data() as Partial<BrokerClientProfile>) : null;
  const previousApartmentIds = Array.isArray(existing?.apartmentIds)
    ? existing.apartmentIds.filter((apartmentId): apartmentId is string => typeof apartmentId === "string")
    : [];
  const apartmentIds = input.apartmentId?.trim()
    ? Array.from(new Set([...previousApartmentIds, input.apartmentId.trim()]))
    : previousApartmentIds;
  const clientName = input.clientName?.trim();
  const clientAvatar = input.clientAvatar?.trim();

  await setDoc(
    profileRef,
    {
      brokerId: input.brokerId,
      clientId: input.clientId,
      clientUserId: input.clientId,
      role: input.role,
      ...(clientName ? { clientName } : {}),
      ...(clientAvatar ? { clientAvatar } : {}),
      ...(input.chatRoomId?.trim() ? { chatRoomId: input.chatRoomId.trim() } : {}),
      ...(input.pipelineStage && !input.apartmentId || !existingSnapshot?.exists()
        ? { pipelineStage: input.pipelineStage ?? "new_lead" }
        : {}),
      ...(input.pipelineStage && !input.apartmentId || !existingSnapshot?.exists() ? { stageUpdatedAt: Date.now() } : {}),
      apartmentIds,
      ...(!existingSnapshot?.exists() || !existing?.createdAt ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (input.apartmentId?.trim() && input.role === "client") {
    const initializeDeal = httpsCallable<Record<string, unknown>, { dealId: string }>(firebaseFunctions, "initializeDealCallable");
    const startingStage = getInitialStage(input.pipelineStage);
    await initializeDeal({
      apartmentId: input.apartmentId.trim(),
      brokerId: input.brokerId,
      clientId: input.clientId,
      ...(input.apartmentTitle?.trim() ? { apartmentTitle: input.apartmentTitle.trim() } : {}),
      ...(typeof input.rent === "number" && Number.isFinite(input.rent) ? { dealAmount: input.rent } : {}),
      ...(startingStage === undefined ? {} : { initialStage: startingStage }),
    });
  }

  if (input.role === "client") {
    void scanHighMatchForBrokerClient(input.brokerId, input.clientId, clientName ?? "Πελάτης").catch(() => undefined);
  }
}

export async function syncBrokerClientProfile(input: {
  brokerId: string;
  clientId: string;
  role: BrokerRelationshipRole;
  chatRoomId?: string | null;
  apartmentId?: string | null;
  pipelineStage?: BrokerPipelineStage;
  apartmentTitle?: string | null;
  rent?: number | null;
  ownerId?: string | null;
}): Promise<void> {
  const clientSnapshot = await getDoc(doc(db, "users", input.clientId));
  const clientData = clientSnapshot.exists() ? (clientSnapshot.data() as UserProfileData) : null;
  let apartmentData: { title?: unknown; rent?: unknown; price?: unknown; ownerId?: unknown } | null = null;
  if (input.apartmentId?.trim()) {
    const apartmentSnapshot = await getDoc(doc(db, "apartments", input.apartmentId.trim()));
    if (apartmentSnapshot.exists()) apartmentData = apartmentSnapshot.data() as { title?: unknown; rent?: unknown; price?: unknown; ownerId?: unknown };
  }

  await upsertBrokerClientProfile({
    ...input,
    clientName: clientData?.name,
    clientAvatar: getProfileAvatar(clientData),
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

  const profiles = snapshot.docs.map((profileSnapshot) => {
    const data = profileSnapshot.data() as Omit<BrokerClientProfile, "id"> & { clientUserId?: string };
    return {
      id: profileSnapshot.id,
      ...data,
      clientId: data.clientId || data.clientUserId || "",
      apartmentIds: Array.isArray(data.apartmentIds)
        ? data.apartmentIds.filter((apartmentId): apartmentId is string => typeof apartmentId === "string")
        : [],
    };
  }).filter((profile) => profile.clientId.length > 0);

  return Promise.all(profiles.map(async (profile) => {
    if (profile.clientName?.trim() && profile.clientAvatar?.trim()) return profile;

    try {
      const userSnapshot = await getDoc(doc(db, "users", profile.clientId));
      if (!userSnapshot.exists()) return profile;
      const userData = userSnapshot.data() as UserProfileData;
      return {
        ...profile,
        clientName: profile.clientName?.trim() || userData.name?.trim() || undefined,
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
    ...(typeof data.dealAmount === "number" ? { rent: data.dealAmount } : {}),
    pipelineStage,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getBrokerDeals(brokerId: string, agencyId?: string): Promise<BrokerDeal[]> {
  if (!brokerId.trim()) return [];
  const authoritativeSnapshot = agencyId?.trim() ? await getDocs(query(collection(db, "deals"), where("agencyId", "==", agencyId.trim()))) : null;
  const authoritativeDeals = (authoritativeSnapshot?.docs ?? []).flatMap((dealSnapshot) => {
    const data = dealSnapshot.data() as Record<string, unknown>;
    const isParticipant = [data.listingBrokerId, data.buyerBrokerId, data.coveringBrokerId].includes(brokerId);
    const deal = isParticipant ? mapAuthoritativeDeal(dealSnapshot.id, data, brokerId) : null;
    return deal ? [deal] : [];
  });
  return authoritativeDeals;
}

export function subscribeBrokerDeals(agencyId: string, brokerId: string, onChange: (deals: BrokerDeal[]) => void): () => void {
  if (!agencyId.trim() || !brokerId.trim()) {
    onChange([]);
    return () => undefined;
  }
  let legacyDeals: BrokerDeal[] = [];
  let liveDeals: BrokerDeal[] = [];
  let active = true;
  const emit = () => {
    if (!active) return;
    const liveKeys = new Set(liveDeals.map((deal) => `${deal.apartmentId}_${deal.clientId}`));
    onChange([...liveDeals, ...legacyDeals.filter((deal) => !liveKeys.has(`${deal.apartmentId}_${deal.clientId}`))]);
  };
  void getBrokerDeals(brokerId).then((deals) => {
    legacyDeals = deals;
    emit();
  }).catch(() => undefined);
  const unsubscribe = onSnapshot(query(collection(db, "deals"), where("agencyId", "==", agencyId.trim())), (snapshot) => {
    liveDeals = snapshot.docs.flatMap((dealSnapshot) => {
      const data = dealSnapshot.data() as Record<string, unknown>;
      return [data.listingBrokerId, data.buyerBrokerId, data.coveringBrokerId].includes(brokerId) ? mapAuthoritativeDeal(dealSnapshot.id, data, brokerId) ?? [] : [];
    });
    emit();
  }, () => {
    liveDeals = [];
    emit();
  });
  return () => {
    active = false;
    unsubscribe();
  };
}

export async function getBrokerClientDeals(brokerId: string, clientId: string, apartmentIds: string[] = []): Promise<BrokerDeal[]> {
  if (!brokerId.trim() || !clientId.trim() || apartmentIds.length === 0) return [];
  const snapshots = await Promise.all(apartmentIds.map((apartmentId) => getDoc(doc(db, "deals", `${apartmentId}_${clientId}`)).catch(() => null)));
  return snapshots.flatMap((dealSnapshot) => {
    if (!dealSnapshot?.exists()) return [];
    const data = dealSnapshot.data() as Record<string, unknown>;
    if (![data.listingBrokerId, data.buyerBrokerId, data.coveringBrokerId].includes(brokerId)) return [];
    const deal = mapAuthoritativeDeal(dealSnapshot.id, data, brokerId);
    return deal ? [deal] : [];
  });
}