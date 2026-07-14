export interface CompatibilityQuiz {
  q1_bills: 'Split everything evenly' | 'Each person pays for a different one' | 'We’ll figure it out as we go';
  q2_sharing: 'Share freely' | 'Ask first' | 'Prefer not to share';
  q3_food: 'Take turns buying' | 'Split evenly' | 'Everyone buys their own';
  q4_cleanliness: 'Very tidy' | 'Average' | 'Messy';
  q5_cleaning_freq: 'Weekly' | 'Every now and then' | 'Only when it’s really needed';
  q6_dishes: 'Wash daily' | 'Next day' | 'When there are no clean ones left';
  q7_smoke: 'Yes' | 'Only outside' | 'No';
  q8_pets: 'Yes' | 'Pets are fine' | 'No pets please';
  q9_sleep: 'Before 11pm' | '11pm–1am' | 'After 1am';
  q10_quiet: 'Quiet always' | 'Quiet at night' | 'Noise is fine anytime';
  q11_guests: 'Come anytime' | 'Ask first' | 'Rare visits only';
  q12_parties: 'Love them' | 'Occasionally is fine' | 'No parties please';
  q13_cook: 'Every day' | 'Few times a week' | 'Rarely';
  q14_drinking: 'I drink often' | 'Only weekends' | 'I don’t drink (but okay if you do)' | 'I prefer no alcohol at home';
  q15_roommate_type: 'Just split the bills' | 'Friendly co-living' | 'Let’s hang out and be friends';
}

export type CompatibilityQuizAnswers = Partial<CompatibilityQuiz>;

export interface UserProfile {
  uid: string;
  city: string;
  gender: 'Male' | 'Female' | 'Prefer Not To Say';
  monthlyBudget: number;
  quiz?: CompatibilityQuizAnswers;
}

const QUESTION_KEYS: (keyof CompatibilityQuiz)[] = [
  'q1_bills',
  'q2_sharing',
  'q3_food',
  'q4_cleanliness',
  'q5_cleaning_freq',
  'q6_dishes',
  'q7_smoke',
  'q8_pets',
  'q9_sleep',
  'q10_quiet',
  'q11_guests',
  'q12_parties',
  'q13_cook',
  'q14_drinking',
  'q15_roommate_type',
];

const QUESTION_MAX_POINTS: Record<keyof CompatibilityQuiz, number> = {
  q1_bills: 3,
  q2_sharing: 3,
  q3_food: 3,
  q4_cleanliness: 8,
  q5_cleaning_freq: 6,
  q6_dishes: 6,
  q7_smoke: 7,
  q8_pets: 6,
  q9_sleep: 6,
  q10_quiet: 6,
  q11_guests: 5,
  q12_parties: 5,
  q13_cook: 3,
  q14_drinking: 3,
  q15_roommate_type: 5,
};

function hasAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function scoreAnsweredQuestion(
  key: keyof CompatibilityQuiz,
  currentQuiz: CompatibilityQuizAnswers,
  matchQuiz: CompatibilityQuizAnswers,
): number {
  const currentAnswer = currentQuiz[key];
  const matchAnswer = matchQuiz[key];

  if (!hasAnswer(currentAnswer) || !hasAnswer(matchAnswer)) return 0;

  switch (key) {
    case 'q7_smoke':
      if (currentAnswer === matchAnswer) return 7;
      if (currentAnswer === 'Only outside' && matchAnswer === 'No') return 5;
      return 0;
    case 'q8_pets':
      if (currentAnswer === matchAnswer) return 6;
      if (currentAnswer === 'Pets are fine' && matchAnswer === 'Yes') return 5;
      return 0;
    case 'q9_sleep':
      if (currentAnswer === matchAnswer) return 6;
      if (
        (currentAnswer === 'Before 11pm' && matchAnswer === '11pm–1am') ||
        (currentAnswer === '11pm–1am' && matchAnswer === 'After 1am')
      ) {
        return 3;
      }
      return 0;
    case 'q10_quiet':
      return currentAnswer === matchAnswer ? 6 : 0;
    case 'q4_cleanliness':
      if (currentAnswer === matchAnswer) return 8;
      if (currentAnswer === 'Very tidy' && matchAnswer === 'Average') return 4;
      return 0;
    case 'q5_cleaning_freq':
      return currentAnswer === matchAnswer ? 6 : 0;
    case 'q6_dishes':
      return currentAnswer === matchAnswer ? 6 : 0;
    case 'q11_guests':
      return currentAnswer === matchAnswer ? 5 : 0;
    case 'q12_parties':
      return currentAnswer === matchAnswer ? 5 : 0;
    case 'q15_roommate_type':
      return currentAnswer === matchAnswer ? 5 : 0;
    case 'q1_bills':
      return currentAnswer === matchAnswer ? 3 : 0;
    case 'q2_sharing':
      return currentAnswer === matchAnswer ? 3 : 0;
    case 'q3_food':
      return currentAnswer === matchAnswer ? 3 : 0;
    case 'q13_cook':
      return currentAnswer === matchAnswer ? 3 : 0;
    case 'q14_drinking':
      return currentAnswer === matchAnswer ? 3 : 0;
    default:
      return 0;
  }
}

export function calculateMatchScore(currentUser: UserProfile, potentialMatch: UserProfile): number {
  // Αν ψάχνουν σε διαφορετική πόλη, τους βγάζουμε τελείως εκτός στοίβας (0%)
  if (currentUser.city !== potentialMatch.city) return 0;

  const currentQuiz = currentUser.quiz ?? {};
  const matchQuiz = potentialMatch.quiz ?? {};

  let totalPoints = 0;
  let maxPossiblePoints = 25;
  let mutuallyAnsweredCount = 0;

  // ==========================================
  // 1. MONTHLY BUDGET (Μέγιστο: 25 πόντοι)
  // ==========================================
  const budgetDiff = Math.abs(currentUser.monthlyBudget - potentialMatch.monthlyBudget);
  if (budgetDiff <= 30) totalPoints += 25;
  else if (budgetDiff <= 80) totalPoints += 15;
  else if (budgetDiff <= 150) totalPoints += 5;

  for (const key of QUESTION_KEYS) {
    const currentAnswer = currentQuiz[key];
    const matchAnswer = matchQuiz[key];

    if (!hasAnswer(currentAnswer) || !hasAnswer(matchAnswer)) {
      continue;
    }

    mutuallyAnsweredCount += 1;
    totalPoints += scoreAnsweredQuestion(key, currentQuiz, matchQuiz);
    maxPossiblePoints += QUESTION_MAX_POINTS[key];
  }

  const baseScore = maxPossiblePoints > 0 ? (totalPoints / maxPossiblePoints) * 100 : 0;
  const completionPercentage = mutuallyAnsweredCount / QUESTION_KEYS.length;
  const scalingFactor = 0.5 + 0.5 * completionPercentage;

  return Math.max(0, Math.min(100, Math.round(baseScore * scalingFactor)));
}