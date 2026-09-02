import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

export type VisitAppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface VisitAppointment {
  id: string;
  chatRoomId: string;
  brokerId: string;
  clientId: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
  agencyId?: string;
  apartmentId: string;
  apartmentTitle: string;
  apartmentAddress: string;
  appointmentDate: string;
  status: VisitAppointmentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function getPublicApartmentAddress(data: {
  area?: unknown;
  city?: unknown;
  address?: unknown;
  exactAddress?: unknown;
  showExactAddress?: unknown;
}): string {
  const area = typeof data.area === "string" ? data.area.trim() : "";
  const city = typeof data.city === "string" ? data.city.trim() : "";
  const exactAddress = typeof data.exactAddress === "string" && data.exactAddress.trim()
    ? data.exactAddress.trim()
    : typeof data.address === "string" ? data.address.trim() : "";

  return data.showExactAddress === true && exactAddress
    ? exactAddress
    : [area, city].filter(Boolean).join(", ");
}

export async function createVisitAppointment(params: Omit<VisitAppointment, "id" | "createdAt" | "updatedAt" | "status"> & { status?: VisitAppointmentStatus }): Promise<string> {
  const appointmentRef = doc(collection(db, "appointments"));
  await setDoc(appointmentRef, {
    ...params,
    status: params.status ?? "confirmed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return appointmentRef.id;
}

export async function updateVisitAppointment(
  appointmentId: string,
  updates: Partial<Pick<VisitAppointment, "appointmentDate" | "apartmentAddress" | "status">>,
): Promise<void> {
  await updateDoc(doc(db, "appointments", appointmentId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function getVisitAppointment(appointmentId: string): Promise<VisitAppointment | null> {
  const snapshot = await getDoc(doc(db, "appointments", appointmentId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as VisitAppointment) : null;
}

export async function updateLinkedCalendarNotes(params: {
  appointmentId: string;
  appointmentDate: string;
  status?: VisitAppointmentStatus;
}): Promise<void> {
  const notesSnapshot = await getDocs(query(collectionGroup(db, "calendarNotes"), where("appointmentId", "==", params.appointmentId)));
  await Promise.all(notesSnapshot.docs.map((noteSnapshot) => updateDoc(noteSnapshot.ref, {
    ...(params.status === "cancelled" ? {} : {
      scheduledDate: params.appointmentDate.slice(0, 10),
      scheduledTime: params.appointmentDate.slice(11, 16),
      date: params.appointmentDate.slice(0, 10),
      time: params.appointmentDate.slice(11, 16),
      timestamp: new Date(params.appointmentDate).getTime(),
    }),
    ...(params.status ? { appointmentStatus: params.status, done: params.status === "completed" } : {}),
  })));
}
