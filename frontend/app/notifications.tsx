import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { getUserSettings, saveUserNotifications } from "@/src/api/accountSettings";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { t } from "@/src/locales";

const NOTIFICATION_ROWS = [
  {
    id: "new_matches",
    title: "notifications.rows.newMatches.title",
    subtitle: "notifications.rows.newMatches.subtitle",
  },
  {
    id: "direct_messages",
    title: "notifications.rows.directMessages.title",
    subtitle: "notifications.rows.directMessages.subtitle",
  },
  {
    id: "app_updates_and_tips",
    title: "notifications.rows.updatesTips.title",
    subtitle: "notifications.rows.updatesTips.subtitle",
  },
] as const;

type NotificationKey = "new_matches" | "direct_messages" | "app_updates_and_tips";
const STICKY_FOOTER_PADDING = 152;

export default function NotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isGuest = auth.isGuest;
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
    if (isGuest) {
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
        setError(t("notifications.errors.load"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isGuest, auth.userId]);

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
        setError(t("notifications.errors.save"));
      } finally {
        setSaving(false);
      }
    },
    [auth.userId, preferences],
  );

  if (auth.isLoading || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + (isGuest ? STICKY_FOOTER_PADDING : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        testID="notifications-screen"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("notifications.title")}</Text>
          <Text style={styles.subtitle}>{t("notifications.subtitle")}</Text>
        </View>

        {isGuest && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="notifications-guest-banner"
            buttonTestID="notifications-guest-top-signin-button"
            style={styles.guestBannerSpacing}
          />
        )}

        <View style={styles.centerBlock}>
          {NOTIFICATION_ROWS.map((row) => (
            <View key={row.id} style={styles.settingRow} testID={`notification-row-${row.id}`}>
              <View style={styles.rowText}>
                <Text style={styles.settingTitle}>{t(row.title)}</Text>
                <Text style={styles.settingSubtitle}>{t(row.subtitle)}</Text>
              </View>
              <View style={isGuest ? styles.disabledControl : undefined}>
                <Switch
                  value={preferences[row.id]}
                  onValueChange={(value) => updatePreference(row.id, value)}
                  disabled={isGuest}
                  trackColor={{ false: isGuest ? colors.border : colors.surfaceSecondary, true: isGuest ? colors.onSurfaceTertiary : colors.brand }}
                  thumbColor={isGuest ? colors.surfaceTertiary : preferences[row.id] ? colors.surface : colors.surfaceSecondary}
                />
              </View>
            </View>
          ))}
        </View>
        {saving && <Text style={styles.saveText}>{t("notifications.saving")}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {isGuest && (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="notifications-guest-footer-signin-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1, backgroundColor: colors.surface },
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
  guestBannerSpacing: { marginBottom: spacing.lg },
  disabledControl: { opacity: 0.6 },
});
