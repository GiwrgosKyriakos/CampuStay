import { t } from "@/src/locales";

export interface QuizQuestion {
  id: string;
  emoji: string;
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
        emoji: "🧹",
        question: t("quiz.questions.q1.question"),
        options: t("quiz.questions.q1.options") as unknown as string[],
      },
      {
        id: "q2",
        emoji: "🧽",
        question: t("quiz.questions.q2.question"),
        options: t("quiz.questions.q2.options") as unknown as string[],
      },
      {
        id: "q3",
        emoji: "🍽️",
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
        emoji: "💵",
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
        emoji: "🚬",
        question: t("quiz.questions.q5.question"),
        options: t("quiz.questions.q5.options") as unknown as string[],
      },
      {
        id: "q6",
        emoji: "🤫",
        question: t("quiz.questions.q6.question"),
        options: t("quiz.questions.q6.options") as unknown as string[],
      },
      {
        id: "q7",
        emoji: "💤",
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
        emoji: "🔕",
        question: t("quiz.questions.q8.question"),
        options: t("quiz.questions.q8.options") as unknown as string[],
      },
      {
        id: "q9",
        emoji: "🎉",
        question: t("quiz.questions.q9.question"),
        options: t("quiz.questions.q9.options") as unknown as string[],
      },
      {
        id: "q10",
        emoji: "🤝",
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
        emoji: "📦",
        question: t("quiz.questions.q11.question"),
        options: t("quiz.questions.q11.options") as unknown as string[],
      },
      {
        id: "q12",
        emoji: "🛒",
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
        emoji: "🐾",
        question: t("quiz.questions.q13.question"),
        options: t("quiz.questions.q13.options") as unknown as string[],
      },
      {
        id: "q14",
        emoji: "🍻",
        question: t("quiz.questions.q14.question"),
        options: t("quiz.questions.q14.options") as unknown as string[],
      },
      {
        id: "q15",
        emoji: "🍳",
        question: t("quiz.questions.q15.question"),
        options: t("quiz.questions.q15.options") as unknown as string[],
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
