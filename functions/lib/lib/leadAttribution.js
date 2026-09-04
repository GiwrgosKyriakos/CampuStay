"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLeadSource = normalizeLeadSource;
exports.getLeadSource = getLeadSource;
exports.resolveLeadId = resolveLeadId;
const firestore_1 = require("firebase-admin/firestore");
const STANDARD_LEAD_SOURCES = new Set(["spitogatos", "xe_gr", "meta_ads", "google_ads", "agency_website", "referral", "walk_in", "signboard", "other"]);
function normalizeLeadSource(value) {
    const source = typeof value === "string" ? value.trim().toLowerCase().replace(/[ -]/g, "_") : "";
    const legacyMap = { xe: "xe_gr", social_ads: "meta_ads", meta_ad: "meta_ads", google: "google_ads", website: "agency_website", open_house: "other", openhouse: "other", yard_sign: "signboard" };
    const normalized = legacyMap[source] ?? source;
    return STANDARD_LEAD_SOURCES.has(normalized) ? normalized : "other";
}
async function getLeadSource(leadId) {
    const snapshot = await (0, firestore_1.getFirestore)().doc(`leads/${leadId}`).get();
    return normalizeLeadSource(snapshot.data()?.source ?? snapshot.data()?.leadSource);
}
async function resolveLeadId(input) {
    const leads = (0, firestore_1.getFirestore)().collection("leads");
    if (typeof input.explicitLeadId === "string" && input.explicitLeadId.trim()) {
        const leadSnapshot = await leads.doc(input.explicitLeadId.trim()).get();
        const lead = leadSnapshot.data() ?? {};
        return leadSnapshot.exists
            && lead.agencyId === input.agencyId
            && lead.apartmentId === input.apartmentId
            && lead.clientId === input.clientId
            ? leadSnapshot.id
            : "";
    }
    const snapshot = await leads.where("agencyId", "==", input.agencyId).get();
    const matches = snapshot.docs.filter((document) => {
        const lead = document.data();
        return lead.apartmentId === input.apartmentId && lead.clientId === input.clientId;
    });
    return matches.length === 1 ? matches[0].id : "";
}
//# sourceMappingURL=leadAttribution.js.map