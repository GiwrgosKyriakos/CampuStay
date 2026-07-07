import type { RoommateProfile } from "@/src/data/profiles";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

interface FirestoreUserDoc {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  maxBudget?: number | null;
  budget?: number | null;
  university?: string | null;
  year?: string | null;
  year_of_study?: string | null;
  about?: string;
  bio?: string;
  photoUrl?: string;
  photos?: string[];
  deleted?: boolean;
}

interface FirestoreQuizDoc {
  answers?: Record<string, string>;
}

interface CandidateMatchRecord {
  profile: RoommateProfile;
  quizAnswers: Record<string, string>;
}

function normalizeCandidate(uid: string, data: FirestoreUserDoc): RoommateProfile {
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const firstPhoto = data.photoUrl || photos[0] || "";

  return {
    id: uid,
    name: data.name?.trim() || "Unknown",
    age: typeof data.age === "number" ? data.age : 20,
    gender: (data.gender as RoommateProfile["gender"]) || "Non-binary",
    budget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    city: data.city?.trim() || "",
    university: data.university || "",
    program: data.year || data.year_of_study || "Student",
    bio: data.about || data.bio || "",
    tags: [],
    photo: firstPhoto,
    deleted: !!data.deleted,
  };
}

async function getExcludedCandidateIds(userId: string): Promise<{ swipedTo: Set<string>; chattedWith: Set<string> }> {
  const swipesRef = collection(db, "swipes");
  const chatsRef = collection(db, "chats");

  const [swipedSnap, chatsSnap] = await Promise.all([
    getDocs(query(swipesRef, where("fromUid", "==", userId))),
    getDocs(query(chatsRef, where("users", "array-contains", userId))),
  ]);

  const swipedTo = new Set<string>();
  swipedSnap.forEach((d) => {
    const toUid = d.data()?.toUid;
    if (typeof toUid === "string" && toUid) swipedTo.add(toUid);
  });

  const chattedWith = new Set<string>();
  chatsSnap.forEach((chatDoc) => {
    const data = chatDoc.data() as { users?: string[]; status?: "pending" | "active" | string };
    const status = data.status;
    const isActiveOrPending = status === "pending" || status === "active";
    if (!isActiveOrPending) return;

    const users = Array.isArray(data.users) ? data.users : [];
    const counterpart = users.find((uid) => uid !== userId);
    if (typeof counterpart === "string" && counterpart) chattedWith.add(counterpart);
  });

  return { swipedTo, chattedWith };
}

async function getPotentialCandidateRecords(userId: string): Promise<CandidateMatchRecord[]> {
  const usersRef = collection(db, "users");
  const { swipedTo, chattedWith } = await getExcludedCandidateIds(userId);
  const usersSnap = await getDocs(usersRef);

  const candidateEntries: { uid: string; profile: RoommateProfile }[] = [];

  usersSnap.forEach((u) => {
    const uid = u.id;
    if (!uid || uid === userId || swipedTo.has(uid) || chattedWith.has(uid)) return;

    const data = u.data() as FirestoreUserDoc;
    candidateEntries.push({ uid, profile: normalizeCandidate(uid, data) });
  });

  const quizEntries = await Promise.all(
    candidateEntries.map(async ({ uid, profile }) => {
      const quizSnap = await getDoc(doc(db, "quiz_answers", uid));
      const quizData = quizSnap.exists() ? (quizSnap.data() as FirestoreQuizDoc) : null;

      return {
        profile,
        quizAnswers: quizData?.answers ?? {},
      } satisfies CandidateMatchRecord;
    }),
  );

  return quizEntries;
}

function buildChatRoomId(userA: string, userB: string): string {
  return [userA, userB].sort().join("_");
}

export async function getCandidates(userId: string): Promise<RoommateProfile[]> {
  const records = await getPotentialCandidateRecords(userId);
  return records.map((record) => record.profile);
}

export async function getCandidateMatchRecords(userId: string): Promise<CandidateMatchRecord[]> {
  return getPotentialCandidateRecords(userId);
}

export async function postSwipe(
  userId: string,
  targetId: string,
  direction: "left" | "right",
): Promise<boolean> {
  const swipeType = direction === "right" ? "like" : "dislike";
  const swipeDocId = `${userId}_${targetId}`;

  await setDoc(
    doc(db, "swipes", swipeDocId),
    {
      fromUid: userId,
      toUid: targetId,
      type: swipeType,
      timestamp: serverTimestamp(),
    },
    { merge: true },
  );

  if (direction === "right") {
    const chatRoomId = buildChatRoomId(userId, targetId);
    const chatRef = doc(db, "chats", chatRoomId);
    const existingChat = await getDoc(chatRef);

    if (!existingChat.exists()) {
      await setDoc(
        chatRef,
        {
          users: [userId, targetId],
          status: "pending",
          initiatedBy: userId,
          createdAt: serverTimestamp(),
          lastMessageTimestamp: serverTimestamp(),
          lastMessage: "",
        },
        { merge: true },
      );
    }
  }

  // Legacy return contract maintained for existing callers.
  return direction === "right";
}

export async function resetDislikedSwipes(userId: string): Promise<void> {
  const dislikesQ = query(
    collection(db, "swipes"),
    where("fromUid", "==", userId),
    where("type", "==", "dislike"),
  );
  const dislikesSnap = await getDocs(dislikesQ);
  if (dislikesSnap.empty) return;

  await Promise.all(dislikesSnap.docs.map((swipeDoc) => deleteDoc(swipeDoc.ref)));
}

export async function getMyMatches(userId: string): Promise<RoommateProfile[]> {
  const res = await fetch(`${BASE}/api/my-matches/${userId}`);
  if (!res.ok) throw new Error(`matches ${res.status}`);
  const data = await res.json();
  return data.matches as RoommateProfile[];
}

export async function acceptChatRequest(chatRoomId: string, userId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/chat/${chatRoomId}/accept`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "current-user-id": userId,
    },
  });
  if (!res.ok) return false;
  return true;
}

export async function getUserPublic(userId: string): Promise<RoommateProfile | null> {
  const res = await fetch(`${BASE}/api/user-public/${userId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.user as RoommateProfile;
}
