import {
  CANONICAL_DEAL_STAGES,
  canonicalDealStageFromPercentage,
  getCanonicalDealStageConfig,
  normalizeCanonicalDealStage,
} from "../constants/pipeline";

describe("canonical deal stages", () => {
  it("keeps the shared stage order and audited 5% new-lead probability", () => {
    expect(CANONICAL_DEAL_STAGES).toEqual([
      "new_lead",
      "contacted",
      "showing_scheduled",
      "offer_made",
      "under_contract",
      "closed_won",
      "closed_lost",
    ]);
    expect(getCanonicalDealStageConfig("new_lead")).toEqual(expect.objectContaining({ percentage: 5, probability: 0.05 }));
  });

  it("normalizes legacy stage aliases to canonical keys", () => {
    expect(normalizeCanonicalDealStage("negotiation_agreement")).toBe("under_contract");
    expect(normalizeCanonicalDealStage("deal_closed")).toBe("closed_won");
    expect(normalizeCanonicalDealStage("lost")).toBe("closed_lost");
    expect(canonicalDealStageFromPercentage(10)).toBe("contacted");
    expect(canonicalDealStageFromPercentage(90)).toBe("under_contract");
  });
});
