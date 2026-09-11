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
          { value: "Very tidy", labelKey: "quiz.questions.q1.options.veryTidy" },
          { value: "Average", labelKey: "quiz.questions.q1.options.average" },
          { value: "Messy", labelKey: "quiz.questions.q1.options.messy" },
        ],
      },
      {
        id: "q2",
        icon: "sparkles-outline",
        questionKey: "quiz.questions.q2.question",
        options: [
          { value: "Weekly", labelKey: "quiz.questions.q2.options.weekly" },
          { value: "Every now and then", labelKey: "quiz.questions.q2.options.sometimes" },
          { value: "Only when it’s really needed", labelKey: "quiz.questions.q2.options.onlyWhenNeeded" },
        ],
      },
      {
        id: "q3",
        icon: "restaurant-outline",
        questionKey: "quiz.questions.q3.question",
        options: [
          { value: "Wash daily", labelKey: "quiz.questions.q3.options.daily" },
          { value: "Next day", labelKey: "quiz.questions.q3.options.nextDay" },
          { value: "When there are no clean ones left", labelKey: "quiz.questions.q3.options.noCleanOnes" },
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
          { value: "Split everything evenly", labelKey: "quiz.questions.q4.options.splitEvenly" },
          { value: "Each person pays for a different one", labelKey: "quiz.questions.q4.options.assignedBills" },
          { value: "We’ll figure it out as we go", labelKey: "quiz.questions.q4.options.flexible" },
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
          { value: "Yes", labelKey: "quiz.questions.q5.options.regular" },
          { value: "Only outside", labelKey: "quiz.questions.q5.options.outside" },
          { value: "No", labelKey: "quiz.questions.q5.options.nonSmoker" },
        ],
      },
      {
        id: "q6",
        icon: "volume-mute-outline",
        questionKey: "quiz.questions.q6.question",
        options: [
          { value: "Quiet always", labelKey: "quiz.questions.q6.options.alwaysQuiet" },
          { value: "Quiet at night", labelKey: "quiz.questions.q6.options.nightQuiet" },
          { value: "Noise is fine anytime", labelKey: "quiz.questions.q6.options.noiseFine" },
        ],
      },
      {
        id: "q7",
        icon: "moon-outline",
        questionKey: "quiz.questions.q7.question",
        options: [
          { value: "Before 11pm", labelKey: "quiz.questions.q7.options.earlyBird" },
          { value: "11pm–1am", labelKey: "quiz.questions.q7.options.studentRoutine" },
          { value: "After 1am", labelKey: "quiz.questions.q7.options.nightOwl" },
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
          { value: "Come anytime", labelKey: "quiz.questions.q8.options.anytime" },
          { value: "Ask first", labelKey: "quiz.questions.q8.options.askFirst" },
          { value: "Rare visits only", labelKey: "quiz.questions.q8.options.rareVisits" },
        ],
      },
      {
        id: "q9",
        icon: "sparkles-outline",
        questionKey: "quiz.questions.q9.question",
        options: [
          { value: "Love them", labelKey: "quiz.questions.q9.options.loveParties" },
          { value: "Occasionally is fine", labelKey: "quiz.questions.q9.options.occasional" },
          { value: "No parties please", labelKey: "quiz.questions.q9.options.noParties" },
        ],
      },
      {
        id: "q10",
        icon: "people-outline",
        questionKey: "quiz.questions.q10.question",
        options: [
          { value: "Let’s hang out and be friends", labelKey: "quiz.questions.q10.options.closeFriends" },
          { value: "Friendly co-living", labelKey: "quiz.questions.q10.options.friendlySeparate" },
          { value: "Just split the bills", labelKey: "quiz.questions.q10.options.quietRoommates" },
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
          { value: "Share freely", labelKey: "quiz.questions.q11.options.shareFreely" },
          { value: "Ask first", labelKey: "quiz.questions.q11.options.askFirst" },
          { value: "Prefer not to share", labelKey: "quiz.questions.q11.options.noSharing" },
        ],
      },
      {
        id: "q12",
        icon: "cart-outline",
        questionKey: "quiz.questions.q12.question",
        options: [
          { value: "Take turns buying", labelKey: "quiz.questions.q12.options.takeTurns" },
          { value: "Split evenly", labelKey: "quiz.questions.q12.options.splitCosts" },
          { value: "Everyone buys their own", labelKey: "quiz.questions.q12.options.ownSupplies" },
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
          { value: "Yes", labelKey: "quiz.questions.q13.options.haveOrWant" },
          { value: "Pets are fine", labelKey: "quiz.questions.q13.options.petsFine" },
          { value: "No pets please", labelKey: "quiz.questions.q13.options.noPets" },
        ],
      },
      {
        id: "q14",
        icon: "wine-outline",
        questionKey: "quiz.questions.q14.question",
        options: [
          { value: "I drink often", labelKey: "quiz.questions.q14.options.often" },
          { value: "Only weekends", labelKey: "quiz.questions.q14.options.weekends" },
          { value: "I don’t drink (but okay if you do)", labelKey: "quiz.questions.q14.options.noAlcohol" },
        ],
      },
      {
        id: "q15",
        icon: "restaurant-outline",
        questionKey: "quiz.questions.q15.question",
        options: [
          { value: "Every day", labelKey: "quiz.questions.q15.options.everyDay" },
          { value: "Few times a week", labelKey: "quiz.questions.q15.options.fewTimes" },
          { value: "Rarely", labelKey: "quiz.questions.q15.options.rarely" },
        ],
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
