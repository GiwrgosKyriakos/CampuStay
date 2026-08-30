import { collection, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";

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

export type DealPipelineStage = "liked" | "lead" | "showing_scheduled" | "offer_made" | "deal_closed" | "lost";

export interface BrokerDeal {
  id: string;
  dealId?: string;
  brokerId: string;
  clientId: string;
  role?: BrokerRelationshipRole;
  ownerId?: string;
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

export function getDealId(apartmentId: string): string {
  return apartmentId.trim();
}

function getDealStage(stage?: BrokerPipelineStage): DealPipelineStage {
  if (stage === "showing_scheduled" || stage === "showing_planned" || stage === "showing_completed") return "showing_scheduled";
  if (stage === "offer_made" || stage === "offer" || stage === "negotiation_agreement") return "offer_made";
  if (stage === "closed_won") return "deal_closed";
  if (stage === "closed_lost") return "lost";
  return "lead";
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

  if (input.apartmentId?.trim()) {
    const dealRef = doc(collection(profileRef, "deals"), getDealId(input.apartmentId));
    const dealSnapshot = await getDoc(dealRef).catch(() => null);
    await setDoc(
      dealRef,
      {
        brokerId: input.brokerId,
        clientId: input.clientId,
        role: input.role,
        ...(input.ownerId?.trim() ? { ownerId: input.ownerId.trim() } : {}),
        apartmentId: input.apartmentId.trim(),
        ...(input.apartmentTitle?.trim() ? { apartmentTitle: input.apartmentTitle.trim() } : {}),
        ...(typeof input.rent === "number" && Number.isFinite(input.rent) ? { rent: input.rent } : {}),
        ...(input.pipelineStage ? { pipelineStage: getDealStage(input.pipelineStage) } : {}),
        ...(!dealSnapshot?.exists() ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
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

export async function getBrokerDeals(brokerId: string): Promise<BrokerDeal[]> {
  if (!brokerId.trim()) return [];
  const snapshot = await getDocs(query(collectionGroup(db, "deals"), where("brokerId", "==", brokerId)));
  return snapshot.docs.map((dealSnapshot) => {
    const data = dealSnapshot.data() as Omit<BrokerDeal, "id">;
    return { id: dealSnapshot.id, ...data, apartmentId: data.apartmentId || dealSnapshot.id };
  });
}

export async function getBrokerClientDeals(brokerId: string, clientId: string): Promise<BrokerDeal[]> {
  if (!brokerId.trim() || !clientId.trim()) return [];
  const snapshot = await getDocs(collection(db, "brokerClientProfiles", getBrokerClientProfileId(brokerId, clientId), "deals"));
  return snapshot.docs.map((dealSnapshot) => {
    const data = dealSnapshot.data() as Omit<BrokerDeal, "id">;
    return { id: dealSnapshot.id, ...data, apartmentId: data.apartmentId || dealSnapshot.id };
  });
}