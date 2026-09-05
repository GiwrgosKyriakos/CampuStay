import { shouldDisplayListingForUser } from "@/src/utils/listingFilters";
import type { Listing } from "@/src/types/listing";

const noRoommateClient = { notLookingForRoommate: true };
const roommateLookingClient = { notLookingForRoommate: false };

describe("shouldDisplayListingForUser", () => {
  it("keeps broker and agency listings visible", () => {
    expect(shouldDisplayListingForUser({ isBroker: true }, noRoommateClient)).toBe(true);
    expect(shouldDisplayListingForUser({ agencyId: "agency-1" }, noRoommateClient)).toBe(true);
    expect(shouldDisplayListingForUser({ creatorRole: "agency" }, noRoommateClient)).toBe(true);
  });

  it("keeps explicitly whole-property and opted-out owner listings visible", () => {
    const wholeApartment: Listing = { isWholeApartment: true };
    const optedOutOwner: Listing = { creatorNotLookingForRoommate: true };

    expect(shouldDisplayListingForUser(wholeApartment, noRoommateClient)).toBe(true);
    expect(shouldDisplayListingForUser(optedOutOwner, noRoommateClient)).toBe(true);
  });

  it("hides roommate-seeking and unknown regular listings from no-roommate clients", () => {
    expect(shouldDisplayListingForUser({ isRoommateListing: true }, noRoommateClient)).toBe(false);
    expect(shouldDisplayListingForUser({ lookingForRoommate: true }, noRoommateClient)).toBe(false);
    expect(shouldDisplayListingForUser({ creatorNotLookingForRoommate: false }, noRoommateClient)).toBe(false);
    expect(shouldDisplayListingForUser({}, noRoommateClient)).toBe(false);
  });

  it("does not restrict clients who are looking for roommates", () => {
    expect(shouldDisplayListingForUser({ isRoommateListing: true }, roommateLookingClient)).toBe(true);
    expect(shouldDisplayListingForUser({}, roommateLookingClient)).toBe(true);
    expect(shouldDisplayListingForUser({ isRoommateListing: true }, null)).toBe(true);
  });
});