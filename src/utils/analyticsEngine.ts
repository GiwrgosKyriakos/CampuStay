import type {
  AnalyticsApartmentRecord,
  AnalyticsDealRecord,
  AnalyticsTimeWindow,
  CEOAnalyticsDataset,
  CEOAnalyticsSummary,
  LeadSource,
  LostDealReason,
} from "@/src/types/analytics";

export const LEAD_SOURCES: LeadSource[] = [
  "spitogatos",
  "xe",
  "social_ads",
  "agency_website",
  "referral",
  "yard_sign",
  "walk_in",
  "other",
];

export const LOST_DEAL_REASONS: LostDealReason[] = [
  "price_too_high",
  "property_flaws",
  "legal_tax_issues",
  "competitor_won",
  "buyer_withdrew",
  "owner_cancelled",
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

function createSourceRoiRecord(): Record<LeadSource, { revenue: number; roiRatio: number; spend: number }> {
  return Object.fromEntries(LEAD_SOURCES.map((source) => [source, { revenue: 0, roiRatio: 0, spend: 0 }])) as Record<LeadSource, { revenue: number; roiRatio: number; spend: number }>;
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

export function calculateWeightedPipelineForecast(deals: AnalyticsDealRecord[]): number {
  return deals.reduce((total, deal) => {
    if (isClosedDeal(deal) || isLostDeal(deal)) return total;
    return total + getCommissionAmount(deal) * (getStagePercent(deal) / 100);
  }, 0);
}

export function calculateAgentWinRate(closedDeals: number, totalAssignedDeals: number): number {
  if (totalAssignedDeals <= 0) return 0;
  return (closedDeals / totalAssignedDeals) * 100;
}

function normalizeKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeLeadSource(value: unknown): LeadSource {
  const source = normalizeKey(value).replace(/[ -]/g, "_");
  return LEAD_SOURCES.includes(source as LeadSource) ? source as LeadSource : "other";
}

export function normalizeLostDealReason(value: unknown): LostDealReason {
  const reason = normalizeKey(value).replace(/[ -]/g, "_");
  const legacyMap: Record<string, LostDealReason> = {
    high_price: "price_too_high",
    loan_rejected: "legal_tax_issues",
    chose_another_property: "competitor_won",
    owner_withdrew: "owner_cancelled",
    other: "buyer_withdrew",
  };
  if (LOST_DEAL_REASONS.includes(reason as LostDealReason)) return reason as LostDealReason;
  return legacyMap[reason] ?? "buyer_withdrew";
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
  return apartment.createdAt ?? apartment.publishedAt;
}

function getListingEndAt(apartment: AnalyticsApartmentRecord, now: number): unknown {
  return apartment.statusChangeDate ?? apartment.statusChangedAt ?? apartment.closedAt ?? apartment.rentedAt ?? apartment.updatedAt ?? (isActiveListing(apartment) ? now : undefined);
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateCEOAnalyticsSummary(
  dataset: CEOAnalyticsDataset,
  options: { window?: AnalyticsTimeWindow; now?: number } = {},
): CEOAnalyticsSummary {
  const window = options.window ?? "all";
  const now = options.now ?? Date.now();
  const apartments = dataset.apartments.filter((apartment) => isWithinAnalyticsWindow(getListingCreatedAt(apartment), window, now));
  const deals = dataset.deals.filter((deal) => isWithinAnalyticsWindow(getPeriodValue(deal), window, now));
  const leads = dataset.leads.filter((lead) => isWithinAnalyticsWindow(lead.createdAt, window, now));
  const interactions = dataset.interactions.filter((interaction) => isWithinAnalyticsWindow(interaction.createdAt, window, now));
  const spends = dataset.campaignSpends.filter((spend) => isSpendWithinWindow(spend.period, window, now));

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
    revenueBySource[normalizeLeadSource(deal.source ?? deal.leadSource)] += getCommissionAmount(deal);
  });
  const roiBySource = createSourceRoiRecord();
  spends.forEach((spend) => {
    roiBySource[normalizeLeadSource(spend.source)].spend += Math.max(0, spend.spentAmount || 0);
  });
  LEAD_SOURCES.forEach((source) => {
    roiBySource[source].revenue = revenueBySource[source];
    roiBySource[source].roiRatio = round(calculateMarketingRoiRatio(roiBySource[source].revenue, roiBySource[source].spend));
  });

  const closedDeals = deals.filter(isClosedDeal);
  const agentsMetrics = dataset.agents.map((agent) => {
    const agentDeals = deals.filter((deal) => getAgentIds(deal).includes(agent.id));
    const agentClosedDeals = agentDeals.filter(isClosedDeal);
    const closingDurations = agentClosedDeals.map((deal) => {
      const start = toAnalyticsMillis(deal.createdAt);
      const end = toAnalyticsMillis(deal.closedAt ?? deal.updatedAt);
      return start && end >= start ? (end - start) / (1000 * 60 * 60 * 24) : 0;
    }).filter((days) => days > 0);
    const activeListingsCount = apartments.filter((apartment) => isActiveListing(apartment) && apartment.assignedBrokerIds?.includes(agent.id)).length;
    const showingsCount = interactions.filter((interaction) => (interaction.brokerId ?? interaction.loggedByUserId) === agent.id && ["showing", "visit"].includes(normalizeKey(interaction.type))).length;
    const callsCount = interactions.filter((interaction) => (interaction.brokerId ?? interaction.loggedByUserId) === agent.id && ["call", "phone"].includes(normalizeKey(interaction.type))).length;
    const avatarUrl = getAgentAvatar(agent);
    return {
      brokerId: agent.id,
      brokerName: agent.name?.trim() || "Συνεργάτης",
      ...(avatarUrl ? { avatarUrl } : {}),
      activeListingsCount,
      showingsCount,
      callsCount,
      dealsClosedCount: agentClosedDeals.length,
      winRate: round(calculateAgentWinRate(agentClosedDeals.length, agentDeals.length)),
      avgClosingTimeDays: round(closingDurations.length ? closingDurations.reduce((total, days) => total + days, 0) / closingDurations.length : 0),
    };
  }).sort((first, second) => second.winRate - first.winRate || second.dealsClosedCount - first.dealsClosedCount);

  const lostReasonCounts = createCountRecord(LOST_DEAL_REASONS);
  const explicitLostDeals = dataset.lostDeals.filter((loss) => isWithinAnalyticsWindow(loss.lostAt, window, now));
  explicitLostDeals.forEach((loss) => { lostReasonCounts[normalizeLostDealReason(loss.reason)] += 1; });
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

  return {
    totalActiveListings: apartments.filter(isActiveListing).length,
    totalViews: apartments.reduce((total, apartment) => total + getApartmentViews(apartment), 0),
    totalInquiries: apartments.reduce((total, apartment) => total + getApartmentInquiries(apartment), 0) || leads.length,
    listingConversionRate: round((apartments.reduce((total, apartment) => total + getApartmentViews(apartment), 0) > 0 ? ((apartments.reduce((total, apartment) => total + getApartmentInquiries(apartment), 0) || leads.length) / apartments.reduce((total, apartment) => total + getApartmentViews(apartment), 0)) * 100 : 0)),
    averageDaysOnMarket: round(listingDoms.length ? listingDoms.reduce((total, listing) => total + listing.daysOnMarket, 0) / listingDoms.length : 0),
    domByArea,
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
    weightedForecastRevenue: round(calculateWeightedPipelineForecast(deals)),
    roommateAnalytics: {
      supplyDemandRatioByArea,
      averageMatchTimeDays: round(matchDurations.length ? matchDurations.reduce((total, days) => total + days, 0) / matchDurations.length : 0),
      successfulMatchRate: round(roommateMatches.length ? (successfulMatches.length / roommateMatches.length) * 100 : 0),
      estimatedCAC: round(successfulMatches.length ? totalMarketingSpend / successfulMatches.length : 0),
      estimatedLTV: round(successfulMatches.length ? totalRealizedRevenue / successfulMatches.length : 0),
    },
  };
}

export function isExecutiveAnalyticsRole(role: unknown): boolean {
  return role === "ceo" || role === "secretary";
}