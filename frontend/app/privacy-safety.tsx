import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "@/src/context/auth";
import { getUserSettings, saveUserPrivacy, PrivacyPreferences } from "@/src/api/accountSettings";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { t } from "@/src/locales";

const STICKY_FOOTER_PADDING = 152;

export default function PrivacySafetyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isGuest = auth.isGuest;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacyPreferences>({
    is_visible: true,
    blocked_profiles: [],
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
        setPrivacy(settings.privacy);
      } catch {
        if (!active) return;
        setError(t("privacySafety.errors.load"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isGuest, auth.userId]);

  const persistPrivacy = useCallback(
    async (nextPrivacy: PrivacyPreferences) => {
      if (isGuest) return;
      setPrivacy(nextPrivacy);
      setSaving(true);
      setError(null);
      try {
        if (!auth.userId) return;
        await saveUserPrivacy(auth.userId, nextPrivacy);
      } catch {
        setError(t("privacySafety.errors.save"));
      } finally {
        setSaving(false);
      }
    },
    [isGuest, auth.userId],
  );

  const toggleVisibility = useCallback(
    (value: boolean) => {
      if (isGuest) return;
      persistPrivacy({ ...privacy, is_visible: value });
    },
    [isGuest, privacy, persistPrivacy],
  );

  const unblockProfile = useCallback(
    (id: string) => {
      if (isGuest) return;
      const nextPrivacy = {
        ...privacy,
        blocked_profiles: privacy.blocked_profiles.filter((p) => p.id !== id),
      };
      persistPrivacy(nextPrivacy);
    },
    [isGuest, privacy, persistPrivacy],
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
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + (auth.isGuest ? STICKY_FOOTER_PADDING : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        testID="privacy-safety-screen"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("privacySafety.title")}</Text>
          <Text style={styles.subtitle}>{t("privacySafety.subtitle")}</Text>
        </View>

        {auth.isGuest && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="privacy-guest-readonly-banner"
            buttonTestID="privacy-guest-top-signin-button"
            style={styles.guestBannerSpacing}
          />
        )}

        <View style={styles.toggleCard}>
          <View style={styles.toggleHeader}>
            <View style={styles.iconWrap}>
              <Ionicons name="eye-outline" size={20} color={colors.onSurface} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>{t("privacySafety.visibilityTitle")}</Text>
              <Text style={styles.toggleSubtitle}>{t("privacySafety.visibilityHelp")}</Text>
            </View>
          </View>
          <View style={isGuest ? styles.disabledControl : undefined}>
            <Switch
              value={privacy.is_visible}
              onValueChange={toggleVisibility}
              disabled={isGuest}
              trackColor={{ false: isGuest ? colors.border : colors.surfaceSecondary, true: isGuest ? colors.onSurfaceTertiary : colors.brand }}
              thumbColor={isGuest ? colors.surfaceTertiary : privacy.is_visible ? colors.surface : colors.surfaceSecondary}
            />
          </View>
        </View>

        <View style={styles.settingsList}>
          <Pressable
            style={styles.settingsRow}
            onPress={() => WebBrowser.openBrowserAsync("https://giwrgoskyriakos.github.io/CampuStay/privacy.html")}
            testID="privacy-policy-link"
          >
            <View style={styles.settingsRowIcon}>
              <Ionicons name="document-text-outline" size={20} color={colors.onSurface} />
            </View>
            <Text style={styles.settingsRowLabel}>{t("common.labels.privacyPolicy")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>{t("privacySafety.blockedTitle")}</Text>
          {privacy.blocked_profiles.length === 0 ? (
            <Text style={styles.blockedEmpty}>{t("privacySafety.blockedEmpty")}</Text>
          ) : (
            privacy.blocked_profiles.map((profile) => (
              <View key={profile.id} style={styles.blockedRow} testID={`blocked-profile-${profile.id}`}>
                <View>
                  <Text style={styles.blockedName}>{profile.name}</Text>
                  <Text style={styles.blockedId}>{profile.id}</Text>
                </View>
                <Pressable
                  style={[styles.unblockButton, isGuest && styles.unblockButtonDisabled]}
                  onPress={() => unblockProfile(profile.id)}
                  disabled={isGuest}
                  testID={`unblock-${profile.id}`}
                >
                  <Text style={styles.unblockText}>{t("common.actions.unblock")}</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
        {saving && <Text style={styles.saveText}>{t("privacySafety.saving")}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {auth.isGuest && (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="privacy-guest-footer-signin-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  contentContainer: { minHeight: "100%", paddingHorizontal: spacing.lg },
  header: { marginBottom: spacing.xl },
  container: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, marginBottom: spacing.lg },
  toggleCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  toggleHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: { flex: 1 },
  toggleTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  toggleSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 6 },
  settingsList: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  settingsRowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  blockedCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  blockedTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface, marginBottom: spacing.sm },
  blockedEmpty: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  blockedName: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  blockedId: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  unblockButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unblockButtonDisabled: {
    opacity: 0.45,
  },
  disabledControl: { opacity: 0.6 },
  unblockText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrand },
  saveText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brand, marginTop: spacing.sm, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginTop: spacing.sm, textAlign: "center" },
  guestBannerSpacing: {
    marginBottom: spacing.lg,
  },
});
