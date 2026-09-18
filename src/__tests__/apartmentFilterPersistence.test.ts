import {
  DEFAULT_APARTMENT_FILTER_CRITERIA,
  DEFAULT_SHOW_ONLY_TOGGLES,
  hydratePersistedApartmentFilters,
  serializeApartmentFilters,
} from "@/src/utils/apartmentFilterPersistence";
import type { ApartmentFilterState } from "@/src/types/filters";

describe("apartment filter persistence", () => {
  it("serializes structural criteria without Show Only state", () => {
    const state: ApartmentFilterState = {
      ...DEFAULT_APARTMENT_FILTER_CRITERIA,
      ...DEFAULT_SHOW_ONLY_TOGGLES,
      rentMin: "500",
      propertyTypes: ["apartment"],
      selectedAgencyId: "agency-1",
      selectedBrokerId: "broker-1",
      selectedProposalListId: "list-1",
      proposalApartmentIds: ["apt-1"],
      showOwnListingsInFeed: true,
    };

    const persisted = serializeApartmentFilters(state);

    expect(persisted.rentMin).toBe("500");
    expect(persisted.propertyTypes).toEqual(["apartment"]);
    expect(persisted).not.toHaveProperty("selectedAgencyId");
    expect(persisted).not.toHaveProperty("selectedBrokerId");
    expect(persisted).not.toHaveProperty("selectedProposalListId");
    expect(persisted).not.toHaveProperty("proposalApartmentIds");
    expect(persisted).not.toHaveProperty("showOwnListingsInFeed");
  });

  it("hydrates saved criteria with clean Show Only defaults", () => {
    const hydrated = hydratePersistedApartmentFilters({ rentMax: "1200", selectedAgencyId: "stale-agency" });

    expect(hydrated.rentMax).toBe("1200");
    expect(hydrated).not.toHaveProperty("selectedAgencyId");
    expect(hydrated).not.toHaveProperty("showOwnListingsInFeed");
  });
});
