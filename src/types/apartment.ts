import type { Timestamp } from "firebase/firestore";

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

export interface ListingPhotoItem {
  id: string;
  url: string;
  caption?: string | null;
  orderIndex: number;
}

export type ListingPhoto = string | ListingPhotoItem;

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
  price?: number;
  originalPrice?: number | null;
  isOffer?: boolean;
  offerCreatedAt?: Timestamp | Date | null;
  title?: string;
  address?: string;
  exactAddress?: string;
  area: string;
  city?: string;
  showExactAddress: boolean;
  hostId: string;
  hostRequiresRoommate?: boolean;
  agencyId?: string;
  creatorRole?: "broker" | "agency" | "owner" | "student" | "user";
  isBroker?: boolean;
  isRoommateListing?: boolean;
  creatorNotLookingForRoommate?: boolean;
  lookingForRoommate?: boolean;
  isWholeApartment?: boolean;
  wholeApartment?: boolean;
  entireApartment?: boolean;
  rentalType?: "entire" | "whole_apartment" | "room" | "shared" | string;
  assignedBrokerIds?: string[];
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
  photos?: ListingPhoto[];
  photoCaptions?: Record<string, string>;
  extraPhotos?: ListingPhoto[];
  reelsPhotos?: ListingPhoto[];
  showInExploreFeed?: boolean;
  virtualTour?: VirtualTourData;
  [key: string]: unknown;
}

export interface ApartmentListing {
  price: number;
  originalPrice?: number | null;
  isOffer?: boolean;
  offerCreatedAt?: Timestamp | Date | null;
  showInExploreFeed?: boolean;
  photos: ListingPhoto[];
  photoCaptions?: Record<string, string>;
  extraPhotos?: ListingPhoto[];
  reelsPhotos?: ListingPhoto[];
}
