import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { getUserSettings, saveUserNotifications } from "@/src/api/accountSettings";

const NOTIFICATION_ROWS = [
  {
    id: "new_matches",
    title: "New Matches",
    subtitle: "Notify me when someone likes me back",
  },
  {
    id: "direct_messages",
    title: "Direct Messages",
    subtitle: "Notify me when I receive a new chat message",
  },
  {
    id: "app_updates_and_tips",
    title: "App Updates & Tips",
    subtitle: "Occasional reminders and compatibility tips",
  },
] as const;

type NotificationKey = "new_matches" | "direct_messages" | "app_updates_and_tips";

export default function NotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Record<NotificationKey, boolean>>({
    new_matches: true,
    direct_messages: true,
    app_updates_and_tips: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (auth.isGuest) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const settings = await getUserSettings(auth.userId ?? "");
        if (!active) return;
        setPreferences(settings.notifications);
      } catch {
        if (!active) return;
        setError("Unable to load notification settings.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.userId]);

  const updatePreference = useCallback(
    async (key: NotificationKey, value: boolean) => {
      const nextPreferences = { ...preferences, [key]: value };
      setPreferences(nextPreferences);
      setSaving(true);
      setError(null);
      try {
        if (!auth.userId) return;
        await saveUserNotifications(auth.userId, nextPreferences);
      } catch {
        setError("Could not save notification settings.");
      } finally {
        setSaving(false);
      }
    },
    [auth.userId, preferences],
  );

  if (!auth.loaded || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (auth.isGuest) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + spacing.lg }]}> 
        <Text style={styles.guestTitle}>Notifications are disabled in Guest Mode</Text>
        <Text style={styles.guestSubtitle}>
          Log in to access your personal notification preferences and receive updates for your matches.
        </Text>
        <Pressable style={styles.guestButton} onPress={() => router.replace("/guest")}> 
          <Text style={styles.guestButtonText}>Continue as guest</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      testID="notifications-screen"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Manage your push notification preferences.</Text>
      </View>
      <View style={styles.centerBlock}>
        {NOTIFICATION_ROWS.map((row) => (
          <View key={row.id} style={styles.settingRow} testID={`notification-row-${row.id}`}>
            <View style={styles.rowText}>
              <Text style={styles.settingTitle}>{row.title}</Text>
              <Text style={styles.settingSubtitle}>{row.subtitle}</Text>
            </View>
            <Switch
              value={preferences[row.id]}
              onValueChange={(value) => updatePreference(row.id, value)}
              trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
              thumbColor={preferences[row.id] ? colors.surface : colors.surfaceSecondary}
            />
          </View>
        ))}
      </View>
      {saving && <Text style={styles.saveText}>Saving changes…</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  contentContainer: { minHeight: "100%", paddingHorizontal: spacing.lg, justifyContent: "center" },
  header: { marginBottom: spacing.xl, alignItems: "center" },
  centerBlock: { flex: 1, justifyContent: "center", gap: spacing.sm },
  container: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: { flex: 1, paddingRight: spacing.sm },
  settingTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  settingSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 4 },
  saveText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brand, marginTop: spacing.sm, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginTop: spacing.sm, textAlign: "center" },
  guestTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, textAlign: "center" },
  guestSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.sm },
  guestButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  guestButtonText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
