import type {
  AnalyticsApartmentRecord,
  AnalyticsDealRecord,
  AnalyticsLeadRecord,
  LeadSource,
  MarketingCampaignSpend,
} from "@/src/types/analytics";
import { normalizeLeadSource, toAnalyticsMillis } from "@/src/utils/analyticsEngine";

export interface BigQueryField {
  name: string;
  type: "STRING" | "INT64" | "NUMERIC" | "FLOAT64" | "BOOL" | "TIMESTAMP";
  mode: "NULLABLE" | "REQUIRED" | "REPEATED";
}

export interface BigQueryTableSchema {
  table: "dim_apartments" | "dim_brokers" | "fct_leads" | "fct_deals" | "fct_marketing_costs";
  fields: BigQueryField[];
  partitionField?: string;
  clusterFields: string[];
}

export interface DimApartmentRow {
  apartment_id: string;
  agency_id: string;
  area: string;
  city: string;
  property_category: string;
  transaction_type: string;
  status: string;
  published_at: string | null;
}

export interface DimBrokerRow {
  broker_id: string;
  agency_id: string;
  broker_name: string;
  agency_role: string;
}

export interface FctLeadRow {
  lead_id: string;
  agency_id: string;
  apartment_id: string | null;
  assigned_broker_id: string | null;
  source: LeadSource;
  created_at: string | null;
}

export interface FctDealRow {
  deal_id: string;
  agency_id: string;
  apartment_id: string | null;
  lead_id: string | null;
  broker_id: string | null;
  source: LeadSource;
  pipeline_stage: string;
  status: string;
  transaction_type: string;
  deal_value: number;
  commission_rate: number;
  commission_amount: number;
  created_at: string | null;
  closed_at: string | null;
}

export interface FctMarketingCostRow {
  spend_id: string;
  agency_id: string;
  source: LeadSource;
  period: string;
  spent_amount: number;
}

export const BIGQUERY_ANALYTICS_SCHEMAS: BigQueryTableSchema[] = [
  {
    table: "dim_apartments",
    fields: [
      { name: "apartment_id", type: "STRING", mode: "REQUIRED" },
      { name: "agency_id", type: "STRING", mode: "REQUIRED" },
      { name: "area", type: "STRING", mode: "NULLABLE" },
      { name: "city", type: "STRING", mode: "NULLABLE" },
      { name: "property_category", type: "STRING", mode: "NULLABLE" },
      { name: "transaction_type", type: "STRING", mode: "NULLABLE" },
      { name: "status", type: "STRING", mode: "NULLABLE" },
      { name: "published_at", type: "TIMESTAMP", mode: "NULLABLE" },
    ],
    partitionField: "published_at",
    clusterFields: ["agency_id", "area", "status"],
  },
  {
    table: "dim_brokers",
    fields: [
      { name: "broker_id", type: "STRING", mode: "REQUIRED" },
      { name: "agency_id", type: "STRING", mode: "REQUIRED" },
      { name: "broker_name", type: "STRING", mode: "NULLABLE" },
      { name: "agency_role", type: "STRING", mode: "NULLABLE" },
    ],
    clusterFields: ["agency_id", "agency_role"],
  },
  {
    table: "fct_leads",
    fields: [
      { name: "lead_id", type: "STRING", mode: "REQUIRED" },
      { name: "agency_id", type: "STRING", mode: "REQUIRED" },
      { name: "apartment_id", type: "STRING", mode: "NULLABLE" },
      { name: "assigned_broker_id", type: "STRING", mode: "NULLABLE" },
      { name: "source", type: "STRING", mode: "REQUIRED" },
      { name: "created_at", type: "TIMESTAMP", mode: "NULLABLE" },
    ],
    partitionField: "created_at",
    clusterFields: ["agency_id", "source", "assigned_broker_id"],
  },
  {
    table: "fct_deals",
    fields: [
      { name: "deal_id", type: "STRING", mode: "REQUIRED" },
      { name: "agency_id", type: "STRING", mode: "REQUIRED" },
      { name: "apartment_id", type: "STRING", mode: "NULLABLE" },
      { name: "lead_id", type: "STRING", mode: "NULLABLE" },
      { name: "broker_id", type: "STRING", mode: "NULLABLE" },
      { name: "source", type: "STRING", mode: "REQUIRED" },
      { name: "pipeline_stage", type: "STRING", mode: "NULLABLE" },
      { name: "status", type: "STRING", mode: "NULLABLE" },
      { name: "transaction_type", type: "STRING", mode: "NULLABLE" },
      { name: "deal_value", type: "NUMERIC", mode: "NULLABLE" },
      { name: "commission_rate", type: "FLOAT64", mode: "NULLABLE" },
      { name: "commission_amount", type: "NUMERIC", mode: "NULLABLE" },
      { name: "created_at", type: "TIMESTAMP", mode: "NULLABLE" },
      { name: "closed_at", type: "TIMESTAMP", mode: "NULLABLE" },
    ],
    partitionField: "created_at",
    clusterFields: ["agency_id", "source", "status", "broker_id"],
  },
  {
    table: "fct_marketing_costs",
    fields: [
      { name: "spend_id", type: "STRING", mode: "REQUIRED" },
      { name: "agency_id", type: "STRING", mode: "REQUIRED" },
      { name: "source", type: "STRING", mode: "REQUIRED" },
      { name: "period", type: "STRING", mode: "REQUIRED" },
      { name: "spent_amount", type: "NUMERIC", mode: "REQUIRED" },
    ],
    clusterFields: ["agency_id", "source", "period"],
  },
];

function isoTimestamp(value: unknown): string | null {
  const millis = toAnalyticsMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

export function buildApartmentDimensionRow(apartment: AnalyticsApartmentRecord): DimApartmentRow {
  return {
    apartment_id: apartment.id,
    agency_id: text(apartment.agencyId),
    area: text(apartment.area),
    city: text(apartment.city),
    property_category: text(apartment.propertyCategory ?? apartment.propertyType),
    transaction_type: text(apartment.transactionType),
    status: text(apartment.status),
    published_at: isoTimestamp(apartment.publishedAt),
  };
}

export function buildBrokerDimensionRow(broker: { id: string; agencyId?: string; name?: string; agencyRole?: string; role?: string }): DimBrokerRow {
  return {
    broker_id: broker.id,
    agency_id: text(broker.agencyId),
    broker_name: text(broker.name),
    agency_role: text(broker.agencyRole ?? broker.role),
  };
}

export function buildLeadFactRow(lead: AnalyticsLeadRecord): FctLeadRow {
  return {
    lead_id: lead.id,
    agency_id: text(lead.agencyId),
    apartment_id: nullableText(lead.apartmentId),
    assigned_broker_id: nullableText(lead.assignedBrokerId),
    source: normalizeLeadSource(lead.source ?? lead.leadSource),
    created_at: isoTimestamp(lead.createdAt),
  };
}

export function buildDealFactRow(deal: AnalyticsDealRecord): FctDealRow {
  const dealValue = numeric(deal.dealValue ?? deal.dealAmount ?? deal.totalDealAmount);
  const rawRate = numeric(deal.commissionRate ?? deal.commissionPercent);
  const commissionRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const commissionAmount = numeric(deal.commissionTotal ?? deal.expectedCommission ?? deal.calculatedCommission ?? deal.dealCommission);
  return {
    deal_id: deal.id,
    agency_id: text(deal.agencyId),
    apartment_id: nullableText(deal.apartmentId),
    lead_id: nullableText(deal.leadId),
    broker_id: nullableText(deal.brokerId ?? deal.assignedBrokerId ?? deal.listingBrokerId),
    source: normalizeLeadSource(deal.source ?? deal.leadSource),
    pipeline_stage: text(deal.pipelineStage),
    status: text(deal.status),
    transaction_type: text(deal.transactionType),
    deal_value: dealValue,
    commission_rate: commissionRate,
    commission_amount: commissionAmount || dealValue * commissionRate,
    created_at: isoTimestamp(deal.createdAt),
    closed_at: isoTimestamp(deal.closedAt),
  };
}

export function buildMarketingCostFactRow(spend: MarketingCampaignSpend): FctMarketingCostRow {
  return {
    spend_id: spend.id,
    agency_id: spend.agencyId,
    source: normalizeLeadSource(spend.source),
    period: spend.month,
    spent_amount: Math.max(0, spend.spendAmount),
  };
}
