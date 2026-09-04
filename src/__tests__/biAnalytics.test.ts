import {
  calculateAgentWinRate,
  calculateDaysOnMarket,
  calculateFunnelAnalytics,
  calculateMarketingRoiPercent,
  calculateMarketingRoiRatio,
  calculateCEOAnalyticsSummary,
  calculateWeightedPipelineForecast,
  isValidLostDealReason,
  normalizeLeadSource,
  normalizeLostDealReason,
} from "@/src/utils/analyticsEngine";
import { DEFAULT_AGENCY_PIPELINE_CONFIG } from "@/src/constants/pipeline";
import {
  BIGQUERY_ANALYTICS_SCHEMAS,
  buildDealFactRow,
  buildLeadFactRow,
} from "@/src/services/warehouseExport";

describe("BI metric contracts", () => {
  it("calculates every funnel rate and drop-off with zero denominators", () => {
    expect(calculateFunnelAnalytics({ views: 0, inquiries: 0, showings: 2, offers: 1, closedDeals: 0 })).toEqual({
      viewsToInquiriesRate: 0,
      inquiriesToShowingsRate: 0,
      showingsToOffersRate: 50,
      offersToClosedRate: 0,
      viewsToInquiriesDropOff: 0,
      inquiriesToShowingsDropOff: 0,
      showingsToOffersDropOff: 1,
      offersToClosedDropOff: 1,
      frictionStage: "views_to_inquiries",
    });
  });

  it("calculates negotiated-only win rate", () => {
    expect(calculateAgentWinRate(2, 4)).toBe(50);
    expect(calculateAgentWinRate(2, 0)).toBe(0);
  });

  it("calculates DOM in days and marketing ROI consistently", () => {
    expect(calculateDaysOnMarket(Date.UTC(2025, 0, 1), Date.UTC(2025, 0, 4))).toBe(3);
    expect(calculateMarketingRoiPercent(1500, 1000)).toBe(50);
    expect(calculateMarketingRoiRatio(1500, 1000)).toBe(1.5);
    expect(calculateMarketingRoiRatio(1500, 0)).toBe(0);
  });

  it("normalizes legacy sources and validates canonical lost reasons", () => {
    expect(normalizeLeadSource("social ads")).toBe("meta_ads");
    expect(normalizeLeadSource("unknown-source")).toBe("other");
    expect(normalizeLostDealReason("high price")).toBe("price_dispute");
    expect(isValidLostDealReason("price_dispute")).toBe(true);
    expect(isValidLostDealReason("unknown")).toBe(false);
  });

  it("uses agency-configured probabilities for weighted forecast", () => {
    const config = {
      ...DEFAULT_AGENCY_PIPELINE_CONFIG,
      stageProbabilities: { ...DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities, offer_made: 0.25 },
    };
    expect(calculateWeightedPipelineForecast([{
      id: "deal-1",
      pipelineStage: "offer_made",
      dealValue: 100_000,
      commissionRate: 0.02,
    }], config)).toBe(500);
    expect(calculateWeightedPipelineForecast([{
      id: "deal-2",
      pipelineStage: "closed_won",
      dealValue: 100_000,
      commissionRate: 0.02,
    }], config)).toBe(0);
  });

  it("attributes closed revenue to the originating lead and reports channel margin", () => {
    const summary = calculateCEOAnalyticsSummary({
      apartments: [],
      agents: [],
      interactions: [],
      lostDeals: [],
      roommateMatches: [],
      roommateSeekers: [],
      leads: [{ id: "lead-1", source: "google_ads" }],
      deals: [{ id: "deal-1", leadId: "lead-1", status: "closed", stage: 100, commissionTotal: 1200 }],
      campaignSpends: [{ id: "spend-1", agencyId: "agency-1", source: "google_ads", month: "2026-09", spendAmount: 200, currency: "EUR", recordedAt: 1, recordedBy: "user-1" }],
    }, { window: "all", now: Date.UTC(2026, 8, 4) });

    expect(summary.revenueBySource.google_ads).toBe(1200);
    expect(summary.roiBySource.google_ads).toEqual(expect.objectContaining({ spend: 200, attributedDeals: 1, netMargin: 1000, roiPercent: 500 }));
    expect(summary.roiBySource.other).toEqual(expect.objectContaining({ roiPercent: 0, netMargin: 0 }));
    expect(summary.benchmarkMetrics.targetMonthlyRevenue).toBe(25000);
  });
});

describe("warehouse export contracts", () => {
  it("exposes the five required BigQuery tables with stable keys", () => {
    expect(BIGQUERY_ANALYTICS_SCHEMAS.map((schema) => schema.table)).toEqual([
      "dim_apartments",
      "dim_brokers",
      "fct_leads",
      "fct_deals",
      "fct_marketing_costs",
    ]);
    BIGQUERY_ANALYTICS_SCHEMAS.forEach((schema) => {
      expect(schema.fields.some((field) => field.name === "agency_id" && field.mode === "REQUIRED")).toBe(true);
      expect(schema.clusterFields).toContain("agency_id");
    });
  });

  it("builds normalized lead and deal facts", () => {
    expect(buildLeadFactRow({ id: "lead-1", agencyId: "agency-1", source: "social ads", createdAt: "2025-01-01T00:00:00.000Z" })).toEqual(expect.objectContaining({
      lead_id: "lead-1",
      source: "meta_ads",
      created_at: "2025-01-01T00:00:00.000Z",
    }));
    expect(buildDealFactRow({
      id: "deal-1",
      agencyId: "agency-1",
      source: "xe",
      dealValue: 100_000,
      commissionRate: 2,
      pipelineStage: "offer_made",
    })).toEqual(expect.objectContaining({
      deal_id: "deal-1",
      source: "xe_gr",
      commission_rate: 0.02,
      commission_amount: 2_000,
    }));
  });
});
