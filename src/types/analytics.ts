export type AnalyticsEventType =
  | "listing_view"
  | "lead_inquiry"
  | "showing_conducted"
  | "offer_submitted"
  | "deal_stage_changed"
  | "deal_closed"
  | "deal_lost";

export type StandardLeadSource =
  | "spitogatos"
  | "xe_gr"
  | "meta_ads"
  | "google_ads"
  | "agency_website"
  | "referral"
  | "walk_in"
  | "signboard"
  | "other";

export type LostDealReason =
  | "price_dispute"
  | "legal_defect"
  | "competitor_won"
  | "buyer_withdrew"
  | "owner_cancelled"
  | "financial_issue";

/** Immutable event written once to analytics_events. */
export interface AnalyticsEvent {
  id: string;
  agencyId: string;
  eventType: AnalyticsEventType;
  timestamp: number;
  listingId?: string;
  leadId?: string;
  brokerId?: string;
  source?: string;
  transactionType?: "sale" | "rent";
  amount?: number;
  stageFrom?: number;
  stageTo?: number;
  lostReason?: string;
  metadata?: Record<string, any>;
}

/** Backwards-compatible name for analytics consumers. */
export type LeadSource = StandardLeadSource;

export type AnalyticsTimeWindow = "month" | "quarter" | "year" | "all";

export interface CampaignSpend {
  id: string;
  agencyId: string;
  source: StandardLeadSource;
  month: string;
  spendAmount: number;
  currency: "EUR";
  recordedAt: number;
  recordedBy: string;
}

/** @deprecated Use CampaignSpend. */
export type MarketingCampaignSpend = CampaignSpend;

export interface LostDealRecord {
  dealId: string;
  apartmentId: string;
  agencyId?: string;
  brokerId: string;
  clientId: string;
  lostAt: number;
  lostReason: LostDealReason;
  notes?: string;
  stageBeforeLoss: number;
  potentialRevenueLoss: number;
}

export interface SourceRoiSummary {
  revenue: number;
  roiRatio: number;
  spend: number;
  roiPercent: number;
  netMargin: number;
  attributedDeals: number;
}

export interface AgentAnalyticsMetric {
  brokerId: string;
  brokerName: string;
  avatarUrl?: string;
  activeListingsCount: number;
  showingsCount: number;
  callsCount: number;
  scheduledShowingsCount: number;
  newListingsCount: number;
  dealsClosedCount: number;
  winRate: number;
  avgClosingTimeDays: number;
}

export interface FunnelAnalytics {
  viewsToInquiriesRate: number;
  inquiriesToShowingsRate: number;
  showingsToOffersRate: number;
  offersToClosedRate: number;
  viewsToInquiriesDropOff: number;
  inquiriesToShowingsDropOff: number;
  showingsToOffersDropOff: number;
  offersToClosedDropOff: number;
  frictionStage: "views_to_inquiries" | "inquiries_to_showings" | "showings_to_offers" | "offers_to_closed";
}

export interface RevenueTimeSeriesPoint {
  period: string;
  grossCommission: number;
  saleCommission: number;
  rentCommission: number;
  agencyRetainedShare: number;
  brokerSplitPayouts: number;
}

export interface RoommateAreaAnalytics {
  seekers: number;
  availableRooms: number;
  ratio: number;
}

export interface CEOAnalyticsSummary {
  listingFunnel: {
    views: number;
    inquiries: number;
    showings: number;
    offers: number;
    closedDeals: number;
    lostDeals: number;
  };
  funnelAnalytics: FunnelAnalytics;
  totalActiveListings: number;
  totalViews: number;
  totalInquiries: number;
  listingConversionRate: number;
  averageDaysOnMarket: number;
  domByArea: Record<string, number>;
  averageDomByAreaAndCategory: Record<string, number>;
  longestPendingListings: { id: string; title: string; area: string; daysOnMarket: number }[];
  leadDistribution: Record<LeadSource, number>;
  revenueBySource: Record<LeadSource, number>;
  roiBySource: Record<LeadSource, SourceRoiSummary>;
  agentsMetrics: AgentAnalyticsMetric[];
  lostDealsSummary: {
    totalLost: number;
    reasonsBreakdown: Record<LostDealReason, number>;
  };
  realizedRevenue: {
    totalRevenue: number;
    salesCommission: number;
    rentalsCommission: number;
    agencyRetainedNet: number;
  };
  weightedForecastRevenue: number;
  weightedForecast: {
    next30Days: number;
    next60Days: number;
  };
  benchmarkMetrics: {
    targetMonthlyRevenue: number;
    revenueAchievementPercent: number;
    targetDaysOnMarket: number;
    daysOnMarketDelta: number;
    targetWinRate: number;
    actualWinRate: number;
    winRateDelta: number;
  };
  roommateAnalytics: {
    supplyDemandRatioByArea: Record<string, RoommateAreaAnalytics>;
    averageMatchTimeDays: number;
    successfulMatchRate: number;
    estimatedCAC: number;
    estimatedLTV: number;
  };
  revenueTimeSeries: {
    month: RevenueTimeSeriesPoint[];
    quarter: RevenueTimeSeriesPoint[];
    year: RevenueTimeSeriesPoint[];
  };
  settlementAccounting: {
    grossCommission: number;
    agencyRetainedShare: number;
    brokerSplitPayouts: number;
    pendingInvoices: number;
    settledInvoices: number;
  };
}

export interface AnalyticsApartmentRecord {
  id: string;
  agencyId?: string;
  title?: string;
  area?: string;
  city?: string;
  status?: string;
  propertyCategory?: string;
  propertyType?: string;
  createdAt?: unknown;
  publishedAt?: unknown;
  statusChangeDate?: unknown;
  statusChangedAt?: unknown;
  closedAt?: unknown;
  rentedAt?: unknown;
  updatedAt?: unknown;
  views?: number;
  viewCount?: number;
  inquiries?: number;
  inquiryCount?: number;
  assignedBrokerIds?: string[];
  availableRooms?: number;
  isRoommateListing?: boolean;
  roommateAvailable?: boolean;
  [key: string]: unknown;
}

export interface AnalyticsDealRecord {
  id: string;
  agencyId?: string;
  apartmentId?: string;
  clientId?: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
  brokerId?: string;
  assignedBrokerId?: string;
  stage?: number;
  stagePercent?: number;
  pipelineStage?: string;
  status?: string;
  commissionTotal?: number;
  commissionRate?: number;
  commissionPercent?: number;
  dealValue?: number;
  expectedCommission?: number;
  calculatedCommission?: number;
  dealCommission?: number;
  agencyCutPercentage?: number;
  agencyCutAmount?: number;
  createdAt?: unknown;
  closedAt?: unknown;
  updatedAt?: unknown;
  source?: string;
  leadSource?: string;
  leadId?: string;
  lostReason?: string;
  reason?: string;
  transactionType?: string;
  propertyCategory?: string;
  [key: string]: unknown;
}

export interface AnalyticsAgentRecord {
  id: string;
  name?: string;
  photoUrl?: string;
  avatar?: string;
  photos?: string[];
  is_broker?: boolean;
  agencyRole?: string;
  role?: string;
}

export interface AnalyticsLeadRecord {
  id: string;
  agencyId?: string;
  apartmentId?: string;
  assignedBrokerId?: string;
  source?: string;
  leadSource?: string;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface AnalyticsInteractionRecord {
  id: string;
  apartmentId?: string;
  brokerId?: string;
  loggedByUserId?: string;
  type?: string;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface AnalyticsRoommateMatchRecord {
  id: string;
  createdAt?: unknown;
  matchedAt?: unknown;
  successful?: boolean;
  status?: string;
}

export interface AnalyticsRoommateSeekerRecord {
  id: string;
  area?: string;
  city?: string;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
}

export interface CEOAnalyticsDataset {
  apartments: AnalyticsApartmentRecord[];
  deals: AnalyticsDealRecord[];
  agents: AnalyticsAgentRecord[];
  leads: AnalyticsLeadRecord[];
  campaignSpends: CampaignSpend[];
  lostDeals: LostDealRecord[];
  interactions: AnalyticsInteractionRecord[];
  roommateSeekers: AnalyticsRoommateSeekerRecord[];
  roommateMatches: AnalyticsRoommateMatchRecord[];
}

export interface MaterializedAnalyticsSummary {
  periodId: string;
  periodStart: number;
  periodEnd: number;
  funnel: {
    views: number;
    inquiries: number;
    showings: number;
    offers: number;
    closedDeals: number;
    lostDeals: number;
  };
  averageDomByAreaAndCategory: Record<string, number>;
  leadCountsBySource: Record<StandardLeadSource, number>;
  attributedRevenueBySource: Record<StandardLeadSource, number>;
  attributedDealsBySource?: Record<StandardLeadSource, number>;
  campaignSpendBySource: Record<StandardLeadSource, number>;
  roiPercentBySource: Record<StandardLeadSource, number>;
}