import {
  collection,
  collectionGroup,
  deleteDoc,
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
import { resolveClientDisplayName } from "@/src/api/brokerCalendar";

export type VisitAppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "reschedule_proposed"
  | "superseded_pending"
  | "superseded_final"
  | "reschedule_rejected";

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
  clientName?: string;
  notes?: string;
  status: VisitAppointmentStatus;
  previousVisitId?: string;
  previousAppointmentDate?: string;
  proposedBy?: string;
  proposedAt?: unknown;
  feedbackStatus?: "eligible" | "suppressed_rescheduled";
  feedbackPromptSent?: boolean;
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
  const resolvedClientName = await resolveClientDisplayName(params.clientId, params.clientName);
  await setDoc(appointmentRef, {
    ...params,
    ...(resolvedClientName || params.clientId ? { clientName: resolvedClientName || "Πελάτης" } : {}),
    status: params.status ?? "confirmed",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return appointmentRef.id;
}

export async function updateVisitAppointment(
  appointmentId: string,
  updates: Partial<Pick<VisitAppointment, "appointmentDate" | "apartmentAddress" | "notes" | "status" | "feedbackStatus" | "feedbackPromptSent">>,
): Promise<void> {
  await updateDoc(doc(db, "appointments", appointmentId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export interface VisitRescheduleRevision {
  previousVisit: VisitAppointment;
  proposedVisitId: string;
}

export async function proposeVisitReschedule(params: {
  previousVisitId: string;
  proposedBy: string;
  appointmentDate: string;
}): Promise<VisitRescheduleRevision> {
  const previousVisit = await getVisitAppointment(params.previousVisitId);
  if (!previousVisit) throw new Error("The appointment being rescheduled was not found.");
  if (previousVisit.status !== "confirmed") throw new Error("Only confirmed appointments can be rescheduled.");
  if (params.proposedBy !== previousVisit.brokerId && params.proposedBy !== previousVisit.clientId) throw new Error("Only appointment participants can propose a reschedule.");

  const proposedRef = doc(collection(db, "appointments"));
  await setDoc(proposedRef, {
    chatRoomId: previousVisit.chatRoomId,
    brokerId: previousVisit.brokerId,
    clientId: previousVisit.clientId,
    ...(previousVisit.clientName ? { clientName: previousVisit.clientName } : {}),
    ...(previousVisit.listingBrokerId ? { listingBrokerId: previousVisit.listingBrokerId } : {}),
    ...(previousVisit.buyerBrokerId ? { buyerBrokerId: previousVisit.buyerBrokerId } : {}),
    ...(previousVisit.coveringBrokerId ? { coveringBrokerId: previousVisit.coveringBrokerId } : {}),
    ...(previousVisit.agencyId ? { agencyId: previousVisit.agencyId } : {}),
    apartmentId: previousVisit.apartmentId,
    apartmentTitle: previousVisit.apartmentTitle,
    apartmentAddress: previousVisit.apartmentAddress,
    appointmentDate: params.appointmentDate,
    ...(previousVisit.notes ? { notes: previousVisit.notes } : {}),
    previousVisitId: params.previousVisitId,
    previousAppointmentDate: previousVisit.appointmentDate,
    proposedBy: params.proposedBy,
    proposedAt: serverTimestamp(),
    status: "reschedule_proposed",
    feedbackStatus: "eligible",
    feedbackPromptSent: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateVisitAppointment(params.previousVisitId, {
    status: "superseded_pending",
    feedbackStatus: "suppressed_rescheduled",
    feedbackPromptSent: true,
  });
  await updateLinkedCalendarNotes({
    appointmentId: params.previousVisitId,
    appointmentDate: previousVisit.appointmentDate,
    status: "superseded_pending",
    feedbackStatus: "suppressed_rescheduled",
  });
  return { previousVisit, proposedVisitId: proposedRef.id };
}

export async function acceptVisitReschedule(params: { proposedVisitId: string; actorId: string }): Promise<{ proposedVisit: VisitAppointment; previousVisit: VisitAppointment }> {
  const proposedVisit = await getVisitAppointment(params.proposedVisitId);
  if (!proposedVisit?.previousVisitId) throw new Error("The reschedule proposal is invalid.");
  if (proposedVisit.status !== "reschedule_proposed") throw new Error("The reschedule proposal is no longer pending.");
  if (proposedVisit.proposedBy === params.actorId) throw new Error("The proposer cannot accept their own reschedule.");
  if (params.actorId !== proposedVisit.brokerId && params.actorId !== proposedVisit.clientId) throw new Error("Only appointment participants can accept a reschedule.");
  const previousVisit = await getVisitAppointment(proposedVisit.previousVisitId);
  if (!previousVisit) throw new Error("The original appointment was not found.");

  await updateVisitAppointment(proposedVisit.id, { status: "confirmed" });
  await updateVisitAppointment(previousVisit.id, {
    status: "superseded_final",
    feedbackStatus: "suppressed_rescheduled",
    feedbackPromptSent: true,
  });
  await updateLinkedCalendarNotes({ appointmentId: previousVisit.id, appointmentDate: previousVisit.appointmentDate, status: "superseded_final", feedbackStatus: "suppressed_rescheduled" });
  await updateLinkedCalendarNotes({ appointmentId: proposedVisit.id, appointmentDate: proposedVisit.appointmentDate, status: "confirmed", feedbackStatus: "eligible" });
  return { proposedVisit, previousVisit };
}

export async function rejectVisitReschedule(params: { proposedVisitId: string; actorId: string }): Promise<{ proposedVisit: VisitAppointment; previousVisit: VisitAppointment }> {
  const proposedVisit = await getVisitAppointment(params.proposedVisitId);
  if (!proposedVisit?.previousVisitId) throw new Error("The reschedule proposal is invalid.");
  if (proposedVisit.status !== "reschedule_proposed") throw new Error("The reschedule proposal is no longer pending.");
  if (proposedVisit.proposedBy === params.actorId) throw new Error("The proposer cannot reject their own reschedule.");
  if (params.actorId !== proposedVisit.brokerId && params.actorId !== proposedVisit.clientId) throw new Error("Only appointment participants can reject a reschedule.");
  const previousVisit = await getVisitAppointment(proposedVisit.previousVisitId);
  if (!previousVisit) throw new Error("The original appointment was not found.");

  await updateVisitAppointment(proposedVisit.id, { status: "reschedule_rejected", feedbackStatus: "suppressed_rescheduled", feedbackPromptSent: true });
  await updateVisitAppointment(previousVisit.id, { status: "confirmed", feedbackStatus: "eligible", feedbackPromptSent: false });
  await updateLinkedCalendarNotes({ appointmentId: proposedVisit.id, appointmentDate: proposedVisit.appointmentDate, status: "reschedule_rejected", feedbackStatus: "suppressed_rescheduled" });
  await updateLinkedCalendarNotes({ appointmentId: previousVisit.id, appointmentDate: previousVisit.appointmentDate, status: "confirmed", feedbackStatus: "eligible" });
  return { proposedVisit, previousVisit };
}

export async function getVisitAppointment(appointmentId: string): Promise<VisitAppointment | null> {
  const snapshot = await getDoc(doc(db, "appointments", appointmentId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as VisitAppointment) : null;
}

export async function updateLinkedCalendarNotes(params: {
  appointmentId: string;
  appointmentDate: string;
  status?: VisitAppointmentStatus;
  feedbackStatus?: "eligible" | "suppressed_rescheduled";
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
    ...(params.status ? { appointmentStatus: params.status, done: params.status !== "confirmed", isCompleted: params.status !== "confirmed" } : {}),
    ...(params.feedbackStatus ? { feedbackStatus: params.feedbackStatus, feedbackPromptSent: params.feedbackStatus === "suppressed_rescheduled" } : {}),
  })));
}

export async function deleteLinkedCalendarNotes(appointmentId: string): Promise<void> {
  const notesSnapshot = await getDocs(query(collectionGroup(db, "calendarNotes"), where("appointmentId", "==", appointmentId)));
  await Promise.all(notesSnapshot.docs.map((noteSnapshot) => deleteDoc(noteSnapshot.ref)));
}
