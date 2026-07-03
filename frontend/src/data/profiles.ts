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
