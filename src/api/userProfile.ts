import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";

import type { UserProfile } from "@/src/types/user";

export type { UserProfile } from "@/src/types/user";

interface FirestoreUserDocument {
  name: string | null;
  age: number | null;
  university: string | null;
  year: string | null;
  maxBudget: number | null;
  gender: string | null;
  photoUrl: string;
  email: string | null;
  photos?: string[];
  about?: string;
  city?: string | null;
  has_place?: boolean;
  already_have_apartment_to_share?: boolean;
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
  looking_for_apartment?: boolean;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
  year_of_study?: string | null;
  budget?: number | null;
  move_in?: string | null;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  phone_number?: string;
  preferences?: { hideNameInDeck?: boolean; hideInStack?: boolean };
}

interface SaveUserProfileOptions {
  email?: string | null;
}

function normalizeProfile(docData: Partial<FirestoreUserDocument>): UserProfile {
  const yearOfStudy = docData.year_of_study ?? docData.year ?? null;
  const budget = docData.budget ?? docData.maxBudget ?? null;
  const photos = Array.isArray(docData.photos)
    ? docData.photos.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  const normalizedPhotos = photos.length > 0 ? photos : docData.photoUrl ? [docData.photoUrl] : [];

  return {
    name: docData.name ?? null,
    photos: normalizedPhotos,
    age: docData.age ?? null,
    about: docData.about ?? "",
    gender: docData.gender ?? null,
    city: docData.city ?? null,
    has_place: docData.hasApartment === false ? false : !!docData.has_place,
    already_have_apartment_to_share: docData.hasApartment === false ? false : !!docData.already_have_apartment_to_share,
    hasApartment: docData.hasApartment ?? docData.has_place ?? false,
    isLooking: docData.isLooking ?? docData.looking_for_apartment ?? docData.housingStatus === "looking",
    housingStatus: docData.housingStatus ?? (docData.looking_for_apartment ? "looking" : docData.has_place ? "has_apartment" : "looking"),
    is_broker: !!docData.is_broker,
    isBroker: docData.isBroker === true || docData.role === "broker" || docData.is_broker === true,
    role: docData.role,
    afm: docData.afm ?? null,
    agencyId: docData.agencyId ?? null,
    agencyRole: docData.agencyRole ?? null,
    agencyStatus: docData.agencyStatus ?? "none",
    agencyRequestedAt: docData.agencyRequestedAt,
    agencyJoinedAt: docData.agencyJoinedAt,
    looking_for_apartment: !!(docData.isLooking ?? docData.looking_for_apartment ?? docData.housingStatus === "looking"),
    looking_for_roommate: typeof docData.looking_for_roommate === "boolean"
      ? docData.looking_for_roommate
      : typeof docData.isLookingForRoommate === "boolean"
        ? docData.isLookingForRoommate
      : docData.not_looking_for_roommate !== true,
    not_looking_for_roommate: docData.not_looking_for_roommate === true,
    university: docData.university ?? null,
    year_of_study: yearOfStudy,
    budget,
    move_in: docData.move_in ?? null,
    instagram: docData.instagram ?? "",
    facebook: docData.facebook ?? "",
    linkedin: docData.linkedin ?? "",
    twitter: docData.twitter ?? "",
    phone_number:
      typeof docData.phone_number === "string"
        ? docData.phone_number
        : undefined,
    preferences: docData.preferences,
  };
}

function buildFirestoreDocument(
  profile: UserProfile,
  options?: SaveUserProfileOptions,
): FirestoreUserDocument & { updatedAt: ReturnType<typeof serverTimestamp> } {
  const firstPhoto = profile.photos?.[0] ?? "";
  const phoneNumber = typeof profile.phone_number === "string" ? profile.phone_number.trim() : "";

  return {
    name: profile.name ?? null,
    age: profile.age ?? null,
    university: profile.university ?? null,
    year: profile.year_of_study ?? null,
    maxBudget: profile.budget ?? null,
    gender: profile.gender ?? null,
    photoUrl: firstPhoto,
    email: options?.email ?? null,
    photos: profile.photos ?? [],
    about: profile.about ?? "",
    city: profile.city ?? null,
    has_place: !!profile.has_place,
    already_have_apartment_to_share: !!profile.already_have_apartment_to_share,
    hasApartment: profile.hasApartment ?? profile.has_place,
    isLooking: profile.isLooking ?? profile.looking_for_apartment,
    housingStatus: profile.housingStatus ?? (profile.looking_for_apartment ? "looking" : profile.has_place ? "has_apartment" : "looking"),
    is_broker: !!profile.is_broker,
    ...(profile.isBroker !== undefined ? { isBroker: profile.isBroker } : {}),
    ...(profile.role !== undefined ? { role: profile.role } : {}),
    afm: profile.afm ?? null,
    ...(profile.agencyId && profile.agencyRole
      ? {
          agencyId: profile.agencyId,
          agencyRole: profile.agencyRole,
          agencyStatus: profile.agencyStatus ?? "none",
          ...(profile.agencyRequestedAt !== undefined ? { agencyRequestedAt: profile.agencyRequestedAt } : {}),
          ...(profile.agencyJoinedAt !== undefined ? { agencyJoinedAt: profile.agencyJoinedAt } : {}),
        }
      : {}),
    looking_for_apartment: !!profile.looking_for_apartment,
    not_looking_for_roommate: profile.not_looking_for_roommate === true,
    year_of_study: profile.year_of_study ?? null,
    budget: profile.budget ?? null,
    move_in: profile.move_in ?? null,
    instagram: profile.instagram ?? "",
    facebook: profile.facebook ?? "",
    linkedin: profile.linkedin ?? "",
    twitter: profile.twitter ?? "",
    ...(phoneNumber.length > 0 ? { phone_number: phoneNumber } : {}),
    updatedAt: serverTimestamp(),
  };
}

// 1. Ο πίνακας μνήμης RAM που κρατάει τα προφίλ καθ' όλη τη διάρκεια του session
const profileCache: Record<string, UserProfile> = {};

export async function userProfileExists(userId: string): Promise<boolean> {
  // Αν το έχουμε ήδη στο cache, ξέρουμε σίγουρα ότι υπάρχει!
  if (profileCache[userId]) return true;

  const ref = doc(db, "users", userId);
  const snapshot = await getDoc(ref);
  return snapshot.exists();
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;

  // 2. ΕΛΕΓΧΟΣ CACHE: Αν το προφίλ υπάρχει στη μνήμη, επιστρέφει ΑΜΕΣΩΣ σε 0ms
  if (profileCache[userId]) {
    return profileCache[userId];
  }

  const ref = doc(db, "users", userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;

  const profile = normalizeProfile(snapshot.data() as Partial<FirestoreUserDocument>);
  
  // 3. ΑΠΟΘΗΚΕΥΣΗ ΣΤΟ CACHE: Το κρατάμε στη μνήμη για την επόμενη φορά
  profileCache[userId] = profile;
  
  return profile;
}

export async function saveUserProfile(
  userId: string,
  profile: UserProfile,
  options?: SaveUserProfileOptions,
): Promise<void> {
  const ref = doc(db, "users", userId);
  const payload = buildFirestoreDocument(profile, options);
  await setDoc(ref, payload, { merge: true });

  // 4. ΣΥΓΧΡΟΝΙΣΜΟΣ: Ενημερώνουμε το cache με τα νέα στοιχεία για να μην δείχνει παλιά δεδομένα
  profileCache[userId] = profile;
}