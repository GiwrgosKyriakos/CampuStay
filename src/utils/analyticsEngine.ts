import type {
  AnalyticsApartmentRecord,
  AnalyticsDealRecord,
  AnalyticsLeadRecord,
  AnalyticsTimeWindow,
  CEOAnalyticsDataset,
  CEOAnalyticsSummary,
  LeadSource,
  LostDealReason,
} from "@/src/types/analytics";
import { DEFAULT_AGENCY_PIPELINE_CONFIG, getPipelineStageProbability, type AgencyPipelineConfig } from "@/src/constants/pipeline";

export const LEAD_SOURCES: LeadSource[] = [
  "spitogatos",
  "xe_gr",
  "meta_ads",
  "google_ads",
  "agency_website",
  "referral",
  "walk_in",
  "signboard",
  "other",
];

export const LOST_DEAL_REASONS: LostDealReason[] = [
  "price_dispute",
  "legal_defect",
  "competitor_won",
  "buyer_withdrew",
  "owner_cancelled",
  "financial_issue",
];

const PIPELINE_STAGE_PERCENT: Record<string, number> = {
  liked: 10,
  lead: 10,
  new_lead: 10,
  showing_planned: 35,
  showing_scheduled: 35,
  showing_completed: 40,
  offer: 65,
  offer_made: 65,
  negotiation_agreement: 90,
  closed_won: 100,
  deal_closed: 100,
  closed_lost: 0,
  lost: 0,
};

function createCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function createSourceRoiRecord(): Record<LeadSource, { revenue: number; roiRatio: number; spend: number; roiPercent: number; netMargin: number; attributedDeals: number }> {
  return Object.fromEntries(LEAD_SOURCES.map((source) => [source, { revenue: 0, roiRatio: 0, spend: 0, roiPercent: 0, netMargin: 0, attributedDeals: 0 }])) as Record<LeadSource, { revenue: number; roiRatio: number; spend: number; roiPercent: number; netMargin: number; attributedDeals: number }>;
}

export function toAnalyticsMillis(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number; nanoseconds?: number };
    try {
      if (typeof candidate.toMillis === "function") {
        const millis = candidate.toMillis();
        if (Number.isFinite(millis)) return millis;
      }
      if (typeof candidate.toDate === "function") {
        const millis = candidate.toDate().getTime();
        if (Number.isFinite(millis)) return millis;
      }
    } catch {
      return fallback;
    }
    if (typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds)) {
      return candidate.seconds * 1000 + Math.floor((candidate.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return fallback;
}

export function getAnalyticsWindowStart(window: AnalyticsTimeWindow, now = Date.now()): number {
  const date = new Date(now);
  if (window === "month") return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  if (window === "quarter") return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1).getTime();
  if (window === "year") return new Date(date.getFullYear(), 0, 1).getTime();
  return 0;
}

export function isWithinAnalyticsWindow(value: unknown, window: AnalyticsTimeWindow, now = Date.now()): boolean {
  if (window === "all") return true;
  const millis = toAnalyticsMillis(value);
  return millis > 0 && millis >= getAnalyticsWindowStart(window, now) && millis <= now;
}

export function calculateDaysOnMarket(createdAt: unknown, statusChangeDate: unknown, now = Date.now()): number {
  const createdMillis = toAnalyticsMillis(createdAt);
  if (!createdMillis) return 0;
  const endMillis = toAnalyticsMillis(statusChangeDate, now) || now;
  return Math.max(0, (endMillis - createdMillis) / (1000 * 60 * 60 * 24));
}

export function calculateMarketingRoiPercent(revenue: number, spend: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  return ((revenue - spend) / spend) * 100;
}

export function calculateMarketingRoiRatio(revenue: number, spend: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  return revenue / spend;
}

export function calculateDealForecastValue(deal: AnalyticsDealRecord, config: AgencyPipelineConfig = DEFAULT_AGENCY_PIPELINE_CONFIG): number {
  if (isClosedDeal(deal) || isLostDeal(deal)) return 0;
  const dealValue = typeof deal.dealValue === "number" ? deal.dealValue : typeof deal.dealAmount === "number" ? deal.dealAmount : 0;
  const explicitRate = typeof deal.commissionRate === "number" ? deal.commissionRate : typeof deal.commissionPercent === "number" ? deal.commissionPercent / 100 : undefined;
  const commissionRate = explicitRate !== undefined ? (explicitRate > 1 ? explicitRate / 100 : explicitRate) : dealValue > 0 && typeof deal.commissionTotal === "number" ? deal.commissionTotal / dealValue : 0;
  const commissionBase = dealValue > 0 && explicitRate !== undefined ? dealValue * Math.max(0, commissionRate) : getCommissionAmount(deal);
  const stageKey = deal.pipelineStage ?? deal.status ?? (getStagePercent(deal) >= 90 ? "negotiation_agreement" : getStagePercent(deal) >= 65 ? "offer_made" : getStagePercent(deal) >= 35 ? "showing_completed" : "new_lead");
  return commissionBase * getPipelineStageProbability(stageKey, config);
}

export function calculateWeightedPipelineForecast(deals: AnalyticsDealRecord[], config: AgencyPipelineConfig = DEFAULT_AGENCY_PIPELINE_CONFIG): number {
  return deals.reduce((total, deal) => {
    return total + calculateDealForecastValue(deal, config);
  }, 0);
}

export function calculateAgentWinRate(closedDeals: number, totalAssignedDeals: number): number {
  if (totalAssignedDeals <= 0) return 0;
  return (closedDeals / totalAssignedDeals) * 100;
}

export function calculateFunnelAnalytics(funnel: { views: number; inquiries: number; showings: number; offers: number; closedDeals: number }): CEOAnalyticsSummary["funnelAnalytics"] {
  const steps = [funnel.views, funnel.inquiries, funnel.showings, funnel.offers, funnel.closedDeals];
  const rates = steps.slice(0, -1).map((step, index) => step > 0 ? round((steps[index + 1] / step) * 100) : 0);
  const dropOffs = steps.slice(0, -1).map((step, index) => Math.max(0, step - steps[index + 1]));
  const frictionIndex = rates.reduce((lowestIndex, rate, index) => rate < rates[lowestIndex] ? index : lowestIndex, 0);
  const frictionStages: CEOAnalyticsSummary["funnelAnalytics"]["frictionStage"][] = ["views_to_inquiries", "inquiries_to_showings", "showings_to_offers", "offers_to_closed"];
  return {
    viewsToInquiriesRate: rates[0],
    inquiriesToShowingsRate: rates[1],
    showingsToOffersRate: rates[2],
    offersToClosedRate: rates[3],
    viewsToInquiriesDropOff: dropOffs[0],
    inquiriesToShowingsDropOff: dropOffs[1],
    showingsToOffersDropOff: dropOffs[2],
    offersToClosedDropOff: dropOffs[3],
    frictionStage: frictionStages[frictionIndex],
  };
}

function normalizeKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeLeadSource(value: unknown): LeadSource {
  const source = normalizeKey(value).replace(/[ -]/g, "_");
  const legacyMap: Record<string, LeadSource> = {
    xe: "xe_gr",
    social_ads: "meta_ads",
    meta_ad: "meta_ads",
    google: "google_ads",
    website: "agency_website",
    open_house: "other",
    openhouse: "other",
    yard_sign: "other",
  };
  return LEAD_SOURCES.includes(source as LeadSource) ? source as LeadSource : legacyMap[source] ?? "other";
}

export function normalizeLostDealReason(value: unknown): LostDealReason {
  const reason = normalizeKey(value).replace(/[ -]/g, "_");
  const legacyMap: Record<string, LostDealReason> = {
    high_price: "price_dispute",
    price_too_high: "price_dispute",
    property_flaws: "legal_defect",
    loan_rejected: "financial_issue",
    legal_tax_issues: "legal_defect",
    chose_another_property: "competitor_won",
    owner_withdrew: "owner_cancelled",
    other: "financial_issue",
  };
  if (LOST_DEAL_REASONS.includes(reason as LostDealReason)) return reason as LostDealReason;
  return legacyMap[reason] ?? "buyer_withdrew";
}

export function isValidLostDealReason(value: unknown): value is LostDealReason {
  return typeof value === "string" && LOST_DEAL_REASONS.includes(value as LostDealReason);
}

function getStagePercent(deal: AnalyticsDealRecord): number {
  const numericStage = typeof deal.stage === "number" ? deal.stage : typeof deal.stagePercent === "number" ? deal.stagePercent : NaN;
  if (Number.isFinite(numericStage)) return Math.max(0, Math.min(100, numericStage));
  return PIPELINE_STAGE_PERCENT[normalizeKey(deal.pipelineStage)] ?? 0;
}

function getCommissionAmount(deal: AnalyticsDealRecord): number {
  const candidates = [deal.commissionTotal, deal.expectedCommission, deal.calculatedCommission, deal.dealCommission];
  const amount = candidates.find((candidate) => typeof candidate === "number" && Number.isFinite(candidate));
  return Math.max(0, amount ?? 0);
}

function isClosedDeal(deal: AnalyticsDealRecord): boolean {
  return getStagePercent(deal) >= 100 || ["closed", "closed_won", "deal_closed"].includes(normalizeKey(deal.status)) || normalizeKey(deal.pipelineStage) === "deal_closed";
}

function isLostDeal(deal: AnalyticsDealRecord): boolean {
  return ["cancelled", "canceled", "lost", "closed_lost"].includes(normalizeKey(deal.status)) || ["lost", "closed_lost"].includes(normalizeKey(deal.pipelineStage));
}

function isActiveListing(apartment: AnalyticsApartmentRecord): boolean {
  return !["withdrawn", "rented", "sold", "closed_deal", "closed"].includes(normalizeKey(apartment.status));
}

function getListingCreatedAt(apartment: AnalyticsApartmentRecord): unknown {
  return apartment.publishedAt;
}

function getListingEndAt(apartment: AnalyticsApartmentRecord, now: number): unknown {
  return apartment.closedAt ?? apartment.rentedAt ?? apartment.statusChangeDate ?? apartment.statusChangedAt ?? (isActiveListing(apartment) ? now : undefined);
}

function getApartmentViews(apartment: AnalyticsApartmentRecord): number {
  const value = apartment.views ?? apartment.viewCount;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getApartmentInquiries(apartment: AnalyticsApartmentRecord): number {
  const value = apartment.inquiries ?? apartment.inquiryCount;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isSalesDeal(deal: AnalyticsDealRecord, apartment?: AnalyticsApartmentRecord): boolean {
  const transactionType = normalizeKey(deal.transactionType ?? deal.propertyCategory ?? apartment?.propertyCategory ?? apartment?.propertyType);
  return transactionType.includes("sale") || transactionType.includes("πωλ") || transactionType.includes("αγορα");
}

function getAgentIds(deal: AnalyticsDealRecord): string[] {
  return Array.from(new Set([
    deal.listingBrokerId,
    deal.buyerBrokerId,
    deal.coveringBrokerId,
    deal.brokerId,
    deal.assignedBrokerId,
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
}

function getAgentAvatar(agent: { photoUrl?: string; avatar?: string; photos?: string[] }): string {
  return agent.photoUrl?.trim() || agent.avatar?.trim() || agent.photos?.find((photo) => photo.trim())?.trim() || "";
}

function getPeriodValue(record: { createdAt?: unknown; updatedAt?: unknown; closedAt?: unknown; lostAt?: unknown }): unknown {
  return record.closedAt ?? record.lostAt ?? record.updatedAt ?? record.createdAt;
}

function isSpendWithinWindow(period: string, window: AnalyticsTimeWindow, now: number): boolean {
  if (window === "all") return true;
  const periodDate = /^\d{4}-\d{2}$/.test(period) ? Date.parse(`${period}-01T00:00:00`) : 0;
  return periodDate > 0 && periodDate >= getAnalyticsWindowStart(window, now) && periodDate <= now;
}

function getDealSource(deal: AnalyticsDealRecord, leadsById: Map<string, AnalyticsLeadRecord>): LeadSource {
  const lead = deal.leadId ? leadsById.get(deal.leadId) : undefined;
  return normalizeLeadSource(lead?.source ?? lead?.leadSource ?? deal.source ?? deal.leadSource);
}

function getExpectedCloseAt(deal: AnalyticsDealRecord, now: number): number {
  const candidate = deal.expectedCloseAt ?? deal.expectedClosingDate ?? deal.targetCloseDate ?? deal.estimatedClosingDate;
  return toAnalyticsMillis(candidate, now + 60 * 24 * 60 * 60 * 1000);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateCEOAnalyticsSummary(
  dataset: CEOAnalyticsDataset,
  options: { window?: AnalyticsTimeWindow; now?: number; pipelineConfig?: AgencyPipelineConfig } = {},
): CEOAnalyticsSummary {
  const window = options.window ?? "all";
  const now = options.now ?? Date.now();
  const apartments = dataset.apartments.filter((apartment) => {
    const publishedAt = toAnalyticsMillis(apartment.publishedAt);
    const closedAt = toAnalyticsMillis(apartment.closedAt ?? apartment.rentedAt ?? apartment.statusChangeDate ?? apartment.statusChangedAt);
    if (window === "all") return publishedAt > 0;
    const windowStart = getAnalyticsWindowStart(window, now);
    return publishedAt > 0 && publishedAt <= now && (isActiveListing(apartment) ? publishedAt <= now : closedAt >= windowStart && closedAt <= now);
  });
  const deals = dataset.deals.filter((deal) => isWithinAnalyticsWindow(getPeriodValue(deal), window, now));
  const leads = dataset.leads.filter((lead) => isWithinAnalyticsWindow(lead.createdAt, window, now));
  const interactions = dataset.interactions.filter((interaction) => isWithinAnalyticsWindow(interaction.createdAt, window, now));
  const spends = dataset.campaignSpends.filter((spend) => isSpendWithinWindow(spend.month, window, now));
  const leadsById = new Map(dataset.leads.map((lead) => [lead.id, lead]));

  const listingDoms = apartments.map((apartment) => ({
    id: apartment.id,
    title: apartment.title?.trim() || "Ακίνητο",
    area: apartment.area?.trim() || apartment.city?.trim() || "Άγνωστη περιοχή",
    daysOnMarket: calculateDaysOnMarket(getListingCreatedAt(apartment), getListingEndAt(apartment, now), now),
  }));
  const pendingListingDoms = listingDoms.filter((listing) => {
    const apartment = apartments.find((candidate) => candidate.id === listing.id);
    return apartment ? isActiveListing(apartment) : false;
  });
  const domByArea: Record<string, number> = {};
  const domCountByArea: Record<string, number> = {};
  listingDoms.forEach((listing) => {
    domByArea[listing.area] = (domByArea[listing.area] ?? 0) + listing.daysOnMarket;
    domCountByArea[listing.area] = (domCountByArea[listing.area] ?? 0) + 1;
  });
  Object.keys(domByArea).forEach((area) => {
    domByArea[area] = round(domByArea[area] / domCountByArea[area]);
  });

  const leadDistribution = createCountRecord(LEAD_SOURCES);
  leads.forEach((lead) => {
    leadDistribution[normalizeLeadSource(lead.source ?? lead.leadSource)] += 1;
  });
  const revenueBySource = createCountRecord(LEAD_SOURCES);
  deals.filter(isClosedDeal).forEach((deal) => {
    revenueBySource[getDealSource(deal, leadsById)] += getCommissionAmount(deal);
  });
  const roiBySource = createSourceRoiRecord();
  spends.forEach((spend) => {
    roiBySource[normalizeLeadSource(spend.source)].spend += Math.max(0, spend.spendAmount || 0);
  });
  LEAD_SOURCES.forEach((source) => {
    roiBySource[source].revenue = revenueBySource[source];
    roiBySource[source].roiRatio = round(calculateMarketingRoiRatio(roiBySource[source].revenue, roiBySource[source].spend));
    roiBySource[source].roiPercent = round(calculateMarketingRoiPercent(roiBySource[source].revenue, roiBySource[source].spend));
    roiBySource[source].netMargin = round(roiBySource[source].revenue - roiBySource[source].spend);
    roiBySource[source].attributedDeals = deals.filter((deal) => isClosedDeal(deal) && getDealSource(deal, leadsById) === source).length;
  });

  const closedDeals = deals.filter(isClosedDeal);
  const agentsMetrics = dataset.agents.map((agent) => {
    const agentDeals = deals.filter((deal) => getAgentIds(deal).includes(agent.id));
    const agentClosedDeals = agentDeals.filter(isClosedDeal);
    const negotiatedDeals = agentDeals.filter((deal) => getStagePercent(deal) >= 65 || ["offer", "negotiation", "under_negotiation", "closed", "lost", "cancelled"].includes(normalizeKey(deal.pipelineStage ?? deal.status)));
    const closingDurations = agentClosedDeals.map((deal) => {
      const start = toAnalyticsMillis(deal.inquiryAt ?? deal.offerSubmittedAt ?? deal.createdAt);
      const end = toAnalyticsMillis(deal.deedExecutedAt ?? deal.closedAt ?? deal.updatedAt);
      return start && end >= start ? (end - start) / (1000 * 60 * 60 * 24) : 0;
    }).filter((days) => days > 0);
    const activeListingsCount = apartments.filter((apartment) => isActiveListing(apartment) && apartment.assignedBrokerIds?.includes(agent.id)).length;
    const showingsCount = interactions.filter((interaction) => (interaction.brokerId ?? interaction.loggedByUserId) === agent.id && ["showing", "visit"].includes(normalizeKey(interaction.type))).length;
    const callsCount = interactions.filter((interaction) => (interaction.brokerId ?? interaction.loggedByUserId) === agent.id && ["call", "phone"].includes(normalizeKey(interaction.type))).length;
    const newListingsCount = apartments.filter((apartment) => apartment.assignedBrokerIds?.includes(agent.id) && isWithinAnalyticsWindow(apartment.publishedAt ?? apartment.createdAt, window, now)).length;
    const avatarUrl = getAgentAvatar(agent);
    return {
      brokerId: agent.id,
      brokerName: agent.name?.trim() || "Συνεργάτης",
      ...(avatarUrl ? { avatarUrl } : {}),
      activeListingsCount,
      showingsCount,
      callsCount,
      scheduledShowingsCount: showingsCount,
      newListingsCount,
      dealsClosedCount: agentClosedDeals.length,
      winRate: round(calculateAgentWinRate(agentClosedDeals.length, negotiatedDeals.length)),
      avgClosingTimeDays: round(closingDurations.length ? closingDurations.reduce((total, days) => total + days, 0) / closingDurations.length : 0),
    };
  }).sort((first, second) => second.winRate - first.winRate || second.dealsClosedCount - first.dealsClosedCount);

  const lostReasonCounts = createCountRecord(LOST_DEAL_REASONS);
  const explicitLostDeals = dataset.lostDeals.filter((loss) => isWithinAnalyticsWindow(loss.lostAt, window, now));
  explicitLostDeals.forEach((loss) => { lostReasonCounts[normalizeLostDealReason(loss.lostReason)] += 1; });
  if (explicitLostDeals.length === 0) {
    deals.filter(isLostDeal).forEach((deal) => { lostReasonCounts[normalizeLostDealReason(deal.lossReason ?? deal.reason)] += 1; });
  }

  const realizedRevenue = closedDeals.reduce((result, deal) => {
    const apartment = apartments.find((candidate) => candidate.id === deal.apartmentId);
    const commission = getCommissionAmount(deal);
    const retained = typeof deal.agencyCutAmount === "number"
      ? deal.agencyCutAmount
      : commission * (typeof deal.agencyCutPercentage === "number" ? deal.agencyCutPercentage : 0) / 100;
    result.totalRevenue += commission;
    result.agencyRetainedNet += retained;
    if (isSalesDeal(deal, apartment)) result.salesCommission += commission;
    else result.rentalsCommission += commission;
    return result;
  }, { totalRevenue: 0, salesCommission: 0, rentalsCommission: 0, agencyRetainedNet: 0 });

  const roommateSeekersByArea: Record<string, number> = {};
  dataset.roommateSeekers.forEach((seeker) => {
    const area = seeker.area?.trim() || seeker.city?.trim() || "Άγνωστη περιοχή";
    roommateSeekersByArea[area] = (roommateSeekersByArea[area] ?? 0) + 1;
  });
  const roommateListingsByArea: Record<string, number> = {};
  apartments.forEach((apartment) => {
    const category = normalizeKey(apartment.propertyCategory ?? apartment.propertyType);
    const isRoommateListing = apartment.isRoommateListing === true || apartment.roommateAvailable === true || category.includes("roommate") || category.includes("συγκατοικ");
    if (!isRoommateListing || !isActiveListing(apartment)) return;
    const area = apartment.area?.trim() || apartment.city?.trim() || "Άγνωστη περιοχή";
    const rooms = typeof apartment.availableRooms === "number" && apartment.availableRooms > 0 ? apartment.availableRooms : 1;
    roommateListingsByArea[area] = (roommateListingsByArea[area] ?? 0) + rooms;
  });
  const areas = new Set([...Object.keys(roommateSeekersByArea), ...Object.keys(roommateListingsByArea)]);
  const supplyDemandRatioByArea: Record<string, { seekers: number; availableRooms: number; ratio: number }> = {};
  areas.forEach((area) => {
    const seekers = roommateSeekersByArea[area] ?? 0;
    const availableRooms = roommateListingsByArea[area] ?? 0;
    supplyDemandRatioByArea[area] = { seekers, availableRooms, ratio: availableRooms > 0 ? round(seekers / availableRooms) : seekers > 0 ? seekers : 0 };
  });
  const roommateMatches = dataset.roommateMatches.filter((match) => isWithinAnalyticsWindow(match.matchedAt ?? match.createdAt, window, now));
  const successfulMatches = roommateMatches.filter((match) => match.successful === true || ["success", "successful", "closed"].includes(normalizeKey(match.status)));
  const matchDurations = successfulMatches.map((match) => {
    const start = toAnalyticsMillis(match.createdAt);
    const end = toAnalyticsMillis(match.matchedAt);
    return start && end >= start ? (end - start) / (1000 * 60 * 60 * 24) : 0;
  }).filter((days) => days > 0);
  const totalMarketingSpend = LEAD_SOURCES.reduce((total, source) => total + roiBySource[source].spend, 0);
  const totalRealizedRevenue = realizedRevenue.totalRevenue;
  const totalViews = apartments.reduce((total, apartment) => total + getApartmentViews(apartment), 0);
  const totalInquiries = apartments.reduce((total, apartment) => total + getApartmentInquiries(apartment), 0) || leads.length;
  const totalShowings = agentsMetrics.reduce((total, agent) => total + agent.showingsCount, 0);
  const totalOffers = deals.filter((deal) => getStagePercent(deal) >= 65 && !isClosedDeal(deal) && !isLostDeal(deal)).length;
  const funnel = { views: totalViews, inquiries: totalInquiries, showings: totalShowings, offers: totalOffers, closedDeals: closedDeals.length };
  const pipelineConfig = options.pipelineConfig ?? DEFAULT_AGENCY_PIPELINE_CONFIG;
  const weightedForecast = deals.reduce((forecast, deal) => {
    if (isClosedDeal(deal) || isLostDeal(deal)) return forecast;
    const value = calculateDealForecastValue(deal, pipelineConfig);
    const expectedCloseAt = getExpectedCloseAt(deal, now);
    if (expectedCloseAt <= now + 30 * 24 * 60 * 60 * 1000) forecast.next30Days += value;
    if (expectedCloseAt <= now + 60 * 24 * 60 * 60 * 1000) forecast.next60Days += value;
    return forecast;
  }, { next30Days: 0, next60Days: 0 });
  const negotiatedDeals = deals.filter((deal) => getStagePercent(deal) >= 65 || ["offer", "negotiation", "under_negotiation", "closed", "lost", "cancelled"].includes(normalizeKey(deal.pipelineStage ?? deal.status))).length;
  const actualWinRate = negotiatedDeals > 0 ? closedDeals.length / negotiatedDeals : 0;
  const averageDom = listingDoms.length ? listingDoms.reduce((total, listing) => total + listing.daysOnMarket, 0) / listingDoms.length : 0;

  return {
    listingFunnel: { ...funnel, lostDeals: Object.values(lostReasonCounts).reduce((total, count) => total + count, 0) },
    funnelAnalytics: calculateFunnelAnalytics(funnel),
    totalActiveListings: apartments.filter(isActiveListing).length,
    totalViews,
    totalInquiries,
    listingConversionRate: round((totalViews > 0 ? (totalInquiries / totalViews) * 100 : 0)),
    averageDaysOnMarket: round(listingDoms.length ? listingDoms.reduce((total, listing) => total + listing.daysOnMarket, 0) / listingDoms.length : 0),
    domByArea,
    averageDomByAreaAndCategory: {},
    longestPendingListings: pendingListingDoms.sort((first, second) => second.daysOnMarket - first.daysOnMarket).slice(0, 3),
    leadDistribution,
    revenueBySource,
    roiBySource,
    agentsMetrics,
    lostDealsSummary: { totalLost: Object.values(lostReasonCounts).reduce((total, count) => total + count, 0), reasonsBreakdown: lostReasonCounts },
    realizedRevenue: {
      totalRevenue: round(realizedRevenue.totalRevenue),
      salesCommission: round(realizedRevenue.salesCommission),
      rentalsCommission: round(realizedRevenue.rentalsCommission),
      agencyRetainedNet: round(realizedRevenue.agencyRetainedNet),
    },
    weightedForecastRevenue: round(calculateWeightedPipelineForecast(deals, pipelineConfig)),
    weightedForecast: { next30Days: round(weightedForecast.next30Days), next60Days: round(weightedForecast.next60Days) },
    benchmarkMetrics: {
      targetMonthlyRevenue: pipelineConfig.benchmarks.targetMonthlyRevenue,
      revenueAchievementPercent: round(pipelineConfig.benchmarks.targetMonthlyRevenue > 0 ? (realizedRevenue.totalRevenue / pipelineConfig.benchmarks.targetMonthlyRevenue) * 100 : 0),
      targetDaysOnMarket: pipelineConfig.benchmarks.targetDaysOnMarket,
      daysOnMarketDelta: round(averageDom - pipelineConfig.benchmarks.targetDaysOnMarket),
      targetWinRate: pipelineConfig.benchmarks.targetWinRate,
      actualWinRate: round(actualWinRate),
      winRateDelta: round(actualWinRate - pipelineConfig.benchmarks.targetWinRate),
    },
    roommateAnalytics: {
      supplyDemandRatioByArea,
      averageMatchTimeDays: round(matchDurations.length ? matchDurations.reduce((total, days) => total + days, 0) / matchDurations.length : 0),
      successfulMatchRate: round(roommateMatches.length ? (successfulMatches.length / roommateMatches.length) * 100 : 0),
      estimatedCAC: round(successfulMatches.length ? totalMarketingSpend / successfulMatches.length : 0),
      estimatedLTV: round(successfulMatches.length ? totalRealizedRevenue / successfulMatches.length : 0),
    },
    revenueTimeSeries: { month: [], quarter: [], year: [] },
    settlementAccounting: { grossCommission: round(realizedRevenue.totalRevenue), agencyRetainedShare: round(realizedRevenue.agencyRetainedNet), brokerSplitPayouts: round(realizedRevenue.totalRevenue - realizedRevenue.agencyRetainedNet), pendingInvoices: 0, settledInvoices: closedDeals.length },
  };
}

export function isExecutiveAnalyticsRole(role: unknown): boolean {
  return role === "ceo" || role === "secretary";
}