import type { ListingPhotoItem } from "@/src/types/apartment";

export type BrokerPropertyStatusKey =
  | "available"
  | "available_after_call"
  | "under_negotiation"
  | "closed_deposit"
  | "sold_rented"
  | "on_hold_owner_request";

export interface ListingBrokerDraft {
  maxDiscountPercent: string;
  propertyStatus: BrokerPropertyStatusKey;
  closedDealPrice: string;
  ownerName: string;
  ownerPhone: string;
  ownerMotivationType: string | null;
  customOwnerMotivation: string;
  ownerPriceExpectation: string;
  commissionRate: string;
  expectedBrokerSplit: string;
  mandateNotes: string;
  internalNotes: string;
  clientCriteria: string;
  brokerPrivatePhotos: ListingPhotoItem[];
  isOffMarket: boolean;
  offMarketAccessUserIds: string[];
  assignedBrokerIds: string[];
  assignmentStatus: "unassigned_pool" | "claim_pending" | "assigned" | null;
  publishMode: "direct" | "pool" | null;
}

export function createEmptyListingBrokerDraft(): ListingBrokerDraft {
  return {
    maxDiscountPercent: "",
    propertyStatus: "available",
    closedDealPrice: "",
    ownerName: "",
    ownerPhone: "",
    ownerMotivationType: null,
    customOwnerMotivation: "",
    ownerPriceExpectation: "",
    commissionRate: "",
    expectedBrokerSplit: "",
    mandateNotes: "",
    internalNotes: "",
    clientCriteria: "",
    brokerPrivatePhotos: [],
    isOffMarket: false,
    offMarketAccessUserIds: [],
    assignedBrokerIds: [],
    assignmentStatus: null,
    publishMode: null,
  };
}
