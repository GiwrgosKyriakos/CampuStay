import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";

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
}): Promise<void> {
  if (!input.brokerId.trim() || !input.clientId.trim() || input.brokerId === input.clientId) return;

  const profileRef = doc(db, "brokerClientProfiles", getBrokerClientProfileId(input.brokerId, input.clientId));
  const existingSnapshot = await getDoc(profileRef);
  const existing = existingSnapshot.exists() ? (existingSnapshot.data() as Partial<BrokerClientProfile>) : null;
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
      ...(input.pipelineStage || !existingSnapshot.exists()
        ? { pipelineStage: input.pipelineStage ?? "new_lead" }
        : {}),
      ...(input.pipelineStage || !existingSnapshot.exists() ? { stageUpdatedAt: Date.now() } : {}),
      apartmentIds,
      ...(!existingSnapshot.exists() || !existing?.createdAt ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncBrokerClientProfile(input: {
  brokerId: string;
  clientId: string;
  role: BrokerRelationshipRole;
  chatRoomId?: string | null;
  apartmentId?: string | null;
  pipelineStage?: BrokerPipelineStage;
}): Promise<void> {
  const clientSnapshot = await getDoc(doc(db, "users", input.clientId));
  const clientData = clientSnapshot.exists() ? (clientSnapshot.data() as UserProfileData) : null;

  await upsertBrokerClientProfile({
    ...input,
    clientName: clientData?.name,
    clientAvatar: getProfileAvatar(clientData),
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