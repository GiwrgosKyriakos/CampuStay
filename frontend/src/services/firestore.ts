import { type User } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  DocumentData,
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import type { UserProfile } from "@/src/types/profile";

export interface FirestoreUserProfile extends UserProfile {
  id: string;
  email?: string | null;
  name?: string | null;
  photo?: string | null;
  bio?: string;
  program?: string | null;
  tags?: string[];
  profileComplete?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchParticipant {
  id: string;
  name: string | null;
  photo: string | null;
  age: number | null;
  gender: string | null;
  budget: number | null;
  university: string | null;
}

export interface FirestoreMatch {
  id: string;
  pairId: string;
  chatRoomId: string;
  memberIds: string[];
  participants: MatchParticipant[];
  lastMessage: string;
  updatedAt: unknown;
  createdAt: unknown;
}

export interface FirestoreChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: unknown;
}

export interface FirestoreChatRoom {
  id: string;
  matchId: string;
  memberIds: string[];
  participants: MatchParticipant[];
  lastMessage: string;
  updatedAt: unknown;
  createdAt: unknown;
}

function normalizeProfile(doc: QueryDocumentSnapshot<DocumentData>): FirestoreUserProfile {
  const data = doc.data();
  return {
    id: doc.id,
    email: data.email ?? null,
    name: data.name ?? null,
    photo: data.photo ?? null,
    age: data.age ?? null,
    gender: data.gender ?? null,
    budget: data.budget ?? null,
    university: data.university ?? null,
    about: data.about ?? "",
    bio: data.bio ?? data.about ?? "",
    program: data.program ?? null,
    tags: data.tags ?? [],
    city: data.city ?? null,
    has_place: data.has_place ?? false,
    year_of_study: data.year_of_study ?? null,
    move_in: data.move_in ?? null,
    instagram: data.instagram ?? "",
    facebook: data.facebook ?? "",
    linkedin: data.linkedin ?? "",
    twitter: data.twitter ?? "",
    profileComplete: data.profileComplete ?? false,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

function normalizeMatch(doc: QueryDocumentSnapshot<DocumentData>): FirestoreMatch {
  const data = doc.data();
  return {
    id: doc.id,
    pairId: data.pairId,
    chatRoomId: data.chatRoomId,
    memberIds: data.memberIds ?? [],
    participants: data.participants ?? [],
    lastMessage: data.lastMessage ?? "",
    updatedAt: data.updatedAt ?? null,
    createdAt: data.createdAt ?? null,
  };
}

function normalizeChatMessage(doc: QueryDocumentSnapshot<DocumentData>): FirestoreChatMessage {
  const data = doc.data();
  return {
    id: doc.id,
    senderId: data.senderId,
    text: data.text,
    timestamp: data.timestamp ?? null,
  };
}

export async function getUserProfile(userId: string): Promise<FirestoreUserProfile | null> {
  const profileRef = doc(db, "users", userId);
  const snapshot = await getDoc(profileRef);
  if (!snapshot.exists()) return null;
  return normalizeProfile(snapshot as QueryDocumentSnapshot<DocumentData>);
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const profileRef = doc(db, "users", userId);
  await setDoc(
    profileRef,
    {
      ...profile,
      bio: profile.bio ?? profile.about,
      program: profile.program ?? null,
      tags: profile.tags ?? [],
      id: userId,
      profileComplete: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncAuthUserToFirestore(user: User): Promise<void> {
  const profileRef = doc(db, "users", user.uid);
  await setDoc(
    profileRef,
    {
      id: user.uid,
      email: user.email ?? null,
      name: user.displayName ?? null,
      photo: user.photoURL ?? null,
      profileComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeUserProfile(
  userId: string,
  callback: (profile: FirestoreUserProfile | null) => void,
) {
  console.log(`[Firestore] → Subscribing to user profile: ${userId.substring(0, 8)}...`);
  const profileRef = doc(db, "users", userId);
  return onSnapshot(profileRef, (snapshot) => {
    if (!snapshot.exists()) {
      console.log("[Firestore] ✗ User profile not found");
      callback(null);
      return;
    }
    const profile = normalizeProfile(snapshot as QueryDocumentSnapshot<DocumentData>);
    console.log(`[Firestore] ✓ User profile loaded: ${profile.name}`);
    callback(profile);
  }, (err) => {
    console.error("[Firestore] ✗ Error subscribing to user profile:", err);
  });
}

export function subscribeRoommateProfiles(
  currentUserId: string | null,
  callback: (profiles: FirestoreUserProfile[]) => void,
) {
  console.log("[Firestore] → Subscribing to roommate profiles...");
  const usersQuery = currentUserId
    ? query(collection(db, "users"), orderBy("updatedAt", "desc"))
    : query(collection(db, "users"));
  
  return onSnapshot(usersQuery, (snapshot) => {
    const profiles = snapshot.docs
      .map(normalizeProfile)
      .filter((profile) => profile.profileComplete && profile.id !== currentUserId);
    console.log(`[Firestore] ✓ Roommate profiles loaded: ${profiles.length} profiles`);
    callback(profiles);
  }, (err) => {
    console.error("[Firestore] ✗ Error subscribing to roommate profiles:", err);
  });
}

export async function sendSwipeAction(
  currentUserId: string,
  targetUserId: string,
  direction: "left" | "right",
): Promise<void> {
  if (currentUserId === targetUserId) {
    console.warn("[Firestore] ⚠ Attempted to swipe on own profile, ignoring");
    return;
  }

  try {
    console.log(`[Firestore] → Recording ${direction} swipe: ${currentUserId} → ${targetUserId}`);
    
    const pairId = [currentUserId, targetUserId].sort().join("_");
    const swipeRef = doc(collection(db, "swipes"));
    await setDoc(swipeRef, {
      id: swipeRef.id,
      pairId,
      sourceUserId: currentUserId,
      targetUserId,
      direction,
      createdAt: serverTimestamp(),
    });
    
    console.log(`[Firestore] ✓ Swipe recorded: ${swipeRef.id}`);

    if (direction !== "right") {
      console.log("[Firestore] ← Swipe is LEFT, not checking for bidirectional match");
      return;
    }

    console.log("[Firestore] → Checking for bidirectional match...");
    const reverseQuery = query(
      collection(db, "swipes"),
      where("sourceUserId", "==", targetUserId),
      where("targetUserId", "==", currentUserId),
      where("direction", "==", "right"),
    );
    const reverseSnapshot = await getDocs(reverseQuery);
    
    if (reverseSnapshot.empty) {
      console.log("[Firestore] ← No reverse RIGHT swipe found, no match yet");
      return;
    }

    console.log("[Firestore] ✓ Bidirectional match detected! Creating match...");
    
    const matchId = pairId;
    const matchRef = doc(db, "matches", matchId);
    const existingMatch = await getDoc(matchRef);
    
    if (existingMatch.exists()) {
      console.log("[Firestore] ⚠ Match already exists, skipping duplicate creation");
      return;
    }

    const currentProfile = await getUserProfile(currentUserId);
    const targetProfile = await getUserProfile(targetUserId);
    
    if (!currentProfile || !targetProfile) {
      console.error("[Firestore] ✗ Could not load profiles for match creation");
      return;
    }

    const chatRoomRef = doc(collection(db, "chatRooms"));
    const participants = [
      {
        id: currentProfile.id,
        name: currentProfile.name ?? null,
        photo: currentProfile.photo ?? null,
        age: currentProfile.age ?? null,
        gender: currentProfile.gender ?? null,
        budget: currentProfile.budget ?? null,
        university: currentProfile.university ?? null,
      },
      {
        id: targetProfile.id,
        name: targetProfile.name ?? null,
        photo: targetProfile.photo ?? null,
        age: targetProfile.age ?? null,
        gender: targetProfile.gender ?? null,
        budget: targetProfile.budget ?? null,
        university: targetProfile.university ?? null,
      },
    ];

    await setDoc(matchRef, {
      pairId,
      chatRoomId: chatRoomRef.id,
      memberIds: [currentUserId, targetUserId],
      participants,
      lastMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(chatRoomRef, {
      id: chatRoomRef.id,
      matchId,
      memberIds: [currentUserId, targetUserId],
      participants,
      lastMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`[Firestore] ✓ Match created: ${matchId}`);
    console.log(`[Firestore] ✓ Chat room created: ${chatRoomRef.id}`);
  } catch (err) {
    console.error("[Firestore] ✗ Error in swipe action:", err);
    throw err;
  }
}

export function subscribeMatches(
  userId: string,
  callback: (matches: FirestoreMatch[]) => void,
) {
  console.log("[Firestore] → Subscribing to user matches...");
  const matchesQuery = query(collection(db, "matches"), where("memberIds", "array-contains", userId));
  return onSnapshot(matchesQuery, (snapshot) => {
    const matches = snapshot.docs.map(normalizeMatch);
    console.log(`[Firestore] ✓ Matches loaded: ${matches.length} matches`);
    callback(matches);
  }, (err) => {
    console.error("[Firestore] ✗ Error subscribing to matches:", err);
  });
}

export async function getChatRoom(chatRoomId: string): Promise<FirestoreChatRoom | null> {
  const chatRoomRef = doc(db, "chatRooms", chatRoomId);
  const snapshot = await getDoc(chatRoomRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as FirestoreChatRoom;
}

export async function sendChatMessage(
  chatRoomId: string,
  senderId: string,
  text: string,
): Promise<void> {
  try {
    console.log(`[Firestore] → Sending chat message to room ${chatRoomId.substring(0, 8)}...`);
    
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);
    const messageRef = await addDoc(collection(db, "chatRooms", chatRoomId, "messages"), {
      senderId,
      text,
      timestamp: serverTimestamp(),
    });

    console.log(`[Firestore] ✓ Message sent: ${messageRef.id}`);

    const chatRoomSnapshot = await getDoc(chatRoomRef);
    const matchId = chatRoomSnapshot.exists() ? (chatRoomSnapshot.data()?.matchId as string | undefined) : undefined;
    const updatedAt = serverTimestamp();

    await updateDoc(chatRoomRef, {
      lastMessage: text,
      updatedAt,
    });

    console.log(`[Firestore] ✓ Chat room last message updated`);

    if (matchId) {
      const matchRef = doc(db, "matches", matchId);
      await updateDoc(matchRef, {
        lastMessage: text,
        updatedAt,
      });
      console.log(`[Firestore] ✓ Match last message updated`);
    }
  } catch (err) {
    console.error("[Firestore] ✗ Error sending chat message:", err);
    throw err;
  }
}

export function subscribeChatMessages(
  chatRoomId: string,
  callback: (messages: FirestoreChatMessage[]) => void,
) {
  console.log(`[Firestore] → Subscribing to chat messages for room ${chatRoomId.substring(0, 8)}...`);
  const messagesQuery = query(
    collection(db, "chatRooms", chatRoomId, "messages"),
    orderBy("timestamp", "asc"),
  );
  
  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map(normalizeChatMessage);
    console.log(`[Firestore] ✓ Chat messages loaded: ${messages.length} messages`);
    callback(messages);
  }, (err) => {
    console.error("[Firestore] ✗ Error subscribing to chat messages:", err);
  });
}
