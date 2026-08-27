import type { LatLng } from "@/src/utils/geometry";

export interface FilterSetPayload {
  title?: string;
  rentMin?: string;
  rentMax?: string;
  minSqmPrice?: string;
  maxSqmPrice?: string;
  cityQuery?: string;
  latitude?: number;
  longitude?: number;
  sizeMin?: string;
  sizeMax?: string;
  floor?: string | number;
  petFriendly?: boolean;
  nearMetro?: boolean;
  propertyType?: string;
  propertyCategory?: string;
  polygonCoordinates?: LatLng[];
  sortBy?: string;
  summary?: string;
  version?: number;
  updatedAt?: number;
}