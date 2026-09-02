import type { FeedbackSentimentAnalysis } from "@/src/types/aiFeatures";

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
