const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface RoomieProfileResponse {
  user_id: string;
  answers: Record<string, number>;
  updated_at: string | null;
}

export async function getRoomieProfile(userId: string): Promise<RoomieProfileResponse> {
  const res = await fetch(`${BASE}/api/roomie-profile/${userId}`);
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return res.json();
}

export async function saveRoomieProfile(
  userId: string,
  answers: Record<string, number>,
): Promise<RoomieProfileResponse> {
  const res = await fetch(`${BASE}/api/roomie-profile/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(`Failed to save profile (${res.status})`);
  return res.json();
}
