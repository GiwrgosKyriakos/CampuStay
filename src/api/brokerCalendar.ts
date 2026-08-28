import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { colors } from "@/src/theme";


/**
 * Καθαρίζει αναδρομικά το αντικείμενο από πεδία που έχουν τιμή `undefined`,
 * ώστε το Firestore setDoc() να μην πετάει σφάλμα.
 */
function sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }

    // Καθαρισμός και στα ένθετα αντικείμενα (π.χ. extraInformation)
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      typeof (value as { toMillis?: unknown }).toMillis !== "function"
    ) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export type NoteCategory =
  | "visit"
  | "keys"
  | "message"
  | "phone"
  | "offer_review"
  | "deal_confirmation"
  | "other";

const categoryPriority: NoteCategory[] = [
  "visit",
  "keys",
  "message",
  "phone",
  "offer_review",
  "deal_confirmation",
  "other",
];

function getBrandPrimaryColor(): string {
  const withLegacyKey = colors as unknown as { brandPrimary?: string; brand?: string };
  return withLegacyKey.brandPrimary ?? withLegacyKey.brand ?? "#E07A2F";
}

export const noteCategoryColorMap: Record<NoteCategory, string> = {
  visit: getBrandPrimaryColor(),
  keys: "#E6E6FA",
  message: "#D8BFD8",
  phone: "#E0BBFF",
  offer_review: "#C8A2C8",
  deal_confirmation: "#A8E6CF",
  other: "#E0E0E0",
};

export interface BrokerNote {
  id: string;
  brokerId: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:mm" (e.g. "10:30")
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  clientId?: string;
  clientName?: string;
  category: NoteCategory;
  notesText?: string;
  done: boolean;
  createdAt: FieldValue;
}

type FirestoreBrokerNoteReadDoc = {
  brokerId?: string;
  date?: string;
  time?: string;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  clientId?: string;
  clientName?: string;
  category?: string;
  notesText?: string;
  done?: boolean;
  createdAt?: unknown;
};

type SaveBrokerNoteInput = Omit<BrokerNote, "id" | "createdAt" | "done"> & { done?: boolean };
type UpdateBrokerNoteInput = Partial<BrokerNote>;

export type GridDisplayField = "time" | "apartment" | "client" | "apartmentOrClient" | "timeOrTitle";

export interface GridLayoutResult {
  notes: BrokerNote[];
  columnCount: 1 | 2 | 3 | 4;
  visibleFields: GridDisplayField[];
  predominantColor: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function ensureNonEmptyString(value: string, fieldName: string): void {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} is required.`);
  }
}

function isValidNoteCategory(value: unknown): value is NoteCategory {
  return typeof value === "string" && categoryPriority.includes(value as NoteCategory);
}

function normalizeCategory(value: unknown): NoteCategory {
  return isValidNoteCategory(value) ? value : "other";
}

function parseTimeToMinutes(time?: string): number | null {
  if (!time || typeof time !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function compareTimeAsc(a?: string, b?: string): number {
  const aMinutes = parseTimeToMinutes(a);
  const bMinutes = parseTimeToMinutes(b);

  if (aMinutes === null && bMinutes === null) return 0;
  if (aMinutes === null) return 1;
  if (bMinutes === null) return -1;
  return aMinutes - bMinutes;
}

function mapFirestoreDocToBrokerNote(id: string, data: FirestoreBrokerNoteReadDoc, brokerId: string): BrokerNote {
  return {
    id,
    brokerId: isNonEmptyString(data.brokerId ?? "") ? (data.brokerId as string) : brokerId,
    date: typeof data.date === "string" ? data.date : "",
    time: typeof data.time === "string" ? data.time : undefined,
    apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
    apartmentTitle: typeof data.apartmentTitle === "string" ? data.apartmentTitle : undefined,
    apartmentPrice: typeof data.apartmentPrice === "number" ? data.apartmentPrice : undefined,
    clientId: typeof data.clientId === "string" ? data.clientId : undefined,
    clientName: typeof data.clientName === "string" ? data.clientName : undefined,
    category: normalizeCategory(data.category),
    notesText: typeof data.notesText === "string" ? data.notesText : undefined,
    done: data.done === true,
    createdAt: (data.createdAt as FieldValue) ?? serverTimestamp(),
  };
}

export async function saveBrokerNote(brokerId: string, noteData: SaveBrokerNoteInput): Promise<string> {
  ensureNonEmptyString(brokerId, "brokerId");
  ensureNonEmptyString(noteData.date, "date");

  try {
    const notesRef = collection(db, "users", brokerId, "calendarNotes");

    const payload: Omit<BrokerNote, "id"> = {
      ...noteData,
      brokerId,
      done: noteData.done ?? false,
      category: normalizeCategory(noteData.category),
      createdAt: serverTimestamp(),
    };

    const newDocRef = await addDoc(notesRef, payload);
    return newDocRef.id;
  } catch (error: unknown) {
    throw new Error(`Failed to save broker note: ${toErrorMessage(error)}`);
  }
}

export async function updateBrokerNote(brokerId: string, noteId: string, updates: UpdateBrokerNoteInput): Promise<void> {
  ensureNonEmptyString(brokerId, "brokerId");
  ensureNonEmptyString(noteId, "noteId");

  try {
    const noteRef = doc(db, "users", brokerId, "calendarNotes", noteId);

    const sanitizedUpdates: Record<string, unknown> = {};
    const blockedKeys = new Set(["id", "createdAt", "brokerId"]);

    for (const [key, value] of Object.entries(updates)) {
      if (blockedKeys.has(key) || typeof value === "undefined") {
        continue;
      }

      if (key === "category") {
        sanitizedUpdates.category = normalizeCategory(value);
        continue;
      }

      sanitizedUpdates[key] = value;
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return;
    }

    await updateDoc(noteRef, sanitizedUpdates);
  } catch (error: unknown) {
    throw new Error(`Failed to update broker note: ${toErrorMessage(error)}`);
  }
}

export async function deleteBrokerNote(brokerId: string, noteId: string): Promise<void> {
  ensureNonEmptyString(brokerId, "brokerId");
  ensureNonEmptyString(noteId, "noteId");

  try {
    const noteRef = doc(db, "users", brokerId, "calendarNotes", noteId);
    await deleteDoc(noteRef);
  } catch (error: unknown) {
    throw new Error(`Failed to delete broker note: ${toErrorMessage(error)}`);
  }
}

export async function getBrokerNotesByDateRange(
  brokerId: string,
  startDate: string,
  endDate: string,
): Promise<BrokerNote[]> {
  ensureNonEmptyString(brokerId, "brokerId");
  ensureNonEmptyString(startDate, "startDate");
  ensureNonEmptyString(endDate, "endDate");

  if (startDate > endDate) {
    throw new Error("startDate must be less than or equal to endDate.");
  }

  try {
    const notesRef = collection(db, "users", brokerId, "calendarNotes");
    const snapshot = await getDocs(notesRef);
    const mapped = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as FirestoreBrokerNoteReadDoc;
      return mapFirestoreDocToBrokerNote(docSnap.id, data, brokerId);
    }).filter((note) => note.date >= startDate && note.date <= endDate);

    return mapped.sort((a, b) => {
      if (a.date === b.date) {
        return compareTimeAsc(a.time, b.time);
      }
      return a.date.localeCompare(b.date);
    });
  } catch (error: unknown) {
    throw new Error(`Failed to fetch broker notes by date range: ${toErrorMessage(error)}`);
  }
}

export function getMostFrequentCategoryColor(notes: BrokerNote[]): string {
  if (notes.length === 0) {
    return colors.surface;
  }

  const frequency: Record<NoteCategory, number> = {
    visit: 0,
    keys: 0,
    message: 0,
    phone: 0,
    offer_review: 0,
    deal_confirmation: 0,
    other: 0,
  };

  for (const note of notes) {
    frequency[normalizeCategory(note.category)] += 1;
  }

  let topCategory: NoteCategory = "other";
  let topCount = -1;

  for (const category of categoryPriority) {
    const count = frequency[category];
    if (count > topCount) {
      topCount = count;
      topCategory = category;
    }
  }

  return noteCategoryColorMap[topCategory];
}

function determineGridRules(noteCount: number): { columnCount: 1 | 2 | 3 | 4; visibleFields: GridDisplayField[] } {
  if (noteCount <= 4) {
    return { columnCount: 1, visibleFields: ["time", "apartment", "client"] };
  }
  if (noteCount <= 10) {
    return { columnCount: 2, visibleFields: ["time", "apartmentOrClient"] };
  }
  if (noteCount <= 18) {
    return { columnCount: 3, visibleFields: ["timeOrTitle"] };
  }
  return { columnCount: 4, visibleFields: ["timeOrTitle"] };
}

export function calculateGridLayout(notes: BrokerNote[], isToday: boolean, currentTimeStr: string): GridLayoutResult {
  const currentMinutes = parseTimeToMinutes(currentTimeStr);

  const filteredNotes = notes.filter((note) => {
    if (!isToday || currentMinutes === null) {
      return true;
    }

    const noteMinutes = parseTimeToMinutes(note.time);
    if (noteMinutes === null) {
      return true;
    }

    return noteMinutes >= currentMinutes;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => compareTimeAsc(a.time, b.time));
  const { columnCount, visibleFields } = determineGridRules(sortedNotes.length);

  return {
    notes: sortedNotes,
    columnCount,
    visibleFields,
    predominantColor: getMostFrequentCategoryColor(sortedNotes),
  };
}
