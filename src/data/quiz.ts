import { t } from "@/src/locales";
import { Ionicons } from "@expo/vector-icons";

export interface QuizQuestion {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  question: string;
  options: string[];
}

export interface QuizSection {
  category: string;
  questions: QuizQuestion[];
}

export const QUIZ_SECTIONS: QuizSection[] = [
  {
    category: t("quiz.categories.cleaning"),
    questions: [
      {
        id: "q1",
        icon: "brush-outline",
        question: t("quiz.questions.q1.question"),
        options: t("quiz.questions.q1.options") as unknown as string[],
      },
      {
        id: "q2",
        icon: "sparkles-outline",
        question: t("quiz.questions.q2.question"),
        options: t("quiz.questions.q2.options") as unknown as string[],
      },
      {
        id: "q3",
        icon: "restaurant-outline",
        question: t("quiz.questions.q3.question"),
        options: t("quiz.questions.q3.options") as unknown as string[],
      },
    ],
  },
  {
    category: t("quiz.categories.bills"),
    questions: [
      {
        id: "q4",
        icon: "cash-outline",
        question: t("quiz.questions.q4.question"),
        options: t("quiz.questions.q4.options") as unknown as string[],
      },
    ],
  },
  {
    category: t("quiz.categories.lifestyle"),
    questions: [
      {
        id: "q5",
        icon: "ban-outline",
        question: t("quiz.questions.q5.question"),
        options: t("quiz.questions.q5.options") as unknown as string[],
      },
      {
        id: "q6",
        icon: "volume-mute-outline",
        question: t("quiz.questions.q6.question"),
        options: t("quiz.questions.q6.options") as unknown as string[],
      },
      {
        id: "q7",
        icon: "moon-outline",
        question: t("quiz.questions.q7.question"),
        options: t("quiz.questions.q7.options") as unknown as string[],
      },
    ],
  },
  {
    category: t("quiz.categories.guests"),
    questions: [
      {
        id: "q8",
        icon: "notifications-off-outline",
        question: t("quiz.questions.q8.question"),
        options: t("quiz.questions.q8.options") as unknown as string[],
      },
      {
        id: "q9",
        icon: "sparkles-outline",
        question: t("quiz.questions.q9.question"),
        options: t("quiz.questions.q9.options") as unknown as string[],
      },
      {
        id: "q10",
        icon: "people-outline",
        question: t("quiz.questions.q10.question"),
        options: t("quiz.questions.q10.options") as unknown as string[],
      },
    ],
  },
  {
    category: t("quiz.categories.sharing"),
    questions: [
      {
        id: "q11",
        icon: "cube-outline",
        question: t("quiz.questions.q11.question"),
        options: t("quiz.questions.q11.options") as unknown as string[],
      },
      {
        id: "q12",
        icon: "cart-outline",
        question: t("quiz.questions.q12.question"),
        options: t("quiz.questions.q12.options") as unknown as string[],
      },
    ],
  },
  {
    category: t("quiz.categories.personal"),
    questions: [
      {
        id: "q13",
        icon: "paw-outline",
        question: t("quiz.questions.q13.question"),
        options: t("quiz.questions.q13.options") as unknown as string[],
      },
      {
        id: "q14",
        icon: "wine-outline",
        question: t("quiz.questions.q14.question"),
        options: t("quiz.questions.q14.options") as unknown as string[],
      },
      {
        id: "q15",
        icon: "restaurant-outline",
        question: t("quiz.questions.q15.question"),
        options: t("quiz.questions.q15.options") as unknown as string[],
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
