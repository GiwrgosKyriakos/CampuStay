import { calculateMatchScore, canonicalizeQuizAnswer, type UserProfile } from "@/src/utils/matchAlgorithm";

function profile(uid: string, quiz: Record<string, string>): UserProfile {
  return {
    uid,
    city: "Athens",
    gender: "Prefer Not To Say",
    monthlyBudget: 500,
    quiz,
  };
}

describe("match algorithm quiz contract", () => {
  it("normalizes stable IDs and legacy display values to the same answer", () => {
    expect(canonicalizeQuizAnswer("q1", "very_tidy")).toBe("very_tidy");
    expect(canonicalizeQuizAnswer("q1", "Very tidy")).toBe("very_tidy");
    expect(canonicalizeQuizAnswer("q7", "Before 11pm")).toBe("early_bird");
    expect(canonicalizeQuizAnswer("q7", "Πρωινός τύπος")).toBe("early_bird");
  });

  it("scores canonical quiz values without depending on translated labels", () => {
    const stableScore = calculateMatchScore(
      profile("viewer", { q1: "very_tidy", q5: "smokes_outside", q7: "early_bird" }),
      profile("candidate", { q1: "average", q5: "non_smoker", q7: "student_routine" }),
    );
    const legacyScore = calculateMatchScore(
      profile("viewer", { q1: "Very tidy", q5: "Only outside", q7: "Before 11pm" }),
      profile("candidate", { q1: "Average", q5: "No", q7: "11pm–1am" }),
    );

    expect(stableScore).toBeGreaterThan(50);
    expect(stableScore).toBe(legacyScore);
  });

  it("keeps algorithm-keyed quiz objects compatible with raw question answers", () => {
    const rawScore = calculateMatchScore(
      profile("viewer", { q5: "smokes_outside", q13: "pets_allowed" }),
      profile("candidate", { q5: "non_smoker", q13: "pet_owner_or_wants" }),
    );
    const algorithmKeyedScore = calculateMatchScore(
      profile("viewer", { q7_smoke: "smokes_outside", q8_pets: "pets_allowed" }),
      profile("candidate", { q7_smoke: "non_smoker", q8_pets: "pet_owner_or_wants" }),
    );

    expect(algorithmKeyedScore).toBe(rawScore);
  });

  it("uses the direct point formula at the scoring boundaries", () => {
    const completeQuiz = {
      q1: "very_tidy",
      q2: "weekly",
      q3: "wash_daily",
      q4: "split_evenly",
      q5: "non_smoker",
      q6: "quiet_always",
      q7: "early_bird",
      q8: "ask_first",
      q9: "occasional_gatherings",
      q10: "friendly_co_living",
      q11: "ask_first",
      q12: "wash_daily",
      q13: "pets_allowed",
      q14: "weekend_drinker",
      q15: "few_times",
    };

    expect(calculateMatchScore(profile("viewer", completeQuiz), profile("candidate", completeQuiz))).toBe(100);
    const almostCompleteQuiz: Record<string, string> = { ...completeQuiz };
    delete almostCompleteQuiz.q15;
    expect(calculateMatchScore(profile("viewer", almostCompleteQuiz), profile("candidate", almostCompleteQuiz))).toBe(96);
    expect(calculateMatchScore(profile("viewer", {}), profile("candidate", {}))).toBe(50);
    expect(
      calculateMatchScore(profile("viewer", {}), { ...profile("candidate", {}), city: "Thessaloniki" }),
    ).toBe(0);
    expect(
      calculateMatchScore(profile("viewer", { q1: "very_tidy" }), profile("candidate", { q1: "very_tidy" })),
    ).toBe(55);
  });
});