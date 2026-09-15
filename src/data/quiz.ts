import { Ionicons } from "@expo/vector-icons";

export interface QuizOption {
  value: string;
  labelKey: string;
}

export interface QuizQuestion {
  id: QuizQuestionId;
  icon: keyof typeof Ionicons.glyphMap;
  questionKey: string;
  options: QuizOption[];
}

export type QuizQuestionId =
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "q7"
  | "q8"
  | "q9"
  | "q10"
  | "q11"
  | "q12"
  | "q13"
  | "q14"
  | "q15";

export interface QuizSection {
  categoryKey: string;
  questions: QuizQuestion[];
}

export const QUIZ_SECTIONS: QuizSection[] = [
  {
    categoryKey: "quiz.categories.cleaning",
    questions: [
      {
        id: "q1",
        icon: "brush-outline",
        questionKey: "quiz.questions.q1.question",
        options: [
          { value: "very_tidy", labelKey: "quiz.questions.q1.options.veryTidy" },
          { value: "average", labelKey: "quiz.questions.q1.options.average" },
          { value: "messy", labelKey: "quiz.questions.q1.options.messy" },
        ],
      },
      {
        id: "q2",
        icon: "sparkles-outline",
        questionKey: "quiz.questions.q2.question",
        options: [
          { value: "weekly", labelKey: "quiz.questions.q2.options.weekly" },
          { value: "sometimes", labelKey: "quiz.questions.q2.options.sometimes" },
          { value: "only_when_needed", labelKey: "quiz.questions.q2.options.onlyWhenNeeded" },
        ],
      },
      {
        id: "q3",
        icon: "restaurant-outline",
        questionKey: "quiz.questions.q3.question",
        options: [
          { value: "wash_daily", labelKey: "quiz.questions.q3.options.daily" },
          { value: "next_day", labelKey: "quiz.questions.q3.options.nextDay" },
          { value: "when_no_clean_ones", labelKey: "quiz.questions.q3.options.noCleanOnes" },
        ],
      },
    ],
  },
  {
    categoryKey: "quiz.categories.bills",
    questions: [
      {
        id: "q4",
        icon: "cash-outline",
        questionKey: "quiz.questions.q4.question",
        options: [
          { value: "split_evenly", labelKey: "quiz.questions.q4.options.splitEvenly" },
          { value: "assigned_bills", labelKey: "quiz.questions.q4.options.assignedBills" },
          { value: "flexible", labelKey: "quiz.questions.q4.options.flexible" },
        ],
      },
    ],
  },
  {
    categoryKey: "quiz.categories.lifestyle",
    questions: [
      {
        id: "q5",
        icon: "ban-outline",
        questionKey: "quiz.questions.q5.question",
        options: [
          { value: "smoker", labelKey: "quiz.questions.q5.options.regular" },
          { value: "smokes_outside", labelKey: "quiz.questions.q5.options.outside" },
          { value: "non_smoker", labelKey: "quiz.questions.q5.options.nonSmoker" },
        ],
      },
      {
        id: "q6",
        icon: "volume-mute-outline",
        questionKey: "quiz.questions.q6.question",
        options: [
          { value: "quiet_always", labelKey: "quiz.questions.q6.options.alwaysQuiet" },
          { value: "quiet_at_night", labelKey: "quiz.questions.q6.options.nightQuiet" },
          { value: "noise_is_fine", labelKey: "quiz.questions.q6.options.noiseFine" },
        ],
      },
      {
        id: "q7",
        icon: "moon-outline",
        questionKey: "quiz.questions.q7.question",
        options: [
          { value: "early_bird", labelKey: "quiz.questions.q7.options.earlyBird" },
          { value: "student_routine", labelKey: "quiz.questions.q7.options.studentRoutine" },
          { value: "night_owl", labelKey: "quiz.questions.q7.options.nightOwl" },
        ],
      },
    ],
  },
  {
    categoryKey: "quiz.categories.guests",
    questions: [
      {
        id: "q8",
        icon: "notifications-off-outline",
        questionKey: "quiz.questions.q8.question",
        options: [
          { value: "guests_anytime", labelKey: "quiz.questions.q8.options.anytime" },
          { value: "ask_first", labelKey: "quiz.questions.q8.options.askFirst" },
          { value: "rare_visits", labelKey: "quiz.questions.q8.options.rareVisits" },
        ],
      },
      {
        id: "q9",
        icon: "sparkles-outline",
        questionKey: "quiz.questions.q9.question",
        options: [
          { value: "love_parties", labelKey: "quiz.questions.q9.options.loveParties" },
          { value: "occasional_gatherings", labelKey: "quiz.questions.q9.options.occasional" },
          { value: "no_parties", labelKey: "quiz.questions.q9.options.noParties" },
        ],
      },
      {
        id: "q10",
        icon: "people-outline",
        questionKey: "quiz.questions.q10.question",
        options: [
          { value: "close_friends", labelKey: "quiz.questions.q10.options.closeFriends" },
          { value: "friendly_co_living", labelKey: "quiz.questions.q10.options.friendlySeparate" },
          { value: "quiet_roommates", labelKey: "quiz.questions.q10.options.quietRoommates" },
        ],
      },
    ],
  },
  {
    categoryKey: "quiz.categories.sharing",
    questions: [
      {
        id: "q11",
        icon: "cube-outline",
        questionKey: "quiz.questions.q11.question",
        options: [
          { value: "share_freely", labelKey: "quiz.questions.q11.options.shareFreely" },
          { value: "ask_first", labelKey: "quiz.questions.q11.options.askFirst" },
          { value: "no_sharing", labelKey: "quiz.questions.q11.options.noSharing" },
        ],
      },
      {
        id: "q12",
        icon: "cart-outline",
        questionKey: "quiz.questions.q12.question",
        options: [
          { value: "take_turns", labelKey: "quiz.questions.q12.options.takeTurns" },
          { value: "split_costs", labelKey: "quiz.questions.q12.options.splitCosts" },
          { value: "own_supplies", labelKey: "quiz.questions.q12.options.ownSupplies" },
        ],
      },
    ],
  },
  {
    categoryKey: "quiz.categories.personal",
    questions: [
      {
        id: "q13",
        icon: "paw-outline",
        questionKey: "quiz.questions.q13.question",
        options: [
          { value: "pet_owner_or_wants", labelKey: "quiz.questions.q13.options.haveOrWant" },
          { value: "pets_allowed", labelKey: "quiz.questions.q13.options.petsFine" },
          { value: "no_pets", labelKey: "quiz.questions.q13.options.noPets" },
        ],
      },
      {
        id: "q14",
        icon: "wine-outline",
        questionKey: "quiz.questions.q14.question",
        options: [
          { value: "often_alcohol", labelKey: "quiz.questions.q14.options.often" },
          { value: "weekend_drinker", labelKey: "quiz.questions.q14.options.weekends" },
          { value: "no_alcohol", labelKey: "quiz.questions.q14.options.noAlcohol" },
        ],
      },
      {
        id: "q15",
        icon: "restaurant-outline",
        questionKey: "quiz.questions.q15.question",
        options: [
          { value: "every_day", labelKey: "quiz.questions.q15.options.everyDay" },
          { value: "few_times", labelKey: "quiz.questions.q15.options.fewTimes" },
          { value: "rarely", labelKey: "quiz.questions.q15.options.rarely" },
        ],
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
