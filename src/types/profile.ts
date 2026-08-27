export interface UserProfile {
  name?: string | null;
  photos: string[];
  age: number | null;
  about: string;
  bio?: string;
  gender: string | null;
  city: string | null;
  has_place: boolean;
  already_have_apartment_to_share: boolean;
  is_broker?: boolean;
  agencyId?: string | null;
  agencyRole?: "ceo" | "member" | null;
  agencyStatus?: "approved" | "pending" | "none";
  agencyRequestedAt?: unknown;
  agencyJoinedAt?: unknown;
  looking_for_apartment?: boolean;
  not_looking_for_roommate?: boolean;
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
