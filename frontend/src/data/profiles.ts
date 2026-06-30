export type Gender = "Male" | "Female" | "Non-binary";

export interface RoommateProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  budget: number; // max monthly budget in EUR
  university: string;
  program: string;
  bio: string;
  tags: string[];
  photo: string;
}

export const PROFILES: RoommateProfile[] = [
  {
    id: "1",
    name: "Sofia",
    age: 22,
    gender: "Female",
    budget: 650,
    university: "TU Berlin",
    program: "MSc Architecture",
    bio: "Early riser, plant mom, makes a mean pasta. Looking for a chill, tidy flatmate.",
    tags: ["Non-smoker", "Pet-friendly", "Early bird"],
    photo:
      "https://images.unsplash.com/photo-1544168190-79c17527004f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHwzfHx1bml2ZXJzaXR5JTIwc3R1ZGVudCUyMHBvcnRyYWl0JTIwcmVhbCUyMHBob3RvfGVufDB8fHx8MTc4Mjc3ODMwNHww&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "2",
    name: "Liam",
    age: 24,
    gender: "Male",
    budget: 800,
    university: "LMU Munich",
    program: "PhD Physics",
    bio: "Coffee-fueled researcher. Quiet weekdays, board games on weekends.",
    tags: ["Non-smoker", "Quiet", "Gamer"],
    photo:
      "https://images.unsplash.com/photo-1492462543947-040389c4a66c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHw0fHx1bml2ZXJzaXR5JTIwc3R1ZGVudCUyMHBvcnRyYWl0JTIwcmVhbCUyMHBob3RvfGVufDB8fHx8MTc4Mjc3ODMwNHww&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "3",
    name: "Noah",
    age: 21,
    gender: "Male",
    budget: 550,
    university: "RWTH Aachen",
    program: "BSc Computer Science",
    bio: "Into climbing, lo-fi beats, and late-night coding. Easy to live with.",
    tags: ["Sporty", "Night owl", "Vegetarian"],
    photo:
      "https://images.unsplash.com/photo-1548810020-ea2f1da35cff?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHwyfHx1bml2ZXJzaXR5JTIwc3R1ZGVudCUyMHBvcnRyYWl0JTIwcmVhbCUyMHBob3RvfGVufDB8fHx8MTc4Mjc3ODMwNHww&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "4",
    name: "Emma",
    age: 23,
    gender: "Female",
    budget: 720,
    university: "Uni Heidelberg",
    program: "MA Psychology",
    bio: "Loves Sunday brunches, yoga, and a clean kitchen. Looking for good vibes only.",
    tags: ["Non-smoker", "Tidy", "Yoga"],
    photo:
      "https://images.unsplash.com/photo-1618355776464-8666794d2520?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHwxfHx1bml2ZXJzaXR5JTIwc3R1ZGVudCUyMHBvcnRyYWl0JTIwcmVhbCUyMHBob3RvfGVufDB8fHx8MTc4Mjc3ODMwNHww&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "5",
    name: "Aisha",
    age: 20,
    gender: "Female",
    budget: 600,
    university: "Uni Hamburg",
    program: "BA Media Studies",
    bio: "Film nerd & weekend baker. I'll share the cookies if you share the remote.",
    tags: ["Foodie", "Creative", "Social"],
    photo:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?crop=entropy&cs=srgb&fm=jpg&w=900&q=85",
  },
  {
    id: "6",
    name: "Marco",
    age: 25,
    gender: "Male",
    budget: 900,
    university: "ETH Zürich",
    program: "MSc Mechanical Eng.",
    bio: "Cyclist, cook, and casual guitar player. Respect for shared spaces is key.",
    tags: ["Sporty", "Tidy", "Musician"],
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&w=900&q=85",
  },
  {
    id: "7",
    name: "Kai",
    age: 22,
    gender: "Non-binary",
    budget: 680,
    university: "Uni Köln",
    program: "MA Sociology",
    bio: "Big on community dinners and houseplants. Calm, friendly, and reliable.",
    tags: ["Pet-friendly", "Plant lover", "Calm"],
    photo:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?crop=entropy&cs=srgb&fm=jpg&w=900&q=85",
  },
  {
    id: "8",
    name: "Lena",
    age: 24,
    gender: "Female",
    budget: 750,
    university: "FU Berlin",
    program: "PhD Biology",
    bio: "Lab by day, vinyl & wine by night. Looking for a long-term, drama-free home.",
    tags: ["Non-smoker", "Music", "Quiet"],
    photo:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?crop=entropy&cs=srgb&fm=jpg&w=900&q=85",
  },
];
