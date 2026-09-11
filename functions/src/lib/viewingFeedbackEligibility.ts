import type { DocumentData } from "firebase-admin/firestore";

function normalizedRole(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isBrokerRole(value: unknown): boolean {
  return ["broker", "realtor", "agent", "ceo", "secretary", "secretariat", "member"].includes(normalizedRole(value));
}

export function isBrokerProfile(hostUser: DocumentData, listing: DocumentData = {}): boolean {
  return hostUser.is_broker === true
    || hostUser.isBroker === true
    || isBrokerRole(hostUser.role)
    || isBrokerRole(hostUser.agencyRole)
    || listing.isBroker === true
    || isBrokerRole(listing.creatorRole);
}

export function hasExplicitRoommateOptOut(hostUser: DocumentData, listing: DocumentData = {}): boolean {
  const preferences = hostUser.preferences && typeof hostUser.preferences === "object" ? hostUser.preferences as DocumentData : {};
  const listingPreferences = listing.preferences && typeof listing.preferences === "object" ? listing.preferences as DocumentData : {};
  return hostUser.not_looking_for_roommate === true
    || hostUser.notLookingForRoommate === true
    || hostUser.looking_for_roommate === false
    || hostUser.isLookingForRoommate === false
    || preferences.wantsRoommate === false
    || preferences.noRoommates === true
    || listing.creatorNotLookingForRoommate === true
    || listing.not_looking_for_roommate === true
    || listing.lookingForRoommate === false
    || listing.isRoommateListing === false
    || listing.noRoommates === true
    || listingPreferences.wantsRoommate === false
    || listingPreferences.noRoommates === true;
}

export function shouldSuppressViewingFeedback(appointment: DocumentData, hostUser: DocumentData, listing: DocumentData = {}): boolean {
  const isBroker = isBrokerProfile(hostUser, listing);
  const hasOptedOutOfRoommates = hasExplicitRoommateOptOut(hostUser, listing);
  return !isBroker && !hasOptedOutOfRoommates;
}

export function listingHostId(appointment: DocumentData, listing: DocumentData): string {
  const candidates = [
    appointment.hostId,
    listing.hostId,
    listing.ownerId,
    listing.creatorId,
    appointment.brokerId,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}
