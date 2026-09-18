import type { ApartmentFilterCriteria, ApartmentFilterState, PersistedApartmentFilterState } from "@/src/types/filters";

export const APARTMENT_FILTERS_STORAGE_KEY = "apartments.filters";

export const DEFAULT_APARTMENT_FILTER_CRITERIA: ApartmentFilterCriteria = {
  rentMin: "",
  rentMax: "",
  minSqmPrice: "",
  maxSqmPrice: "",
  selectedCity: "",
  areaQuery: "",
  sizeMin: "",
  sizeMax: "",
  petFriendly: false,
  nearMetro: false,
  propertyTypes: [],
  propertyCategories: [],
  floors: [],
  bedroomsMin: "",
  bathroomsMin: "",
  furnishedStatus: "all",
  heatingTypes: [],
  energyClasses: [],
  constructionYearMin: "",
  renovationYearMin: "",
  selectedAmenities: [],
  userHardCriteria: [],
  showMatchScoreOnMap: false,
  polygonCoordinates: [],
  sortBy: "newest",
};

export const DEFAULT_SHOW_ONLY_TOGGLES: Pick<ApartmentFilterState, ShowOnlyKeys> = {
  selectedAgencyId: null,
  selectedBrokerId: null,
  selectedProposalListId: null,
  proposalApartmentIds: [],
  showOwnListingsInFeed: false,
};

type ShowOnlyKeys = "selectedAgencyId" | "selectedBrokerId" | "selectedProposalListId" | "proposalApartmentIds" | "showOwnListingsInFeed";

export function getApartmentFiltersStorageKey(userId: string | null, isGuest: boolean): string {
  return `${APARTMENT_FILTERS_STORAGE_KEY}.${isGuest ? "guest" : userId ?? "anonymous"}`;
}

export function serializeApartmentFilters(state: ApartmentFilterState): PersistedApartmentFilterState {
  const {
    selectedAgencyId: _selectedAgencyId,
    selectedBrokerId: _selectedBrokerId,
    selectedProposalListId: _selectedProposalListId,
    proposalApartmentIds: _proposalApartmentIds,
    showOwnListingsInFeed: _showOwnListingsInFeed,
    ...criteria
  } = state;
  return criteria;
}

function normalizedPersistedFilters(filters: PersistedApartmentFilterState): PersistedApartmentFilterState {
  return {
    ...filters,
    propertyTypes: [...filters.propertyTypes].sort(),
    propertyCategories: [...filters.propertyCategories].sort(),
    floors: [...filters.floors].sort(),
    heatingTypes: [...filters.heatingTypes].sort(),
    energyClasses: [...filters.energyClasses].sort(),
    selectedAmenities: [...filters.selectedAmenities].sort(),
    userHardCriteria: [...filters.userHardCriteria].sort(),
  };
}

export function arePersistedApartmentFiltersEqual(
  left: PersistedApartmentFilterState | null,
  right: PersistedApartmentFilterState | null,
): boolean {
  if (!left || !right) return false;
  return JSON.stringify(normalizedPersistedFilters(left)) === JSON.stringify(normalizedPersistedFilters(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function hydratePersistedApartmentFilters(value: unknown): PersistedApartmentFilterState {
  if (!isRecord(value)) return { ...DEFAULT_APARTMENT_FILTER_CRITERIA };
  const furnishedStatus = value.furnishedStatus === "furnished" || value.furnishedStatus === "unfurnished" ? value.furnishedStatus : "all";
  const sortBy = typeof value.sortBy === "string" && ["newest", "oldest", "price_asc", "price_desc", "size_asc", "size_desc", "price_sqm_asc", "price_sqm_desc"].includes(value.sortBy)
    ? value.sortBy as PersistedApartmentFilterState["sortBy"]
    : "newest";

  return {
    rentMin: stringValue(value.rentMin, ""),
    rentMax: stringValue(value.rentMax, ""),
    minSqmPrice: stringValue(value.minSqmPrice, ""),
    maxSqmPrice: stringValue(value.maxSqmPrice, ""),
    selectedCity: stringValue(value.selectedCity, ""),
    areaQuery: stringValue(value.areaQuery, ""),
    sizeMin: stringValue(value.sizeMin, ""),
    sizeMax: stringValue(value.sizeMax, ""),
    petFriendly: booleanValue(value.petFriendly, false),
    nearMetro: booleanValue(value.nearMetro, false),
    propertyTypes: stringArray(value.propertyTypes),
    propertyCategories: stringArray(value.propertyCategories),
    floors: stringArray(value.floors),
    bedroomsMin: stringValue(value.bedroomsMin, ""),
    bathroomsMin: stringValue(value.bathroomsMin, ""),
    furnishedStatus,
    heatingTypes: stringArray(value.heatingTypes),
    energyClasses: stringArray(value.energyClasses),
    constructionYearMin: stringValue(value.constructionYearMin, ""),
    renovationYearMin: stringValue(value.renovationYearMin, ""),
    selectedAmenities: stringArray(value.selectedAmenities),
    userHardCriteria: stringArray(value.userHardCriteria) as PersistedApartmentFilterState["userHardCriteria"],
    showMatchScoreOnMap: booleanValue(value.showMatchScoreOnMap, false),
    polygonCoordinates: Array.isArray(value.polygonCoordinates) ? value.polygonCoordinates as PersistedApartmentFilterState["polygonCoordinates"] : [],
    sortBy,
  };
}