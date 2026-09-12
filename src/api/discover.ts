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
import { normalizeCity } from "@/src/utils/cityNormalization";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";
import { calculateMatchScore, type UserProfile as MatchUserProfile } from "@/src/utils/matchAlgorithm";

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
  is_broker?: boolean;
  role?: string | null;
  agencyId?: string | null;
  agencyRole?: string | null;
  is_agency_ceo?: boolean;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
  is_visible?: boolean;
  isVisible?: boolean;
  privacy?: { is_visible?: boolean };
  blockedUserIds?: string[];
  preferences?: { hideNameInDeck?: boolean; hideInStack?: boolean };
  expoPushToken?: string;
  newMatchesEnabled?: boolean;
}

interface FirestoreSettingsDoc {
  privacy?: {
    blocked_profiles?: Array<{ id?: string | null }>;
  };
}

interface FirestoreQuizDoc {
  answers?: Record<string, string>;
}

function normalizeMatchGender(gender: string | null | undefined): MatchUserProfile["gender"] {
  if (gender === "Male" || gender === "Female" || gender === "Prefer Not To Say") return gender;
  return "Prefer Not To Say";
}

function toMatchProfile(uid: string, data: FirestoreUserDoc, quizAnswers: Record<string, string>): MatchUserProfile {
  return {
    uid,
    city: data.city?.trim() || "",
    gender: normalizeMatchGender(data.gender),
    monthlyBudget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    quiz: quizAnswers,
  };
}

async function calculateRoommateCompatibilityScore(userId: string, targetId: string): Promise<number | null> {
  const [userSnapshot, targetSnapshot, userQuizSnapshot, targetQuizSnapshot] = await Promise.all([
    getDoc(doc(db, "users", userId)),
    getDoc(doc(db, "users", targetId)),
    getDoc(doc(db, "quiz_answers", userId)),
    getDoc(doc(db, "quiz_answers", targetId)),
  ]);
  if (!userSnapshot.exists() || !targetSnapshot.exists()) return null;

  const userData = userSnapshot.data() as FirestoreUserDoc;
  const targetData = targetSnapshot.data() as FirestoreUserDoc;
  const userQuiz = userQuizSnapshot.exists() ? (userQuizSnapshot.data() as FirestoreQuizDoc).answers ?? {} : {};
  const targetQuiz = targetQuizSnapshot.exists() ? (targetQuizSnapshot.data() as FirestoreQuizDoc).answers ?? {} : {};
  return calculateMatchScore(toMatchProfile(userId, userData, userQuiz), toMatchProfile(targetId, targetData, targetQuiz));
}

interface CandidateMatchRecord {
  profile: RoommateProfile;
  quizAnswers: Record<string, string>;
}

interface FirestoreChatDoc {
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  clearedAt?: Record<string, unknown>;
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
): Promise<{ swipedTo: Set<string>; chattedWith: Set<string>; blockedUsers: Set<string> }> {
  const swipesRef = collection(db, "swipes");
  const chatsRef = collection(db, "chats");

  const [swipedSnap, chatsSnap, userSnap, settingsSnap] = await Promise.all([
    getDocs(query(swipesRef, where("fromUid", "==", userId))),
    getDocs(query(chatsRef, where("users", "array-contains", userId))),
    getDoc(doc(db, "users", userId)),
    getDoc(doc(db, "settings", userId)),
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
    const shouldExcludeFromRecommendations = status === "active" || status === "pending";
    if (!shouldExcludeFromRecommendations) return;

    const users = Array.isArray(data.users) ? data.users : [];
    const counterpart = users.find((uid) => uid !== userId);
    if (typeof counterpart === "string" && counterpart) chattedWith.add(counterpart);
  });

  const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : {};
  const settingsData = settingsSnap.exists() ? (settingsSnap.data() as FirestoreSettingsDoc) : {};
  const blockedUsers = new Set<string>([
    ...(Array.isArray(userData.blockedUserIds) ? userData.blockedUserIds : []),
    ...(Array.isArray(settingsData.privacy?.blocked_profiles)
      ? settingsData.privacy.blocked_profiles.map((profile) => profile.id)
      : []),
  ].filter((id): id is string => typeof id === "string" && id.length > 0));

  return { swipedTo, chattedWith, blockedUsers };
}

async function getPotentialCandidateRecords(userId: string, currentCity?: string | null): Promise<CandidateMatchRecord[]> {
  const usersRef = collection(db, "users");
  const { swipedTo, chattedWith, blockedUsers } = await getExcludedCandidateIds(userId);
  const normalizedCity = normalizeCity(currentCity);
  const usersSnap = await getDocs(usersRef);

  const candidateEntries: { uid: string; profile: RoommateProfile }[] = [];
  const exclusionCounts = {
    self: 0,
    swipeHistory: 0,
    activeChat: 0,
    blocked: 0,
    invisible: 0,
    notLookingForRoommate: 0,
    role: 0,
    deleted: 0,
    cityMismatch: 0,
    invalidId: 0,
  };

  usersSnap.forEach((u) => {
    const uid = u.id;
    if (!uid) {
      exclusionCounts.invalidId += 1;
      return;
    }
    if (uid === userId) {
      exclusionCounts.self += 1;
      return;
    }
    if (swipedTo.has(uid)) {
      exclusionCounts.swipeHistory += 1;
      return;
    }
    if (chattedWith.has(uid)) {
      exclusionCounts.activeChat += 1;
      return;
    }
    if (blockedUsers.has(uid)) {
      exclusionCounts.blocked += 1;
      return;
    }

    // Ενημερωμένος τύπος με υποστήριξη για is_visible στη ρίζα του user document
    const data = u.data() as FirestoreUserDoc;
    
    // Έλεγχος αν η ορατότητα είναι απενεργοποιημένη
    if (data.is_visible === false || data.isVisible === false || data.privacy?.is_visible === false) {
      exclusionCounts.invisible += 1;
      return;
    }
    const candidateBlockedUsers = Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [];
    if (candidateBlockedUsers.includes(userId)) {
      exclusionCounts.blocked += 1;
      return;
    }
    if (data.not_looking_for_roommate === true || data.looking_for_roommate === false || data.isLookingForRoommate === false) {
      exclusionCounts.notLookingForRoommate += 1;
      return;
    }
    const isLookingForRoommate = data.looking_for_roommate === true || data.isLookingForRoommate === true;
    if (isBrokerOrAgencyUser(data) && !isLookingForRoommate) {
      exclusionCounts.role += 1;
      return;
    }

    const candidate = normalizeCandidate(uid, data);
    if (candidate.deleted) {
      exclusionCounts.deleted += 1;
      return;
    }
    const candidateCity = normalizeCity(candidate.city);
    if (normalizedCity && candidateCity && candidateCity !== normalizedCity) {
      exclusionCounts.cityMismatch += 1;
      return;
    }
    candidateEntries.push({ uid, profile: candidate });
  });

  let quizReadFailures = 0;
  const quizEntries = await Promise.all(
    candidateEntries.map(async ({ uid, profile }) => {
      let quizAnswers: Record<string, string> = {};
      try {
        const quizSnap = await getDoc(doc(db, "quiz_answers", uid));
        const quizData = quizSnap.exists() ? (quizSnap.data() as FirestoreQuizDoc) : null;
        quizAnswers = quizData?.answers ?? {};
      } catch (error) {
        quizReadFailures += 1;
        console.warn("[Discover] Candidate quiz unavailable; retaining profile", {
          candidateId: uid,
          error,
        });
      }

      return {
        profile,
        quizAnswers,
      } satisfies CandidateMatchRecord;
    }),
  );

  console.log("[Discover] Candidate pipeline", {
    userId,
    fetchedFromDb: usersSnap.size,
    exclusionCounts,
    eligibleProfiles: candidateEntries.length,
    quizReadFailures,
    finalRecords: quizEntries.length,
  });

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
      ? (existingChat.data() as FirestoreChatDoc)
      : null;

    await setDoc(
      chatRef,
      {
        users: [userId, targetId],
        type: "roommate",
        status: existingData?.status ?? "pending",
        initiatedBy: existingData?.initiatedBy ?? userId,
        rejectedBy: null,
        rejections: [],
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

    try {
      const score = await calculateRoommateCompatibilityScore(userId, targetId);
      const matchId = `roommate_${userId}_${targetId}`;
      await setDoc(doc(db, "matches", matchId), {
        recipientId: targetId,
        candidateId: userId,
        userId,
        score: typeof score === "number" && Number.isFinite(score) ? score : 0,
        chatRoomId,
        source: "roommate_swipe",
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }, { merge: true });
    } catch (notifErr) {
      console.error("[postSwipe] Σφάλμα αποστολής notification match:", notifErr);
    }
  }

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