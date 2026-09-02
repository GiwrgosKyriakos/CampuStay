export type SentimentTone = "positive" | "neutral" | "negative";

export interface ComparableProperty {
  id: string;
  title: string;
  address: string;
  area: string;
  sqm: number;
  price: number;
  pricePerSqm: number;
  similarityScore: number;
  soldOrListedDate: string;
}

export interface CmaValuationReport {
  id: string;
  apartmentId: string;
  estimatedPriceMin: number;
  estimatedPriceMax: number;
  recommendedListingPrice: number;
  confidenceScore: number;
  pricePerSqmAverage: number;
  comparables: ComparableProperty[];
  marketTrendSummary: string;
  pricingAdvice: string;
  createdAt: number;
}

export interface FeedbackSentimentAnalysis {
  overallSentiment: SentimentTone;
  positivePoints: string[];
  frictionPoints: string[];
  recurringPatterns: {
    issue: string;
    frequencyPercentage: number;
  }[];
  priceAdjustmentRecommendation?: {
    suggestedReductionPercent: number;
    justification: string;
  };
}

export interface OwnerActivityReport {
  id: string;
  apartmentId: string;
  reportPeriod: string;
  totalViews: number;
  totalInquiries: number;
  totalShowings: number;
  averageRating: number;
  sentimentSummary: FeedbackSentimentAnalysis;
  brokerNotes: string;
  generatedPdfUrl?: string;
  createdAt: number;
}

export interface AiCopywritingOption {
  tone: "professional" | "enthusiastic" | "luxury" | "concise_bulleted";
  headline: string;
  description: string;
  keyHighlights: string[];
  socialMediaSnippet: string;
}
