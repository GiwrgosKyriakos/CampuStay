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
  looking_for_apartment: boolean;
  university: string | null;
  year_of_study: string | null;
  budget: number | null;
  move_in: string | null;
  instagram: string;
  facebook: string;
  linkedin: string;
  twitter: string;
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
  looking_for_apartment?: boolean;
  year_of_study?: string | null;
  budget?: number | null;
  move_in?: string | null;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
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
    looking_for_apartment: !!docData.looking_for_apartment,
    university: docData.university ?? null,
    year_of_study: yearOfStudy,
    budget,
    move_in: docData.move_in ?? null,
    instagram: docData.instagram ?? "",
    facebook: docData.facebook ?? "",
    linkedin: docData.linkedin ?? "",
    twitter: docData.twitter ?? "",
  };
}

function buildFirestoreDocument(
  profile: UserProfile,
  options?: SaveUserProfileOptions,
): FirestoreUserDocument & { updatedAt: ReturnType<typeof serverTimestamp> } {
  const firstPhoto = profile.photos?.[0] ?? "";

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
    looking_for_apartment: !!profile.looking_for_apartment,
    year_of_study: profile.year_of_study ?? null,
    budget: profile.budget ?? null,
    move_in: profile.move_in ?? null,
    instagram: profile.instagram ?? "",
    facebook: profile.facebook ?? "",
    linkedin: profile.linkedin ?? "",
    twitter: profile.twitter ?? "",
    updatedAt: serverTimestamp(),
  };
}

export async function userProfileExists(userId: string): Promise<boolean> {
  const ref = doc(db, "users", userId);
  const snapshot = await getDoc(ref);
  return snapshot.exists();
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return normalizeProfile(snapshot.data() as Partial<FirestoreUserDocument>);
}

export async function saveUserProfile(
  userId: string,
  profile: UserProfile,
  options?: SaveUserProfileOptions,
): Promise<void> {
  const ref = doc(db, "users", userId);
  const payload = buildFirestoreDocument(profile, options);
  await setDoc(ref, payload, { merge: true });
}
