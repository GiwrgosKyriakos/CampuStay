export interface VirtualTourHotspot {
  pitch: number;
  yaw: number;
  type: "scene";
  text: string;
  targetSceneId: string;
}

export interface VirtualTourScene {
  id: string;
  title: string;
  imageUrl: string;
  mimeType?: "image/jpeg" | "image/png";
  hotspots?: VirtualTourHotspot[];
}

export interface VirtualTourData {
  enabled: boolean;
  defaultSceneId: string;
  scenes: VirtualTourScene[];
}

export type VirtualTour = VirtualTourData;
export type TourHotspot = VirtualTourHotspot;
export type TourScene = VirtualTourScene;

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
  action?: "checkout" | "checkin";
  timestamp?: number;
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
  hostRequiresRoommate?: boolean;
  assignedBrokerIds?: string[];
  agencyId?: string;
  assignmentStatus?: "unassigned_pool" | "claim_pending" | "assigned";
  pendingClaimBrokerId?: string;
  rejectedBrokerIds?: string[];
  keySafeLocation?: string;
  currentKeyHolderId?: string;
  keySafeLogs?: KeySafeLogEntry[];
  openHouseConfig?: OpenHouseConfig;
  status: "active" | "under_negotiation" | "withdrawn" | "rented" | "sold" | "closed_deal";
  withdrawalMetadata?: ListingWithdrawalMetadata;
  reelMedia?: ApartmentReelMedia;
  virtualTour?: VirtualTourData;
  [key: string]: unknown;
}
