import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface Apartment {
  id: string;
  title: string;
  rent: number;
  city: string;
  area: string;
  image: string;
  imageUrl?: string;
  images?: string[];
  rooms: number;
  size: number;
  tags: string[];
  description?: string;
  about?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
}

export interface FirestoreApartmentNoteDoc {
  apartmentId: string;
  text: string;
  apartmentData: Apartment;
  orderIndex: number;
  updatedAt: FieldValue;
  createdAt: FieldValue;
}

type FirestoreApartmentNoteReadDoc = {
  apartmentId?: string;
  text?: string;
  apartmentData?: Apartment;
  orderIndex?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
};

function normalizeApartmentData(apartmentId: string, apartmentData: Apartment): Apartment {
  return {
    ...apartmentData,
    id: apartmentData.id || apartmentId,
    title: apartmentData.title || "",
    rent: typeof apartmentData.rent === "number" ? apartmentData.rent : 0,
    city: apartmentData.city || "",
    area: apartmentData.area || "",
    image: apartmentData.image || apartmentData.imageUrl || apartmentData.images?.[0] || "",
    rooms: typeof apartmentData.rooms === "number" ? apartmentData.rooms : 1,
    size: typeof apartmentData.size === "number" ? apartmentData.size : 0,
    tags: Array.isArray(apartmentData.tags) ? apartmentData.tags : [],
  };
}

async function getNextOrderIndex(userId: string): Promise<number> {
  const notesRef = collection(db, "users", userId, "apartmentNotes");
  const notesSnap = await getDocs(query(notesRef, orderBy("orderIndex", "asc")));
  if (notesSnap.empty) return 0;

  const maxOrderIndex = notesSnap.docs.reduce((max, item) => {
    const data = item.data() as FirestoreApartmentNoteReadDoc;
    const current = typeof data.orderIndex === "number" ? data.orderIndex : -1;
    return Math.max(max, current);
  }, -1);

  return maxOrderIndex + 1;
}

export async function saveApartmentNote(
  userId: string,
  apartmentId: string,
  text: string,
  apartmentData: Apartment,
): Promise<void> {
  const noteRef = doc(db, "users", userId, "apartmentNotes", apartmentId);
  const existingSnap = await getDoc(noteRef);

  let orderIndex = 0;
  let createdAtValue: unknown = serverTimestamp();

  if (existingSnap.exists()) {
    const existingData = existingSnap.data() as FirestoreApartmentNoteReadDoc;
    orderIndex = typeof existingData.orderIndex === "number" ? existingData.orderIndex : 0;
    createdAtValue = existingData.createdAt ?? serverTimestamp();
  } else {
    orderIndex = await getNextOrderIndex(userId);
  }

  const payload: Record<string, unknown> = {
    apartmentId,
    text,
    apartmentData: normalizeApartmentData(apartmentId, apartmentData),
    orderIndex,
    updatedAt: serverTimestamp(),
    createdAt: createdAtValue,
  };

  await setDoc(noteRef, payload, { merge: true });
}

export async function getApartmentNote(userId: string, apartmentId: string): Promise<string | null> {
  const noteRef = doc(db, "users", userId, "apartmentNotes", apartmentId);
  const noteSnap = await getDoc(noteRef);
  if (!noteSnap.exists()) return null;

  const data = noteSnap.data() as FirestoreApartmentNoteReadDoc;
  if (typeof data.text !== "string") return null;
  return data.text;
}

export async function getUserApartmentNotes(
  userId: string,
): Promise<Array<{ id: string; text: string; apartmentData: Apartment; orderIndex: number }>> {
  const notesRef = collection(db, "users", userId, "apartmentNotes");
  const notesSnap = await getDocs(query(notesRef, orderBy("orderIndex", "asc")));

  return notesSnap.docs.map((docSnap, index) => {
    const data = docSnap.data() as FirestoreApartmentNoteReadDoc;
    const apartmentId = typeof data.apartmentId === "string" && data.apartmentId.length > 0 ? data.apartmentId : docSnap.id;
    const apartmentData = normalizeApartmentData(apartmentId, (data.apartmentData ?? { id: apartmentId }) as Apartment);

    return {
      id: apartmentId,
      text: typeof data.text === "string" ? data.text : "",
      apartmentData,
      orderIndex: typeof data.orderIndex === "number" ? data.orderIndex : index,
    };
  });
}

export async function updateNotesOrder(userId: string, orderedApartmentIds: string[]): Promise<void> {
  const batch = writeBatch(db);

  orderedApartmentIds.forEach((apartmentId, index) => {
    const noteRef = doc(db, "users", userId, "apartmentNotes", apartmentId);
    batch.set(
      noteRef,
      {
        apartmentId,
        orderIndex: index,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
}
