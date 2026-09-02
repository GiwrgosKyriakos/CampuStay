import type { VirtualTourData } from "@/src/types/apartment";

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
  virtualTour?: VirtualTourData;
}
