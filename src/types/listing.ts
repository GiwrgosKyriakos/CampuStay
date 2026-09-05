import type { VirtualTour } from "@/src/types/apartment";

export type ListingCreatorRole = "broker" | "agency" | "owner" | "student" | "user";

export interface Listing {
  agencyId?: string | null;
  creatorRole?: ListingCreatorRole;
  isBroker?: boolean;
  isRoommateListing?: boolean;
  creatorNotLookingForRoommate?: boolean;
  lookingForRoommate?: boolean;
  isWholeApartment?: boolean;
  wholeApartment?: boolean;
  entireApartment?: boolean;
  rentalType?: "entire" | "whole_apartment" | "room" | "shared" | string;
}

export type WatermarkType = "default_text" | "agency_logo";
export type LogoWatermarkStyle = "with_bg" | "no_bg" | "no_bg_transparent";

export interface WatermarkConfig {
  enabled: boolean;
  type: WatermarkType;
  text?: string;
  logoUrl?: string | null;
  logoStyle?: LogoWatermarkStyle;
}

export interface Apartment {
  id: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  rooms: number;
  size: number;
  image: string;
  photos?: string[];
  files2d3d?: string[];
  tags: string[];
  watermarkConfig?: WatermarkConfig;
  virtualTour?: VirtualTour;
}
