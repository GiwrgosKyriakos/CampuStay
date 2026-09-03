"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeComparativeMarket = analyzeComparativeMarket;
exports.generateCmaReport = generateCmaReport;
const firestore_1 = require("firebase-admin/firestore");
const geminiClient_1 = require("./geminiClient");
function numberValue(value, fallback = 0) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function stringValue(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function parseJsonObject(text) {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        const parsed = JSON.parse(cleaned);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function buildFallback(input, comparables) {
    const prices = comparables.map((comparable) => comparable.pricePerSqm).filter((price) => price > 0);
    const averagePricePerSqm = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
    const sqm = numberValue(input.sqm);
    const targetPrice = numberValue(input.targetPrice);
    const optimal = targetPrice > 0 ? targetPrice : sqm > 0 ? Math.round(averagePricePerSqm * sqm) : 0;
    const spread = optimal > 0 ? Math.round(optimal * 0.08) : 0;
    const ratio = optimal > 0 && targetPrice > 0 ? targetPrice / optimal : 1;
    return {
        suggestedPriceRange: { min: Math.max(0, optimal - spread), max: optimal + spread, optimal },
        pricePerSqmEstimate: sqm > 0 && optimal > 0 ? Math.round(optimal / sqm * 100) / 100 : Math.round(averagePricePerSqm * 100) / 100,
        marketCompetitiveness: ratio > 1.12 ? "overpriced" : ratio > 1.03 ? "low" : ratio < 0.95 ? "high" : "fair",
        keyDifferentiators: [],
        marketInsightsSummary: comparables.length
            ? `Η εκτίμηση βασίζεται σε ${comparables.length} συγκρίσιμα ακίνητα της ίδιας ή κοντινής περιοχής.`
            : "Δεν υπάρχουν αρκετά συγκρίσιμα ακίνητα για ασφαλή εκτίμηση αγοράς.",
    };
}
function normalizeResult(value, fallback) {
    const range = value?.suggestedPriceRange && typeof value.suggestedPriceRange === "object" ? value.suggestedPriceRange : {};
    const min = Math.max(0, numberValue(range.min, fallback.suggestedPriceRange.min));
    const max = Math.max(min, numberValue(range.max, fallback.suggestedPriceRange.max));
    const optimal = Math.min(max, Math.max(min, numberValue(range.optimal, fallback.suggestedPriceRange.optimal)));
    const competitiveness = value?.marketCompetitiveness;
    const validCompetitiveness = competitiveness === "low" || competitiveness === "fair" || competitiveness === "high" || competitiveness === "overpriced";
    const differentiators = Array.isArray(value?.keyDifferentiators)
        ? value.keyDifferentiators.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 8)
        : fallback.keyDifferentiators;
    return {
        suggestedPriceRange: { min, max, optimal },
        pricePerSqmEstimate: Math.max(0, numberValue(value?.pricePerSqmEstimate, fallback.pricePerSqmEstimate)),
        marketCompetitiveness: validCompetitiveness ? competitiveness : fallback.marketCompetitiveness,
        keyDifferentiators: differentiators,
        marketInsightsSummary: stringValue(value?.marketInsightsSummary, fallback.marketInsightsSummary),
    };
}
async function loadCmaData(input) {
    const db = (0, firestore_1.getFirestore)();
    let apartmentData = {};
    try {
        apartmentData = (await db.doc(`apartments/${input.apartmentId}`).get()).data() ?? {};
    }
    catch {
        // Supplied attributes are sufficient for a qualified fallback response.
    }
    const storedArea = stringValue(apartmentData.area);
    const storedMunicipality = stringValue(apartmentData.municipality ?? apartmentData.city);
    const subject = {
        ...input,
        area: (input.area ?? storedArea ?? storedMunicipality) || undefined,
        sqm: (input.sqm ?? numberValue(apartmentData.sqm ?? apartmentData.size)) || undefined,
        rooms: (input.rooms ?? numberValue(apartmentData.rooms ?? apartmentData.bedrooms)) || undefined,
        floor: (input.floor ?? numberValue(apartmentData.floor)) || undefined,
        targetPrice: (input.targetPrice ?? numberValue(apartmentData.price ?? apartmentData.rent)) || undefined,
    };
    let listingSnapshot = null;
    try {
        const query = input.area || storedArea
            ? db.collection("apartments").where("area", "==", input.area ?? storedArea).limit(25)
            : storedMunicipality
                ? db.collection("apartments").where("municipality", "==", storedMunicipality).limit(25)
                : db.collection("apartments").limit(25);
        listingSnapshot = await query.get();
    }
    catch {
        // A missing or unavailable comparables query should not prevent a report.
    }
    const legacyComparables = [];
    const comparables = (listingSnapshot?.docs ?? []).filter((document) => document.id !== input.apartmentId).map((document) => {
        const data = document.data();
        const sqm = numberValue(data.sqm ?? data.size);
        const price = numberValue(data.price ?? data.rent);
        if (sqm <= 0 || price <= 0)
            return null;
        const comparable = {
            area: stringValue(data.area ?? subject.area, "Άγνωστη περιοχή"),
            sqm,
            rooms: numberValue(data.rooms ?? data.bedrooms),
            floor: numberValue(data.floor),
            price,
            pricePerSqm: price / sqm,
            condition: stringValue(data.condition ?? data.renovationState, "Δεν αναφέρεται"),
            address: stringValue(data.address ?? data.area, "Δεν αναφέρεται"),
        };
        legacyComparables.push({
            id: document.id,
            title: stringValue(data.title, "Συγκρίσιμο ακίνητο"),
            address: comparable.address,
            area: comparable.area,
            sqm,
            price,
            pricePerSqm: Math.round(comparable.pricePerSqm * 100) / 100,
            similarityScore: subject.sqm && subject.sqm > 0 ? Math.max(0, Math.round(100 - Math.abs(sqm - subject.sqm) / subject.sqm * 100)) : 70,
            soldOrListedDate: stringValue(data.updatedAt, new Date().toISOString().slice(0, 10)),
        });
        return comparable;
    }).filter((value) => value !== null).slice(0, 10);
    return { subject, comparables, legacyComparables };
}
async function analyzeComparativeMarket(input) {
    const normalizedInput = {
        apartmentId: stringValue(input?.apartmentId),
        targetPrice: numberValue(input?.targetPrice) || undefined,
        area: stringValue(input?.area) || undefined,
        sqm: numberValue(input?.sqm) || undefined,
        rooms: numberValue(input?.rooms) || undefined,
        floor: Number.isFinite(input?.floor) ? input.floor : undefined,
    };
    const { subject, comparables } = await loadCmaData(normalizedInput);
    const fallback = buildFallback(subject, comparables);
    const prompt = `Είσαι πιστοποιημένος αναλυτής αποτίμησης ακινήτων στην ελληνική αγορά.\nΑνάλυσε το ακίνητο-στόχο και τα συγκρίσιμα ακίνητα. Υπολόγισε προσαρμογές για τετραγωνικά, δωμάτια, όροφο, κατάσταση και τοπική θέση. Μην επινοήσεις δεδομένα.\n\nΑκίνητο-στόχος: ${JSON.stringify(subject)}\nΣυγκρίσιμα: ${JSON.stringify(comparables)}\n\nΕπίστρεψε αυστηρά έγκυρο JSON χωρίς markdown ή άλλο κείμενο, με ακριβώς αυτή τη δομή. Όλα τα κείμενα στα Ελληνικά (EL-GR):\n{"suggestedPriceRange":{"min":0,"max":0,"optimal":0},"pricePerSqmEstimate":0,"marketCompetitiveness":"low" | "fair" | "high" | "overpriced","keyDifferentiators":["..."],"marketInsightsSummary":"..."}`;
    try {
        const response = await (0, geminiClient_1.getGeminiModel)().generateContent(prompt);
        return normalizeResult(parseJsonObject(response.response.text()), fallback);
    }
    catch {
        return fallback;
    }
}
async function generateCmaReport(apartmentId) {
    const { subject, comparables, legacyComparables } = await loadCmaData({ apartmentId });
    const analysis = await analyzeComparativeMarket(subject);
    return {
        id: `cma-${apartmentId}`,
        apartmentId,
        estimatedPriceMin: Math.round(analysis.suggestedPriceRange.min),
        estimatedPriceMax: Math.round(analysis.suggestedPriceRange.max),
        recommendedListingPrice: Math.round(analysis.suggestedPriceRange.optimal),
        confidenceScore: comparables.length >= 3 ? 80 : comparables.length > 0 ? 60 : 20,
        pricePerSqmAverage: analysis.pricePerSqmEstimate,
        comparables: legacyComparables,
        marketTrendSummary: analysis.marketInsightsSummary,
        pricingAdvice: analysis.keyDifferentiators.join(" ") || "Χρησιμοποιήστε την προτεινόμενη τιμή ως αφετηρία και επανεκτιμήστε την απόδοση μετά τις πρώτες υποδείξεις.",
        createdAt: Date.now(),
    };
}
//# sourceMappingURL=cmaService.js.map