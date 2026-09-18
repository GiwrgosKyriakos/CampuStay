export interface UserProfile {
  name: string | null;
  photos: string[];
  age: number | null;
  about: string;
  gender: string | null;
  city: string | null;
  has_place: boolean;
  already_have_apartment_to_share: boolean;
  hasApartment?: boolean;
  isLooking?: boolean;
  housingStatus?: "looking" | "has_apartment" | string;
  is_broker?: boolean;
  isBroker?: boolean;
  role?: string;
  afm?: string | null;
  agencyId?: string | null;
  agencyRole?: "ceo" | "owner" | "member" | "secretary" | null;
  agencyStatus?: "approved" | "pending" | "none";
  agencyRequestedAt?: unknown;
  agencyJoinedAt?: unknown;
  looking_for_apartment: boolean;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
  university: string | null;
  year_of_study: string | null;
  budget: number | null;
  move_in: string | null;
  instagram: string;
  facebook: string;
  linkedin: string;
  twitter: string;
  phone_number?: string;
  preferences?: { hideNameInDeck?: boolean; hideInStack?: boolean };
}

export interface User extends UserProfile {
  id: string;
  email?: string | null;
}