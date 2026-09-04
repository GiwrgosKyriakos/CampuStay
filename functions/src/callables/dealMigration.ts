import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { seedDealChecklist } from "../lib/dealChecklist";

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const MIGRATION_ROLES = new Set(["ceo", "secretary", "secretariat", "admin"]);

type UserData = { agencyId?: unknown; agencyRole?: unknown; role?: unknown; is_broker?: unknown; pendingClaimEmail?: unknown };

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new HttpsError("invalid-argument", `${field} is required.`);
  return value.trim();
}

function dataOf(request: CallableRequest<unknown>): Record<string, unknown> {
  return request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
}

function roleOf(user: UserData): string {
  return typeof user.agencyRole === "string" ? user.agencyRole : typeof user.role === "string" ? user.role : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function migrateProfileDeals(profileId: string, actorId: string, clientIdOverride?: string, actorEmail?: string): Promise<{ migrated: number; skipped: number }> {
  const profileSnapshot = await db.doc(`brokerClientProfiles/${profileId}`).get();
  if (!profileSnapshot.exists) throw new HttpsError("not-found", "Broker-client profile not found.");
  const profile = profileSnapshot.data() ?? {};
  const brokerId = stringValue(profile.brokerId);
  const legacyClientId = stringValue(profile.clientId || profile.clientUserId);
  const clientId = stringValue(clientIdOverride || profile.clientId || profile.clientUserId);
  if (!brokerId || !clientId) throw new HttpsError("failed-precondition", "Legacy profile is missing brokerId or clientId.");

  const actorSnapshot = await db.doc(`users/${actorId}`).get();
  const actor = actorSnapshot.data() as UserData | undefined;
  const isProfileClient = actorId === clientId;
  if (!actorSnapshot.exists || (!isProfileClient && actor?.is_broker !== true && !MIGRATION_ROLES.has(roleOf(actor ?? {})))) {
    throw new HttpsError("permission-denied", "Only agency staff can migrate legacy deals.");
  }
  const profileAgencyId = stringValue(profile.agencyId);
  if (!isProfileClient && profileAgencyId && actor?.agencyId !== profileAgencyId) throw new HttpsError("permission-denied", "You cannot migrate this profile.");
  if (actor?.is_broker === true && actorId !== brokerId) throw new HttpsError("permission-denied", "Only the profile broker or Secretariat can migrate these deals.");
  if (isProfileClient && clientIdOverride && legacyClientId !== clientId) {
    const legacyClientSnapshot = await db.doc(`users/${legacyClientId}`).get();
    const pendingClaimEmail = stringValue(legacyClientSnapshot.data()?.pendingClaimEmail).toLowerCase();
    if (!legacyClientSnapshot.exists || !pendingClaimEmail || pendingClaimEmail !== stringValue(actorEmail).toLowerCase()) {
      throw new HttpsError("permission-denied", "This profile is not linked to the authenticated account.");
    }
  }

  const legacySnapshot = await db.collection(`brokerClientProfiles/${profileId}/deals`).get();
  let migrated = 0;
  let skipped = 0;
  for (const legacyDocument of legacySnapshot.docs) {
    const legacy = legacyDocument.data() as DocumentData;
    const apartmentId = stringValue(legacy.apartmentId || legacy.listingId || legacyDocument.id);
    if (!apartmentId) {
      skipped += 1;
      continue;
    }
    const dealId = `${apartmentId}_${clientId}`;
    const dealRef = db.doc(`deals/${dealId}`);
    const currentSnapshot = await dealRef.get();
    const current = currentSnapshot.data() ?? {};
    const legacyStage = typeof legacy.stage === "number" ? legacy.stage : typeof legacy.stagePercent === "number" ? legacy.stagePercent : undefined;
    await dealRef.set({
      apartmentId,
      apartmentTitle: stringValue(legacy.apartmentTitle || legacy.title) || current.apartmentTitle || "Ακίνητο",
      clientId,
      agencyId: stringValue(legacy.agencyId || profile.agencyId) || current.agencyId,
      listingBrokerId: stringValue(legacy.listingBrokerId || current.listingBrokerId || brokerId),
      buyerBrokerId: stringValue(legacy.buyerBrokerId || current.buyerBrokerId || brokerId),
      ...(stringValue(legacy.ownerId || legacy.hostId || current.ownerId) ? { ownerId: stringValue(legacy.ownerId || legacy.hostId || current.ownerId) } : {}),
      ...(typeof legacy.dealAmount === "number" ? { dealAmount: legacy.dealAmount } : {}),
      ...(typeof legacyStage === "number" && typeof current.stage !== "number" ? { stage: Math.max(0, Math.min(89, legacyStage)) } : {}),
      status: current.status || "active",
      commissionTotal: typeof current.commissionTotal === "number" ? current.commissionTotal : Number(legacy.commission || 0),
      agencyCutPercentage: typeof current.agencyCutPercentage === "number" ? current.agencyCutPercentage : 50,
      agencyCutAmount: typeof current.agencyCutAmount === "number" ? current.agencyCutAmount : 0,
      brokerSplits: Array.isArray(current.brokerSplits) ? current.brokerSplits : [],
      ...(current.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
      migratedFrom: `brokerClientProfiles/${profileId}/deals/${legacyDocument.id}`,
      migratedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await seedDealChecklist(dealId);
    migrated += 1;
  }
  return { migrated, skipped };
}

export const migrateLegacyDealsCallable = onCall(async (request) => {
  const actorId = request.auth?.uid;
  if (!actorId) throw new HttpsError("unauthenticated", "Authentication is required.");
  const data = dataOf(request);
  const profileId = requiredString(data.profileId, "profileId");
  const clientId = typeof data.clientId === "string" ? data.clientId.trim() : undefined;
  if (clientId && clientId !== actorId) throw new HttpsError("permission-denied", "The migration clientId must match the authenticated user.");
  const actorEmail = typeof request.auth?.token.email === "string" ? request.auth.token.email : undefined;
  return { profileId, ...(await migrateProfileDeals(profileId, actorId, clientId, actorEmail)) };
});

export { migrateProfileDeals };
