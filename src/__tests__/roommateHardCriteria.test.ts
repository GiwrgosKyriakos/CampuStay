import {
  DEFAULT_HARD_CRITERIA,
  MAX_HARD_CRITERIA_COUNT,
  normalizeSelectedHardCriteria,
} from "@/src/types/roommateHardCriteria";

describe("roommate hard criteria", () => {
  it("defaults to smoking and pets", () => {
    expect(DEFAULT_HARD_CRITERIA).toEqual(["smoking", "pets"]);
  });

  it("migrates legacy quiz keys and caps selections at three", () => {
    expect(normalizeSelectedHardCriteria(["q5", "q13", "cleanliness", "bills"])).toEqual(["smoking", "pets", "cleanliness"]);
    expect(normalizeSelectedHardCriteria(["smoking", "smoking", "pets"])).toHaveLength(2);
    expect(MAX_HARD_CRITERIA_COUNT).toBe(3);
  });

  it("preserves an intentional empty selection", () => {
    expect(normalizeSelectedHardCriteria([])).toEqual([]);
  });
});