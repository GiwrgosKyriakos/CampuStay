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

export const DEFAULT_AGENCY_CONFIG: AgencyPipelineConfig = {
  benchmarks: {
    targetMonthlyRevenue: 25000,
    targetDaysOnMarket: 60,
    targetWinRate: 0.25,
  },
  stageProbabilities: {
    inquiry: 0.05,
    showing_scheduled: 0.15,
    showing_completed: 0.25,
    offer_made: 0.30,
    docs_review: 0.60,
    preliminary_signed_90: 0.90,
    contract_completed_100: 1.00,
  },
  defaultSplits: {
    agencyShare: 0.50,
    listingBrokerShare: 0.25,
    sellingBrokerShare: 0.25,
  },
};