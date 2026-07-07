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

export interface UserProfile {
  uid: string;
  city: string;
  gender: 'Male' | 'Female' | 'Prefer Not To Say';
  monthlyBudget: number;
  quiz: CompatibilityQuiz;
}

export function calculateMatchScore(currentUser: UserProfile, potentialMatch: UserProfile): number {
  // Αν ψάχνουν σε διαφορετική πόλη, τους βγάζουμε τελείως εκτός στοίβας (0%)
  if (currentUser.city !== potentialMatch.city) return 0;

  let totalPoints = 0;

  // ==========================================
  // 1. MONTHLY BUDGET (Μέγιστο: 25 πόντοι)
  // ==========================================
  const budgetDiff = Math.abs(currentUser.monthlyBudget - potentialMatch.monthlyBudget);
  if (budgetDiff <= 30) totalPoints += 25;
  else if (budgetDiff <= 80) totalPoints += 15;
  else if (budgetDiff <= 150) totalPoints += 5;

  const currentQuiz = currentUser.quiz;
  const matchQuiz = potentialMatch.quiz;

  // Αν κάποιος δεν έχει συμπληρώσει το quiz ακόμα, επιστρέφουμε ένα βασικό σκορ βασισμένο μόνο στο budget
  if (!currentQuiz || !matchQuiz) {
    return Math.round((totalPoints / 25) * 100);
  }

  // ==========================================
  // 2. CRITICAL LIFESTYLE (Μέγιστο: 25 πόντοι)
  // ==========================================
  // Q7: Καπνισμα (7 πόντοι)
  if (currentQuiz.q7_smoke === matchQuiz.q7_smoke) totalPoints += 7;
  else if (currentQuiz.q7_smoke === 'Only outside' && matchQuiz.q7_smoke === 'No') totalPoints += 5;

  // Q8: Κατοικίδια (6 πόντοι)
  if (currentQuiz.q8_pets === matchQuiz.q8_pets) totalPoints += 6;
  else if (currentQuiz.q8_pets === 'Pets are fine' && matchQuiz.q8_pets === 'Yes') totalPoints += 5;

  // Q9: Ύπνος (6 πόντοι)
  if (currentQuiz.q9_sleep === matchQuiz.q9_sleep) totalPoints += 6;
  else if (
    (currentQuiz.q9_sleep === 'Before 11pm' && matchQuiz.q9_sleep === '11pm–1am') ||
    (currentQuiz.q9_sleep === '11pm–1am' && matchQuiz.q9_sleep === 'After 1am')
  ) totalPoints += 3;

  // Q10: Ησυχία (6 πόντοι)
  if (currentQuiz.q10_quiet === matchQuiz.q10_quiet) totalPoints += 6;

  // ==========================================
  // 3. CLEANING & HABITS (Μέγιστο: 20 πόντοι)
  // ==========================================
  // Q4: Πόσο καθαρός είσαι (8 πόντοι)
  if (currentQuiz.q4_cleanliness === matchQuiz.q4_cleanliness) totalPoints += 8;
  else if (currentQuiz.q4_cleanliness === 'Very tidy' && matchQuiz.q4_cleanliness === 'Average') totalPoints += 4;

  // Q5: Συχνότητα καθαρισμού (6 πόντοι)
  if (currentQuiz.q5_cleaning_freq === matchQuiz.q5_cleaning_freq) totalPoints += 6;

  // Q6: Πλύσιμο πιάτων (6 πόντοι)
  if (currentQuiz.q6_dishes === matchQuiz.q6_dishes) totalPoints += 6;

  // ==========================================
  // 4. SOCIAL LIFE & GUESTS (Μέγιστο: 15 πόντοι)
  // ==========================================
  // Q11: Καλεσμένοι (5 πόντοι)
  if (currentQuiz.q11_guests === matchQuiz.q11_guests) totalPoints += 5;

  // Q12: Πάρτι (5 πόντοι)
  if (currentQuiz.q12_parties === matchQuiz.q12_parties) totalPoints += 5;

  // Q15: Προσδοκίες από συγκατοίκηση (5 πόντοι)
  if (currentQuiz.q15_roommate_type === matchQuiz.q15_roommate_type) totalPoints += 5;

  // ==========================================
  // 5. BILLS & KITCHEN (Μέγιστο: 15 πόντοι)
  // ==========================================
  // Q1: Λογαριασμοί (3 πόντοι)
  if (currentQuiz.q1_bills === matchQuiz.q1_bills) totalPoints += 3;

  // Q2: Κοινή χρήση επίπλων/σκεύων (3 πόντοι)
  if (currentQuiz.q2_sharing === matchQuiz.q2_sharing) totalPoints += 3;

  // Q3: Φαγητό & Κοινά πράγματα (3 πόντοι)
  if (currentQuiz.q3_food === matchQuiz.q3_food) totalPoints += 3;

  // Q13: Μαγείρεμα (3 πόντοι)
  if (currentQuiz.q13_cook === matchQuiz.q13_cook) totalPoints += 3;

  // Q14: Αλκοόλ στο σπίτι (3 πόντοι)
  if (currentQuiz.q14_drinking === matchQuiz.q14_drinking) totalPoints += 3;

  // Επιστροφή τελικού ποσοστού % στρογγυλοποιημένου
  return Math.min(Math.round(totalPoints), 100);
}