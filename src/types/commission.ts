import type { BrokerCommissionSplit } from "@/src/types/deal";

export interface CommissionSettlementInvoice {
  id: string;
  dealId: string;
  apartmentId: string;
  apartmentTitle: string;
  totalDealAmount: number;
  totalCommission: number;
  agencyShare: number;
  brokerSplits: BrokerCommissionSplit[];
  invoiceNumber: string;
  invoiceStatus: "pending_review" | "approved" | "issued" | "settled";
  issuedAt?: number;
  settledAt?: number;
  createdAt: number;
}