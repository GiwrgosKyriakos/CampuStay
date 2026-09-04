"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOwnerPerformanceReport = generateOwnerPerformanceReport;
exports.persistOwnerReport = persistOwnerReport;
exports.buildOwnerActivityPdfReport = buildOwnerActivityPdfReport;
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
function feedbackSentiment(data) {
    const explicit = stringValue(data.sentiment ?? data.overallSentiment).toLowerCase();
    if (["positive", "θετικό", "θετικη", "θετική"].includes(explicit))
        return "positive";
    if (["negative", "αρνητικό", "αρνητικη", "αρνητική"].includes(explicit))
        return "negative";
    const rating = numberValue(data.rating);
    return rating >= 4 ? "positive" : rating > 0 && rating <= 2 ? "negative" : "neutral";
}
function isWithinRange(data, startTime) {
    const dateValue = data.createdAt ?? data.updatedAt ?? data.visitDate ?? data.timestamp;
    if (!dateValue)
        return true;
    const candidate = dateValue && typeof dateValue === "object" && "toMillis" in dateValue && typeof dateValue.toMillis === "function"
        ? numberValue(dateValue.toMillis())
        : typeof dateValue === "object" && "seconds" in dateValue ? numberValue(dateValue.seconds) * 1000 : new Date(String(dateValue)).getTime();
    return !Number.isFinite(candidate) || candidate >= startTime;
}
function fallbackReport(days, totalVisits, feedback, totalInquiries, totalViews) {
    const positiveSignalsCount = feedback.filter((entry) => entry.sentiment === "positive").length;
    const concernsCount = feedback.filter((entry) => entry.sentiment === "negative").length;
    return {
        reportPeriod: `Τελευταίες ${days} ημέρες`,
        executiveSummary: totalVisits > 0
            ? `Καταγράφηκαν ${totalVisits} υποδείξεις και ${totalInquiries} ερωτήματα για το ακίνητο. Η εικόνα βασίζεται στα διαθέσιμα στοιχεία της περιόδου.`
            : "Δεν καταγράφηκαν υποδείξεις στην επιλεγμένη περίοδο. Τα συμπεράσματα είναι περιορισμένα λόγω ανεπαρκών δεδομένων.",
        showingMetrics: { totalVisits, positiveSignalsCount, concernsCount },
        totalViews,
        totalInquiries,
        averageRating: feedback.filter((entry) => entry.rating !== undefined).reduce((sum, entry, _index, entries) => sum + (entry.rating ?? 0) / entries.length, 0),
        buyerFeedbackThemes: [],
        strategicRecommendations: totalVisits > 0 ? ["Συνεχίστε την παρακολούθηση των υποδείξεων και των ερωτημάτων πριν από αλλαγή τιμής."] : ["Εξετάστε την προβολή της αγγελίας και την ανταγωνιστικότητα της τιμής για την προσέλκυση περισσότερων υποδείξεων."],
        ownerActionItems: ["Συζητήστε με τον μεσίτη τα επόμενα βήματα με βάση τα νέα δεδομένα."],
    };
}
function normalizeResult(value, fallback) {
    const metrics = value?.showingMetrics && typeof value.showingMetrics === "object" ? value.showingMetrics : {};
    const themes = Array.isArray(value?.buyerFeedbackThemes) ? value.buyerFeedbackThemes.map((entry) => {
        if (!entry || typeof entry !== "object")
            return null;
        const object = entry;
        const theme = stringValue(object.theme);
        const sentiment = object.sentiment;
        return theme && (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") ? { theme, sentiment } : null;
    }).filter((entry) => entry !== null).slice(0, 12) : fallback.buyerFeedbackThemes;
    const list = (candidate, defaultValue) => Array.isArray(candidate)
        ? candidate.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 12)
        : defaultValue;
    return {
        reportPeriod: stringValue(value?.reportPeriod, fallback.reportPeriod),
        executiveSummary: stringValue(value?.executiveSummary, fallback.executiveSummary),
        showingMetrics: {
            totalVisits: Math.max(0, Math.round(numberValue(metrics.totalVisits, fallback.showingMetrics.totalVisits))),
            positiveSignalsCount: Math.max(0, Math.round(numberValue(metrics.positiveSignalsCount, fallback.showingMetrics.positiveSignalsCount))),
            concernsCount: Math.max(0, Math.round(numberValue(metrics.concernsCount, fallback.showingMetrics.concernsCount))),
        },
        totalViews: Math.max(0, Math.round(numberValue(value?.totalViews, fallback.totalViews))),
        totalInquiries: Math.max(0, Math.round(numberValue(value?.totalInquiries, fallback.totalInquiries))),
        averageRating: Math.max(0, Math.min(5, numberValue(value?.averageRating, fallback.averageRating))),
        buyerFeedbackThemes: themes,
        strategicRecommendations: list(value?.strategicRecommendations, fallback.strategicRecommendations),
        ownerActionItems: list(value?.ownerActionItems, fallback.ownerActionItems),
    };
}
async function generateOwnerPerformanceReport(input, usage) {
    const days = Math.min(3650, Math.max(1, Math.round(numberValue(input?.timeRangeDays, 30))));
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const db = (0, firestore_1.getFirestore)();
    const [feedbackSnapshot, showingsSnapshot, inquiriesSnapshot, viewsSnapshot] = await Promise.all([
        db.collection("post_visit_feedbacks").where("apartmentId", "==", input.apartmentId).limit(500).get().catch(() => null),
        db.collection("showings").where("apartmentId", "==", input.apartmentId).limit(5000).get().catch(() => null),
        db.collection("inquiries").where("apartmentId", "==", input.apartmentId).limit(5000).get().catch(() => null),
        db.collection("apartment_views").where("apartmentId", "==", input.apartmentId).limit(5000).get().catch(() => null),
    ]);
    const feedback = (feedbackSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).map((document) => {
        const data = document.data();
        return { text: stringValue(data.feedback ?? data.comment ?? data.notes, "Nέα καταγεγραμμένη επίσκεψη χωρίς σχόλιο."), rating: numberValue(data.rating) || undefined, sentiment: feedbackSentiment(data) };
    });
    const totalVisits = (showingsSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).length;
    const totalInquiries = (inquiriesSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).length;
    const totalViews = (viewsSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).length;
    const ratings = feedback.map((entry) => entry.rating).filter((rating) => rating !== undefined);
    const fallback = fallbackReport(days, totalVisits, feedback, totalInquiries, totalViews);
    fallback.averageRating = ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length * 10) / 10 : 0;
    const prompt = `Είσαι σύμβουλος ενημέρωσης ιδιοκτητών σε επαγγελματικό ελληνικό μεσιτικό CRM. Σύνταξε ευγενική, διαφανή και data-driven αναφορά προς τον ιδιοκτήτη. Αν τα δεδομένα είναι λίγα, ανέφερε καθαρά τον περιορισμό και μην επινοήσεις συμπεράσματα. Χρησιμοποίησε τα θέματα των σχολίων χωρίς προσωπικά δεδομένα.\n\nΠερίοδος: τελευταίες ${days} ημέρες\nΥποδείξεις: ${totalVisits}\nΕρωτήματα: ${totalInquiries}\nΣχόλια: ${JSON.stringify(feedback.slice(0, 100))}\n\nΕπίστρεψε αυστηρά έγκυρο JSON χωρίς markdown ή άλλο κείμενο, με ακριβώς αυτή τη δομή. Όλα τα κείμενα στα Ελληνικά (EL-GR):\n{"reportPeriod":"Τελευταίες ${days} ημέρες","executiveSummary":"...","showingMetrics":{"totalVisits":0,"positiveSignalsCount":0,"concernsCount":0},"buyerFeedbackThemes":[{"theme":"...","sentiment":"positive" | "negative" | "neutral"}],"strategicRecommendations":["..."],"ownerActionItems":["..."]}`;
    try {
        const response = await (0, geminiClient_1.getGeminiModel)().generateContent(prompt);
        (0, geminiClient_1.recordGeminiUsage)(response, usage);
        return normalizeResult(parseJsonObject(response.response.text()), fallback);
    }
    catch {
        return fallback;
    }
}
async function persistOwnerReport(apartmentId, timeRangeDays, report) {
    const reportRef = (0, firestore_1.getFirestore)().collection(`apartments/${apartmentId}/owner_reports`).doc();
    const createdAt = firestore_1.Timestamp.now();
    await reportRef.set({
        ...report,
        reportId: reportRef.id,
        apartmentId,
        timeRangeDays,
        createdAt,
    });
    return { reportId: reportRef.id, createdAt: createdAt.toMillis() };
}
async function buildOwnerActivityPdfReport(apartmentId) {
    const result = await generateOwnerPerformanceReport({ apartmentId, timeRangeDays: 30 });
    const db = (0, firestore_1.getFirestore)();
    const [viewsSnapshot, inquiriesSnapshot, feedbackSnapshot] = await Promise.all([
        db.collection("apartment_views").where("apartmentId", "==", apartmentId).limit(5000).get().catch(() => null),
        db.collection("inquiries").where("apartmentId", "==", apartmentId).limit(5000).get().catch(() => null),
        db.collection("post_visit_feedbacks").where("apartmentId", "==", apartmentId).limit(500).get().catch(() => null),
    ]);
    const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const views = (viewsSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).length;
    const inquiries = (inquiriesSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data(), startTime)).length;
    const ratings = (feedbackSnapshot?.docs ?? [])
        .filter((document) => isWithinRange(document.data(), startTime))
        .map((document) => numberValue(document.data().rating))
        .filter((rating) => rating > 0);
    return {
        id: `report-${apartmentId}`,
        apartmentId,
        reportPeriod: result.reportPeriod,
        totalViews: result.totalViews || views,
        totalInquiries: result.totalInquiries || inquiries,
        totalShowings: result.showingMetrics.totalVisits,
        averageRating: ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length * 10) / 10 : result.averageRating,
        sentimentSummary: {
            overallSentiment: result.showingMetrics.positiveSignalsCount > result.showingMetrics.concernsCount ? "positive" : result.showingMetrics.concernsCount > result.showingMetrics.positiveSignalsCount ? "negative" : "neutral",
            positivePoints: result.buyerFeedbackThemes.filter((theme) => theme.sentiment === "positive").map((theme) => theme.theme),
            frictionPoints: result.buyerFeedbackThemes.filter((theme) => theme.sentiment === "negative").map((theme) => theme.theme),
            recurringPatterns: [],
        },
        brokerNotes: result.executiveSummary,
        createdAt: Date.now(),
    };
}
//# sourceMappingURL=ownerReportService.js.map