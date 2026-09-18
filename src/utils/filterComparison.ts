import type { LatLng } from "@/src/utils/geometry";

export interface FilterCriteriaInput {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  brokerId?: unknown;
  clientId?: unknown;
  sharedAt?: unknown;
  cityQuery?: string | null;
  rentMin?: string | number | null;
  rentMax?: string | number | null;
  minSqmPrice?: string | number | null;
  maxSqmPrice?: string | number | null;
  sizeMin?: string | number | null;
  sizeMax?: string | number | null;
  propertyTypes?: readonly string[] | null;
  propertyCategories?: readonly string[] | null;
  bedroomsMin?: string | number | null;
  bathroomsMin?: string | number | null;
  floors?: readonly string[] | null;
  furnishedStatus?: string | null;
  heatingTypes?: readonly string[] | null;
  petFriendly?: boolean | null;
  nearMetro?: boolean | null;
  selectedAmenities?: readonly string[] | null;
  userHardCriteria?: readonly string[] | null;
  energyClasses?: readonly string[] | null;
  constructionYearMin?: string | number | null;
  renovationYearMin?: string | number | null;
  polygonCoordinates?: readonly LatLng[] | null;
  sortBy?: string | null;
  showMatchScore?: boolean | null;
}

interface NormalizedFilterCriteria {
  cityQuery: string | null;
  rentMin: number | null;
  rentMax: number | null;
  minSqmPrice: number | null;
  maxSqmPrice: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  propertyTypes: string[];
  propertyCategories: string[];
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  floors: string[];
  furnishedStatus: string | null;
  heatingTypes: string[];
  petFriendly: boolean;
  nearMetro: boolean;
  selectedAmenities: string[];
  userHardCriteria: string[];
  energyClasses: string[];
  constructionYearMin: number | null;
  renovationYearMin: number | null;
  polygonCoordinates: Array<{ latitude: number; longitude: number }>;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return parsed;
}

function normalizeStringArray(values: readonly string[] | null | undefined): string[] {
  return Array.from(new Set(
    (values ?? [])
      .map((value) => normalizeText(value))
      .filter((value): value is string => value !== null),
  )).sort();
}

function normalizePolygon(values: readonly LatLng[] | null | undefined): Array<{ latitude: number; longitude: number }> {
  return (values ?? []).map((value) => ({
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
  }));
}

function normalizeCriteria(criteria: FilterCriteriaInput): NormalizedFilterCriteria {
  return {
    cityQuery: normalizeText(criteria.cityQuery),
    rentMin: normalizeNumber(criteria.rentMin),
    rentMax: normalizeNumber(criteria.rentMax),
    minSqmPrice: normalizeNumber(criteria.minSqmPrice),
    maxSqmPrice: normalizeNumber(criteria.maxSqmPrice),
    sizeMin: normalizeNumber(criteria.sizeMin),
    sizeMax: normalizeNumber(criteria.sizeMax),
    propertyTypes: normalizeStringArray(criteria.propertyTypes),
    propertyCategories: normalizeStringArray(criteria.propertyCategories),
    bedroomsMin: normalizeNumber(criteria.bedroomsMin),
    bathroomsMin: normalizeNumber(criteria.bathroomsMin),
    floors: normalizeStringArray(criteria.floors),
    furnishedStatus: normalizeText(criteria.furnishedStatus) ?? "all",
    heatingTypes: normalizeStringArray(criteria.heatingTypes),
    petFriendly: criteria.petFriendly === true,
    nearMetro: criteria.nearMetro === true,
    selectedAmenities: normalizeStringArray(criteria.selectedAmenities),
    userHardCriteria: normalizeStringArray(criteria.userHardCriteria),
    energyClasses: normalizeStringArray(criteria.energyClasses),
    constructionYearMin: normalizeNumber(criteria.constructionYearMin),
    renovationYearMin: normalizeNumber(criteria.renovationYearMin),
    polygonCoordinates: normalizePolygon(criteria.polygonCoordinates),
  };
}

export function areFilterCriteriaEqual(left: FilterCriteriaInput, right: FilterCriteriaInput): boolean {
  return JSON.stringify(normalizeCriteria(left)) === JSON.stringify(normalizeCriteria(right));
}
