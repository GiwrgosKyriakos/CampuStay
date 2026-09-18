import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { updateBrokerNote, type BrokerNote } from "@/src/api/brokerCalendar";

export interface PostVisitFeedbackInput {
  note: BrokerNote;
  loggedByUserId: string;
  isClient: boolean;
  clientName: string;
  clientPriceScore?: number;
  clientLayoutScore?: number;
  clientConditionScore?: number;
  selectedTags?: string[];
  clientNotes?: string;
  secondVisitInterest?: "yes" | "no" | "maybe";
  brokerAssessmentNotes?: string;
  hasOralOffer?: boolean;
  oralOfferAmount?: number | null;
  followUpIntent?: string;
  submittedByCoveringBrokerId?: string;
}

export async function markShowingFeedbackSubmitted(appointmentId: string): Promise<void> {
  const callable = httpsCallable<{ appointmentId: string }, { appointmentId: string; submittedBy: string }>(firebaseFunctions, "recordShowingFeedbackCallable");
  await callable({ appointmentId });
}

export async function savePostVisitFeedback(input: PostVisitFeedbackInput): Promise<string> {
  const apartmentId = input.note.apartmentId;
  if (!apartmentId) throw new Error("Δεν βρέθηκε διαμέρισμα για την επίσκεψη.");
  const clientId = input.note.clientId ?? (input.isClient ? input.loggedByUserId : "");
  const brokerId = input.note.brokerId;
  const interactionBrokerId = input.loggedByUserId.trim();
  if (!input.isClient && (!interactionBrokerId || !brokerId || brokerId !== interactionBrokerId)) {
    throw new Error("Interaction logs must be authored by the submitting broker.");
  }
  const scores = [input.clientPriceScore, input.clientLayoutScore, input.clientConditionScore];
  const averageScore = scores.every((score) => typeof score === "number")
    ? scores.reduce((sum, score) => sum + (score ?? 0), 0) / 3
    : null;

  const interactionRef = doc(collection(db, "apartments", apartmentId, "interactions"));
  if (!input.isClient) {
    const assignedBrokerIds = Array.from(new Set([
      interactionBrokerId,
      input.note.brokerId,
      input.note.listingBrokerId,
      input.note.buyerBrokerId,
    ].filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
    await setDoc(interactionRef, {
      apartmentId,
      apartmentTitle: input.note.apartmentTitle ?? "Διαμέρισμα",
      clientId,
      clientName: input.clientName,
      brokerId: interactionBrokerId,
      assignedBrokerIds,
      type: "showing",
      note: input.brokerAssessmentNotes ?? "",
      loggedByUserId: interactionBrokerId,
      createdAt: serverTimestamp(),
      scheduledDate: input.note.scheduledDate ?? input.note.date,
      scheduledTime: input.note.scheduledTime ?? input.note.time,
      isVisitCompleted: true,
      ratings: null,
      selectedFeedbackTags: [],
      clientNotes: "",
      secondVisitInterest: null,
      brokerAssessmentNotes: input.brokerAssessmentNotes ?? "",
      hasOralOffer: input.hasOralOffer === true,
      oralOfferAmount: input.hasOralOffer ? input.oralOfferAmount ?? null : null,
      followUpIntent: input.followUpIntent ?? null,
      submittedByCoveringBrokerId: input.submittedByCoveringBrokerId ?? null,
    });
  }

  await setDoc(doc(db, "post_visit_feedbacks", interactionRef.id), {
    apartmentId,
    apartmentTitle: input.note.apartmentTitle ?? "Διαμέρισμα",
    clientId,
    clientName: input.clientName,
    brokerId,
    loggedByUserId: input.loggedByUserId,
    feedback: input.isClient ? input.clientNotes ?? "" : input.brokerAssessmentNotes ?? "",
    comment: input.isClient ? input.clientNotes ?? "" : input.brokerAssessmentNotes ?? "",
    selectedFeedbackTags: input.isClient ? input.selectedTags ?? [] : [],
    rating: averageScore,
    createdAt: serverTimestamp(),
    sourceInteractionId: input.isClient ? null : interactionRef.id,
  });

  if (clientId) {
    const brokerIds = new Set([brokerId, input.note.listingBrokerId, input.note.buyerBrokerId].filter((id): id is string => typeof id === "string" && id.length > 0));
    await Promise.all([...brokerIds].map((targetBrokerId) => setDoc(doc(db, "brokerClientProfiles", `${targetBrokerId}_${clientId}`), {
      brokerId: targetBrokerId,
      clientId,
      clientUserId: clientId,
      role: "client",
      lastShowingFeedback: {
        interactionId: interactionRef.id,
        apartmentId,
        loggedByUserId: input.loggedByUserId,
        createdAt: serverTimestamp(),
        submittedByCoveringBrokerId: input.submittedByCoveringBrokerId ?? null,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true })));
  }

  const submittedBy = { ...(input.note.feedbackSubmittedBy ?? {}), [input.loggedByUserId]: true };
  if (input.note.appointmentId) {
    await markShowingFeedbackSubmitted(input.note.appointmentId);
  } else {
    await updateBrokerNote(input.note.calendarOwnerId ?? input.note.brokerId, input.note.id, {
      feedbackSubmittedBy: submittedBy,
      ...(input.submittedByCoveringBrokerId ? { submittedByCoveringBrokerId: input.submittedByCoveringBrokerId } : {}),
    });
    if (input.note.primaryBrokerId && input.note.primaryNoteId && input.note.primaryBrokerId !== input.note.calendarOwnerId) {
      await updateBrokerNote(input.note.primaryBrokerId, input.note.primaryNoteId, {
        feedbackSubmittedBy: { ...(input.note.feedbackSubmittedBy ?? {}), [input.loggedByUserId]: true },
        ...(input.submittedByCoveringBrokerId ? { submittedByCoveringBrokerId: input.submittedByCoveringBrokerId } : {}),
      });
    }
  }
  return interactionRef.id;
}