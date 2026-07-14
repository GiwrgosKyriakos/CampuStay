import type { RoommateProfile } from "@/src/data/profiles";
import {
  arrayRemove,
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
import { normalizeCity } from "@/src/utils/cityNormalization";

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

async function getExcludedCandidateIds(
  userId: string,
): Promise<{ swipedTo: Set<string>; chattedWith: Set<string>; likedYou: Set<string> }> {
  const swipesRef = collection(db, "swipes");
  const chatsRef = collection(db, "chats");

  const [swipedSnap, incomingLikesSnap, chatsSnap] = await Promise.all([
    getDocs(query(swipesRef, where("fromUid", "==", userId))),
    getDocs(query(swipesRef, where("toUid", "==", userId), where("type", "==", "like"))),
    getDocs(query(chatsRef, where("users", "array-contains", userId))),
  ]);

  const swipedTo = new Set<string>();
  swipedSnap.forEach((d) => {
    const toUid = d.data()?.toUid;
    if (typeof toUid === "string" && toUid) swipedTo.add(toUid);
  });

  const likedYou = new Set<string>();
  incomingLikesSnap.forEach((d) => {
    const fromUid = d.data()?.fromUid;
    if (typeof fromUid === "string" && fromUid) likedYou.add(fromUid);
  });

  const chattedWith = new Set<string>();
  chatsSnap.forEach((chatDoc) => {
    const data = chatDoc.data() as { users?: string[]; status?: "pending" | "active" | string };
    const status = data.status;
    const shouldExcludeFromRecommendations = status === "active" || status === "pending";
    if (!shouldExcludeFromRecommendations) return;

    const users = Array.isArray(data.users) ? data.users : [];
    const counterpart = users.find((uid) => uid !== userId);
    if (typeof counterpart === "string" && counterpart) chattedWith.add(counterpart);
  });

  return { swipedTo, chattedWith, likedYou };
}

async function getPotentialCandidateRecords(userId: string, currentCity?: string | null): Promise<CandidateMatchRecord[]> {
  const usersRef = collection(db, "users");
  const { swipedTo, chattedWith, likedYou } = await getExcludedCandidateIds(userId);
  const normalizedCity = normalizeCity(currentCity);
  const usersSnap = await getDocs(usersRef);

  const candidateEntries: { uid: string; profile: RoommateProfile }[] = [];

  usersSnap.forEach((u) => {
    const uid = u.id;
    if (!uid || uid === userId || swipedTo.has(uid) || chattedWith.has(uid) || likedYou.has(uid)) return;

    const data = u.data() as FirestoreUserDoc;
    const candidate = normalizeCandidate(uid, data);
    if (candidate.deleted) return;
    if (normalizedCity && normalizeCity(candidate.city) !== normalizedCity) return;
    candidateEntries.push({ uid, profile: candidate });
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

export async function getCandidates(userId: string, currentCity?: string | null): Promise<RoommateProfile[]> {
  const records = await getPotentialCandidateRecords(userId, currentCity);
  return records.map((record) => record.profile);
}

export async function getCandidateMatchRecords(userId: string, currentCity?: string | null): Promise<CandidateMatchRecord[]> {
  return getPotentialCandidateRecords(userId, currentCity);
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
    const existingData = existingChat.exists()
      ? (existingChat.data() as { status?: "pending" | "active"; initiatedBy?: string | null })
      : null;

    await setDoc(
      chatRef,
      {
        users: [userId, targetId],
        type: "roommate",
        status: existingData?.status ?? "pending",
        initiatedBy: existingData?.initiatedBy ?? userId,
        updatedAt: serverTimestamp(),
        lastMessageTimestamp: serverTimestamp(),
        ...(existingChat.exists()
          ? {}
          : {
              createdAt: serverTimestamp(),
              lastMessage: "",
            }),
      },
      { merge: true },
    );

    // Re-open chat visibility for a user that had previously hidden this thread.
    await setDoc(
      chatRef,
      {
        // Ensure the chat stays visible in the roommates list for both participants.
        deletedBy: arrayRemove(userId, targetId),
      },
      { merge: true },
    );
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

