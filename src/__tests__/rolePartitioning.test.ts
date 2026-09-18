import { hasBrokerParticipant, isBrokerOrAgencyUser, isPeerHost, isRoommateGroupHost } from "@/src/utils/roles";

describe("role partitioning", () => {
  it("treats every supported broker marker as commercial", () => {
    expect(isBrokerOrAgencyUser({ isBroker: true })).toBe(true);
    expect(isBrokerOrAgencyUser({ role: "broker" })).toBe(true);
    expect(isBrokerOrAgencyUser({ agencyId: "agency-1" })).toBe(true);
  });

  it("detects a broker anywhere in a typed participant list", () => {
    expect(hasBrokerParticipant([{ role: "roommate" }, { agencyId: "agency-1" }])).toBe(true);
    expect(hasBrokerParticipant([{ role: "roommate" }, { isHost: true }])).toBe(false);
  });

  it("only accepts non-commercial host profiles as peer hosts", () => {
    expect(isPeerHost({ role: "host" })).toBe(true);
    expect(isPeerHost({ isHost: true, isBroker: true })).toBe(false);
    expect(isPeerHost({ role: "host", agencyId: "agency-1" })).toBe(false);
    expect(isPeerHost({ role: "broker", isHost: true })).toBe(false);
  });

  it("recognizes a non-commercial housing profile as a group host", () => {
    expect(isRoommateGroupHost({ has_place: true })).toBe(true);
    expect(isRoommateGroupHost({ hasApartment: true, isBroker: true })).toBe(false);
  });
});