export type Gender = "Male" | "Female" | "Non-binary";

export interface RoommateProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  budget: number; // max monthly budget in EUR
  city?: string;
  university: string;
  program: string;
  bio: string;
  tags: string[];
  photo: string;
  matchScore?: number;
  deleted?: boolean;
  chat_status?: "pending" | "active" | "rejected";
  chat_initiated_by?: string | null;
}
