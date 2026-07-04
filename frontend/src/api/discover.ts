import type { RoommateProfile } from "@/src/data/profiles";
import {
  collection,
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

function normalizeCandidate(uid: string, data: FirestoreUserDoc): RoommateProfile {
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const firstPhoto = data.photoUrl || photos[0] || "";

  return {
    id: uid,
    name: data.name?.trim() || "Unknown",
    age: typeof data.age === "number" ? data.age : 20,
    gender: (data.gender as RoommateProfile["gender"]) || "Non-binary",
    budget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    university: data.university || "",
    program: data.year || data.year_of_study || "Student",
    bio: data.about || data.bio || "",
    tags: [],
    photo: firstPhoto,
    deleted: !!data.deleted,
  };
}

function buildChatRoomId(userA: string, userB: string): string {
  return [userA, userB].sort().join("_");
}

export async function getCandidates(userId: string): Promise<RoommateProfile[]> {
  const swipesRef = collection(db, "swipes");
  const usersRef = collection(db, "users");

  const swipedSnap = await getDocs(query(swipesRef, where("fromUid", "==", userId)));
  const swipedTo = new Set<string>();
  swipedSnap.forEach((d) => {
    const toUid = d.data()?.toUid;
    if (typeof toUid === "string" && toUid) swipedTo.add(toUid);
  });

  const usersSnap = await getDocs(usersRef);
  const candidates: RoommateProfile[] = [];

  usersSnap.forEach((u) => {
    const uid = u.id;
    if (!uid || uid === userId || swipedTo.has(uid)) return;

    const data = u.data() as FirestoreUserDoc;
    candidates.push(normalizeCandidate(uid, data));
  });

  return candidates;
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
          lastMessage: "",
        },
        { merge: true },
      );
    }
  }

  // Legacy return contract maintained for existing callers.
  return direction === "right";
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
