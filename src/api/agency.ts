import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

export async function notifyCeoOfNewApplicant(
  agencyId: string,
  applicantName: string,
  applicantEmail: string,
): Promise<void> {
  const agencySnap = await getDoc(doc(db, "agencies", agencyId));
  if (!agencySnap.exists()) return;
  const { ceoId } = agencySnap.data() as { ceoId?: string };
  if (!ceoId) return;

  await addDoc(collection(db, "users", ceoId, "notifications"), {
    type: "agency_join_request",
    title: "Νέα Αίτηση Μεσίτη",
    body: `Ο μεσίτης ${applicantName} (${applicantEmail}) ζήτησε να ενταχθεί στο γραφείο σας.`,
    createdAt: serverTimestamp(),
    isRead: false,
    data: { agencyId },
  });
}

export async function approveAgencyBroker(agencyId: string, brokerId: string): Promise<void> {
  const applicantSnapshot = await getDoc(doc(db, "users", brokerId));
  const isSecretary = applicantSnapshot.exists() && applicantSnapshot.data().agencyRole === "secretary";
  await updateDoc(doc(db, "users", brokerId), {
    agencyStatus: "approved",
    agencyJoinedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "agencies", agencyId), {
    activeBrokerIds: arrayUnion(brokerId),
    pendingBrokerIds: arrayRemove(brokerId),
    ...(isSecretary ? { pendingSecretaryIds: arrayRemove(brokerId) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectAgencyBroker(agencyId: string, brokerId: string): Promise<void> {
  const applicantSnapshot = await getDoc(doc(db, "users", brokerId));
  const isSecretary = applicantSnapshot.exists() && applicantSnapshot.data().agencyRole === "secretary";
  await updateDoc(doc(db, "users", brokerId), {
    agencyStatus: "none",
    agencyId: null,
    agencyRole: null,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "agencies", agencyId), {
    pendingBrokerIds: arrayRemove(brokerId),
    ...(isSecretary ? { pendingSecretaryIds: arrayRemove(brokerId) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function updateAgencyPasscode(agencyId: string, newPasscode: string, ceoEmail: string): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId), { passcode: newPasscode, updatedAt: serverTimestamp() });
  await addDoc(collection(db, "agency_email_logs"), {
    agencyId,
    recipient: ceoEmail,
    type: "agency_passcode_changed",
    createdAt: serverTimestamp(),
  });
}