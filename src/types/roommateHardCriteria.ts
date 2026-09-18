import type { QuizQuestionId } from "@/src/data/quiz";

export type RoommateHardCriteriaKey =
  | "cleanliness"
  | "cleaningFrequency"
  | "kitchen"
  | "bills"
  | "smoking"
  | "noise"
  | "sleepSchedule"
  | "guests"
  | "parties"
  | "socializing"
  | "sharing"
  | "shopping"
  | "pets"
  | "alcohol"
  | "cooking";

export interface RoommateHardCriteriaOption {
  key: RoommateHardCriteriaKey;
  questionId: QuizQuestionId;
  labelKey: string;
}

export const DEFAULT_HARD_CRITERIA: RoommateHardCriteriaKey[] = ["smoking", "pets"];
export const MAX_HARD_CRITERIA_COUNT = 3;

export const ROOMMATE_HARD_CRITERIA_OPTIONS: readonly RoommateHardCriteriaOption[] = [
  { key: "cleanliness", questionId: "q1", labelKey: "quiz.questions.q1.question" },
  { key: "cleaningFrequency", questionId: "q2", labelKey: "quiz.questions.q2.question" },
  { key: "kitchen", questionId: "q3", labelKey: "quiz.questions.q3.question" },
  { key: "bills", questionId: "q4", labelKey: "quiz.questions.q4.question" },
  { key: "smoking", questionId: "q5", labelKey: "quiz.questions.q5.question" },
  { key: "noise", questionId: "q6", labelKey: "quiz.questions.q6.question" },
  { key: "sleepSchedule", questionId: "q7", labelKey: "quiz.questions.q7.question" },
  { key: "guests", questionId: "q8", labelKey: "quiz.questions.q8.question" },
  { key: "parties", questionId: "q9", labelKey: "quiz.questions.q9.question" },
  { key: "socializing", questionId: "q10", labelKey: "quiz.questions.q10.question" },
  { key: "sharing", questionId: "q11", labelKey: "quiz.questions.q11.question" },
  { key: "shopping", questionId: "q12", labelKey: "quiz.questions.q12.question" },
  { key: "pets", questionId: "q13", labelKey: "quiz.questions.q13.question" },
  { key: "alcohol", questionId: "q14", labelKey: "quiz.questions.q14.question" },
  { key: "cooking", questionId: "q15", labelKey: "quiz.questions.q15.question" },
];

const LEGACY_HARD_CRITERIA_KEYS: Record<string, RoommateHardCriteriaKey> = {
  q5: "smoking",
  q13: "pets",
};

function isRoommateHardCriteriaKey(value: string): value is RoommateHardCriteriaKey {
  return ROOMMATE_HARD_CRITERIA_OPTIONS.some((option) => option.key === value);
}

export function normalizeSelectedHardCriteria(value: unknown): RoommateHardCriteriaKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_HARD_CRITERIA];

  const normalized: RoommateHardCriteriaKey[] = [];
  value.forEach((item) => {
    if (typeof item !== "string") return;
    const key = LEGACY_HARD_CRITERIA_KEYS[item] ?? item;
    if (isRoommateHardCriteriaKey(key) && !normalized.includes(key)) normalized.push(key);
  });
  return normalized.slice(0, MAX_HARD_CRITERIA_COUNT);
}

export function getRoommateHardCriteriaOption(key: RoommateHardCriteriaKey): RoommateHardCriteriaOption {
  return ROOMMATE_HARD_CRITERIA_OPTIONS.find((option) => option.key === key) ?? ROOMMATE_HARD_CRITERIA_OPTIONS[0];
}