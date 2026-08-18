import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface RoomieProfileResponse {
  user_id: string;
  answers: Record<string, string>;
  updated_at: string | null;
}

interface FirestoreQuizDocument {
  answers: Record<string, string>;
  updatedAt?: ReturnType<typeof serverTimestamp>;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const candidate = value as { toDate?: () => Date; toMillis?: () => number };
  if (typeof candidate.toDate === "function") return candidate.toDate().toISOString();
  if (typeof candidate.toMillis === "function") return new Date(candidate.toMillis()).toISOString();

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

export async function getRoomieProfile(userId: string): Promise<RoomieProfileResponse> {
  try {
    const ref = doc(db, "quiz_answers", userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return {
        user_id: userId,
        answers: {},
        updated_at: null,
      };
    }

    const data = snapshot.data() as Partial<FirestoreQuizDocument>;
    return {
      user_id: userId,
      answers: data.answers ?? {},
      updated_at: toIsoString(data.updatedAt),
    };
  } catch (err) {
    console.error("[API] getRoomieProfile failed:", err);
    throw err;
  }
}

export async function saveRoomieProfile(
  userId: string,
  answers: Record<string, string>,
): Promise<RoomieProfileResponse> {
  try {
    const ref = doc(db, "quiz_answers", userId);
    const payload: FirestoreQuizDocument = {
      answers,
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });

    return {
      user_id: userId,
      answers,
      updated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[API] saveRoomieProfile failed:", err);
    throw err;
  }
}
