import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface RoomieProfileResponse {
  user_id: string;
  answers: Record<string, number>;
  updated_at: string | null;
}

interface FirestoreQuizDocument {
  answers: Record<string, number>;
  updatedAt?: ReturnType<typeof serverTimestamp>;
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
      updated_at: data.updatedAt ? new Date(data.updatedAt).toISOString() : null,
    };
  } catch (err) {
    console.error("[API] getRoomieProfile failed:", err);
    throw err;
  }
}

export async function saveRoomieProfile(
  userId: string,
  answers: Record<string, number>,
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
