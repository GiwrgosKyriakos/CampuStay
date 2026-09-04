import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/src/config/functions";

export interface FeedbackSentimentAnalysis {
  overallSentiment: "positive" | "neutral" | "negative";
  positivePoints: string[];
  frictionPoints: string[];
  recurringPatterns: { issue: string; frequencyPercentage: number }[];
  priceAdjustmentRecommendation?: { suggestedReductionPercent: number; justification: string };
}

export interface CmaAnalysisInput {
  apartmentId: string;
  transactionType: "sale" | "rent";
  targetPrice?: number;
  area?: string;
  sqm?: number;
  rooms?: number;
  floor?: number;
}

export interface CmaAnalysisResult {
  suggestedPriceRange: { min: number; max: number; optimal: number };
  pricePerSqmEstimate: number;
  marketCompetitiveness: "low" | "fair" | "high" | "overpriced";
  keyDifferentiators: string[];
  marketInsightsSummary: string;
  comparablesUsed?: number;
  reportId?: string;
  createdAt?: number;
}

export interface CopywriterInput {
  apartmentId: string;
  title: string;
  area: string;
  sqm: number;
  bedrooms: number;
  price: number;
  features: string[];
  tone?: "professional" | "luxury" | "student_friendly";
}

export interface CopywriterResult {
  portalTitle: string;
  portalDescription: string;
  socialCaption: string;
  bulletHighlights: string[];
  seoTags: string[];
}

export interface OwnerReportInput {
  apartmentId: string;
  timeRangeDays?: number;
}

export interface OwnerReportResult {
  reportPeriod: string;
  executiveSummary: string;
  showingMetrics: { totalVisits: number; positiveSignalsCount: number; concernsCount: number };
  totalViews: number;
  totalInquiries: number;
  averageRating: number;
  generatedPdfUrl?: string;
  buyerFeedbackThemes: { theme: string; sentiment: "positive" | "negative" | "neutral" }[];
  strategicRecommendations: string[];
  ownerActionItems: string[];
  reportId?: string;
  createdAt?: number;
}

export type AiErrorCode =
  | "unauthenticated"
  | "invalid-argument"
  | "resource-exhausted"
  | "failed-precondition"
  | "not-found"
  | "unavailable"
  | "internal"
  | "unknown";

export class AiServiceError extends Error {
  constructor(public readonly code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiServiceError";
  }
}

const errorMessages: Record<AiErrorCode, string> = {
  unauthenticated: "Συνδεθείτε για να χρησιμοποιήσετε τις λειτουργίες AI.",
  "invalid-argument": "Τα στοιχεία που στάλθηκαν δεν είναι έγκυρα.",
  "resource-exhausted": "Έχουν γίνει πολλά αιτήματα AI. Δοκιμάστε ξανά σε λίγο.",
  "failed-precondition": "Η λειτουργία AI δεν μπορεί να εκτελεστεί με τα διαθέσιμα δεδομένα.",
  "not-found": "Το ακίνητο δεν βρέθηκε.",
  unavailable: "Η υπηρεσία AI δεν είναι προσωρινά διαθέσιμη. Δοκιμάστε ξανά.",
  internal: "Παρουσιάστηκε σφάλμα στην υπηρεσία AI. Δοκιμάστε ξανά.",
  unknown: "Δεν ήταν δυνατή η ολοκλήρωση του αιτήματος AI.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new AiServiceError("internal", `Η απάντηση AI δεν περιέχει έγκυρο ${field}.`);
  return value.trim();
}

function asStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim().length > 0)) {
    throw new AiServiceError("internal", `Η απάντηση AI δεν περιέχει έγκυρη λίστα ${field}.`);
  }
  return value.map((entry) => (entry as string).trim());
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new AiServiceError("internal", `Η απάντηση AI δεν περιέχει έγκυρο ${field}.`);
  return value;
}

function normalizeFeedback(value: unknown): FeedbackSentimentAnalysis {
  if (!isRecord(value)) throw new AiServiceError("internal", "Η απάντηση ανάλυσης συναισθήματος δεν είναι έγκυρη.");
  if (value.overallSentiment !== "positive" && value.overallSentiment !== "neutral" && value.overallSentiment !== "negative") throw new AiServiceError("internal", "Η απάντηση ανάλυσης συναισθήματος δεν περιέχει έγκυρο τόνο.");
  if (!Array.isArray(value.recurringPatterns)) throw new AiServiceError("internal", "Η απάντηση ανάλυσης συναισθήματος δεν περιέχει έγκυρα μοτίβα.");
  const recurringPatterns = value.recurringPatterns.map((entry) => {
    if (!isRecord(entry)) throw new AiServiceError("internal", "Η απάντηση ανάλυσης συναισθήματος περιέχει μη έγκυρο μοτίβο.");
    const frequencyPercentage = asNumber(entry.frequencyPercentage, "ποσοστό συχνότητας");
    return { issue: asString(entry.issue, "θέμα"), frequencyPercentage: Math.min(100, Math.max(0, frequencyPercentage)) };
  });
  let priceAdjustmentRecommendation: FeedbackSentimentAnalysis["priceAdjustmentRecommendation"];
  if (value.priceAdjustmentRecommendation !== undefined) {
    if (!isRecord(value.priceAdjustmentRecommendation)) throw new AiServiceError("internal", "Η απάντηση ανάλυσης συναισθήματος περιέχει μη έγκυρη πρόταση τιμής.");
    priceAdjustmentRecommendation = {
      suggestedReductionPercent: Math.min(100, Math.max(0, asNumber(value.priceAdjustmentRecommendation.suggestedReductionPercent, "ποσοστό προσαρμογής"))),
      justification: asString(value.priceAdjustmentRecommendation.justification, "αιτιολόγηση"),
    };
  }
  return { overallSentiment: value.overallSentiment, positivePoints: asStringList(value.positivePoints, "θετικά σημεία"), frictionPoints: asStringList(value.frictionPoints, "σημεία τριβής"), recurringPatterns, ...(priceAdjustmentRecommendation ? { priceAdjustmentRecommendation } : {}) };
}

function normalizeCma(value: unknown): CmaAnalysisResult {
  if (!isRecord(value) || !isRecord(value.suggestedPriceRange)) throw new AiServiceError("internal", "Η απάντηση CMA δεν είναι έγκυρη.");
  const range = value.suggestedPriceRange;
  const marketCompetitiveness = value.marketCompetitiveness;
  if (marketCompetitiveness !== "low" && marketCompetitiveness !== "fair" && marketCompetitiveness !== "high" && marketCompetitiveness !== "overpriced") throw new AiServiceError("internal", "Η απάντηση CMA δεν περιέχει έγκυρη ανταγωνιστικότητα.");
  return {
    suggestedPriceRange: { min: asNumber(range.min, "ελάχιστη τιμή"), max: asNumber(range.max, "μέγιστη τιμή"), optimal: asNumber(range.optimal, "βέλτιστη τιμή") },
    pricePerSqmEstimate: asNumber(value.pricePerSqmEstimate, "τιμή ανά τετραγωνικό"),
    marketCompetitiveness,
    keyDifferentiators: asStringList(value.keyDifferentiators, "διαφοροποιητικά στοιχεία"),
    marketInsightsSummary: asString(value.marketInsightsSummary, "σύνοψη αγοράς"),
    ...(typeof value.comparablesUsed === "number" ? { comparablesUsed: value.comparablesUsed } : {}),
    ...(typeof value.reportId === "string" ? { reportId: value.reportId } : {}),
    ...(typeof value.createdAt === "number" ? { createdAt: value.createdAt } : {}),
  };
}

function normalizeCopy(value: unknown): CopywriterResult {
  if (!isRecord(value)) throw new AiServiceError("internal", "Η απάντηση copywriter δεν είναι έγκυρη.");
  return {
    portalTitle: asString(value.portalTitle, "τίτλο portal"),
    portalDescription: asString(value.portalDescription, "περιγραφή portal"),
    socialCaption: asString(value.socialCaption, "λεζάντα social"),
    bulletHighlights: asStringList(value.bulletHighlights, "σημεία προβολής"),
    seoTags: asStringList(value.seoTags, "SEO tags"),
  };
}

function normalizeOwnerReport(value: unknown): OwnerReportResult {
  if (!isRecord(value) || !isRecord(value.showingMetrics) || !Array.isArray(value.buyerFeedbackThemes)) throw new AiServiceError("internal", "Η απάντηση αναφοράς ιδιοκτήτη δεν είναι έγκυρη.");
  const showingMetrics = value.showingMetrics;
  const buyerFeedbackThemes: OwnerReportResult["buyerFeedbackThemes"] = value.buyerFeedbackThemes.map((entry) => {
    if (!isRecord(entry) || (entry.sentiment !== "positive" && entry.sentiment !== "negative" && entry.sentiment !== "neutral")) throw new AiServiceError("internal", "Η απάντηση αναφοράς ιδιοκτήτη περιέχει μη έγκυρο θέμα.");
    const sentiment = entry.sentiment as "positive" | "negative" | "neutral";
    return { theme: asString(entry.theme, "θέμα"), sentiment };
  });
  return {
    reportPeriod: asString(value.reportPeriod, "περίοδο"),
    executiveSummary: asString(value.executiveSummary, "σύνοψη"),
    showingMetrics: { totalVisits: asNumber(showingMetrics.totalVisits, "υποδείξεις"), positiveSignalsCount: asNumber(showingMetrics.positiveSignalsCount, "θετικά σήματα"), concernsCount: asNumber(showingMetrics.concernsCount, "ανησυχίες") },
    totalViews: asNumber(value.totalViews, "προβολές"),
    totalInquiries: asNumber(value.totalInquiries, "ερωτήματα"),
    averageRating: asNumber(value.averageRating, "μέση αξιολόγηση"),
    ...(typeof value.generatedPdfUrl === "string" && value.generatedPdfUrl.trim() ? { generatedPdfUrl: value.generatedPdfUrl.trim() } : {}),
    buyerFeedbackThemes,
    strategicRecommendations: asStringList(value.strategicRecommendations, "στρατηγικές προτάσεις"),
    ownerActionItems: asStringList(value.ownerActionItems, "ενέργειες ιδιοκτήτη"),
    ...(typeof value.reportId === "string" ? { reportId: value.reportId } : {}),
    ...(typeof value.createdAt === "number" ? { createdAt: value.createdAt } : {}),
  };
}

function toAiError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) return error;
  const rawCode = isRecord(error) && typeof error.code === "string" ? error.code.replace(/^functions\//, "") : "unknown";
  const knownCode = rawCode in errorMessages ? rawCode as AiErrorCode : "unknown";
  return new AiServiceError(knownCode, errorMessages[knownCode]);
}

async function callAiFunction<Input, Output>(name: string, input: Input, normalize: (value: unknown) => Output): Promise<Output> {
  try {
    const callable = httpsCallable<Input, Output>(firebaseFunctions, name);
    const result = await callable(input);
    return normalize(result.data);
  } catch (error) {
    throw toAiError(error);
  }
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new AiServiceError("invalid-argument", `Η παράμετρος ${field} είναι υποχρεωτική.`);
  return value.trim();
}

function requireNonNegative(value: number | undefined, field: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new AiServiceError("invalid-argument", `Η παράμετρος ${field} πρέπει να είναι μη αρνητικός αριθμός.`);
}

export function fetchShowingFeedbackSentiment(apartmentId: string): Promise<FeedbackSentimentAnalysis> {
  return callAiFunction("getPropertyFeedbackSentiment", { apartmentId: requireText(apartmentId, "apartmentId") }, normalizeFeedback);
}

export function fetchComparativeMarketAnalysis(params: CmaAnalysisInput): Promise<CmaAnalysisResult> {
  const apartmentId = requireText(params?.apartmentId, "apartmentId");
  requireNonNegative(params.targetPrice, "targetPrice");
  requireNonNegative(params.sqm, "sqm");
  requireNonNegative(params.rooms, "rooms");
  requireNonNegative(params.floor, "floor");
  if (params.transactionType !== "sale" && params.transactionType !== "rent") throw new AiServiceError("invalid-argument", "Η παράμετρος transactionType πρέπει να είναι sale ή rent.");
  return callAiFunction("getComparativeMarketAnalysis", { ...params, apartmentId }, normalizeCma);
}

export function fetchPropertyListingCopy(params: CopywriterInput): Promise<CopywriterResult> {
  const apartmentId = requireText(params?.apartmentId, "apartmentId");
  const title = requireText(params?.title, "title");
  const area = requireText(params?.area, "area");
  if (!Array.isArray(params?.features) || !params.features.every((feature) => typeof feature === "string")) throw new AiServiceError("invalid-argument", "Η παράμετρος features πρέπει να είναι λίστα κειμένων.");
  if (typeof params?.sqm !== "number" || !Number.isFinite(params.sqm) || params.sqm <= 0) throw new AiServiceError("invalid-argument", "Η παράμετρος sqm πρέπει να είναι θετικός αριθμός.");
  requireNonNegative(params.bedrooms, "bedrooms");
  requireNonNegative(params.price, "price");
  if (params.tone !== undefined && params.tone !== "professional" && params.tone !== "luxury" && params.tone !== "student_friendly") throw new AiServiceError("invalid-argument", "Η παράμετρος tone δεν είναι έγκυρη.");
  return callAiFunction("generatePropertyListingCopy", { ...params, apartmentId, title, area }, normalizeCopy);
}

export function fetchOwnerPerformanceReport(apartmentId: string, timeRangeDays?: number): Promise<OwnerReportResult> {
  const normalizedApartmentId = requireText(apartmentId, "apartmentId");
  if (timeRangeDays !== undefined && (typeof timeRangeDays !== "number" || !Number.isFinite(timeRangeDays) || timeRangeDays <= 0)) throw new AiServiceError("invalid-argument", "Η παράμετρος timeRangeDays πρέπει να είναι θετικός αριθμός.");
  return callAiFunction("generateOwnerPerformanceReport", { apartmentId: normalizedApartmentId, timeRangeDays }, normalizeOwnerReport);
}
