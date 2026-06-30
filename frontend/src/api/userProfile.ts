const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface UserProfile {
  photos: string[];
  age: number | null;
  about: string;
  gender: string | null;
  city: string | null;
  has_place: boolean;
  university: string | null;
  year_of_study: string | null;
  budget: number | null;
  move_in: string | null;
  instagram: string;
  facebook: string;
  linkedin: string;
  twitter: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const res = await fetch(`${BASE}/api/profile/${userId}`);
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const data = await res.json();
  return data.profile ?? null;
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const res = await fetch(`${BASE}/api/profile/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Failed to save profile (${res.status})`);
}
