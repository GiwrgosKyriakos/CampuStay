import type { FilterSetPayload } from "@/src/types/filters";
import { normalizeCity } from "@/src/utils/cityNormalization";

export interface ListingFormData {
  city?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  rent?: number | string;
  size?: number | string;
  floor?: string | number;
  petFriendly?: boolean;
  nearMetro?: boolean;
  tags?: string[];
  amenities?: string[];
  propertyType?: string;
  propertyCategory?: string;
}

function normalizeText(value?: string | number): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function textsMatch(left?: string | number, right?: string | number): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return Boolean(normalizedLeft && normalizedRight && (
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
  ));
}

function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseNumber(value?: number | string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloorNumber(value?: string | number): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = normalizeText(value);
  const match = normalized.match(/-?\d+/);
  if (match) return Number.parseInt(match[0], 10);
  if (normalized.includes("ισογ") || normalized.includes("ground")) return 0;
  if (normalized.includes("ημιου") || normalized.includes("semi")) return -1;
  return null;
}

function rangePoints(value: number | null, minimum?: string, maximum?: string): number {
  if (value === null || value <= 0) return 8;
  const min = parseNumber(minimum);
  const max = parseNumber(maximum);
  if (min === null && max === null) return 8;

  const lower = min ?? 0;
  const upper = max ?? Infinity;
  if (value >= lower && value <= upper) return 8;

  const boundary = value < lower ? lower : upper;
  if (!Number.isFinite(boundary) || boundary <= 0) return 0;
  const deviation = (Math.abs(value - boundary) / boundary) * 100;
  if (deviation >= 1 && deviation <= 5) return Math.max(0, 8 - 0.25 * deviation);
  if (deviation > 5 && deviation <= 10) return Math.max(0, 8 - 0.5 * deviation);
  return 0;
}

function includesTag(tags: string[], terms: string[]): boolean {
  return tags.some((tag) => terms.some((term) => normalizeText(tag).includes(term)));
}

export function calculateTenantCompatibilityScore(
  listing: ListingFormData,
  filters?: FilterSetPayload | null,
): number {
  if (!filters) return 40;

  let score = 40;
  let hardCriteriaMetCount = 0;
  const filterLocation = normalizeText(filters.cityQuery);
  let locationPoints = 0;

  if (!filterLocation) {
    locationPoints = 8;
  } else if (
    normalizeCity(listing.city) === normalizeCity(filters.cityQuery) ||
    textsMatch(listing.city, filters.cityQuery) ||
    textsMatch(listing.area, filters.cityQuery)
  ) {
    locationPoints = 8;
  } else {
    const filterLatitude = filters.latitude;
    const filterLongitude = filters.longitude;
    if (
      Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude) &&
      Number.isFinite(filterLatitude) && Number.isFinite(filterLongitude) &&
      calculateHaversineDistanceKm(listing.latitude!, listing.longitude!, filterLatitude!, filterLongitude!) <= 0.8
    ) {
      locationPoints = 3;
    }
  }
  score += locationPoints;
  if (locationPoints > 0) hardCriteriaMetCount++;

  const rentPoints = rangePoints(parseNumber(listing.rent), filters.rentMin, filters.rentMax);
  score += rentPoints;
  if (rentPoints > 0) hardCriteriaMetCount++;

  const sizePoints = rangePoints(parseNumber(listing.size), filters.sizeMin, filters.sizeMax);
  score += sizePoints;
  if (sizePoints > 0) hardCriteriaMetCount++;

  const listingFloor = parseFloorNumber(listing.floor);
  const filterFloor = parseFloorNumber(filters.floor);
  const floorDifference = listingFloor === null || filterFloor === null ? null : Math.abs(listingFloor - filterFloor);
  const floorPoints = floorDifference === null ? 8 : floorDifference === 0 ? 8 : floorDifference === 1 ? 3 : 0;
  score += floorPoints;
  if (floorPoints > 0) hardCriteriaMetCount++;

  if (hardCriteriaMetCount === 4) score += 3;

  const tags = [...(listing.tags ?? []), ...(listing.amenities ?? [])];
  const softChecks: boolean[] = [];
  if (filters.petFriendly === true) softChecks.push(listing.petFriendly === true || includesTag(tags, ["pet", "κατοικ"]));
  if (filters.nearMetro === true) softChecks.push(listing.nearMetro === true || includesTag(tags, ["metro", "μετρο"]));

  const minSqmPrice = parseNumber(filters.minSqmPrice);
  const maxSqmPrice = parseNumber(filters.maxSqmPrice);
  if (minSqmPrice !== null || maxSqmPrice !== null) {
    const rent = parseNumber(listing.rent);
    const size = parseNumber(listing.size);
    const sqmPrice = rent !== null && size !== null && size > 0 && rent > 0 ? rent / size : null;
    softChecks.push(sqmPrice !== null && (minSqmPrice === null || sqmPrice >= minSqmPrice) && (maxSqmPrice === null || sqmPrice <= maxSqmPrice));
  }
  if (filters.propertyType) softChecks.push(textsMatch(listing.propertyType, filters.propertyType));
  if (filters.propertyCategory) softChecks.push(textsMatch(listing.propertyCategory, filters.propertyCategory));

  score += softChecks.length === 0 ? 25 : softChecks.filter(Boolean).length * (25 / softChecks.length);
  return Math.min(100, Math.max(0, Math.round(score)));
}