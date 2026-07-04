import type { RoommateProfile } from "@/src/data/profiles";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function getCandidates(userId: string): Promise<RoommateProfile[]> {
  const res = await fetch(`${BASE}/api/candidates/${userId}`);
  if (!res.ok) throw new Error(`candidates ${res.status}`);
  const data = await res.json();
  return data.candidates as RoommateProfile[];
}

export async function postSwipe(
  userId: string,
  targetId: string,
  direction: "left" | "right",
): Promise<boolean> {
  const res = await fetch(`${BASE}/api/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, target_id: targetId, direction }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.matched;
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
