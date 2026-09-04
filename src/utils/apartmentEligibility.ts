import type { Apartment } from "@/src/types/apartment";
import type { FilterSetPayload } from "@/src/types/filters";
import type { ListingFormData } from "@/src/utils/compatibilityScore";
import { evaluateUserHardCriteriaMatch } from "@/src/utils/compatibilityScore";

interface EligibilityApartmentRecord {
  city?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  rent?: number | string;
  size?: number | string;
  floor?: string | number;
  tags?: string[];
  amenities?: string[];
  propertyType?: string;
  propertyCategory?: string;
  rooms?: number;
  extraInformation?: Record<string, unknown>;
  hostId?: string;
  ownerId?: string;
  isOffMarket?: boolean;
  status?: string;
  available?: unknown;
  isAvailable?: unknown;
  visibility?: unknown;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function includesConfiguredValue(value: unknown, configured: string[] | undefined): boolean {
  if (!configured || configured.length === 0) return true;
  const normalizedValue = normalize(value);
  return normalizedValue.length > 0 && configured.some((item) => {
    const normalizedItem = normalize(item);
    return normalizedValue.includes(normalizedItem) || normalizedItem.includes(normalizedValue);
  });
}

function hasListingTerm(apartment: Apartment, terms: string[]): boolean {
  const values = [
    ...(Array.isArray(apartment.tags) ? apartment.tags : []),
    ...(Array.isArray(apartment.amenities) ? apartment.amenities : []),
  ].map(normalize);
  return terms.some((term) => values.some((value) => value.includes(normalize(term))));
}

export function apartmentToListingFormData(apartment: Apartment): ListingFormData {
  const data = apartment as unknown as EligibilityApartmentRecord;
  const extraInformation = data.extraInformation;
  const rooms = typeof data.rooms === "number" ? data.rooms : undefined;
  return {
    city: data.city,
    area: data.area,
    latitude: data.latitude,
    longitude: data.longitude,
    rent: data.rent,
    size: data.size,
    floor: data.floor,
    tags: data.tags,
    amenities: data.amenities,
    propertyType: data.propertyType,
    propertyCategory: data.propertyCategory,
    bedrooms: rooms,
    bathrooms: typeof extraInformation?.bathrooms === "number" ? extraInformation.bathrooms : undefined,
    furnishedStatus: hasListingTerm(apartment, ["furnished", "επιπλω"]) ? "furnished" : "unfurnished",
    heatingSystem: typeof extraInformation?.heatingSystem === "string" ? extraInformation.heatingSystem : undefined,
    petFriendly: hasListingTerm(apartment, ["pet", "κατοικιδ"]),
    nearMetro: hasListingTerm(apartment, ["metro", "μετρο"]),
  };
}

function matchesFilterSet(apartment: Apartment, filterSet: FilterSetPayload): boolean {
  const data = apartment as unknown as EligibilityApartmentRecord;
  const listing = apartmentToListingFormData(apartment);
  const rent = numberValue(listing.rent);
  const size = numberValue(listing.size);
  const minimumRent = numberValue(filterSet.rentMin);
  const maximumRent = numberValue(filterSet.rentMax);
  const minimumSize = numberValue(filterSet.sizeMin);
  const maximumSize = numberValue(filterSet.sizeMax);
  const minimumBedrooms = numberValue(filterSet.bedroomsMin);
  const minimumBathrooms = numberValue(filterSet.bathroomsMin);
  const minimumBuildYear = numberValue(filterSet.constructionYearMin);
  const minimumRenovationYear = numberValue(filterSet.renovationYearMin);
  const extraInformation = data.extraInformation;

  if (minimumRent !== null && (rent === null || rent < minimumRent)) return false;
  if (maximumRent !== null && (rent === null || rent > maximumRent)) return false;
  if (minimumSize !== null && (size === null || size < minimumSize)) return false;
  if (maximumSize !== null && (size === null || size > maximumSize)) return false;
  if (filterSet.cityQuery?.trim()) {
    const location = normalize(filterSet.cityQuery);
    if (!normalize(data.city).includes(location) && !normalize(data.area).includes(location)) return false;
  }
  if (filterSet.minSqmPrice || filterSet.maxSqmPrice) {
    const pricePerSquareMeter = rent !== null && size !== null && size > 0 ? rent / size : null;
    if (pricePerSquareMeter === null) return false;
    const minimum = numberValue(filterSet.minSqmPrice);
    const maximum = numberValue(filterSet.maxSqmPrice);
    if (minimum !== null && pricePerSquareMeter < minimum) return false;
    if (maximum !== null && pricePerSquareMeter > maximum) return false;
  }
  if (!includesConfiguredValue(listing.propertyType, filterSet.propertyTypes)) return false;
  if (!includesConfiguredValue(listing.propertyCategory, filterSet.propertyCategories)) return false;
  if (!includesConfiguredValue(listing.floor, filterSet.floors)) return false;
  if (minimumBedrooms !== null && (numberValue(listing.bedrooms) === null || numberValue(listing.bedrooms)! < minimumBedrooms)) return false;
  if (minimumBathrooms !== null && (numberValue(listing.bathrooms) === null || numberValue(listing.bathrooms)! < minimumBathrooms)) return false;
  if (filterSet.petFriendly === true && !listing.petFriendly) return false;
  if (filterSet.nearMetro === true && !listing.nearMetro) return false;
  if (filterSet.furnishedStatus === "furnished" && listing.furnishedStatus !== "furnished") return false;
  if (filterSet.furnishedStatus === "unfurnished" && listing.furnishedStatus !== "unfurnished") return false;
  if (filterSet.heatingTypes?.length && !includesConfiguredValue(listing.heatingSystem, filterSet.heatingTypes)) return false;
  if (filterSet.energyClasses?.length && !includesConfiguredValue(extraInformation?.energyClass, filterSet.energyClasses)) return false;
  if (minimumBuildYear !== null && (typeof extraInformation?.buildYear !== "number" || extraInformation.buildYear < minimumBuildYear)) return false;
  if (minimumRenovationYear !== null && (typeof extraInformation?.renovationYear !== "number" || extraInformation.renovationYear < minimumRenovationYear)) return false;
  if (filterSet.selectedAmenities?.length && !filterSet.selectedAmenities.every((amenity) => hasListingTerm(apartment, [amenity]))) return false;

  return evaluateUserHardCriteriaMatch(listing, filterSet).passes;
}

export function isApartmentEligibleForClient(
  apartment: Apartment,
  options: {
    excludedUserIds?: ReadonlySet<string>;
    filterSet?: FilterSetPayload | null;
    notLookingForRoommate?: boolean;
    hostRequiresRoommate?: boolean;
  } = {},
): boolean {
  const apartmentRecord = apartment as unknown as EligibilityApartmentRecord;
  const hostId = apartmentRecord.hostId || apartmentRecord.ownerId;
  if (hostId && options.excludedUserIds?.has(hostId)) return false;
  if (apartmentRecord.visibility !== undefined && apartmentRecord.visibility !== "public") return false;
  if (apartmentRecord.isOffMarket || apartmentRecord.status !== "active") return false;
  if (apartmentRecord.available === false || apartmentRecord.isAvailable === false) return false;
  if (!isHostCompatibleForClient(options.notLookingForRoommate, options.hostRequiresRoommate)) return false;
  return !options.filterSet || matchesFilterSet(apartment, options.filterSet);
}

export function isHostCompatibleForClient(notLookingForRoommate: boolean | undefined, hostRequiresRoommate: boolean | undefined): boolean {
  return !(notLookingForRoommate === true && hostRequiresRoommate === true);
}