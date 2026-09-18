import type { LatLng } from "@/src/utils/geometry";

export type ApartmentSortOption = "newest" | "oldest" | "price_asc" | "price_desc" | "size_asc" | "size_desc" | "price_sqm_asc" | "price_sqm_desc";

export interface ApartmentFilterCriteria {
  rentMin: string;
  rentMax: string;
  minSqmPrice: string;
  maxSqmPrice: string;
  selectedCity: string;
  areaQuery: string;
  sizeMin: string;
  sizeMax: string;
  petFriendly: boolean;
  nearMetro: boolean;
  propertyTypes: string[];
  propertyCategories: string[];
  floors: string[];
  bedroomsMin: string;
  bathroomsMin: string;
  furnishedStatus: "all" | "furnished" | "unfurnished";
  heatingTypes: string[];
  energyClasses: string[];
  constructionYearMin: string;
  renovationYearMin: string;
  selectedAmenities: string[];
  userHardCriteria: HardCriteriaKey[];
  showMatchScoreOnMap: boolean;
  polygonCoordinates: LatLng[];
  sortBy: ApartmentSortOption;
}

export interface ShowOnlyToggles {
  selectedAgencyId: string | null;
  selectedBrokerId: string | null;
  selectedProposalListId: string | null;
  proposalApartmentIds: string[];
  showOwnListingsInFeed: boolean;
}

export type ApartmentFilterState = ApartmentFilterCriteria & ShowOnlyToggles;
export type PersistedApartmentFilterState = Omit<ApartmentFilterState, keyof ShowOnlyToggles>;

export type HardCriteriaKey =
  | "rent"
  | "size"
  | "floor"
  | "propertyType"
  | "bedrooms"
  | "bathrooms"
  | "furnished"
  | "heating"
  | "petFriendly"
  | "nearMetro"
  | "amenities";

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
  showMatchScore?: boolean;
  propertyTypes?: string[];
  propertyCategories?: string[];
  floors?: string[];
  bedroomsMin?: string;
  bathroomsMin?: string;
  furnishedStatus?: "all" | "furnished" | "unfurnished";
  heatingTypes?: string[];
  energyClasses?: string[];
  constructionYearMin?: string;
  renovationYearMin?: string;
  selectedAmenities?: string[];
  version?: number;
  updatedAt?: number;
  origin?: "client_created" | "broker_created";
  brokerModCount?: number;
  lastModifiedByBrokerId?: string;
  lastModifiedByBrokerName?: string;
  lastModifiedAt?: number;
  isSharedWithClient?: boolean;
  sharedByBrokerId?: string;
  userHardCriteria?: HardCriteriaKey[];
}