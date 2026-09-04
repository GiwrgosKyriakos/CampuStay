import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Query,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { getAgencyPipelineConfig } from "@/src/api/pipelineConfig";
import {
  calculateCEOAnalyticsSummary,
  calculateFunnelAnalytics,
  normalizeLeadSource,
  normalizeLostDealReason,
  isExecutiveAnalyticsRole,
} from "@/src/utils/analyticsEngine";
import type {
  AnalyticsAgentRecord,
  AnalyticsApartmentRecord,
  AnalyticsDealRecord,
  AnalyticsInteractionRecord,
  AnalyticsLeadRecord,
  AnalyticsRoommateMatchRecord,
  AnalyticsRoommateSeekerRecord,
  CEOAnalyticsDataset,
  CEOAnalyticsSummary,
  AnalyticsTimeWindow,
  LostDealRecord,
  MarketingCampaignSpend,
  SourceRoiSummary,
  LeadSource,
  LostDealReason,
} from "@/src/types/analytics";

const MATERIALIZED_SOURCES = ["spitogatos", "xe_gr", "meta_ads", "google_ads", "agency_website", "referral", "walk_in", "signboard", "other"] as const;
const MATERIALIZED_LOST_REASONS = ["price_dispute", "legal_defect", "competitor_won", "buyer_withdrew", "owner_cancelled", "financial_issue"] as const;

type UserRecord = Record<string, unknown>;

async function safeGetDocs<T = DocumentData>(reference: Query<T>): Promise<T[] | null> {
  try {
    const snapshot = await getDocs(reference);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapUser(id: string, data: UserRecord): AnalyticsAgentRecord {
  return {
    id,
    name: stringValue(data.name) || "Συνεργάτης",
    ...(stringValue(data.photoUrl) ? { photoUrl: stringValue(data.photoUrl) } : {}),
    ...(stringValue(data.avatar) ? { avatar: stringValue(data.avatar) } : {}),
    ...(Array.isArray(data.photos) ? { photos: data.photos.filter((photo): photo is string => typeof photo === "string") } : {}),
    is_broker: data.is_broker === true,
    ...(stringValue(data.agencyRole) ? { agencyRole: stringValue(data.agencyRole) } : {}),
    ...(stringValue(data.role) ? { role: stringValue(data.role) } : {}),
  };
}

function mapApartment(id: string, data: UserRecord): AnalyticsApartmentRecord {
  return {
    id,
    ...data,
    ...(stringValue(data.agencyId) ? { agencyId: stringValue(data.agencyId) } : {}),
    ...(Array.isArray(data.assignedBrokerIds) ? { assignedBrokerIds: data.assignedBrokerIds.filter((brokerId): brokerId is string => typeof brokerId === "string") } : {}),
    ...(numberValue(data.views) !== undefined ? { views: numberValue(data.views) } : {}),
    ...(numberValue(data.viewCount) !== undefined ? { viewCount: numberValue(data.viewCount) } : {}),
    ...(numberValue(data.inquiries) !== undefined ? { inquiries: numberValue(data.inquiries) } : {}),
    ...(numberValue(data.inquiryCount) !== undefined ? { inquiryCount: numberValue(data.inquiryCount) } : {}),
  };
}

function mapDeal(id: string, data: UserRecord, fallbackBrokerId?: string): AnalyticsDealRecord {
  return {
    id,
    ...data,
    ...(fallbackBrokerId ? { brokerId: fallbackBrokerId } : {}),
  };
}

function mapLead(id: string, data: UserRecord): AnalyticsLeadRecord {
  return { id, ...data } as AnalyticsLeadRecord;
}

function mapLostDeal(id: string, data: UserRecord): LostDealRecord | null {
  const lostAt = numberValue(data.lostAt);
  if (!lostAt) return null;
  const dealId = stringValue(data.dealId) || id;
  const apartmentId = stringValue(data.apartmentId);
  const brokerId = stringValue(data.brokerId);
  const clientId = stringValue(data.clientId);
  if (!apartmentId || !brokerId || !clientId) return null;
  return {
    dealId,
    apartmentId,
    ...(stringValue(data.agencyId) ? { agencyId: stringValue(data.agencyId) } : {}),
    brokerId,
    clientId,
    lostAt,
    lostReason: normalizeLostDealReason(data.lostReason ?? data.reason),
    ...(stringValue(data.notes) ? { notes: stringValue(data.notes) } : {}),
    stageBeforeLoss: numberValue(data.stageBeforeLoss) ?? 0,
    potentialRevenueLoss: numberValue(data.potentialRevenueLoss) ?? numberValue(data.commissionTotal) ?? numberValue(data.dealCommission) ?? 0,
  };
}

function mapCampaignSpend(id: string, data: UserRecord, agencyId: string): MarketingCampaignSpend {
  return {
    id,
    agencyId,
    source: normalizeLeadSource(data.source ?? data.leadSource),
    month: stringValue(data.month ?? data.period),
    spendAmount: numberValue(data.spendAmount) ?? numberValue(data.spentAmount) ?? numberValue(data.amount) ?? 0,
    currency: "EUR",
    recordedAt: numberValue(data.recordedAt) ?? 0,
    recordedBy: stringValue(data.recordedBy),
  };
}

function mapRoommateSeeker(id: string, data: UserRecord): AnalyticsRoommateSeekerRecord {
  return {
    id,
    area: stringValue(data.area),
    city: stringValue(data.city),
    ...(typeof data.looking_for_roommate === "boolean" ? { looking_for_roommate: data.looking_for_roommate } : {}),
    ...(typeof data.isLookingForRoommate === "boolean" ? { isLookingForRoommate: data.isLookingForRoommate } : {}),
    not_looking_for_roommate: data.not_looking_for_roommate === true,
  };
}

function mapRoommateMatch(id: string, data: UserRecord): AnalyticsRoommateMatchRecord {
  return {
    id,
    ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
    ...(data.matchedAt !== undefined ? { matchedAt: data.matchedAt } : {}),
    ...(typeof data.successful === "boolean" ? { successful: data.successful } : {}),
    ...(stringValue(data.status) ? { status: stringValue(data.status) } : {}),
  };
}

export async function loadCEOAnalyticsDataset(userId: string, agencyIdOverride?: string): Promise<CEOAnalyticsDataset> {
  const userSnapshot = await getDoc(doc(db, "users", userId));
  if (!userSnapshot.exists()) throw new Error("Ο χρήστης δεν βρέθηκε.");
  const userData = userSnapshot.data() as UserRecord;
  const role = stringValue(userData.agencyRole) || stringValue(userData.role);
  if (!isExecutiveAnalyticsRole(role)) throw new Error("Δεν υπάρχει πρόσβαση στις αναφορές.");
  const agencyId = agencyIdOverride?.trim() || stringValue(userData.agencyId);
  if (!agencyId) throw new Error("Δεν βρέθηκε agency για τις αναφορές.");

  const [usersRows, apartmentsRows, topLevelDealsRows, leadsRows, spendRows, lostRows, roommateRows, roommateMatchRows] = await Promise.all([
    safeGetDocs(query(collection(db, "users"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "apartments"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "deals"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "leads"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "agencies", agencyId, "campaign_spends"))),
    safeGetDocs(query(collection(db, "lost_deals"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "users"), where("looking_for_roommate", "==", true))),
    safeGetDocs(query(collection(db, "roommateMatches"), where("agencyId", "==", agencyId))),
  ]);

  const userRows = usersRows ?? [];
  const usersById = new Map<string, UserRecord>();
  usersById.set(userId, userData);
  userRows.forEach((row) => {
    const data = row as UserRecord & { id?: string };
    if (typeof data.id === "string") usersById.set(data.id, data);
  });
  const agents = [...usersById.entries()]
    .filter(([, data]) => data.is_broker === true || ["ceo", "secretary", "broker", "member"].includes(stringValue(data.agencyRole) || stringValue(data.role)))
    .map(([id, data]) => mapUser(id, data));

  const apartmentRows = (apartmentsRows ?? []) as (UserRecord & { id: string })[];
  const apartments = apartmentRows.map((row) => mapApartment(row.id, row));
  const topLevelDeals = (topLevelDealsRows ?? []).map((row) => mapDeal(String((row as { id?: string }).id ?? "deal"), row as UserRecord));
  const dealMap = new Map(topLevelDeals.map((deal) => [deal.id, deal]));

  const interactionRows = await Promise.all(apartments.map(async (apartment) => {
    const rows = await safeGetDocs(collection(db, "apartments", apartment.id, "interactions"));
    return (rows ?? []).map((row) => ({ id: String((row as { id?: string }).id ?? "interaction"), ...(row as UserRecord) } as AnalyticsInteractionRecord));
  }));

  const lostDeals = (lostRows ?? []).map((row) => mapLostDeal(String((row as { id?: string }).id ?? "lost"), row as UserRecord)).filter((row): row is LostDealRecord => row !== null);
  const roommateSeekers = (roommateRows ?? []).map((row) => {
    const typed = row as UserRecord & { id?: string };
    return mapRoommateSeeker(typed.id ?? "seeker", typed);
  }).filter((seeker) => seeker.not_looking_for_roommate !== true);

  return {
    apartments,
    deals: [...dealMap.values()].map((deal) => ({ ...deal, agencyId: deal.agencyId || agencyId })),
    agents,
    leads: (leadsRows ?? []).map((row) => mapLead(String((row as { id?: string }).id ?? "lead"), row as UserRecord)),
    campaignSpends: (spendRows ?? []).map((row) => mapCampaignSpend(String((row as { id?: string }).id ?? "spend"), row as UserRecord, agencyId)),
    lostDeals,
    interactions: interactionRows.flat(),
    roommateSeekers,
    roommateMatches: (roommateMatchRows ?? []).map((row) => mapRoommateMatch(String((row as { id?: string }).id ?? "match"), row as UserRecord)),
  };
}

export async function loadCEOAnalyticsSummary(params: { userId: string; agencyId?: string | null; window?: AnalyticsTimeWindow; now?: number }): Promise<CEOAnalyticsSummary> {
  const userSnapshot = await getDoc(doc(db, "users", params.userId));
  if (!userSnapshot.exists()) throw new Error("Ο χρήστης δεν βρέθηκε.");
  const userData = userSnapshot.data() as UserRecord;
  const role = stringValue(userData.agencyRole) || stringValue(userData.role);
  if (!isExecutiveAnalyticsRole(role)) throw new Error("Δεν υπάρχει πρόσβαση στις αναφορές.");
  const agencyId = params.agencyId?.trim() || stringValue(userData.agencyId);
  if (!agencyId) throw new Error("Δεν βρέθηκε agency για τις αναφορές.");
  const now = params.now ?? Date.now();
  const currentDate = new Date(now);
  const month = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodId = params.window === "quarter" ? `${currentDate.getUTCFullYear()}-Q${Math.floor(currentDate.getUTCMonth() / 3) + 1}` : params.window === "year" ? String(currentDate.getUTCFullYear()) : params.window === "all" ? "all" : month;
  const summarySnapshot = await getDoc(doc(db, "agencies", agencyId, "analytics_summaries", periodId));
  if (!summarySnapshot.exists()) {
    const dataset = await loadCEOAnalyticsDataset(params.userId, agencyId);
    return calculateCEOAnalyticsSummary(dataset, { window: params.window, now, pipelineConfig: await getAgencyPipelineConfig(agencyId) });
  }
  return mapMaterializedSummary(summarySnapshot.data() as Record<string, unknown>);
}

export function subscribeCEOAnalyticsSummary(params: { userId: string; agencyId?: string | null; window?: AnalyticsTimeWindow; now?: number }, onChange: (summary: CEOAnalyticsSummary) => void, onError: (error: Error) => void): Unsubscribe {
  const agencyId = params.agencyId?.trim();
  if (!agencyId) {
    onError(new Error("Δεν βρέθηκε agency για τις αναφορές."));
    return () => undefined;
  }
  const currentDate = new Date(params.now ?? Date.now());
  const month = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodId = params.window === "quarter" ? `${currentDate.getUTCFullYear()}-Q${Math.floor(currentDate.getUTCMonth() / 3) + 1}` : params.window === "year" ? String(currentDate.getUTCFullYear()) : params.window === "all" ? "all" : month;
  return onSnapshot(doc(db, "agencies", agencyId, "analytics_summaries", periodId), (snapshot) => {
    if (snapshot.exists()) {
      onChange(mapMaterializedSummary(snapshot.data() as Record<string, unknown>));
      return;
    }
    void loadCEOAnalyticsSummary(params).then(onChange).catch((error: unknown) => onError(error instanceof Error ? error : new Error("Δεν ήταν δυνατή η φόρτωση των αναφορών.")));
  }, (error) => onError(error));
}

function mapMaterializedSummary(data: Record<string, unknown>): CEOAnalyticsSummary {
  const funnel = (data.funnel && typeof data.funnel === "object" ? data.funnel : {}) as Record<string, unknown>;
  const readNumber = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const readRecord = (value: unknown): Record<string, number> => value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, readNumber(item)])) : {};
  const leadDistribution = Object.fromEntries(MATERIALIZED_SOURCES.map((source) => [source, readRecord(data.leadCountsBySource)[source] ?? 0])) as Record<LeadSource, number>;
  const revenueBySource = Object.fromEntries(MATERIALIZED_SOURCES.map((source) => [source, readRecord(data.attributedRevenueBySource)[source] ?? 0])) as Record<LeadSource, number>;
  const attributedDealsBySource = readRecord(data.attributedDealsBySource);
  const spendBySource = readRecord(data.campaignSpendBySource);
  const roiBySource = Object.fromEntries(MATERIALIZED_SOURCES.map((source) => {
    const spend = spendBySource[source] ?? 0;
    const revenue = revenueBySource[source];
    return [source, { revenue, spend, roiRatio: spend > 0 ? revenue / spend : 0, roiPercent: spend > 0 ? ((revenue - spend) / spend) * 100 : 0, netMargin: revenue - spend, attributedDeals: attributedDealsBySource[source] ?? 0 }];
  })) as Record<LeadSource, SourceRoiSummary>;
  const reasons = readRecord(data.lostReasonCounts);
  const reasonsBreakdown = Object.fromEntries(MATERIALIZED_LOST_REASONS.map((reason) => [reason, reasons[reason] ?? 0])) as Record<LostDealReason, number>;
  const totalLost = Object.values(reasonsBreakdown).reduce((sum, value) => sum + value, 0);
  const totalViews = readNumber(data.totalViews) || readNumber(funnel.views);
  const totalInquiries = readNumber(data.totalInquiries) || readNumber(funnel.inquiries);
  const normalizedFunnel = { views: totalViews, inquiries: totalInquiries, showings: readNumber(funnel.showings), offers: readNumber(funnel.offers), closedDeals: readNumber(funnel.closedDeals) };
  const funnelAnalytics = data.funnelAnalytics && typeof data.funnelAnalytics === "object" ? data.funnelAnalytics as CEOAnalyticsSummary["funnelAnalytics"] : calculateFunnelAnalytics(normalizedFunnel);
  const readSeries = (value: unknown): CEOAnalyticsSummary["revenueTimeSeries"]["month"] => value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([period, point]) => {
    const values = point && typeof point === "object" ? point as Record<string, unknown> : {};
    return { period, grossCommission: readNumber(values.grossCommission), saleCommission: readNumber(values.saleCommission), rentCommission: readNumber(values.rentCommission), agencyRetainedShare: readNumber(values.agencyRetainedShare), brokerSplitPayouts: readNumber(values.brokerSplitPayouts) };
  }) : [];
  const settlement = data.settlementAccounting && typeof data.settlementAccounting === "object" ? data.settlementAccounting as Record<string, unknown> : {};
  const agentsMetrics = Array.isArray(data.agentMetrics) ? data.agentMetrics.map((agent) => {
    const values = agent && typeof agent === "object" ? agent as Record<string, unknown> : {};
    return {
      brokerId: stringValue(values.brokerId),
      brokerName: stringValue(values.brokerName) || "Συνεργάτης",
      activeListingsCount: readNumber(values.activeListingsCount),
      showingsCount: readNumber(values.showingsCount),
      callsCount: readNumber(values.callsCount),
      scheduledShowingsCount: readNumber(values.scheduledShowingsCount),
      newListingsCount: readNumber(values.newListingsCount),
      dealsClosedCount: readNumber(values.dealsClosedCount),
      winRate: readNumber(values.winRate),
      avgClosingTimeDays: readNumber(values.avgClosingTimeDays),
    };
  }).filter((agent) => agent.brokerId) : [];
  return {
    listingFunnel: { ...normalizedFunnel, lostDeals: totalLost },
    funnelAnalytics,
    totalActiveListings: readNumber(data.totalActiveListings),
    totalViews,
    totalInquiries,
    listingConversionRate: readNumber(data.listingConversionRate),
    averageDaysOnMarket: readNumber(data.averageDaysOnMarket),
    domByArea: {},
    averageDomByAreaAndCategory: readRecord(data.averageDomByAreaAndCategory),
    longestPendingListings: [],
    leadDistribution,
    revenueBySource,
    roiBySource,
    agentsMetrics,
    lostDealsSummary: { totalLost, reasonsBreakdown },
    realizedRevenue: { totalRevenue: readNumber(data.realizedRevenue), salesCommission: 0, rentalsCommission: 0, agencyRetainedNet: 0 },
    weightedForecastRevenue: readNumber(data.weightedForecastRevenue),
    weightedForecast: { next30Days: readNumber((data.weightedForecast as Record<string, unknown> | undefined)?.next30Days), next60Days: readNumber((data.weightedForecast as Record<string, unknown> | undefined)?.next60Days) },
    benchmarkMetrics: {
      targetMonthlyRevenue: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.targetMonthlyRevenue),
      revenueAchievementPercent: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.revenueAchievementPercent),
      targetDaysOnMarket: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.targetDaysOnMarket),
      daysOnMarketDelta: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.daysOnMarketDelta),
      targetWinRate: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.targetWinRate),
      actualWinRate: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.actualWinRate),
      winRateDelta: readNumber((data.benchmarkMetrics as Record<string, unknown> | undefined)?.winRateDelta),
    },
    roommateAnalytics: { supplyDemandRatioByArea: {}, averageMatchTimeDays: 0, successfulMatchRate: 0, estimatedCAC: 0, estimatedLTV: 0 },
    revenueTimeSeries: { month: readSeries(data.revenueByMonth), quarter: readSeries(data.revenueByQuarter), year: readSeries(data.revenueByYear) },
    settlementAccounting: { grossCommission: readNumber(settlement.grossCommission), agencyRetainedShare: readNumber(settlement.agencyRetainedShare), brokerSplitPayouts: readNumber(settlement.brokerSplitPayouts), pendingInvoices: readNumber(settlement.pendingInvoices), settledInvoices: readNumber(settlement.settledInvoices) },
  };
}