import { areCitiesEquivalent } from "@/src/utils/cityNormalization";

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
  q1_bills: 1.5,
  q2_sharing: 1.5,
  q3_food: 1.5,
  q4_cleanliness: 4.5,
  q5_cleaning_freq: 3,
  q6_dishes: 3,
  q7_smoke: 4.5,
  q8_pets: 3,
  q9_sleep: 3,
  q10_quiet: 3,
  q11_guests: 3,
  q12_parties: 3,
  q13_cook: 1.5,
  q14_drinking: 1.5,
  q15_roommate_type: 3,
};

function hasAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 🎯 Μεταφράζει τα δεδομένα του Firestore (q1, q2...) στα μεγάλα κλειδιά του αλγορίθμου
 */
function normalizeQuizData(rawQuiz: any): CompatibilityQuizAnswers {
  const normalized: any = {};
  const keyMap: Record<string, keyof CompatibilityQuiz> = {
    q1: 'q4_cleanliness',
    q2: 'q5_cleaning_freq',
    q3: 'q6_dishes',
    q4: 'q1_bills',
    q5: 'q2_sharing',
    q6: 'q3_food',
    q7: 'q7_smoke',
    q8: 'q8_pets',
    q9: 'q9_sleep',
    q10: 'q10_quiet',
    q11: 'q11_guests',
    q12: 'q12_parties',
    q13: 'q13_cook',
    q14: 'q14_drinking',
    q15: 'q15_roommate_type'
  };

  const source = rawQuiz?.answers ?? rawQuiz ?? {};
  Object.keys(source).forEach((k) => {
    if (hasAnswer(source[k])) {
      const targetKey = keyMap[k] || k;
      normalized[targetKey] = source[k];
    }
  });
  return normalized;
}

/**
 * 🎯 Υπολογίζει τον συντελεστή Συμβιβασμού (S) βάσει των υπαρχουσών ποσοστώσεων
 * S = 1.0 για πλήρη ταύτιση, S = 0.5 για συμβιβασμό, S = 0.0 για ασυμβατότητα
 */
function getCompromiseFactor(
  key: keyof CompatibilityQuiz,
  currentAnswer: string,
  matchAnswer: string,
): number {
  if (currentAnswer === matchAnswer) return 1.0;

  const cur = currentAnswer.toLowerCase();
  const mat = matchAnswer.toLowerCase();

  switch (key) {
    case 'q7_smoke':
      // "Only outside" / "Μόνο έξω" & "No" / "Όχι"
      if ((cur.includes('outside') || cur.includes('έξω')) && (mat.includes('no') || mat.includes('όχι'))) return 0.5;
      return 0.0;
    case 'q8_pets':
      // "Pets are fine" / "δεκτά" & "Yes" / "Ναι"
      if ((cur.includes('fine') || cur.includes('οκ') || cur.includes('δεκτά')) && (mat.includes('yes') || mat.includes('ναι'))) return 0.5;
      return 0.0;
    case 'q9_sleep':
      // Υπολογισμός διαφοράς φάσης ύπνου (Πριν τις 11, 11-1, Μετά τις 1)
      let slotCur = 0;
      if (cur.includes('before') || cur.includes('πριν')) slotCur = 1;
      else if (cur.includes('11') || cur.includes('1–') || cur.includes('1μμ')) slotCur = 2;
      else if (cur.includes('after') || cur.includes('μετά')) slotCur = 3;

      let slotMat = 0;
      if (mat.includes('before') || mat.includes('πριν')) slotMat = 1;
      else if (mat.includes('11') || mat.includes('1–') || mat.includes('1μμ')) slotMat = 2;
      else if (mat.includes('after') || mat.includes('μετά')) slotMat = 3;

      if (slotCur > 0 && slotMat > 0 && Math.abs(slotCur - slotMat) === 1) return 0.5;
      return 0.0;
    case 'q4_cleanliness':
      // "Very tidy" / "Πολύ τακτικός" & "Average" / "Μέτριος" / "Κανονικός"
      if ((cur.includes('very') || cur.includes('πολύ')) && (mat.includes('average') || mat.includes('μέτριος') || mat.includes('κανονικός'))) return 0.5;
      return 0.0;
    default:
      return 0.0;
  }
}

export function calculateMatchScore(currentUser: UserProfile, potentialMatch: UserProfile): number {
  // Έλεγχος Πόλης: Αν έχουν δηλώσει διαφορετική πόλη, το σκορ παραμένει 0%[cite: 14]
  if (currentUser.city && potentialMatch.city && !areCitiesEquivalent(currentUser.city, potentialMatch.city)) {
    return 0; //[cite: 14]
  }

  // ΒΑΣΗ: Όλοι όσοι είναι στην ίδια πόλη ξεκινάνε αυτόματα από το 50%
  let finalScore = 50;

  // 🎯 ΕΞΟΜΑΛΥΝΣΗ ΔΕΔΟΜΕΝΩΝ: Μετατρέπουμε τα q1, q2 σε q4_cleanliness κλπ.
  const currentQuiz = normalizeQuizData(currentUser.quiz);
  const matchQuiz = normalizeQuizData(potentialMatch.quiz);

  // 🎯 QUIZ QUESTIONS BONUS
  for (const key of QUESTION_KEYS) { //[cite: 14]
    const currentAnswer = currentQuiz[key]; //[cite: 14]
    const matchAnswer = matchQuiz[key]; //[cite: 14]

    if (!hasAnswer(currentAnswer) || !hasAnswer(matchAnswer)) { //[cite: 14]
      continue; //[cite: 14]
    }

    const S = getCompromiseFactor(key, currentAnswer, matchAnswer);

    if (S > 0) {
      let B = 1.0;
      const maxPoints = QUESTION_MAX_POINTS[key]; //[cite: 14]
      
      if (maxPoints >= 7) {
        B = 1.5; 
      } else if (maxPoints === 3) {
        B = 0.5; 
      }

      // Εφαρμογή του τύπου σου: +5% + 3% * B * S
      finalScore += 5 + (3 * B * S);
    }
  }

  // 🎯 COMPLETION REWARD FOR CURRENT USER
  const currentUserAnsweredCount = QUESTION_KEYS.filter(key => hasAnswer(currentQuiz[key])).length;
  const completionReward = Math.floor(currentUserAnsweredCount / 5) * 1.5;
  finalScore += completionReward;

  // CLAMPING & ROUNDING
  return Math.max(0, Math.min(100, Math.round(finalScore))); //[cite: 14]
}