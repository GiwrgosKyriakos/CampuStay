type FeedbackProfile = {
  is_broker?: unknown;
  isBroker?: unknown;
  role?: unknown;
  agencyRole?: unknown;
  not_looking_for_roommate?: unknown;
  notLookingForRoommate?: unknown;
  looking_for_roommate?: unknown;
  isLookingForRoommate?: unknown;
  preferences?: { wantsRoommate?: unknown; noRoommates?: unknown };
};

type FeedbackListing = {
  isBroker?: unknown;
  creatorRole?: unknown;
  creatorNotLookingForRoommate?: unknown;
  not_looking_for_roommate?: unknown;
  lookingForRoommate?: unknown;
  isRoommateListing?: unknown;
  noRoommates?: unknown;
  preferences?: { wantsRoommate?: unknown; noRoommates?: unknown };
};

function normalizedRole(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isBrokerRole(value: unknown): boolean {
  return ["broker", "realtor", "agent", "ceo", "secretary", "secretariat", "member"].includes(normalizedRole(value));
}

export function isBrokerProfile(hostUser: FeedbackProfile, listing: FeedbackListing = {}): boolean {
  return hostUser.is_broker === true
    || hostUser.isBroker === true
    || isBrokerRole(hostUser.role)
    || isBrokerRole(hostUser.agencyRole)
    || listing.isBroker === true
    || isBrokerRole(listing.creatorRole);
}

export function hasExplicitRoommateOptOut(hostUser: FeedbackProfile, listing: FeedbackListing = {}): boolean {
  return hostUser.not_looking_for_roommate === true
    || hostUser.notLookingForRoommate === true
    || hostUser.looking_for_roommate === false
    || hostUser.isLookingForRoommate === false
    || hostUser.preferences?.wantsRoommate === false
    || hostUser.preferences?.noRoommates === true
    || listing.creatorNotLookingForRoommate === true
    || listing.not_looking_for_roommate === true
    || listing.lookingForRoommate === false
    || listing.isRoommateListing === false
    || listing.noRoommates === true
    || listing.preferences?.wantsRoommate === false
    || listing.preferences?.noRoommates === true;
}

export function shouldSuppressViewingFeedback(hostUser: FeedbackProfile, listing: FeedbackListing = {}): boolean {
  return !isBrokerProfile(hostUser, listing) && !hasExplicitRoommateOptOut(hostUser, listing);
}
