import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Pressable,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { useAuth } from "@/src/context/auth";
import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { getUserSettings, saveUserNotifications, type NotificationPreferences } from "@/src/api/accountSettings";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import ScreenHeader from "@/src/components/ScreenHeader";
import { t } from "@/src/locales";
import { db } from "@/src/config/firebase";
import { DEFAULT_BROKER_STAGNATION_SETTINGS, type BrokerStagnationSettings } from "@/src/constants/pipeline";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isGuest = auth.isGuest;
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  const visibleNotificationRows = auth.isBroker
    ? NOTIFICATION_ROWS.filter((row) => row.id !== "new_matches")
    : NOTIFICATION_ROWS;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    new_matches: true,
    direct_messages: true,
    app_updates_and_tips: true,
    mute_all_notifications: false,
    muted_chat_ids: [],
    unmuted_chat_overrides: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [brokerStagnationSettings, setBrokerStagnationSettings] = useState<BrokerStagnationSettings>(DEFAULT_BROKER_STAGNATION_SETTINGS);

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
        if (auth.isBroker) {
          const userSnapshot = await getDoc(doc(db, "users", auth.userId ?? ""));
          const stored = userSnapshot.exists() ? userSnapshot.data().brokerStagnationSettings as Partial<BrokerStagnationSettings> | undefined : undefined;
          setBrokerStagnationSettings({ ...DEFAULT_BROKER_STAGNATION_SETTINGS, ...stored });
        }
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

  const updateBrokerStagnationSettings = useCallback(async (patch: Partial<BrokerStagnationSettings>) => {
    if (!auth.userId) return;
    const next = { ...brokerStagnationSettings, ...patch };
    setBrokerStagnationSettings(next);
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, "users", auth.userId), { brokerStagnationSettings: next }, { merge: true });
      await setDoc(doc(db, "settings", auth.userId), { brokerStagnationSettings: next }, { merge: true });
    } catch (saveError) {
      console.error("[Notifications] Error saving broker stagnation settings:", saveError);
      setError(t("notifications.errors.save"));
    } finally {
      setSaving(false);
    }
  }, [auth.userId, brokerStagnationSettings]);

  if (auth.isLoading || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("notifications.title")}
        onBackPress={() => router.back()}
        backButtonTestID="notifications-back-button"
      />

      <KeyboardAwareScrollView
        style={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + (isGuest ? STICKY_FOOTER_PADDING : spacing.xl) },
        ]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        testID="notifications-screen"
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>{t("notifications.subtitle")}</Text>
          <Pressable style={styles.feedLink} onPress={() => router.push("/notification-feed" as never)} testID="open-notification-feed">
            <Ionicons name="notifications-outline" size={18} color={colors.brand} />
            <Text style={styles.feedLinkText}>Ιστορικό ειδοποιήσεων</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.brand} />
          </Pressable>
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
          {visibleNotificationRows.map((row) => (
            row.id === "new_matches" ? (
              !notLookingForRoommate && (
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
                      trackColor={{ false: isGuest ? colors.muted : colors.muted, true: isGuest ? colors.surfaceSecondary : colors.brand }}
                      thumbColor={isGuest ? colors.surface : preferences[row.id] ? colors.surface : colors.surface}
                    />
                  </View>
                </View>
              )
            ) : (
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
                    trackColor={{ false: isGuest ? colors.muted : colors.muted, true: isGuest ? colors.surfaceSecondary : colors.brand }}
                    thumbColor={isGuest ? colors.surface : preferences[row.id] ? colors.surface : colors.surface}
                  />
                </View>
              </View>
            )
          ))}
          {auth.isBroker ? <View style={styles.brokerSettingsSection} testID="broker-stagnation-settings"><Text style={styles.sectionTitle}>Προειδοποιήσεις Καθυστέρησης (Deal Stagnation)</Text><View style={styles.settingRow}><View style={styles.rowText}><Text style={styles.settingTitle}>Ενεργοποίηση ειδοποιήσεων καθυστέρησης</Text></View><Switch value={brokerStagnationSettings.stagnationAlertsEnabled} onValueChange={(value) => void updateBrokerStagnationSettings({ stagnationAlertsEnabled: value })} disabled={isGuest} /></View>{brokerStagnationSettings.stagnationAlertsEnabled ? <><View style={styles.inputRow}><Text style={styles.inputLabel}>Ώρα πρώτης ειδοποίησης</Text><TextInput value={brokerStagnationSettings.stagnationAlertStartTime} onChangeText={(value) => void updateBrokerStagnationSettings({ stagnationAlertStartTime: value.replace(/[^0-9:]/g, "").slice(0, 5) })} placeholder="11:00" placeholderTextColor={colors.onSurfaceTertiary} style={styles.timeInput} keyboardType="numbers-and-punctuation" testID="broker-stagnation-start-time" /></View><Text style={styles.inputLabel}>Συχνότητα ειδοποιήσεων</Text><View style={styles.intervalOptions}>{[15, 60].map((minutes) => <Pressable key={minutes} style={[styles.intervalOption, brokerStagnationSettings.stagnationAlertIntervalMinutes === minutes && { backgroundColor: colors.brand }]} onPress={() => void updateBrokerStagnationSettings({ stagnationAlertIntervalMinutes: minutes })} testID={`broker-stagnation-interval-${minutes}`}><Text style={[styles.intervalText, brokerStagnationSettings.stagnationAlertIntervalMinutes === minutes && { color: colors.onBrand }]}>{minutes === 15 ? "Κάθε 15 λεπτά" : "Κάθε 1 ώρα"}</Text></Pressable>)}</View></> : null}</View> : null}
        </View>
      </KeyboardAwareScrollView>

      <View
        style={[
          styles.bottomStatus,
          { bottom: insets.bottom + (isGuest ? STICKY_FOOTER_PADDING + spacing.sm : spacing.lg) },
        ]}
        pointerEvents="none"
      >
        {saving && <Text style={styles.saveText}>{t("notifications.saving")}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  contentContainer: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "center" },
  header: { marginTop: spacing.lg, marginBottom: spacing.xl, alignItems: "center" },
  centerBlock: { flex: 1, justifyContent: "center", gap: spacing.sm },
  container: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  feedLink: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  feedLinkText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.sm },
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
  bottomStatus: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  saveText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.brand,
    textAlign: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: "70%",
  },
  errorText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.error,
    textAlign: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    minWidth: "70%",
  },
  guestBannerSpacing: { marginBottom: spacing.lg },
  disabledControl: { opacity: 0.6 },
  brokerSettingsSection: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface, marginBottom: spacing.xs },
  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  inputLabel: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  timeInput: { minWidth: 82, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontFamily: fonts.semibold, textAlign: "center" },
  intervalOptions: { gap: spacing.xs },
  intervalOption: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  intervalText: { fontFamily: fonts.semibold, color: colors.onSurface },
});
