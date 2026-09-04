import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  type FieldValue,
  where,
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
      typeof (value as { toMillis?: unknown }).toMillis !== "function" &&
      typeof (value as { _methodName?: unknown })._methodName !== "string"
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
  | "showing"
  | "pickup"
  | "owner_meeting"
  | "keys"
  | "message"
  | "phone"
  | "call"
  | "offer_review"
  | "deal_confirmation"
  | "other";

const categoryPriority: NoteCategory[] = [
  "visit",
  "showing",
  "pickup",
  "owner_meeting",
  "keys",
  "message",
  "phone",
  "call",
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
  showing: getBrandPrimaryColor(),
  pickup: "#F59E0B",
  owner_meeting: "#F97316",
  keys: "#E6E6FA",
  message: "#D8BFD8",
  phone: "#E0BBFF",
  call: "#E0BBFF",
  offer_review: "#C8A2C8",
  deal_confirmation: "#A8E6CF",
  other: "#E0E0E0",
};

export interface BrokerNote {
  id: string;
  title?: string;
  brokerId: string;
  agencyId?: string;
  calendarOwnerId?: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:mm" (e.g. "10:30")
  type?: NoteCategory;
  scheduledDate?: string;
  scheduledTime?: string;
  timestamp?: number;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  appointmentId?: string;
  clientId?: string;
  clientProfileId?: string;
  clientName?: string;
  category: NoteCategory;
  notesText?: string;
  done: boolean;
  isCompleted?: boolean;
  enablePushReminder?: boolean;
  reminderLeadTimeMinutes?: number;
  reminderNotificationId?: string;
  counterpartId?: string;
  counterpartName?: string;
  primaryBrokerId?: string;
  primaryBrokerName?: string;
  primaryNoteId?: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
  coveringBrokerName?: string;
  submittedByCoveringBrokerId?: string;
  feedbackSubmittedBy?: Record<string, boolean>;
  appointmentStatus?: string;
  createdAt: FieldValue;
}

type FirestoreBrokerNoteReadDoc = {
  title?: string;
  brokerId?: string;
  agencyId?: string;
  calendarOwnerId?: string;
  date?: string;
  time?: string;
  type?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  timestamp?: number;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  appointmentId?: string;
  clientId?: string;
  clientProfileId?: string;
  clientName?: string;
  category?: string;
  notesText?: string;
  done?: boolean;
  isCompleted?: boolean;
  enablePushReminder?: boolean;
  reminderLeadTimeMinutes?: number;
  reminderNotificationId?: string;
  counterpartId?: string;
  counterpartName?: string;
  primaryBrokerId?: string;
  primaryBrokerName?: string;
  primaryNoteId?: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
  coveringBrokerName?: string;
  submittedByCoveringBrokerId?: string;
  feedbackSubmittedBy?: Record<string, boolean>;
  appointmentStatus?: string;
  createdAt?: unknown;
};

type FirestoreAppointmentReadDoc = {
  brokerId?: string;
  clientId?: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
  agencyId?: string;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentAddress?: string;
  appointmentDate?: string;
  status?: string;
  clientName?: string;
  apartmentPrice?: number;
  feedbackSubmittedBy?: Record<string, boolean>;
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
  const category = normalizeCategory(data.category ?? data.type);
  return {
    id,
    title: typeof data.title === "string" ? data.title : undefined,
    brokerId: isNonEmptyString(data.brokerId ?? "") ? (data.brokerId as string) : brokerId,
    agencyId: typeof data.agencyId === "string" ? data.agencyId : undefined,
    calendarOwnerId: typeof data.calendarOwnerId === "string" ? data.calendarOwnerId : brokerId,
    date: typeof data.date === "string" ? data.date : "",
    time: typeof data.time === "string" ? data.time : undefined,
    type: category,
    scheduledDate: typeof data.scheduledDate === "string" ? data.scheduledDate : undefined,
    scheduledTime: typeof data.scheduledTime === "string" ? data.scheduledTime : undefined,
    timestamp: typeof data.timestamp === "number" ? data.timestamp : undefined,
    apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
    apartmentTitle: typeof data.apartmentTitle === "string" ? data.apartmentTitle : undefined,
    apartmentPrice: typeof data.apartmentPrice === "number" ? data.apartmentPrice : undefined,
    appointmentId: typeof data.appointmentId === "string" ? data.appointmentId : undefined,
    clientId: typeof data.clientId === "string" ? data.clientId : undefined,
    clientProfileId: typeof data.clientProfileId === "string" ? data.clientProfileId : undefined,
    clientName: typeof data.clientName === "string" ? data.clientName : undefined,
    category,
    notesText: typeof data.notesText === "string" ? data.notesText : undefined,
    done: data.done === true || data.isCompleted === true,
    isCompleted: data.isCompleted === true || data.done === true,
    enablePushReminder: data.enablePushReminder === true,
    reminderLeadTimeMinutes: typeof data.reminderLeadTimeMinutes === "number" ? data.reminderLeadTimeMinutes : undefined,
    reminderNotificationId: typeof data.reminderNotificationId === "string" ? data.reminderNotificationId : undefined,
    counterpartId: typeof data.counterpartId === "string" ? data.counterpartId : undefined,
    counterpartName: typeof data.counterpartName === "string" ? data.counterpartName : undefined,
    primaryBrokerId: typeof data.primaryBrokerId === "string" ? data.primaryBrokerId : undefined,
    primaryBrokerName: typeof data.primaryBrokerName === "string" ? data.primaryBrokerName : undefined,
    primaryNoteId: typeof data.primaryNoteId === "string" ? data.primaryNoteId : undefined,
    listingBrokerId: typeof data.listingBrokerId === "string" ? data.listingBrokerId : undefined,
    buyerBrokerId: typeof data.buyerBrokerId === "string" ? data.buyerBrokerId : undefined,
    coveringBrokerId: typeof data.coveringBrokerId === "string" ? data.coveringBrokerId : undefined,
    coveringBrokerName: typeof data.coveringBrokerName === "string" ? data.coveringBrokerName : undefined,
    submittedByCoveringBrokerId: typeof data.submittedByCoveringBrokerId === "string" ? data.submittedByCoveringBrokerId : undefined,
    feedbackSubmittedBy: data.feedbackSubmittedBy,
    appointmentStatus: typeof data.appointmentStatus === "string" ? data.appointmentStatus : undefined,
    createdAt: (data.createdAt as FieldValue) ?? serverTimestamp(),
  };
}

function mapAppointmentToBrokerNote(id: string, data: FirestoreAppointmentReadDoc, calendarOwnerId: string): BrokerNote | null {
  if (typeof data.appointmentDate !== "string" || !data.appointmentDate.trim() || typeof data.apartmentId !== "string" || typeof data.clientId !== "string") return null;
  const appointmentDate = new Date(data.appointmentDate);
  if (!Number.isFinite(appointmentDate.getTime())) return null;
  const primaryBrokerId = data.listingBrokerId || data.brokerId || data.buyerBrokerId || calendarOwnerId;
  return {
    id: `appointment_${id}`,
    title: `Επίσκεψη: ${data.apartmentTitle || "Ακίνητο"}`,
    brokerId: primaryBrokerId,
    calendarOwnerId,
    agencyId: data.agencyId,
    date: data.appointmentDate.slice(0, 10),
    time: data.appointmentDate.slice(11, 16),
    type: "showing",
    category: "showing",
    scheduledDate: data.appointmentDate.slice(0, 10),
    scheduledTime: data.appointmentDate.slice(11, 16),
    timestamp: appointmentDate.getTime(),
    apartmentId: data.apartmentId,
    apartmentTitle: data.apartmentTitle,
    apartmentPrice: data.apartmentPrice,
    appointmentId: id,
    clientId: data.clientId,
    clientName: data.clientName,
    primaryBrokerId,
    primaryBrokerName: "Μεσίτης",
    listingBrokerId: data.listingBrokerId,
    buyerBrokerId: data.buyerBrokerId,
    coveringBrokerId: data.coveringBrokerId,
    feedbackSubmittedBy: data.feedbackSubmittedBy,
    appointmentStatus: data.status,
    done: data.status === "completed",
    isCompleted: data.status === "completed",
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
      calendarOwnerId: noteData.calendarOwnerId ?? brokerId,
      done: noteData.done ?? false,
      isCompleted: noteData.isCompleted ?? noteData.done ?? false,
      category: normalizeCategory(noteData.category),
      type: normalizeCategory(noteData.type ?? noteData.category),
      createdAt: serverTimestamp(),
    };

    const newDocRef = await addDoc(notesRef, sanitizePayload(payload as unknown as Record<string, unknown>));
    return newDocRef.id;
  } catch (error: unknown) {
    throw new Error(`Failed to save broker note: ${toErrorMessage(error)}`);
  }
}

export async function saveShowingCalendarNotes(params: {
  brokerId: string;
  clientId: string;
  appointmentId?: string;
  clientName?: string;
  apartmentId: string;
  apartmentTitle: string;
  apartmentPrice?: number;
  scheduledDate: string;
  scheduledTime: string;
}): Promise<{ brokerNoteId: string; clientNoteId: string }> {
  const timestamp = new Date(`${params.scheduledDate}T${params.scheduledTime}:00`).getTime();
  const shared = {
    title: `Επίσκεψη: ${params.apartmentTitle}`,
    type: "showing" as const,
    category: "showing" as const,
    apartmentId: params.apartmentId,
    apartmentTitle: params.apartmentTitle,
    apartmentPrice: params.apartmentPrice,
    scheduledDate: params.scheduledDate,
    scheduledTime: params.scheduledTime,
    time: params.scheduledTime,
    date: params.scheduledDate,
    timestamp,
    clientId: params.clientId,
    appointmentId: params.appointmentId,
    clientName: params.clientName,
  };

  const [brokerNoteId, clientNoteId] = await Promise.all([
    saveBrokerNote(params.brokerId, {
      ...shared,
      brokerId: params.brokerId,
      calendarOwnerId: params.brokerId,
      counterpartId: params.clientId,
      counterpartName: params.clientName,
    }),
    saveBrokerNote(params.clientId, {
      ...shared,
      brokerId: params.brokerId,
      calendarOwnerId: params.clientId,
      counterpartId: params.brokerId,
    }),
  ]);

  return { brokerNoteId, clientNoteId };
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

      if (key === "type") {
        sanitizedUpdates.type = normalizeCategory(value);
        continue;
      }

      if (key === "done" || key === "isCompleted") {
        sanitizedUpdates.done = value === true;
        sanitizedUpdates.isCompleted = value === true;
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

    const appointmentQueries = ["brokerId", "listingBrokerId", "buyerBrokerId", "coveringBrokerId"].map((field) => getDocs(query(collection(db, "appointments"), where(field, "==", brokerId))));
    const appointmentSnapshots = await Promise.all(appointmentQueries);
    const appointmentNotes = new Map<string, BrokerNote>();
    appointmentSnapshots.flatMap((result) => result.docs).forEach((appointmentSnapshot) => {
      const appointmentNote = mapAppointmentToBrokerNote(appointmentSnapshot.id, appointmentSnapshot.data() as FirestoreAppointmentReadDoc, brokerId);
      if (appointmentNote && appointmentNote.date >= startDate && appointmentNote.date <= endDate) appointmentNotes.set(appointmentNote.appointmentId!, appointmentNote);
    });

    const appointmentIds = new Set([...appointmentNotes.keys()]);
    const notesWithoutAppointmentCopies = mapped.filter((note) => !note.appointmentId || !appointmentIds.has(note.appointmentId));

    return [...notesWithoutAppointmentCopies, ...appointmentNotes.values()].sort((a, b) => {
      if (a.date === b.date) {
        return compareTimeAsc(a.time, b.time);
      }
      return a.date.localeCompare(b.date);
    });
  } catch (error: unknown) {
    throw new Error(`Failed to fetch broker notes by date range: ${toErrorMessage(error)}`);
  }
}

export async function getBrokerNoteById(brokerId: string, noteId: string): Promise<BrokerNote | null> {
  ensureNonEmptyString(brokerId, "brokerId");
  ensureNonEmptyString(noteId, "noteId");

  const snapshot = await getDoc(doc(db, "users", brokerId, "calendarNotes", noteId));
  return snapshot.exists() ? mapFirestoreDocToBrokerNote(snapshot.id, snapshot.data() as FirestoreBrokerNoteReadDoc, brokerId) : null;
}

export function getMostFrequentCategoryColor(notes: BrokerNote[]): string {
  if (notes.length === 0) {
    return colors.surface;
  }

  const frequency: Record<NoteCategory, number> = {
    visit: 0,
    showing: 0,
    pickup: 0,
    owner_meeting: 0,
    keys: 0,
    message: 0,
    phone: 0,
    call: 0,
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
