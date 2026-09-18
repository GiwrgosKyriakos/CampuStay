import { areFilterCriteriaEqual } from "@/src/utils/filterComparison";

describe("areFilterCriteriaEqual", () => {
  it("ignores metadata and title while normalizing functional criteria", () => {
    expect(areFilterCriteriaEqual(
      {
        title: "Ignored by the helper",
        cityQuery: "  Athens ",
        rentMin: 0,
        selectedAmenities: ["Parking", "Balcony", "Parking"],
        userHardCriteria: ["size", "rent"],
      },
      {
        title: "Another title",
        cityQuery: "athens",
        rentMin: undefined,
        selectedAmenities: ["balcony", "parking"],
        userHardCriteria: ["rent", "size"],
      },
    )).toBe(true);
  });

  it("detects changed matching criteria", () => {
    expect(areFilterCriteriaEqual(
      { rentMin: "500", propertyTypes: ["apartment"] },
      { rentMin: "650", propertyTypes: ["apartment"] },
    )).toBe(false);
  });

  it("treats omitted furnished status as the default all status", () => {
    expect(areFilterCriteriaEqual(
      { cityQuery: "Patra" },
      { cityQuery: "patra", furnishedStatus: "all" },
    )).toBe(true);
  });
});
