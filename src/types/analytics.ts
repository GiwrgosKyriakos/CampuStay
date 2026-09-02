export type LeadSource =
  | "spitogatos"
  | "xe"
  | "social_ads"
  | "agency_website"
  | "referral"
  | "yard_sign"
  | "walk_in"
  | "other";

export type LostDealReason =
  | "price_too_high"
  | "property_flaws"
  | "legal_tax_issues"
  | "competitor_won"
  | "buyer_withdrew"
  | "owner_cancelled";

export type AnalyticsTimeWindow = "month" | "quarter" | "year" | "all";

export interface MarketingCampaignSpend {
  id: string;
  agencyId: string;
  source: LeadSource;
  period: string;
  spentAmount: number;
}

export interface LostDealRecord {
  dealId: string;
  apartmentId: string;
  agencyId?: string;
  brokerId: string;
  clientId: string;
  lostAt: number;
  reason: LostDealReason;
  notes?: string;
  stageBeforeLoss: number;
  potentialRevenueLoss: number;
}

export interface SourceRoiSummary {
  revenue: number;
  roiRatio: number;
  spend: number;
}

export interface AgentAnalyticsMetric {
  brokerId: string;
  brokerName: string;
  avatarUrl?: string;
  activeListingsCount: number;
  showingsCount: number;
  callsCount: number;
  dealsClosedCount: number;
  winRate: number;
  avgClosingTimeDays: number;
}

export interface RoommateAreaAnalytics {
  seekers: number;
  availableRooms: number;
  ratio: number;
}

export interface CEOAnalyticsSummary {
  totalActiveListings: number;
  totalViews: number;
  totalInquiries: number;
  listingConversionRate: number;
  averageDaysOnMarket: number;
  domByArea: Record<string, number>;
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
  roommateAnalytics: {
    supplyDemandRatioByArea: Record<string, RoommateAreaAnalytics>;
    averageMatchTimeDays: number;
    successfulMatchRate: number;
    estimatedCAC: number;
    estimatedLTV: number;
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
  campaignSpends: MarketingCampaignSpend[];
  lostDeals: LostDealRecord[];
  interactions: AnalyticsInteractionRecord[];
  roommateSeekers: AnalyticsRoommateSeekerRecord[];
  roommateMatches: AnalyticsRoommateMatchRecord[];
}