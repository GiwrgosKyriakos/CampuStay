import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { syncBrokerClientProfile, type DealPipelineStage } from "@/src/api/brokerClientProfiles";

export type ApartmentLikeDoc = {
  userId: string;
  apartmentId: string;
  timestamp: ReturnType<typeof serverTimestamp>;
};

type LikeApartmentData = {
  hostId?: unknown;
  ownerId?: unknown;
  assignedBrokerIds?: unknown;
  title?: unknown;
  rent?: unknown;
  price?: unknown;
};

type BrokerLikeDeal = {
  dealId: string;
  brokerId: string;
  clientId: string;
  ownerId: string | null;
  apartmentId: string;
  apartmentTitle: string;
  rent: number;
  pipelineStage?: DealPipelineStage;
  updatedAt: ReturnType<typeof serverTimestamp>;
  createdAt?: ReturnType<typeof serverTimestamp>;
};

function buildLikeDocId(userId: string, apartmentId: string): string {
  return `${userId}_${apartmentId}`;
}

async function getAssociatedBrokerIds(apartment: LikeApartmentData): Promise<string[]> {
  const assignedBrokerIds = Array.isArray(apartment.assignedBrokerIds)
    ? apartment.assignedBrokerIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const directOwnerIds = [apartment.hostId, apartment.ownerId]
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  const directBrokerIds = await Promise.all(directOwnerIds.map(async (ownerId) => {
    const ownerSnap = await getDoc(doc(db, "users", ownerId)).catch(() => null);
    return ownerSnap?.exists() && ownerSnap.data()?.is_broker === true ? ownerId : null;
  }));

  return Array.from(new Set([
    ...assignedBrokerIds,
    ...directBrokerIds.filter((id): id is string => id !== null),
  ]));
}

async function syncLikedDeal(
  brokerId: string,
  clientId: string,
  apartmentId: string,
  apartment: LikeApartmentData,
): Promise<void> {
  await syncBrokerClientProfile({ brokerId, clientId, role: "client" });

  const dealRef = doc(db, "brokerClientProfiles", `${brokerId}_${clientId}`, "deals", apartmentId);
  const existingSnap = await getDoc(dealRef);
  const existingStage = existingSnap.exists() ? (existingSnap.data()?.pipelineStage as DealPipelineStage | undefined) : undefined;
  const ownerId = typeof apartment.ownerId === "string" ? apartment.ownerId : typeof apartment.hostId === "string" ? apartment.hostId : null;
  const apartmentTitle = typeof apartment.title === "string" ? apartment.title : "";
  const rent = typeof apartment.rent === "number" ? apartment.rent : typeof apartment.price === "number" ? apartment.price : 0;

  await setDoc(dealRef, {
    dealId: apartmentId,
    brokerId,
    clientId,
    ownerId,
    apartmentId,
    apartmentTitle,
    rent,
    ...(!existingStage || existingStage === "liked" ? { pipelineStage: "liked" } : {}),
    updatedAt: serverTimestamp(),
    ...(!existingSnap.exists() ? { createdAt: serverTimestamp() } : {}),
  } satisfies BrokerLikeDeal, { merge: true });
}

async function hasActiveChatMessages(brokerId: string, clientId: string, apartmentId: string): Promise<boolean> {
  const chatsSnap = await getDocs(
    query(
      collection(db, "chats"),
      where("apartmentId", "==", apartmentId),
      where("users", "array-contains", brokerId),
    ),
  );

  for (const chatDoc of chatsSnap.docs) {
    const chatData = chatDoc.data() as { users?: unknown; status?: string; brokerChatRole?: string };
    if (chatData.status === "closed" || chatData.brokerChatRole === "owner") continue;
    const users = Array.isArray(chatData.users) ? chatData.users : [];
    if (!users.includes(clientId)) continue;
    const messagesSnap = await getDocs(collection(db, "chats", chatDoc.id, "messages"));
    if (messagesSnap.size > 0) return true;
  }

  return false;
}

async function removeLikedDealIfUnengaged(brokerId: string, clientId: string, apartmentId: string): Promise<void> {
  const dealRef = doc(db, "brokerClientProfiles", `${brokerId}_${clientId}`, "deals", apartmentId);
  const dealSnap = await getDoc(dealRef);
  if (!dealSnap.exists() || dealSnap.data()?.pipelineStage !== "liked") return;
  if (await hasActiveChatMessages(brokerId, clientId, apartmentId)) return;
  await deleteDoc(dealRef);
}

export async function setApartmentLike(userId: string, apartmentId: string): Promise<void> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));
  await runTransaction(db, async (tx) => {
    tx.set(likeRef, {
      userId,
      apartmentId,
      timestamp: serverTimestamp(),
    } satisfies ApartmentLikeDoc);
  });
}

export async function deleteApartmentLike(userId: string, apartmentId: string): Promise<void> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));
  await runTransaction(db, async (tx) => {
    tx.delete(likeRef);
  });
}

export async function toggleApartmentLike(userId: string, apartmentId: string): Promise<boolean> {
  const likeRef = doc(db, "liked_apartments", buildLikeDocId(userId, apartmentId));
  const apartmentSnap = await getDoc(doc(db, "apartments", apartmentId));
  const apartment = apartmentSnap.exists() ? apartmentSnap.data() as LikeApartmentData : null;
  const brokerIds = apartment ? await getAssociatedBrokerIds(apartment) : [];

  const isLiked = await runTransaction(db, async (tx) => {
    const snap = await tx.get(likeRef);
    if (snap.exists()) {
      tx.delete(likeRef);
      return false;
    }

    tx.set(likeRef, {
      userId,
      apartmentId,
      timestamp: serverTimestamp(),
    } satisfies ApartmentLikeDoc);
    return true;
  });

  if (apartment) {
    for (const brokerId of brokerIds) {
      try {
        if (isLiked) {
          await syncLikedDeal(brokerId, userId, apartmentId, apartment);
        } else {
          await removeLikedDealIfUnengaged(brokerId, userId, apartmentId);
        }
      } catch (error) {
        console.error("[ApartmentLikes] Failed to sync CRM deal", {
          apartmentId,
          brokerId,
          clientId: userId,
          isLiked,
          error,
        });
      }
    }
  }

  return isLiked;
}

export function subscribeUserLikedApartmentIds(
  userId: string,
  onChange: (apartmentIds: Set<string>) => void,
): () => void {
  const likesQ = query(collection(db, "liked_apartments"), where("userId", "==", userId));
  return onSnapshot(likesQ, (snapshot) => {
    const ids = new Set<string>();
    snapshot.forEach((item) => {
      const apartmentId = item.data()?.apartmentId;
      if (typeof apartmentId === "string" && apartmentId) ids.add(apartmentId);
    });
    onChange(ids);
  });
}

export async function getApartmentLikeCount(apartmentId: string): Promise<number> {
  const likesQ = query(collection(db, "liked_apartments"), where("apartmentId", "==", apartmentId));
  const countSnap = await getCountFromServer(likesQ);
  return countSnap.data().count;
}

export function subscribeApartmentLikeCount(apartmentId: string, onChange: (count: number) => void): () => void {
  const likesQ = query(collection(db, "liked_apartments"), where("apartmentId", "==", apartmentId));
  return onSnapshot(likesQ, (snapshot) => onChange(snapshot.size));
}
