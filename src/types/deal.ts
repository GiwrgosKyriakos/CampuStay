import type { DealChecklistItem } from "./checklist";

export interface PropertyDealLead {
  id: string;
  apartmentId: string;
  clientId: string;
  leadId: string;
  clientName: string;
  clientAvatar?: string;
  assignedBrokerId: string;
  brokerName?: string;
  brokerAvatar?: string;
  stagePercent: number;
  lastContactTimestamp: number;
}

export interface BrokerCommissionSplit {
  brokerId: string;
  brokerName: string;
  role: "listing_agent" | "buyer_agent" | "co_listing_agent" | "covering_agent";
  percentage: number;
  amount: number;
}

export interface Deal {
  id: string;
  apartmentId: string;
  apartmentTitle?: string;
  clientId: string;
  clientName?: string;
  agencyId: string;
  listingBrokerId: string;
  buyerBrokerId: string;
  coveringBrokerId?: string;
  stage: number;
  commissionTotal: number;
  dealAmount?: number;
  agencyCutPercentage: number;
  agencyCutAmount: number;
  brokerSplits: BrokerCommissionSplit[];
  settlementStatus?: "pending_review" | "approved" | "issued" | "settled";
  status: "active" | "under_negotiation" | "closed" | "cancelled";
  checklist?: DealChecklistItem[];
  createdAt: number;
}