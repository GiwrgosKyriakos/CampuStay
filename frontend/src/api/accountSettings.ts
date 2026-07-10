import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";

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

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  new_matches: true,
  direct_messages: true,
  app_updates_and_tips: true,
};

const DEFAULT_PRIVACY: PrivacyPreferences = {
  is_visible: true,
  blocked_profiles: [],
};

type FirestoreUserSettingsDoc = {
  notifications?: Partial<NotificationPreferences>;
  privacy?: Partial<PrivacyPreferences>;
};

function normalizeNotifications(input?: Partial<NotificationPreferences>): NotificationPreferences {
  return {
    new_matches: input?.new_matches ?? DEFAULT_NOTIFICATIONS.new_matches,
    direct_messages: input?.direct_messages ?? DEFAULT_NOTIFICATIONS.direct_messages,
    app_updates_and_tips: input?.app_updates_and_tips ?? DEFAULT_NOTIFICATIONS.app_updates_and_tips,
  };
}

function normalizePrivacy(input?: Partial<PrivacyPreferences>): PrivacyPreferences {
  const blockedProfiles = Array.isArray(input?.blocked_profiles)
    ? input.blocked_profiles.filter(
        (profile): profile is BlockedProfile =>
          !!profile && typeof profile.id === "string" && typeof profile.name === "string",
      )
    : [];

  return {
    is_visible: input?.is_visible ?? DEFAULT_PRIVACY.is_visible,
    blocked_profiles: blockedProfiles,
  };
}

function buildSettings(userId: string, data?: FirestoreUserSettingsDoc): UserSettings {
  return {
    user_id: userId,
    notifications: normalizeNotifications(data?.notifications),
    privacy: normalizePrivacy(data?.privacy),
  };
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const ref = doc(db, "users", userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return buildSettings(userId);
  }

  const data = snapshot.data() as FirestoreUserSettingsDoc;
  return buildSettings(userId, data);
}

export async function saveUserNotifications(userId: string, notifications: NotificationPreferences): Promise<UserSettings> {
  const ref = doc(db, "users", userId);
  await setDoc(
    ref,
    {
      notifications: normalizeNotifications(notifications),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const current = await getUserSettings(userId);
  return {
    ...current,
    notifications: normalizeNotifications(notifications),
  };
}

export async function saveUserPrivacy(userId: string, privacy: PrivacyPreferences): Promise<UserSettings> {
  const ref = doc(db, "users", userId);
  await setDoc(
    ref,
    {
      privacy: normalizePrivacy(privacy),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const current = await getUserSettings(userId);
  return {
    ...current,
    privacy: normalizePrivacy(privacy),
  };
}

export async function deleteAccount(userId: string, credential: string): Promise<void> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  const res = await fetch(`${base}/api/delete-account/${userId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete account (${res.status})`);
  }
}
