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
    category: "Cleaning & Habits",
    questions: [
      {
        id: "q1",
        emoji: "🧹",
        question: "What is your overall standard of cleanliness for the shared spaces?",
        options: ["Very tidy and highly organized", "Average and reasonably clean", "Pretty relaxed or messy"],
      },
      {
        id: "q2",
        emoji: "🧽",
        question: "How frequently do you plan to contribute to deep house cleaning?",
        options: ["At least once a week", "Every now and then", "Only when it gets absolutely necessary"],
      },
      {
        id: "q3",
        emoji: "🍽️",
        question: "What is your golden rule for doing the dishes?",
        options: ["Wash them immediately or daily", "Leave them for the next day", "Wash them only when no clean ones are left"],
      },
    ],
  },
  {
    category: "Bills & Sharing",
    questions: [
      {
        id: "q4",
        emoji: "💵",
        question: "How do you want to manage the shared utility bills?",
        options: [
          "Split everything strictly down the middle",
          "Each person takes responsibility for a specific bill",
          "Figure it out dynamically month by month",
        ],
      },
    ],
  },
  {
    category: "Lifestyle Core",
    questions: [
      {
        id: "q5",
        emoji: "🚬",
        question: "What is your stance on smoking or vaping inside the house?",
        options: ["I smoke regularly", "I only smoke outside or on the balcony", "I am a strict non-smoker"],
      },
      {
        id: "q6",
        emoji: "🤫",
        question: "What are your expectations regarding noise levels in the apartment?",
        options: [
          "I need absolute quiet most of the time",
          "I only need it quiet during late-night hours",
          "Noise doesn't bother me at all",
        ],
      },
      {
        id: "q7",
        emoji: "💤",
        question: "What does your typical sleep schedule look like?",
        options: [
          "Early bird (asleep before 11 PM)",
          "Normal student routine (asleep between 11 PM and 1 AM)",
          "Night owl (asleep after 1 AM)",
        ],
      },
    ],
  },
  {
    category: "Guests & Social Life",
    questions: [
      {
        id: "q8",
        emoji: "🔕",
        question: "What is your policy on having friends or guests over?",
        options: [
          "Guests can come over anytime without notice",
          "Please ask or give a heads-up first",
          "Rare visits only, I prefer privacy",
        ],
      },
      {
        id: "q9",
        emoji: "🎉",
        question: "How do you feel about hosting parties or gatherings in the apartment?",
        options: [
          "Love them, the more the merrier",
          "Occasional small gatherings are perfectly fine",
          "Strictly no parties at home",
        ],
      },
      {
        id: "q10",
        emoji: "🤝",
        question: "What kind of social dynamic do you want to build with your roommate?",
        options: [
          "I want us to become close friends and hang out together",
          "Friendly and polite, but we keep our separate lives",
          "Just roommates co-existing quietly",
        ],
      },
    ],
  },
  {
    category: "Sharing Belongings",
    questions: [
      {
        id: "q11",
        emoji: "📦",
        question: "How do you feel about sharing personal belongings like kitchenware or furniture?",
        options: ["Share everything freely", "Always ask before using my things", "I completely prefer not to share"],
      },
      {
        id: "q12",
        emoji: "🛒",
        question: "How should we organize groceries and common household items?",
        options: [
          "Take turns buying shared supplies",
          "Split the grocery costs evenly",
          "Everyone buys and consumes their own stuff",
        ],
      },
    ],
  },
  {
    category: "Personal Preferences",
    questions: [
      {
        id: "q13",
        emoji: "🐾",
        question: "What is your situation or preference regarding pets in the house?",
        options: [
          "I have a pet or definitely want to get one",
          "I don't have one, but pets are totally fine with me",
          "Strictly no pets allowed",
        ],
      },
      {
        id: "q14",
        emoji: "🍻",
        question: "What is your preference regarding alcohol consumption inside the apartment?",
        options: [
          "I enjoy drinking frequently at home",
          "I only drink occasionally on weekends",
          "I don't drink or prefer an alcohol-free home",
        ],
      },
      {
        id: "q15",
        emoji: "🍳",
        question: "How often do you plan on using the kitchen to cook your meals?",
        options: ["I cook every single day", "A few times a week", "Rarely, I mostly order out or eat on campus"],
      },
    ],
  },
];

export const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
