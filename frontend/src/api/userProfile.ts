import { getUserProfile as firestoreGetUserProfile, saveUserProfile as firestoreSaveUserProfile } from "@/src/services/firestore";
import type { UserProfile } from "@/src/types/profile";

export type { UserProfile };

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const firestoreProfile = await firestoreGetUserProfile(userId);
  if (!firestoreProfile) return null;
  return {
    photos: firestoreProfile.photos,
    age: firestoreProfile.age,
    about: firestoreProfile.about,
    gender: firestoreProfile.gender,
    city: firestoreProfile.city,
    has_place: firestoreProfile.has_place,
    university: firestoreProfile.university,
    year_of_study: firestoreProfile.year_of_study,
    budget: firestoreProfile.budget,
    move_in: firestoreProfile.move_in,
    instagram: firestoreProfile.instagram,
    facebook: firestoreProfile.facebook,
    linkedin: firestoreProfile.linkedin,
    twitter: firestoreProfile.twitter,
  };
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  return firestoreSaveUserProfile(userId, profile);
}
