import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface UserProfile {
  name: string | null;
  photos: string[];
  age: number | null;
  about: string;
  gender: string | null;
  city: string | null;
  has_place: boolean;
  already_have_apartment_to_share: boolean;
  is_broker?: boolean;
  looking_for_apartment: boolean;
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
}

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
  is_broker?: boolean;
  looking_for_apartment?: boolean;
  not_looking_for_roommate?: boolean;
  year_of_study?: string | null;
  budget?: number | null;
  move_in?: string | null;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  phone_number?: string;
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
    has_place: !!docData.has_place,
    already_have_apartment_to_share: !!docData.already_have_apartment_to_share,
    is_broker: !!docData.is_broker,
    looking_for_apartment: !!docData.looking_for_apartment,
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
    is_broker: !!profile.is_broker,
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