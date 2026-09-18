import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type ContactRole = "client" | "owner";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new HttpsError("invalid-argument", `${field} is required.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function requestData(request: CallableRequest<unknown>): Record<string, unknown> {
  return request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
}

function isBroker(data: DocumentData): boolean {
  return data.is_broker === true || data.agencyRole === "ceo" || data.agencyRole === "secretary" || data.agencyRole === "secretariat" || data.role === "admin";
}

export const ensureBrokerClientRelationshipCallable = onCall({ region: "europe-west1" }, async (request) => {
  const actorId = request.auth?.uid;
  if (!actorId) throw new HttpsError("unauthenticated", "Authentication is required.");
  const data = requestData(request);
  const brokerId = requiredString(data.brokerId, "brokerId");
  const contactUserId = requiredString(data.contactUserId ?? data.clientId, "contactUserId");
  const contactRole = data.contactRole ?? data.role;
  if (contactRole !== "client" && contactRole !== "owner") throw new HttpsError("invalid-argument", "contactRole must be client or owner.");
  if (actorId !== brokerId && actorId !== contactUserId) throw new HttpsError("permission-denied", "Only the broker or contact can establish this relationship.");

  const [brokerSnapshot, contactSnapshot] = await Promise.all([
    db.doc(`users/${brokerId}`).get(),
    db.doc(`users/${contactUserId}`).get(),
  ]);
  if (!brokerSnapshot.exists || !isBroker(brokerSnapshot.data() ?? {})) throw new HttpsError("permission-denied", "The broker account is not valid.");
  const broker = brokerSnapshot.data() ?? {};
  const contact = contactSnapshot.data() ?? {};
  const agencyId = typeof broker.agencyId === "string" && broker.agencyId.trim() ? broker.agencyId.trim() : null;
  const apartmentId = optionalString(data.apartmentId);
  const apartmentTitle = optionalString(data.apartmentTitle);
  const chatRoomId = optionalString(data.chatRoomId);
  const appointmentId = optionalString(data.appointmentId);
  const listingId = optionalString(data.listingId) ?? apartmentId;
  if (apartmentId) {
    const apartmentSnapshot = await db.doc(`apartments/${apartmentId}`).get();
    if (!apartmentSnapshot.exists) throw new HttpsError("not-found", "Apartment not found.");
    const apartment = apartmentSnapshot.data() ?? {};
    const assignedBrokerIds = Array.isArray(apartment.assignedBrokerIds) ? apartment.assignedBrokerIds : [];
    if (apartment.hostId !== brokerId && apartment.ownerId !== brokerId && !assignedBrokerIds.includes(brokerId)) {
      throw new HttpsError("permission-denied", "The broker does not manage this apartment.");
    }
  }

  const existingLeads = await db.collection("leads").where("brokerId", "==", brokerId).where("clientId", "==", contactUserId).get();
  const activeLead = existingLeads.docs.find((lead) => lead.data().status === "active" || lead.data().status === "assigned");
  const leadRef = activeLead?.ref ?? db.doc(`leads/${brokerId}_${contactUserId}`);
  const profileRef = db.doc(`brokerClientProfiles/${brokerId}_${contactUserId}`);
  const displayName = optionalString(data.displayName) ?? (typeof contact.name === "string" && contact.name.trim() ? contact.name.trim() : "Πελάτης");
  const now = FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const [leadSnapshot, profileSnapshot] = await Promise.all([transaction.get(leadRef), transaction.get(profileRef)]);
    const leadData = leadSnapshot.data() ?? {};
    const profileData = profileSnapshot.data() ?? {};
    transaction.set(leadRef, {
      brokerId,
      agencyId,
      clientId: contactUserId,
      contactUserId,
      status: "active",
      assignedBrokerId: brokerId,
      ...(apartmentId ? { apartmentId } : {}),
      ...(apartmentTitle ? { apartmentTitle } : {}),
      source: typeof leadData.source === "string" ? leadData.source : "direct_contact",
      ...(leadSnapshot.exists ? {} : { createdAt: now }),
      updatedAt: now,
      lastContactTimestamp: now,
    }, { merge: true });
    transaction.set(profileRef, {
      brokerId,
      contactUserId,
      contactRole: contactRole as ContactRole,
      agencyId,
      displayName,
      clientId: contactUserId,
      clientUserId: contactUserId,
      clientName: displayName,
      role: contactRole,
      leadIds: FieldValue.arrayUnion(leadRef.id),
      activeLeadId: leadRef.id,
      ...(chatRoomId ? { chatRoomIds: FieldValue.arrayUnion(chatRoomId), chatRoomId } : {}),
      ...(appointmentId ? { appointmentIds: FieldValue.arrayUnion(appointmentId) } : {}),
      ...(listingId ? { listingIds: FieldValue.arrayUnion(listingId), apartmentIds: FieldValue.arrayUnion(listingId) } : {}),
      pipelineStage: typeof profileData.pipelineStage === "string" ? profileData.pipelineStage : "new_lead",
      ...(profileSnapshot.exists ? {} : { createdAt: now }),
      lastContactAt: now,
      updatedAt: now,
    }, { merge: true });
  });

  return { profileId: profileRef.id, leadId: leadRef.id, agencyId };
});