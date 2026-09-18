import {
  addDoc,
  collection,
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { resolveClientDisplayName } from "@/src/api/brokerCalendar";

export type InteractionType = "call" | "showing" | "comment" | "email" | "note" | "viewing" | "offer" | "meeting";

export interface InteractionLog {
  id: string;
  brokerId: string;
  loggedByUserId: string;
  clientId?: string | null;
  apartmentId?: string | null;
  agencyId?: string | null;
  assignedBrokerIds?: string[];
  type: InteractionType;
  note: string;
  createdAt: Timestamp | Date;
}

export interface PropertyInteraction extends InteractionLog {
  apartmentId: string;
  apartmentTitle?: string;
  clientId: string;
  clientName: string;
  createdAtMillis: number;
}

export async function addPropertyInteraction(payload: {
  apartmentId: string;
  apartmentTitle?: string;
  clientId: string;
  clientName: string;
  type: InteractionType;
  note: string;
  loggedByUserId: string;
  brokerId: string;
  agencyId?: string;
  assignedBrokerIds?: string[];
}): Promise<string> {
  const brokerId = payload.brokerId.trim();
  const loggedByUserId = payload.loggedByUserId.trim();
  if (!brokerId || brokerId !== loggedByUserId) throw new Error("Interaction logs must be authored by the assigned broker.");
  const colRef = collection(db, "apartments", payload.apartmentId, "interactions");
  const resolvedClientName = await resolveClientDisplayName(payload.clientId, payload.clientName);
  const docRef = await addDoc(colRef, {
    apartmentId: payload.apartmentId,
    ...(payload.apartmentTitle ? { apartmentTitle: payload.apartmentTitle } : {}),
    clientId: payload.clientId,
    clientName: resolvedClientName || (payload.clientId ? "Πελάτης" : payload.clientName),
    type: payload.type,
    note: payload.note,
    loggedByUserId,
    brokerId,
    ...(payload.agencyId ? { agencyId: payload.agencyId } : {}),
    assignedBrokerIds: Array.from(new Set([brokerId, ...(payload.assignedBrokerIds ?? [])].filter((id) => id.trim().length > 0))),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export function subscribePropertyInteractions(
  apartmentId: string,
  brokerId: string,
  callback: (interactions: PropertyInteraction[]) => void,
): () => void {
  const normalizedBrokerId = brokerId.trim();
  if (!normalizedBrokerId) {
    callback([]);
    return () => undefined;
  }
  const interactionsQuery = query(
    collection(db, "apartments", apartmentId, "interactions"),
    where("brokerId", "==", normalizedBrokerId),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(interactionsQuery, (snapshot) => {
    const list: PropertyInteraction[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = (data.createdAt as Timestamp | null) ?? null;
      const type = data.type as InteractionType;

      return {
        id: docSnap.id,
        apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : apartmentId,
        apartmentTitle: typeof data.apartmentTitle === "string" ? data.apartmentTitle : "Ακίνητο",
        clientId: typeof data.clientId === "string" ? data.clientId : "",
        clientName: typeof data.clientName === "string" && data.clientName.trim() ? data.clientName : "Άγνωστος",
        type: ["call", "showing", "comment", "email"].includes(type) ? type : "comment",
        note: typeof data.note === "string" ? data.note : "",
        createdAt: createdAt ?? new Date(),
        createdAtMillis: createdAt?.toMillis ? createdAt.toMillis() : Date.now(),
        loggedByUserId: typeof data.loggedByUserId === "string" ? data.loggedByUserId : "",
        brokerId: typeof data.brokerId === "string" ? data.brokerId : "",
        assignedBrokerIds: Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((id): id is string => typeof id === "string") : [],
      };
    });

    callback(list);
  }, (error) => {
    console.warn("[PropertyInteractions] Apartment subscription failed:", { apartmentId, error });
    callback([]);
  });
}

export function subscribeClientInteractions(
  clientId: string,
  callback: (interactions: PropertyInteraction[]) => void,
  brokerId: string,
): () => void {
  const normalizedBrokerId = brokerId.trim();
  if (!normalizedBrokerId) {
    callback([]);
    return () => undefined;
  }
  const interactionsQuery = query(
    collectionGroup(db, "interactions"),
    where("clientId", "==", clientId),
    where("brokerId", "==", normalizedBrokerId),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    interactionsQuery,
    (snapshot) => {
      const list: PropertyInteraction[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const createdAt = (data.createdAt as Timestamp | null) ?? null;
        const type = data.type as InteractionType;

        return {
          id: docSnap.id,
          apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : "",
          apartmentTitle: typeof data.apartmentTitle === "string" ? data.apartmentTitle : "Ακίνητο",
          clientId: typeof data.clientId === "string" ? data.clientId : clientId,
          clientName: typeof data.clientName === "string" ? data.clientName : "",
          type: ["call", "showing", "comment", "email"].includes(type) ? type : "comment",
          note: typeof data.note === "string" ? data.note : "",
          createdAt: createdAt ?? new Date(),
          createdAtMillis: createdAt?.toMillis ? createdAt.toMillis() : Date.now(),
          loggedByUserId: typeof data.loggedByUserId === "string" ? data.loggedByUserId : "",
          brokerId: typeof data.brokerId === "string" ? data.brokerId : "",
          assignedBrokerIds: Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((id): id is string => typeof id === "string") : [],
        };
      });
      callback(list);
    },
    (error) => {
      console.warn("[PropertyInteractions] Client subscription failed:", error);
      callback([]);
    },
  );
}