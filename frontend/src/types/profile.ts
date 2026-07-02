export interface UserProfile {
  photos: string[];
  age: number | null;
  about: string;
  bio?: string;
  gender: string | null;
  city: string | null;
  has_place: boolean;
  university: string | null;
  program?: string | null;
  tags?: string[];
  year_of_study: string | null;
  budget: number | null;
  move_in: string | null;
  instagram: string;
  facebook: string;
  linkedin: string;
  twitter: string;
}
