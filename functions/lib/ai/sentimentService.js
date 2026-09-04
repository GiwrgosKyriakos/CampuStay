"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeShowingFeedbackSentiment = analyzeShowingFeedbackSentiment;
const firestore_1 = require("firebase-admin/firestore");
const geminiClient_1 = require("./geminiClient");
function fallbackSentiment(message) {
    return {
        overallSentiment: "neutral",
        positivePoints: [message],
        frictionPoints: [],
        recurringPatterns: [],
        priceAdjustmentRecommendation: {
            suggestedReductionPercent: 0,
            justification: "Δεν υπάρχουν επαρκή αξιόπιστα δεδομένα για πρόταση προσαρμογής τιμής.",
        },
    };
}
function parseSentimentResult(text) {
    const fallback = fallbackSentiment("Η ανάλυση δεν επέστρεψε έγκυρη δομή δεδομένων.");
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        const parsed = JSON.parse(cleaned);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return fallback;
        const value = parsed;
        const overallSentiment = value.overallSentiment;
        const toStringList = (candidate, defaultValue) => Array.isArray(candidate)
            ? candidate.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 20)
            : defaultValue;
        const recurringPatterns = Array.isArray(value.recurringPatterns)
            ? value.recurringPatterns.map((entry) => {
                if (!entry || typeof entry !== "object")
                    return null;
                const pattern = entry;
                const issue = typeof pattern.issue === "string" ? pattern.issue.trim() : "";
                const frequencyPercentage = Number(pattern.frequencyPercentage);
                return issue && Number.isFinite(frequencyPercentage) ? { issue, frequencyPercentage: Math.min(100, Math.max(0, frequencyPercentage)) } : null;
            }).filter((entry) => entry !== null).slice(0, 20)
            : fallback.recurringPatterns;
        const recommendation = value.priceAdjustmentRecommendation && typeof value.priceAdjustmentRecommendation === "object"
            ? value.priceAdjustmentRecommendation
            : null;
        const suggestedReductionPercent = Number(recommendation?.suggestedReductionPercent);
        return {
            overallSentiment: overallSentiment === "positive" || overallSentiment === "negative" || overallSentiment === "neutral" ? overallSentiment : fallback.overallSentiment,
            positivePoints: toStringList(value.positivePoints, fallback.positivePoints),
            frictionPoints: toStringList(value.frictionPoints, fallback.frictionPoints),
            recurringPatterns,
            priceAdjustmentRecommendation: recommendation && typeof recommendation.justification === "string" && Number.isFinite(suggestedReductionPercent)
                ? { suggestedReductionPercent: Math.min(100, Math.max(0, suggestedReductionPercent)), justification: recommendation.justification.trim() || fallback.priceAdjustmentRecommendation.justification }
                : fallback.priceAdjustmentRecommendation,
        };
    }
    catch {
        return fallback;
    }
}
async function analyzeShowingFeedbackSentiment(apartmentId, usage) {
    let feedbackSnapshot;
    try {
        feedbackSnapshot = await (0, firestore_1.getFirestore)()
            .collection("post_visit_feedbacks")
            .where("apartmentId", "==", apartmentId)
            .limit(100)
            .get();
    }
    catch {
        return fallbackSentiment("Δεν ήταν δυνατή η ανάκτηση των σχολίων υποδείξεων.");
    }
    const rawFeedbacks = feedbackSnapshot.docs
        .map((document) => {
        const data = document.data();
        return String(data.feedback ?? data.comment ?? data.notes ?? "").trim();
    })
        .filter((text) => text.length > 0);
    if (rawFeedbacks.length === 0) {
        return fallbackSentiment("Δεν υπάρχουν ακόμα καταγεγραμμένα σχόλια υποδείξεων.");
    }
    const prompt = `
    Είσαι σύμβουλος ανάλυσης δεδομένων σε μεσιτικό γραφείο.
    Ανάλυσε τα παρακάτω ${rawFeedbacks.length} πραγματικά σχόλια πελατών μετά από υπόδειξη στο ακίνητο:
    ${JSON.stringify(rawFeedbacks)}

    Επίστρεψε αυστηρά JSON στα Ελληνικά με την εξής δομή:
    {
      "overallSentiment": "positive" | "neutral" | "negative",
      "positivePoints": ["σημείο 1", "σημείο 2"],
      "frictionPoints": ["πρόβλημα 1", "πρόβλημα 2"],
      "recurringPatterns": [{ "issue": "Σύντομος τίτλος προβλήματος", "frequencyPercentage": 50 }],
      "priceAdjustmentRecommendation": {
        "suggestedReductionPercent": 0,
        "justification": "Αιτιολόγηση πρότασης τιμής ή ενεργειών προς τον ιδιοκτήτη"
      }
    }
  `;
    try {
        const result = await (0, geminiClient_1.getGeminiModel)().generateContent(prompt);
        (0, geminiClient_1.recordGeminiUsage)(result, usage);
        return parseSentimentResult(result.response.text());
    }
    catch {
        return fallbackSentiment("Η υπηρεσία ανάλυσης δεν είναι διαθέσιμη αυτή τη στιγμή.");
    }
}
//# sourceMappingURL=sentimentService.js.map