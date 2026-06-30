const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface NotificationPreferences {
  new_matches: boolean;
  direct_messages: boolean;
  app_updates_and_tips: boolean;
}

export interface BlockedProfile {
  id: string;
  name: string;
}

export interface PrivacyPreferences {
  is_visible: boolean;
  blocked_profiles: BlockedProfile[];
}

export interface UserSettings {
  user_id: string;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  notifications: {
    new_matches: true,
    direct_messages: true,
    app_updates_and_tips: true,
  },
  privacy: {
    is_visible: true,
    blocked_profiles: [],
  },
};

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const res = await fetch(`${BASE}/api/user-settings/${userId}`);
  if (!res.ok) throw new Error(`Failed to load user settings (${res.status})`);
  return res.json();
}

export async function saveUserNotifications(userId: string, notifications: NotificationPreferences): Promise<UserSettings> {
  const res = await fetch(`${BASE}/api/user-settings/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notifications }),
  });
  if (!res.ok) throw new Error(`Failed to save notifications (${res.status})`);
  return res.json();
}

export async function saveUserPrivacy(userId: string, privacy: PrivacyPreferences): Promise<UserSettings> {
  const res = await fetch(`${BASE}/api/user-settings/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privacy }),
  });
  if (!res.ok) throw new Error(`Failed to save privacy settings (${res.status})`);
  return res.json();
}

export async function deleteAccount(userId: string, credential: string): Promise<void> {
  const res = await fetch(`${BASE}/api/delete-account/${userId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete account (${res.status})`);
  }
}
