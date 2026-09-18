import AsyncStorage from "@react-native-async-storage/async-storage";
import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import type { TourPersonaKey } from "@/src/types/tour";

const completedKey = (userId: string) => `@tour_completed_${userId}`;
const completedPersonaKey = (userId: string, persona: TourPersonaKey) => `@tour_completed_${userId}_${persona}`;

function parsePersonas(raw: string | null): TourPersonaKey[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((persona): persona is TourPersonaKey => typeof persona === "string" && persona !== "guest");
  } catch {
    return [];
  }
}

function uniquePersonas(personas: readonly TourPersonaKey[]): TourPersonaKey[] {
  return Array.from(new Set(personas));
}

export async function getCompletedTourPersonas(userId: string): Promise<TourPersonaKey[]> {
  if (!userId) return [];

  const [profileResult, localResult] = await Promise.allSettled([
    getDoc(doc(db, "users", userId)),
    AsyncStorage.getItem(completedKey(userId)),
  ]);
  const firestoreData = profileResult.status === "fulfilled" && profileResult.value.exists()
    ? profileResult.value.data().completedTourPersonas
    : null;
  const firestorePersonas: TourPersonaKey[] = Array.isArray(firestoreData)
    ? firestoreData.filter((persona): persona is TourPersonaKey => typeof persona === "string" && persona !== "guest")
    : [];
  const localPersonas = localResult.status === "fulfilled" ? parsePersonas(localResult.value) : [];
  const personas = uniquePersonas(firestorePersonas.concat(localPersonas));
  await AsyncStorage.setItem(completedKey(userId), JSON.stringify(personas));
  return personas;
}

export async function markTourPersonaCompleted(userId: string, persona: TourPersonaKey): Promise<void> {
  if (persona === "guest") return;

  const existing = await AsyncStorage.getItem(completedKey(userId));
  const personas = uniquePersonas(parsePersonas(existing).concat(persona));
  await Promise.all([
    updateDoc(doc(db, "users", userId), { completedTourPersonas: arrayUnion(persona) }),
    AsyncStorage.setItem(completedKey(userId), JSON.stringify(personas)),
    AsyncStorage.setItem(completedPersonaKey(userId, persona), "true"),
  ]);
}