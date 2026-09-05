import type { Listing } from "@/src/types/listing";

export interface ListingViewerRoommatePreferences {
  isBroker?: boolean;
  notLookingForRoommate?: boolean;
}

function isBrokerListing(listing: Listing): boolean {
  return Boolean(
    listing.isBroker === true ||
      listing.creatorRole === "broker" ||
      listing.creatorRole === "agency" ||
      (typeof listing.agencyId === "string" && listing.agencyId.trim().length > 0),
  );
}

function isWholePropertyListing(listing: Listing): boolean {
  return Boolean(
    listing.isWholeApartment === true ||
      listing.wholeApartment === true ||
      listing.entireApartment === true ||
      listing.rentalType === "entire" ||
      listing.rentalType === "whole_apartment",
  );
}

export function shouldDisplayListingForUser(
  listing: Listing,
  user: ListingViewerRoommatePreferences | null,
): boolean {
  if (user?.notLookingForRoommate !== true) return true;
  if (isBrokerListing(listing) || isWholePropertyListing(listing)) return true;

  const creatorWantsRoommate =
    listing.isRoommateListing === true ||
    listing.creatorNotLookingForRoommate === false ||
    listing.lookingForRoommate === true;

  if (creatorWantsRoommate) return false;

  return listing.creatorNotLookingForRoommate === true;
}