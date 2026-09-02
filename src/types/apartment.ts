export interface TourHotspot {
  id: string;
  pitch: number;
  yaw: number;
  targetSceneId: string;
  text: string;
}

export interface TourScene {
  id: string;
  title: string;
  imageUrl: string;
  hotspots?: TourHotspot[];
}

export interface VirtualTourData {
  enabled: boolean;
  defaultSceneId: string;
  scenes: TourScene[];
}

export interface ApartmentReelMedia {
  videoUrl?: string;
  thumbnailUrl?: string;
  aspectRatio: "9:16" | "16:9";
  durationSeconds?: number;
}

export interface ListingWithdrawalMetadata {
  withdrawnByUserId: string;
  withdrawnByRole: "broker" | "owner" | "admin";
  reason: string;
  withdrawnAt: number;
}

export interface KeySafeLogEntry {
  id: string;
  brokerId: string;
  brokerName: string;
  checkedOutAt: number;
  returnedAt?: number;
  notes?: string;
}

export interface OpenHouseConfig {
  isOpenHouseActive: boolean;
  date: string;
  attendingBrokerIds: string[];
}

export interface Apartment {
  id?: string;
  title?: string;
  address?: string;
  exactAddress?: string;
  area: string;
  city?: string;
  showExactAddress: boolean;
  hostId: string;
  assignedBrokerIds?: string[];
  agencyId?: string;
  assignmentStatus?: "unassigned_pool" | "claim_pending" | "assigned";
  pendingClaimBrokerId?: string;
  rejectedBrokerIds?: string[];
  keySafeLocation?: string;
  keySafeLogs?: KeySafeLogEntry[];
  openHouseConfig?: OpenHouseConfig;
  status: "active" | "under_negotiation" | "withdrawn" | "rented" | "sold" | "closed_deal";
  withdrawalMetadata?: ListingWithdrawalMetadata;
  reelMedia?: ApartmentReelMedia;
  [key: string]: unknown;
}
