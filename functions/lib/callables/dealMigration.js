"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyDealsCallable = void 0;
exports.migrateProfileDeals = migrateProfileDeals;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const dealChecklist_1 = require("../lib/dealChecklist");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const MIGRATION_ROLES = new Set(["ceo", "secretary", "secretariat", "admin"]);
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0)
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    return value.trim();
}
function dataOf(request) {
    return request.data && typeof request.data === "object" ? request.data : {};
}
function roleOf(user) {
    return typeof user.agencyRole === "string" ? user.agencyRole : typeof user.role === "string" ? user.role : "";
}
function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
}
async function migrateProfileDeals(profileId, actorId, clientIdOverride, actorEmail) {
    const profileSnapshot = await db.doc(`brokerClientProfiles/${profileId}`).get();
    if (!profileSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Broker-client profile not found.");
    const profile = profileSnapshot.data() ?? {};
    const brokerId = stringValue(profile.brokerId);
    const legacyClientId = stringValue(profile.clientId || profile.clientUserId);
    const clientId = stringValue(clientIdOverride || profile.clientId || profile.clientUserId);
    if (!brokerId || !clientId)
        throw new https_1.HttpsError("failed-precondition", "Legacy profile is missing brokerId or clientId.");
    const actorSnapshot = await db.doc(`users/${actorId}`).get();
    const actor = actorSnapshot.data();
    const isProfileClient = actorId === clientId;
    if (!actorSnapshot.exists || (!isProfileClient && actor?.is_broker !== true && !MIGRATION_ROLES.has(roleOf(actor ?? {})))) {
        throw new https_1.HttpsError("permission-denied", "Only agency staff can migrate legacy deals.");
    }
    const profileAgencyId = stringValue(profile.agencyId);
    if (!isProfileClient && profileAgencyId && actor?.agencyId !== profileAgencyId)
        throw new https_1.HttpsError("permission-denied", "You cannot migrate this profile.");
    if (actor?.is_broker === true && actorId !== brokerId)
        throw new https_1.HttpsError("permission-denied", "Only the profile broker or Secretariat can migrate these deals.");
    if (isProfileClient && clientIdOverride && legacyClientId !== clientId) {
        const legacyClientSnapshot = await db.doc(`users/${legacyClientId}`).get();
        const pendingClaimEmail = stringValue(legacyClientSnapshot.data()?.pendingClaimEmail).toLowerCase();
        if (!legacyClientSnapshot.exists || !pendingClaimEmail || pendingClaimEmail !== stringValue(actorEmail).toLowerCase()) {
            throw new https_1.HttpsError("permission-denied", "This profile is not linked to the authenticated account.");
        }
    }
    const legacySnapshot = await db.collection(`brokerClientProfiles/${profileId}/deals`).get();
    let migrated = 0;
    let skipped = 0;
    for (const legacyDocument of legacySnapshot.docs) {
        const legacy = legacyDocument.data();
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
            ...(current.createdAt ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
            migratedFrom: `brokerClientProfiles/${profileId}/deals/${legacyDocument.id}`,
            migratedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        await (0, dealChecklist_1.seedDealChecklist)(dealId);
        migrated += 1;
    }
    return { migrated, skipped };
}
exports.migrateLegacyDealsCallable = (0, https_1.onCall)(async (request) => {
    const actorId = request.auth?.uid;
    if (!actorId)
        throw new https_1.HttpsError("unauthenticated", "Authentication is required.");
    const data = dataOf(request);
    const profileId = requiredString(data.profileId, "profileId");
    const clientId = typeof data.clientId === "string" ? data.clientId.trim() : undefined;
    if (clientId && clientId !== actorId)
        throw new https_1.HttpsError("permission-denied", "The migration clientId must match the authenticated user.");
    const actorEmail = typeof request.auth?.token.email === "string" ? request.auth.token.email : undefined;
    return { profileId, ...(await migrateProfileDeals(profileId, actorId, clientId, actorEmail)) };
});
//# sourceMappingURL=dealMigration.js.map