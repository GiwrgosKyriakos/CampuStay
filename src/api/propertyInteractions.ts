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

export type InteractionType = "call" | "showing" | "comment" | "email";

export interface PropertyInteraction {
  id: string;
  apartmentId: string;
  apartmentTitle?: string;
  clientId: string;
  clientName: string;
  type: InteractionType;
  note: string;
  createdAt: Timestamp | null;
  createdAtMillis: number;
  loggedByUserId: string;
}

export async function addPropertyInteraction(payload: {
  apartmentId: string;
  apartmentTitle?: string;
  clientId: string;
  clientName: string;
  type: InteractionType;
  note: string;
  loggedByUserId: string;
}): Promise<string> {
  const colRef = collection(db, "apartments", payload.apartmentId, "interactions");
  const docRef = await addDoc(colRef, {
    apartmentId: payload.apartmentId,
    ...(payload.apartmentTitle ? { apartmentTitle: payload.apartmentTitle } : {}),
    clientId: payload.clientId,
    clientName: payload.clientName,
    type: payload.type,
    note: payload.note,
    loggedByUserId: payload.loggedByUserId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export function subscribePropertyInteractions(
  apartmentId: string,
  callback: (interactions: PropertyInteraction[]) => void,
): () => void {
  const interactionsQuery = query(
    collection(db, "apartments", apartmentId, "interactions"),
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
        createdAt,
        createdAtMillis: createdAt?.toMillis ? createdAt.toMillis() : Date.now(),
        loggedByUserId: typeof data.loggedByUserId === "string" ? data.loggedByUserId : "",
      };
    });

    callback(list);
  });
}

export function subscribeClientInteractions(
  clientId: string,
  callback: (interactions: PropertyInteraction[]) => void,
): () => void {
  const interactionsQuery = query(
    collectionGroup(db, "interactions"),
    where("clientId", "==", clientId),
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
          createdAt,
          createdAtMillis: createdAt?.toMillis ? createdAt.toMillis() : Date.now(),
          loggedByUserId: typeof data.loggedByUserId === "string" ? data.loggedByUserId : "",
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