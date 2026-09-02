import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface NotificationPreferences {
  new_matches: boolean;
  direct_messages: boolean;
  app_updates_and_tips: boolean;
  mute_all_notifications: boolean;
  muted_chat_ids: string[];
  unmuted_chat_overrides: string[];
}

export interface BlockedProfile {
  id: string;
  name: string;
}

export interface PrivacyPreferences {
  is_visible: boolean;
  blocked_profiles: BlockedProfile[];
  hideNameInDeck?: boolean;
  hideInStack?: boolean;
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
  mute_all_notifications: false,
  muted_chat_ids: [],
  unmuted_chat_overrides: [],
};

const DEFAULT_PRIVACY: PrivacyPreferences = {
  is_visible: true,
  blocked_profiles: [],
  hideNameInDeck: false,
  hideInStack: false,
};

type FirestoreUserSettingsDoc = {
  notifications?: Partial<NotificationPreferences>;
  privacy?: Partial<PrivacyPreferences>;
};

function normalizeNotifications(input?: Partial<NotificationPreferences>): NotificationPreferences {
  const mutedChatIds = Array.isArray(input?.muted_chat_ids)
    ? input.muted_chat_ids.filter((chatId): chatId is string => typeof chatId === "string" && chatId.trim().length > 0)
    : [];
  const unmutedOverrides = Array.isArray(input?.unmuted_chat_overrides)
    ? input.unmuted_chat_overrides.filter((chatId): chatId is string => typeof chatId === "string" && chatId.trim().length > 0)
    : [];

  return {
    new_matches: input?.new_matches ?? DEFAULT_NOTIFICATIONS.new_matches,
    direct_messages: input?.direct_messages ?? DEFAULT_NOTIFICATIONS.direct_messages,
    app_updates_and_tips: input?.app_updates_and_tips ?? DEFAULT_NOTIFICATIONS.app_updates_and_tips,
    mute_all_notifications: input?.mute_all_notifications ?? DEFAULT_NOTIFICATIONS.mute_all_notifications,
    muted_chat_ids: Array.from(new Set(mutedChatIds)),
    unmuted_chat_overrides: Array.from(new Set(unmutedOverrides)),
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
    hideNameInDeck: input?.hideNameInDeck ?? DEFAULT_PRIVACY.hideNameInDeck,
    hideInStack: input?.hideInStack ?? DEFAULT_PRIVACY.hideInStack,
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
  // Διαβάζουμε από τη συλλογή "settings"
  const settingsRef = doc(db, "settings", userId);
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) {
    return buildSettings(userId);
  }

  const data = snapshot.data() as FirestoreUserSettingsDoc;
  return buildSettings(userId, data);
}

export async function saveUserNotifications(userId: string, notifications: NotificationPreferences): Promise<UserSettings> {
  const settingsRef = doc(db, "settings", userId);
  const userRef = doc(db, "users", userId);
  const normNotifications = normalizeNotifications(notifications);

  // 1. Αποθήκευση όλων των προτιμήσεων στην ιδιωτική συλλογή "settings"
  await setDoc(
    settingsRef,
    {
      notifications: normNotifications,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 2. Δημοσίευση των 2 flags στη δημόσια συλλογή "users" για τους ελέγχους των notifications
  await setDoc(
    userRef,
    {
      directMessagesEnabled: normNotifications.direct_messages,
      newMatchesEnabled: normNotifications.new_matches,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const current = await getUserSettings(userId);
  return {
    ...current,
    notifications: normNotifications,
  };
}

export async function saveUserPrivacy(userId: string, privacy: PrivacyPreferences): Promise<UserSettings> {
  const settingsRef = doc(db, "settings", userId);
  const userRef = doc(db, "users", userId); // Προσθήκη αναφοράς στο document του χρήστη
  const normPrivacy = normalizePrivacy(privacy);

  // 1. Αποθήκευση στη συλλογή "settings"
  await setDoc(
    settingsRef,
    {
      privacy: normPrivacy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 2. Ενημέρωση του flag is_visible στη συλλογή "users" για άμεσο φιλτράρισμα στο discover
  await setDoc(
    userRef,
    {
      is_visible: normPrivacy.is_visible,
      blockedUserIds: normPrivacy.blocked_profiles.map((profile) => profile.id),
      preferences: {
        hideNameInDeck: normPrivacy.hideNameInDeck === true,
        hideInStack: normPrivacy.hideInStack === true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const current = await getUserSettings(userId);
  return {
    ...current,
    privacy: normPrivacy,
  };
}