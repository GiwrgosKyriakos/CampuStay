import type { FilterSetPayload, HardCriteriaKey } from "@/src/types/filters";
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
  bedrooms?: number | string;
  bathrooms?: number | string;
  furnishedStatus?: string;
  heatingSystem?: string;
}

export interface CompatibilityResult {
  score: number;
  hardMet: string[];
  softMet: string[];
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

function matchesConfiguredList(value: string | number | undefined, options?: string[]): boolean {
  if (!options || options.length === 0) return true;
  return options.some((option) => textsMatch(value, option));
}

function matchesAnyAmenity(tags: string[], options?: string[]): boolean {
  if (!options || options.length === 0) return true;
  return options.every((option) => tags.some((tag) => textsMatch(tag, option)));
}

export function evaluateUserHardCriteriaMatch(
  apartment: ListingFormData,
  filterSet: FilterSetPayload,
): { passes: boolean; failedCriteria: HardCriteriaKey[] } {
  const hardCriteria = filterSet.userHardCriteria ?? [];
  const failedCriteria: HardCriteriaKey[] = [];
  const rent = parseNumber(apartment.rent);
  const size = parseNumber(apartment.size);
  const bedrooms = parseNumber(apartment.bedrooms);
  const bathrooms = parseNumber(apartment.bathrooms);
  const tags = [...(apartment.tags ?? []), ...(apartment.amenities ?? [])];

  for (const criterion of hardCriteria) {
    switch (criterion) {
      case "rent": {
        const minimum = parseNumber(filterSet.rentMin);
        const maximum = parseNumber(filterSet.rentMax);
        if ((minimum !== null && (rent === null || rent < minimum)) || (maximum !== null && (rent === null || rent > maximum))) failedCriteria.push(criterion);
        break;
      }
      case "size": {
        const minimum = parseNumber(filterSet.sizeMin);
        const maximum = parseNumber(filterSet.sizeMax);
        if ((minimum !== null && (size === null || size < minimum)) || (maximum !== null && (size === null || size > maximum))) failedCriteria.push(criterion);
        break;
      }
      case "floor":
        if (filterSet.floors?.length && !matchesConfiguredList(apartment.floor, filterSet.floors)) failedCriteria.push(criterion);
        break;
      case "propertyType":
        if (filterSet.propertyTypes?.length && !matchesConfiguredList(apartment.propertyType, filterSet.propertyTypes)) failedCriteria.push(criterion);
        break;
      case "bedrooms": {
        const minimum = parseNumber(filterSet.bedroomsMin);
        if (minimum !== null && (bedrooms === null || bedrooms < minimum)) failedCriteria.push(criterion);
        break;
      }
      case "bathrooms": {
        const minimum = parseNumber(filterSet.bathroomsMin);
        if (minimum !== null && (bathrooms === null || bathrooms < minimum)) failedCriteria.push(criterion);
        break;
      }
      case "furnished":
        if (filterSet.furnishedStatus && filterSet.furnishedStatus !== "all" && !matchesConfiguredList(apartment.furnishedStatus, [filterSet.furnishedStatus]) && !includesTag(tags, ["furnish"])) failedCriteria.push(criterion);
        break;
      case "heating":
        if (filterSet.heatingTypes?.length && !matchesConfiguredList(apartment.heatingSystem, filterSet.heatingTypes)) failedCriteria.push(criterion);
        break;
      case "petFriendly":
        if (filterSet.petFriendly === true && !apartment.petFriendly && !includesTag(tags, ["pet", "κατοικ"])) failedCriteria.push(criterion);
        break;
      case "nearMetro":
        if (filterSet.nearMetro === true && !apartment.nearMetro && !includesTag(tags, ["metro", "μετρο"])) failedCriteria.push(criterion);
        break;
      case "amenities":
        if (!matchesAnyAmenity(tags, filterSet.selectedAmenities)) failedCriteria.push(criterion);
        break;
    }
  }

  return { passes: failedCriteria.length === 0, failedCriteria };
}

export function calculateSuggestedApartments<T extends ListingFormData>(
  apartments: T[],
  filterSet: FilterSetPayload,
): { apartment: T; score: number; failedCriteria: HardCriteriaKey[] }[] {
  return apartments
    .map((apartment) => {
      const score = calculateTenantCompatibilityScore(apartment, filterSet);
      const hardMatch = evaluateUserHardCriteriaMatch(apartment, filterSet);
      return { apartment, score: Math.round(score), failedCriteria: hardMatch.failedCriteria };
    })
    .filter((result) => result.failedCriteria.length === 0 || result.score >= 90)
    .sort((left, right) => right.score - left.score);
}

function rangeMatches(value: number | null, minimum?: string, maximum?: string): "exact" | "tolerance" | null {
  if (value === null || value <= 0) return null;
  const min = parseNumber(minimum);
  const max = parseNumber(maximum);
  if (min === null && max === null) return "exact";
  const lower = min ?? 0;
  const upper = max ?? Infinity;
  if (value >= lower && value <= upper) return "exact";
  const boundary = value < lower ? lower : upper;
  if (!Number.isFinite(boundary) || boundary <= 0) return null;
  const deviation = (Math.abs(value - boundary) / boundary) * 100;
  return deviation >= 1 && deviation <= 10 ? "tolerance" : null;
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

export function getCompatibilityDetails(
  listing: ListingFormData,
  filters?: FilterSetPayload | null,
): CompatibilityResult {
  if (!filters) {
    return {
      score: 40,
      hardMet: ["Χωρίς περιορισμούς στα βασικά κριτήρια"],
      softMet: ["Χωρίς επιπλέον προτιμήσεις"],
    };
  }

  const score = calculateTenantCompatibilityScore(listing, filters);
  const hardMet: string[] = [];
  const softMet: string[] = [];
  const listingLocation = normalizeText(listing.city);
  const listingArea = normalizeText(listing.area);
  const filterLocation = normalizeText(filters.cityQuery);
  const locationExact = !filterLocation ||
    normalizeCity(listing.city) === normalizeCity(filters.cityQuery) ||
    textsMatch(listing.city, filters.cityQuery) || textsMatch(listing.area, filters.cityQuery);
  const locationTolerance = !locationExact &&
    Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude) &&
    Number.isFinite(filters.latitude) && Number.isFinite(filters.longitude) &&
    calculateHaversineDistanceKm(listing.latitude!, listing.longitude!, filters.latitude!, filters.longitude!) <= 0.8;
  if (locationExact || locationTolerance) {
    hardMet.push(`Περιοχή / Τοποθεσία (${listing.area || listing.city || "Συμβατή"})`);
  }

  const rent = parseNumber(listing.rent);
  const rentMatch = rangeMatches(rent, filters.rentMin, filters.rentMax);
  if (rentMatch) hardMet.push(`Budget / Ενοίκιο (${rent ?? 0}€ - ${rentMatch === "exact" ? "Εντός ορίων" : "Εντός αποδεκτής ανοχής"})`);

  const size = parseNumber(listing.size);
  const sizeMatch = rangeMatches(size, filters.sizeMin, filters.sizeMax);
  if (sizeMatch) hardMet.push(`Εμβαδόν (${size ?? 0} m² - ${sizeMatch === "exact" ? "Εντός ορίων" : "Εντός αποδεκτής ανοχής"})`);

  const listingFloor = parseFloorNumber(listing.floor);
  const filterFloor = parseFloorNumber(filters.floor);
  if (listingFloor === null || filterFloor === null || Math.abs(listingFloor - filterFloor) <= 1) {
    hardMet.push(`Όροφος (${listing.floor ?? "Συμβατός"})`);
  }

  const tags = [...(listing.tags ?? []), ...(listing.amenities ?? [])];
  if (filters.petFriendly === true && (listing.petFriendly === true || includesTag(tags, ["pet", "κατοικ"]))) {
    softMet.push("Κατοικίδια (Pet friendly)");
  }
  if (filters.nearMetro === true && (listing.nearMetro === true || includesTag(tags, ["metro", "μετρο"]))) {
    softMet.push("Πλησίον Μετρό");
  }
  const minSqmPrice = parseNumber(filters.minSqmPrice);
  const maxSqmPrice = parseNumber(filters.maxSqmPrice);
  if (minSqmPrice !== null || maxSqmPrice !== null) {
    const sqmPrice = rent !== null && size !== null && size > 0 && rent > 0 ? rent / size : null;
    if (sqmPrice !== null && (minSqmPrice === null || sqmPrice >= minSqmPrice) && (maxSqmPrice === null || sqmPrice <= maxSqmPrice)) {
      softMet.push(`Τιμή ανά τ.μ. (${Math.round(sqmPrice)} €/m²)`);
    }
  }
  if (filters.propertyType && textsMatch(listing.propertyType, filters.propertyType)) softMet.push(`Τύπος (${listing.propertyType})`);
  if (filters.propertyCategory && textsMatch(listing.propertyCategory, filters.propertyCategory)) softMet.push(`Κατηγορία (${listing.propertyCategory})`);

  return { score, hardMet, softMet };
}