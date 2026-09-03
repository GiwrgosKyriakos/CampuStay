import { getFirestore } from "firebase-admin/firestore";
import { getGeminiModel } from "./geminiClient";

export interface OwnerReportInput {
  apartmentId: string;
  timeRangeDays?: number;
}

export interface OwnerReportResult {
  reportPeriod: string;
  executiveSummary: string;
  showingMetrics: { totalVisits: number; positiveSignalsCount: number; concernsCount: number };
  buyerFeedbackThemes: { theme: string; sentiment: "positive" | "negative" | "neutral" }[];
  strategicRecommendations: string[];
  ownerActionItems: string[];
}

export interface OwnerActivityReport {
  id: string;
  apartmentId: string;
  reportPeriod: string;
  totalViews: number;
  totalInquiries: number;
  totalShowings: number;
  averageRating: number;
  sentimentSummary: {
    overallSentiment: "positive" | "neutral" | "negative";
    positivePoints: string[];
    frictionPoints: string[];
    recurringPatterns: { issue: string; frequencyPercentage: number }[];
    priceAdjustmentRecommendation?: { suggestedReductionPercent: number; justification: string };
  };
  brokerNotes: string;
  generatedPdfUrl?: string;
  createdAt: number;
}

interface FeedbackExtract {
  text: string;
  rating?: number;
  sentiment: "positive" | "negative" | "neutral";
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function feedbackSentiment(data: Record<string, unknown>): "positive" | "negative" | "neutral" {
  const explicit = stringValue(data.sentiment ?? data.overallSentiment).toLowerCase();
  if (["positive", "θετικό", "θετικη", "θετική"].includes(explicit)) return "positive";
  if (["negative", "αρνητικό", "αρνητικη", "αρνητική"].includes(explicit)) return "negative";
  const rating = numberValue(data.rating);
  return rating >= 4 ? "positive" : rating > 0 && rating <= 2 ? "negative" : "neutral";
}

function isWithinRange(data: Record<string, unknown>, startTime: number): boolean {
  const dateValue = data.createdAt ?? data.updatedAt ?? data.visitDate ?? data.timestamp;
  if (!dateValue) return true;
  const candidate = dateValue && typeof dateValue === "object" && "toMillis" in dateValue && typeof dateValue.toMillis === "function"
    ? numberValue(dateValue.toMillis())
    : typeof dateValue === "object" && "seconds" in dateValue ? numberValue((dateValue as { seconds?: unknown }).seconds) * 1000 : new Date(String(dateValue)).getTime();
  return !Number.isFinite(candidate) || candidate >= startTime;
}

function fallbackReport(days: number, totalVisits: number, feedback: FeedbackExtract[], totalInquiries: number): OwnerReportResult {
  const positiveSignalsCount = feedback.filter((entry) => entry.sentiment === "positive").length;
  const concernsCount = feedback.filter((entry) => entry.sentiment === "negative").length;
  return {
    reportPeriod: `Τελευταίες ${days} ημέρες`,
    executiveSummary: totalVisits > 0
      ? `Καταγράφηκαν ${totalVisits} υποδείξεις και ${totalInquiries} ερωτήματα για το ακίνητο. Η εικόνα βασίζεται στα διαθέσιμα στοιχεία της περιόδου.`
      : "Δεν καταγράφηκαν υποδείξεις στην επιλεγμένη περίοδο. Τα συμπεράσματα είναι περιορισμένα λόγω ανεπαρκών δεδομένων.",
    showingMetrics: { totalVisits, positiveSignalsCount, concernsCount },
    buyerFeedbackThemes: [],
    strategicRecommendations: totalVisits > 0 ? ["Συνεχίστε την παρακολούθηση των υποδείξεων και των ερωτημάτων πριν από αλλαγή τιμής."] : ["Εξετάστε την προβολή της αγγελίας και την ανταγωνιστικότητα της τιμής για την προσέλκυση περισσότερων υποδείξεων."],
    ownerActionItems: ["Συζητήστε με τον μεσίτη τα επόμενα βήματα με βάση τα νέα δεδομένα."],
  };
}

function normalizeResult(value: Record<string, unknown> | null, fallback: OwnerReportResult): OwnerReportResult {
  const metrics = value?.showingMetrics && typeof value.showingMetrics === "object" ? value.showingMetrics as Record<string, unknown> : {};
  const themes = Array.isArray(value?.buyerFeedbackThemes) ? value.buyerFeedbackThemes.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const object = entry as Record<string, unknown>;
    const theme = stringValue(object.theme);
    const sentiment = object.sentiment;
    return theme && (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") ? { theme, sentiment } : null;
  }).filter((entry): entry is { theme: string; sentiment: "positive" | "negative" | "neutral" } => entry !== null).slice(0, 12) : fallback.buyerFeedbackThemes;
  const list = (candidate: unknown, defaultValue: string[]): string[] => Array.isArray(candidate)
    ? candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 12)
    : defaultValue;
  return {
    reportPeriod: stringValue(value?.reportPeriod, fallback.reportPeriod),
    executiveSummary: stringValue(value?.executiveSummary, fallback.executiveSummary),
    showingMetrics: {
      totalVisits: Math.max(0, Math.round(numberValue(metrics.totalVisits, fallback.showingMetrics.totalVisits))),
      positiveSignalsCount: Math.max(0, Math.round(numberValue(metrics.positiveSignalsCount, fallback.showingMetrics.positiveSignalsCount))),
      concernsCount: Math.max(0, Math.round(numberValue(metrics.concernsCount, fallback.showingMetrics.concernsCount))),
    },
    buyerFeedbackThemes: themes,
    strategicRecommendations: list(value?.strategicRecommendations, fallback.strategicRecommendations),
    ownerActionItems: list(value?.ownerActionItems, fallback.ownerActionItems),
  };
}

export async function generateOwnerPerformanceReport(input: OwnerReportInput): Promise<OwnerReportResult> {
  const days = Math.min(3650, Math.max(1, Math.round(numberValue(input?.timeRangeDays, 30))));
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = getFirestore();
  const [feedbackSnapshot, showingsSnapshot, inquiriesSnapshot] = await Promise.all([
    db.collection("post_visit_feedbacks").where("apartmentId", "==", input.apartmentId).limit(500).get().catch(() => null),
    db.collection("showings").where("apartmentId", "==", input.apartmentId).limit(5000).get().catch(() => null),
    db.collection("inquiries").where("apartmentId", "==", input.apartmentId).limit(5000).get().catch(() => null),
  ]);
  const feedback = (feedbackSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data() as Record<string, unknown>, startTime)).map((document) => {
    const data = document.data() as Record<string, unknown>;
    return { text: stringValue(data.feedback ?? data.comment ?? data.notes, "Nέα καταγεγραμμένη επίσκεψη χωρίς σχόλιο."), rating: numberValue(data.rating) || undefined, sentiment: feedbackSentiment(data) } satisfies FeedbackExtract;
  });
  const totalVisits = (showingsSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data() as Record<string, unknown>, startTime)).length;
  const totalInquiries = (inquiriesSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data() as Record<string, unknown>, startTime)).length;
  const fallback = fallbackReport(days, totalVisits, feedback, totalInquiries);
  const prompt = `Είσαι σύμβουλος ενημέρωσης ιδιοκτητών σε επαγγελματικό ελληνικό μεσιτικό CRM. Σύνταξε ευγενική, διαφανή και data-driven αναφορά προς τον ιδιοκτήτη. Αν τα δεδομένα είναι λίγα, ανέφερε καθαρά τον περιορισμό και μην επινοήσεις συμπεράσματα. Χρησιμοποίησε τα θέματα των σχολίων χωρίς προσωπικά δεδομένα.\n\nΠερίοδος: τελευταίες ${days} ημέρες\nΥποδείξεις: ${totalVisits}\nΕρωτήματα: ${totalInquiries}\nΣχόλια: ${JSON.stringify(feedback.slice(0, 100))}\n\nΕπίστρεψε αυστηρά έγκυρο JSON χωρίς markdown ή άλλο κείμενο, με ακριβώς αυτή τη δομή. Όλα τα κείμενα στα Ελληνικά (EL-GR):\n{"reportPeriod":"Τελευταίες ${days} ημέρες","executiveSummary":"...","showingMetrics":{"totalVisits":0,"positiveSignalsCount":0,"concernsCount":0},"buyerFeedbackThemes":[{"theme":"...","sentiment":"positive" | "negative" | "neutral"}],"strategicRecommendations":["..."],"ownerActionItems":["..."]}`;
  try {
    const response = await getGeminiModel().generateContent(prompt);
    return normalizeResult(parseJsonObject(response.response.text()), fallback);
  } catch {
    return fallback;
  }
}

export async function buildOwnerActivityPdfReport(apartmentId: string): Promise<OwnerActivityReport> {
  const result = await generateOwnerPerformanceReport({ apartmentId, timeRangeDays: 30 });
  const db = getFirestore();
  const [viewsSnapshot, inquiriesSnapshot, feedbackSnapshot] = await Promise.all([
    db.collection("apartment_views").where("apartmentId", "==", apartmentId).limit(5000).get().catch(() => null),
    db.collection("inquiries").where("apartmentId", "==", apartmentId).limit(5000).get().catch(() => null),
    db.collection("post_visit_feedbacks").where("apartmentId", "==", apartmentId).limit(500).get().catch(() => null),
  ]);
  const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const views = (viewsSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data() as Record<string, unknown>, startTime)).length;
  const inquiries = (inquiriesSnapshot?.docs ?? []).filter((document) => isWithinRange(document.data() as Record<string, unknown>, startTime)).length;
  const ratings = (feedbackSnapshot?.docs ?? []).map((document) => numberValue((document.data() as Record<string, unknown>).rating)).filter((rating) => rating > 0);
  return {
    id: `report-${apartmentId}`,
    apartmentId,
    reportPeriod: result.reportPeriod,
    totalViews: views,
    totalInquiries: inquiries,
    totalShowings: result.showingMetrics.totalVisits,
    averageRating: ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length * 10) / 10 : 0,
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
