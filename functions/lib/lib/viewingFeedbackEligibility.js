"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrokerProfile = isBrokerProfile;
exports.hasExplicitRoommateOptOut = hasExplicitRoommateOptOut;
exports.shouldSuppressViewingFeedback = shouldSuppressViewingFeedback;
exports.listingHostId = listingHostId;
function normalizedRole(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function isBrokerRole(value) {
    return ["broker", "realtor", "agent", "ceo", "secretary", "secretariat", "member"].includes(normalizedRole(value));
}
function isBrokerProfile(hostUser, listing = {}) {
    return hostUser.is_broker === true
        || hostUser.isBroker === true
        || isBrokerRole(hostUser.role)
        || isBrokerRole(hostUser.agencyRole)
        || listing.isBroker === true
        || isBrokerRole(listing.creatorRole);
}
function hasExplicitRoommateOptOut(hostUser, listing = {}) {
    const preferences = hostUser.preferences && typeof hostUser.preferences === "object" ? hostUser.preferences : {};
    const listingPreferences = listing.preferences && typeof listing.preferences === "object" ? listing.preferences : {};
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
function shouldSuppressViewingFeedback(appointment, hostUser, listing = {}) {
    const isBroker = isBrokerProfile(hostUser, listing);
    const hasOptedOutOfRoommates = hasExplicitRoommateOptOut(hostUser, listing);
    return !isBroker && !hasOptedOutOfRoommates;
}
function listingHostId(appointment, listing) {
    const candidates = [
        appointment.hostId,
        listing.hostId,
        listing.ownerId,
        listing.creatorId,
        appointment.brokerId,
    ];
    return candidates.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}
//# sourceMappingURL=viewingFeedbackEligibility.js.map