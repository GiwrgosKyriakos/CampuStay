import { getFirestore, type DocumentData } from "firebase-admin/firestore";

export interface AgencyPipelineConfig {
  benchmarks: {
    targetMonthlyRevenue: number;
    targetDaysOnMarket: number;
    targetWinRate: number;
  };
  stageProbabilities: Record<string, number>;
  defaultSplits: {
    agencyShare: number;
    listingBrokerShare: number;
    sellingBrokerShare: number;
  };
}

const DEFAULT_AGENCY_PIPELINE_CONFIG: AgencyPipelineConfig = {
  benchmarks: { targetMonthlyRevenue: 25000, targetDaysOnMarket: 60, targetWinRate: 0.25 },
  stageProbabilities: {
    inquiry: 0.05,
    showing_scheduled: 0.15,
    showing_completed: 0.25,
    offer_made: 0.30,
    docs_review: 0.60,
    preliminary_signed_90: 0.90,
    contract_completed_100: 1.00,
  },
  defaultSplits: { agencyShare: 0.50, listingBrokerShare: 0.25, sellingBrokerShare: 0.25 },
};

function numberInRange(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? value : fallback;
}

function probability(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value >= 0 && value <= 1 ? value : value >= 0 && value <= 100 ? value / 100 : fallback;
}

export function normalizeAgencyPipelineConfig(value: DocumentData | undefined): AgencyPipelineConfig {
  const data = value ?? {};
  const probabilities = data.stageProbabilities ?? {};
  const benchmarks = data.benchmarks ?? {};
  return {
    stageProbabilities: {
      inquiry: numberInRange(probabilities.inquiry, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.inquiry, 1),
      showing_scheduled: numberInRange(probabilities.showing_scheduled, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.showing_scheduled, 1),
      showing_completed: numberInRange(probabilities.showing_completed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.showing_completed, 1),
      offer_made: numberInRange(probabilities.offer_made, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.offer_made, 1),
      docs_review: numberInRange(probabilities.docs_review, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.docs_review, 1),
      preliminary_signed_90: numberInRange(probabilities.preliminary_signed_90 ?? probabilities.preliminary_signed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.preliminary_signed_90, 1),
      contract_completed_100: numberInRange(probabilities.contract_completed_100 ?? probabilities.contract_completed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.contract_completed_100, 1),
    },
    benchmarks: {
      targetMonthlyRevenue: numberInRange(benchmarks.targetMonthlyRevenue, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetMonthlyRevenue, Number.MAX_SAFE_INTEGER),
      targetDaysOnMarket: numberInRange(benchmarks.targetDaysOnMarket, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetDaysOnMarket, Number.MAX_SAFE_INTEGER),
      targetWinRate: probability(benchmarks.targetWinRate, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetWinRate),
    },
    defaultSplits: DEFAULT_AGENCY_PIPELINE_CONFIG.defaultSplits,
  };
}

export async function getAgencyPipelineConfig(agencyId: string): Promise<AgencyPipelineConfig> {
  const snapshot = await getFirestore().doc(`agencies/${agencyId}/settings/pipeline_config`).get();
  return normalizeAgencyPipelineConfig(snapshot.exists ? snapshot.data() : undefined);
}

export function getProbabilityForStage(stage: unknown, config: AgencyPipelineConfig): number {
  if (["closed_won", "deal_closed", "contract_completed", "contract_completed_100"].includes(String(stage))) return config.stageProbabilities.contract_completed_100;
  if (["negotiation_agreement", "preliminary_signed", "preliminary_signed_90"].includes(String(stage))) return config.stageProbabilities.preliminary_signed_90;
  if (["docs_review"].includes(String(stage))) return config.stageProbabilities.docs_review;
  if (["offer", "offer_made"].includes(String(stage))) return config.stageProbabilities.offer_made;
  if (["showing_scheduled"].includes(String(stage))) return config.stageProbabilities.showing_scheduled;
  if (["showing_completed", "showing_planned"].includes(String(stage))) return config.stageProbabilities.showing_completed;
  return config.stageProbabilities.inquiry;
}

export { DEFAULT_AGENCY_PIPELINE_CONFIG };
