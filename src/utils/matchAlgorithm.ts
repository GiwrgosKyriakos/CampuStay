import { areCanonicalCitiesEquivalent } from "@/src/utils/cityTypes";

export interface CompatibilityQuiz {
  q1_bills: string;
  q2_sharing: string;
  q3_food: string;
  q4_cleanliness: string;
  q5_cleaning_freq: string;
  q6_dishes: string;
  q7_smoke: string;
  q8_pets: string;
  q9_sleep: string;
  q10_quiet: string;
  q11_guests: string;
  q12_parties: string;
  q13_cook: string;
  q14_drinking: string;
  q15_roommate_type: string;
}

export type CompatibilityQuizAnswers = Partial<CompatibilityQuiz>;

export interface UserProfile {
  uid: string;
  city: string;
  gender: 'Male' | 'Female' | 'Prefer Not To Say';
  monthlyBudget: number;
  is_broker?: boolean;
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
  q1_bills: 1.5,
  q2_sharing: 1.5,
  q3_food: 1.5,
  q4_cleanliness: 4.5,
  q5_cleaning_freq: 3,
  q6_dishes: 3,
  q7_smoke: 4.5,
  q8_pets: 4.5,
  q9_sleep: 3,
  q10_quiet: 3,
  q11_guests: 4.5,
  q12_parties: 3,
  q13_cook: 1.5,
  q14_drinking: 1.5,
  q15_roommate_type: 3,
};

function hasAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeAnswerToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

const QUIZ_ANSWER_ALIASES: Record<string, Record<string, string>> = {
  q1: { very_tidy: 'very_tidy', average: 'average', messy: 'messy', very_tidy_and_highly_organized: 'very_tidy', average_and_reasonably_clean: 'average', pretty_relaxed_or_messy: 'messy', πολυ_τακτικος_η: 'very_tidy', μετρια_καθαριοτητα: 'average', χαλαρος_η_με_την_ταξη: 'messy', πολυ_τακτικος_η_και_οργανωμενος_η: 'very_tidy', μετριος_α_και_αρκετα_καθαρος_η: 'average', αρκετα_χαλαρος_η_η_ακαταστατος_η: 'messy' },
  q2: { weekly: 'weekly', at_least_once_a_week: 'weekly', sometimes: 'sometimes', every_now_and_then: 'sometimes', only_when_needed: 'only_when_needed', only_when_its_really_needed: 'only_when_needed', only_when_it_becomes_absolutely_necessary: 'only_when_needed', τουλαχιστον_μια_φορα_την_εβδομαδα: 'weekly', που_και_που: 'sometimes', μονο_οταν_γινει_απολυτως_απαραιτητο: 'only_when_needed' },
  q3: { wash_daily: 'wash_daily', wash_them_immediately_or_daily: 'wash_daily', next_day: 'next_day', leave_them_until_the_next_day: 'next_day', when_no_clean_ones: 'when_no_clean_ones', when_there_are_no_clean_ones_left: 'when_no_clean_ones', τα_πλενω_αμεσως_η_καθημερινα: 'wash_daily', τα_αφηνω_για_την_επομενη_μερα: 'next_day', τα_πλενω_μονο_οταν_δεν_εχουν_μεινει_καθαρα: 'when_no_clean_ones' },
  q4: { split_evenly: 'split_evenly', assigned_bills: 'assigned_bills', each_person_pays_for_a_different_one: 'assigned_bills', flexible: 'flexible', well_figure_it_out_as_we_go: 'flexible', τα_μοιραζουμε_ολα_ισοτιμα: 'split_evenly', ο_καθενας_αναλαμβανει_εναν_διαφορετικο_λογαριασμο: 'assigned_bills', το_κανονιζουμε_στην_πορεια: 'flexible' },
  q5: { smoker: 'smoker', yes: 'smoker', smokes_outside: 'smokes_outside', only_outside: 'smokes_outside', non_smoker: 'non_smoker', no: 'non_smoker', καπνιστης: 'smoker', καπνιζει_εξω: 'smokes_outside', μη_καπνιστης: 'non_smoker', καπνιζω_συχνα: 'smoker', καπνιζω_μονο_εξω_η_στο_μπαλκονι: 'smokes_outside', ειμαι_αυστηρα_μη_καπνιστης_ρια: 'non_smoker' },
  q6: { quiet_always: 'quiet_always', quiet_at_night: 'quiet_at_night', noise_is_fine: 'noise_is_fine', noise_is_fine_anytime: 'noise_is_fine', χρειαζομαι_απολυτη_ησυχια_τις_περισσοτερες_φορες: 'quiet_always', χρειαζομαι_ησυχια_μονο_αργα_το_βραδυ: 'quiet_at_night', ο_θορυβος_δεν_με_ενοχλει_καθολου: 'noise_is_fine' },
  q7: { early_bird: 'early_bird', before_11pm: 'early_bird', student_routine: 'student_routine', '11pm_1am': 'student_routine', night_owl: 'night_owl', after_1am: 'night_owl', πρωινος_τυπος: 'early_bird', συνηθισμενο_φοιτητικο_ωραριο: 'student_routine', νυχτοπουλι: 'night_owl', πρωινος_τυπος_κοιμαμαι_πριν_τις_11_μμ: 'early_bird', τυπικο_φοιτητικο_προγραμμα_κοιμαμαι_μεταξυ_11_μμ_και_1_πμ: 'student_routine', νυχτοπουλι_κοιμαμαι_μετα_τη_1_πμ: 'night_owl' },
  q8: { guests_anytime: 'guests_anytime', come_anytime: 'guests_anytime', ask_first: 'ask_first', rare_visits: 'rare_visits', rare_visits_only: 'rare_visits', μπορουν_να_ερχονται_οποιαδηποτε_στιγμη_χωρις_ενημερωση: 'guests_anytime', παρακαλω_να_ρωτουν_η_να_ενημερωνουν_πρωτα: 'ask_first', σπανιες_επισκεψεις_μονο_προτιμω_την_ιδιωτικοτητα: 'rare_visits' },
  q9: { love_parties: 'love_parties', love_them: 'love_parties', occasional_gatherings: 'occasional_gatherings', occasionally_is_fine: 'occasional_gatherings', no_parties: 'no_parties', no_parties_please: 'no_parties', τα_λατρευω_οσο_περισσοτεροι_τοσο_καλυτερα: 'love_parties', περιστασιακες_μικρες_συγκεντρωσεις_ειναι_απολυτως_ενταξει: 'occasional_gatherings', αυστηρα_κανενα_παρτι_στο_σπιτι: 'no_parties' },
  q10: { close_friends: 'close_friends', lets_hang_out_and_be_friends: 'close_friends', friendly_co_living: 'friendly_co_living', just_split_the_bills: 'quiet_roommates', quiet_roommates: 'quiet_roommates', θελω_να_γινουμε_κοντινοι_φιλοι_και_να_περναμε_χρονο_μαζι: 'close_friends', φιλικοι_και_ευγενικοι_αλλα_με_ξεχωριστες_ζωες: 'friendly_co_living', απλα_συγκατοικοι_που_συνυπαρχουν_ησυχα: 'quiet_roommates' },
  q11: { share_freely: 'share_freely', prefer_not_to_share: 'no_sharing', no_sharing: 'no_sharing', ask_first: 'ask_first', μοιραζομαι_τα_παντα_ελευθερα: 'share_freely', παντα_να_ρωτας_πριν_χρησιμοποιησεις_τα_πραγματα_μου: 'ask_first', προτιμω_να_μη_μοιραζομαι: 'no_sharing' },
  q12: { take_turns: 'take_turns', take_turns_buying: 'take_turns', split_costs: 'split_costs', split_evenly: 'split_costs', own_supplies: 'own_supplies', everyone_buys_their_own: 'own_supplies', να_αγοραζουμε_εκ_περιτροπης_τα_κοινα_αναλωσιμα: 'take_turns', να_μοιραζομαστε_ισοτιμα_το_κοστος_των_αγορων: 'split_costs', ο_καθενας_αγοραζει_και_καταναλωνει_τα_δικα_του: 'own_supplies' },
  q13: { pet_owner_or_wants: 'pet_owner_or_wants', yes: 'pet_owner_or_wants', pets_allowed: 'pets_allowed', pets_are_fine: 'pets_allowed', no_pets: 'no_pets', no_pets_please: 'no_pets', εχει_η_θελει_κατοικιδιο: 'pet_owner_or_wants', κατοικιδια_ευπροσδεκτα: 'pets_allowed', χωρις_κατοικιδια: 'no_pets', εχω_κατοικιδιο_η_σιγουρα_θελω_να_αποκτησω: 'pet_owner_or_wants', δεν_εχω_αλλα_τα_κατοικιδια_ειναι_απολυτα_ενταξει_για_μενα: 'pets_allowed', αυστηρα_χωρις_κατοικιδια: 'no_pets' },
  q14: { often_alcohol: 'often_alcohol', i_drink_often: 'often_alcohol', weekend_drinker: 'weekend_drinker', only_weekends: 'weekend_drinker', no_alcohol: 'no_alcohol', i_dont_drink_but_okay_if_you_do: 'no_alcohol', μου_αρεσει_να_πινω_συχνα_στο_σπιτι: 'often_alcohol', πινω_μονο_περιστασιακα_τα_σαββατοκυριακα: 'weekend_drinker', δεν_πινω_η_προτιμω_ενα_σπιτι_χωρις_αλκοολ: 'no_alcohol' },
  q15: { every_day: 'every_day', i_cook_every_single_day: 'every_day', few_times: 'few_times', a_few_times_a_week: 'few_times', rarely: 'rarely', rarely_i_mostly_order_out_or_eat_on_campus: 'rarely', μαγειρευω_καθε_μερα: 'every_day', μερικες_φορες_την_εβδομαδα: 'few_times', σπανια_κυριως_παραγγελνω_η_τρωω_στη_σχολη: 'rarely' },
};

export function canonicalizeQuizAnswer(questionId: string, value: unknown): string | undefined {
  if (!hasAnswer(value)) return undefined;
  const trimmed = value.trim();
  return QUIZ_ANSWER_ALIASES[questionId]?.[normalizeAnswerToken(trimmed)] ?? trimmed;
}

/**
 * Μεταφράζει τα δεδομένα του Firestore (q1, q2...) στα μεγάλα κλειδιά του αλγορίθμου
 */
function normalizeQuizData(rawQuiz: any): CompatibilityQuizAnswers {
  const normalized: any = {};
  const keyMap: Record<string, keyof CompatibilityQuiz> = {
    q1: 'q4_cleanliness',
    q2: 'q5_cleaning_freq',
    q3: 'q6_dishes',
    q4: 'q1_bills',
    q5: 'q7_smoke',
    q6: 'q10_quiet',
    q7: 'q9_sleep',
    q8: 'q11_guests',
    q9: 'q12_parties',
    q10: 'q15_roommate_type',
    q11: 'q2_sharing',
    q12: 'q3_food',
    q13: 'q8_pets',
    q14: 'q14_drinking',
    q15: 'q13_cook'
  };

  const algorithmKeyToQuestionId: Record<string, string> = Object.fromEntries(
    Object.entries({
      q1_bills: 'q4',
      q2_sharing: 'q11',
      q3_food: 'q12',
      q4_cleanliness: 'q1',
      q5_cleaning_freq: 'q2',
      q6_dishes: 'q3',
      q7_smoke: 'q5',
      q8_pets: 'q13',
      q9_sleep: 'q7',
      q10_quiet: 'q6',
      q11_guests: 'q8',
      q12_parties: 'q9',
      q13_cook: 'q15',
      q14_drinking: 'q14',
      q15_roommate_type: 'q10',
    }),
  );

  const source = rawQuiz?.answers ?? rawQuiz ?? {};
  Object.keys(source).forEach((k) => {
    if (hasAnswer(source[k])) {
      const targetKey = keyMap[k] || k;
      const questionId = keyMap[k] ? k : algorithmKeyToQuestionId[k];
      normalized[targetKey] = questionId ? canonicalizeQuizAnswer(questionId, source[k]) : source[k];
    }
  });
  return normalized;
}

/**
 * Υπολογίζει τον συντελεστή Συμβιβασμού (S) βάσει των υπαρχουσών ποσοστώσεων
 * S = 1.0 για πλήρη ταύτιση, S = 0.5 για συμβιβασμό, S = 0.0 για ασυμβατότητα
 */
function getCompromiseFactor(
  key: keyof CompatibilityQuiz,
  currentAnswer: string,
  matchAnswer: string,
): number {
  if (currentAnswer === matchAnswer) return 1.0;

  const cur = normalizeAnswerToken(currentAnswer);
  const mat = normalizeAnswerToken(matchAnswer);

  if (cur === mat && cur.length > 0) return 1.0;

  switch (key) {
    case 'q7_smoke':
      if ((cur === 'smokes_outside' && mat === 'non_smoker') || (cur === 'non_smoker' && mat === 'smokes_outside')) return 0.5;
      return 0.0;
    case 'q8_pets':
      if ((cur === 'pets_allowed' && mat === 'pet_owner_or_wants') || (cur === 'pet_owner_or_wants' && mat === 'pets_allowed')) return 0.5;
      return 0.0;
    case 'q9_sleep':
      const slotCur = cur === 'early_bird' || cur.includes('before') ? 1 : cur === 'student_routine' || cur.includes('11') ? 2 : cur === 'night_owl' || cur.includes('after') ? 3 : 0;
      const slotMat = mat === 'early_bird' || mat.includes('before') ? 1 : mat === 'student_routine' || mat.includes('11') ? 2 : mat === 'night_owl' || mat.includes('after') ? 3 : 0;

      if (slotCur > 0 && slotMat > 0 && Math.abs(slotCur - slotMat) === 1) return 0.5;
      return 0.0;
    case 'q4_cleanliness':
      if ((cur === 'very_tidy' && mat === 'average') || (cur === 'average' && mat === 'very_tidy')) return 0.5;
      return 0.0;
    default:
      return 0.0;
  }
}

export function calculateMatchScore(currentUser: UserProfile, potentialMatch: UserProfile): number {
  if (currentUser.city && potentialMatch.city && !areCanonicalCitiesEquivalent(currentUser.city, potentialMatch.city)) {
    return 0;
  }

  let score = 50.0;

  const currentQuiz = normalizeQuizData(currentUser.quiz);
  const matchQuiz = normalizeQuizData(potentialMatch.quiz);

  for (const key of QUESTION_KEYS) {
    const currentAnswer = currentQuiz[key];
    const matchAnswer = matchQuiz[key];

    if (!hasAnswer(currentAnswer) || !hasAnswer(matchAnswer)) continue;

    const S = getCompromiseFactor(key, currentAnswer, matchAnswer);

    if (S > 0) {
      const maxPoints = QUESTION_MAX_POINTS[key] || 0;
      score += maxPoints * S;
    }
  }

  const answeredCount = QUESTION_KEYS.filter((key) => hasAnswer(currentQuiz[key])).length;
  if (answeredCount >= 15) {
    score += 6.5;
  } else if (answeredCount >= 10) {
    score += 3.5;
  } else if (answeredCount >= 5) {
    score += 1.5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}