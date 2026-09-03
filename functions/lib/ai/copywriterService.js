"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePropertyListingCopy = generatePropertyListingCopy;
exports.generateListingCopywriting = generateListingCopywriting;
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
function normalizeInput(input) {
    return {
        apartmentId: stringValue(input?.apartmentId) || undefined,
        title: stringValue(input?.title, "Ακίνητο προς αξιοποίηση"),
        area: stringValue(input?.area, "Ελλάδα"),
        sqm: Math.max(0, numberValue(input?.sqm)),
        bedrooms: Math.max(0, numberValue(input?.bedrooms)),
        price: Math.max(0, numberValue(input?.price)),
        features: Array.isArray(input?.features)
            ? input.features.filter((feature) => typeof feature === "string" && feature.trim().length > 0).map((feature) => feature.trim()).slice(0, 20)
            : [],
        tone: input?.tone === "luxury" || input?.tone === "student_friendly" ? input.tone : "professional",
    };
}
function fallbackCopy(input) {
    const featureText = input.features.length ? input.features.join(", ") : "άνετους και λειτουργικούς χώρους";
    const priceText = input.price > 0 ? `€${input.price.toLocaleString("el-GR")}` : "κατόπιν επικοινωνίας";
    const tonePrefix = input.tone === "luxury" ? "Εκλεπτυσμένη κατοικία" : input.tone === "student_friendly" ? "Ιδανική επιλογή για φοιτητές" : "Επαγγελματική πρόταση κατοικίας";
    return {
        portalTitle: `${input.title} στην περιοχή ${input.area}`.slice(0, 70),
        portalDescription: `${tonePrefix} με ${input.sqm || "άνετους"} τ.μ. και ${input.bedrooms} υπνοδωμάτια στην ${input.area}. Διαθέτει ${featureText}. Τιμή: ${priceText}. Επικοινωνήστε για περισσότερες πληροφορίες και προγραμματισμό επίσκεψης.`,
        socialCaption: `${input.title} | ${input.area} | ${input.sqm || "άνετοι χώροι"} τ.μ. | ${priceText}. ${featureText}.`,
        bulletHighlights: [input.sqm > 0 ? `${input.sqm} τ.μ.` : "Λειτουργική επιφάνεια", `${input.bedrooms} υπνοδωμάτια`, ...input.features.slice(0, 4)],
        seoTags: ["ακίνητο", input.area, "διαμέρισμα", `${input.bedrooms} υπνοδωμάτια`].filter(Boolean),
    };
}
function normalizeResult(value, fallback) {
    const text = (candidate, defaultValue) => stringValue(candidate, defaultValue);
    const list = (candidate, defaultValue) => Array.isArray(candidate)
        ? candidate.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 20)
        : defaultValue;
    return {
        portalTitle: text(value?.portalTitle, fallback.portalTitle).slice(0, 100),
        portalDescription: text(value?.portalDescription, fallback.portalDescription),
        socialCaption: text(value?.socialCaption, fallback.socialCaption),
        bulletHighlights: list(value?.bulletHighlights, fallback.bulletHighlights),
        seoTags: list(value?.seoTags, fallback.seoTags),
    };
}
async function generatePropertyListingCopy(input) {
    const normalizedInput = normalizeInput(input);
    const fallback = fallbackCopy(normalizedInput);
    const prompt = `Είσαι επαγγελματίας copywriter για ελληνικό μεσιτικό CRM. Δημιούργησε ακριβές marketing copy για αγγελία σε Spitogatos, Xe και social media. Χρησιμοποίησε μόνο τα στοιχεία που δίνονται, χωρίς επινοημένες παροχές, αποστάσεις, ενεργειακή κλάση ή κατάσταση ανακαίνισης. Τήρησε τον τόνο: ${normalizedInput.tone}.\n\nΣτοιχεία ακινήτου: ${JSON.stringify(normalizedInput)}\n\nΕπίστρεψε αυστηρά έγκυρο JSON χωρίς markdown ή άλλο κείμενο, με ακριβώς αυτή τη δομή. Όλα τα κείμενα στα Ελληνικά (EL-GR):\n{"portalTitle":"Σύντομος τίτλος","portalDescription":"Ακριβής περιγραφή αγγελίας","socialCaption":"Σύντομη λεζάντα","bulletHighlights":["Βασικό χαρακτηριστικό"],"seoTags":["λέξη-κλειδί"]}`;
    try {
        const response = await (0, geminiClient_1.getGeminiModel)().generateContent(prompt);
        return normalizeResult(parseJsonObject(response.response.text()), fallback);
    }
    catch {
        return fallback;
    }
}
async function generateListingCopywriting(specs, tone) {
    const normalizedTone = tone === "luxury" ? "luxury" : tone === "student_friendly" ? "student_friendly" : "professional";
    const result = await generatePropertyListingCopy({
        title: specs.title ?? "Ακίνητο",
        area: specs.area ?? "Ελλάδα",
        sqm: numberValue(specs.sqm),
        bedrooms: numberValue(specs.rooms),
        price: numberValue(specs.price),
        features: specs.amenities ?? [],
        tone: normalizedTone,
    });
    return [{ tone: normalizedTone === "student_friendly" ? "professional" : normalizedTone, headline: result.portalTitle, description: result.portalDescription, keyHighlights: result.bulletHighlights, socialMediaSnippet: result.socialCaption }];
}
exports.default = generatePropertyListingCopy;
//# sourceMappingURL=copywriterService.js.map