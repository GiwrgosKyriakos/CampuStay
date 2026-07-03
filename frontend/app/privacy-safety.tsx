import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { getUserSettings, saveUserPrivacy, PrivacyPreferences } from "@/src/api/accountSettings";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

export default function PrivacySafetyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacyPreferences>({
    is_visible: true,
    blocked_profiles: [],
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
        setPrivacy(settings.privacy);
      } catch {
        if (!active) return;
        setError("Unable to load privacy preferences.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.userId]);

  const persistPrivacy = useCallback(
    async (nextPrivacy: PrivacyPreferences) => {
      if (auth.isGuest) return;
      setPrivacy(nextPrivacy);
      setSaving(true);
      setError(null);
      try {
        if (!auth.userId) return;
        await saveUserPrivacy(auth.userId, nextPrivacy);
      } catch {
        setError("Failed to update privacy settings.");
      } finally {
        setSaving(false);
      }
    },
    [auth.isGuest, auth.userId],
  );

  const toggleVisibility = useCallback(
    (value: boolean) => {
      if (auth.isGuest) return;
      persistPrivacy({ ...privacy, is_visible: value });
    },
    [auth.isGuest, privacy, persistPrivacy],
  );

  const unblockProfile = useCallback(
    (id: string) => {
      if (auth.isGuest) return;
      const nextPrivacy = {
        ...privacy,
        blocked_profiles: privacy.blocked_profiles.filter((p) => p.id !== id),
      };
      persistPrivacy(nextPrivacy);
    },
    [auth.isGuest, privacy, persistPrivacy],
  );

  if (auth.isLoading || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      testID="privacy-safety-screen"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Privacy & Safety</Text>
        <Text style={styles.subtitle}>Control who sees your profile and manage blocked accounts.</Text>
      </View>

      {auth.isGuest && (
        <View style={styles.guestReadOnlyBanner} testID="privacy-guest-readonly-banner">
          <Text style={styles.guestReadOnlyTitle}>Guest Mode: Read-only</Text>
          <Text style={styles.guestReadOnlyText}>
            You can view privacy settings, but changing preferences requires signing in.
          </Text>
        </View>
      )}

      <View style={styles.toggleCard}>
        <View style={styles.toggleHeader}>
          <View style={styles.iconWrap}>
            <Ionicons name="eye-outline" size={20} color={colors.onSurface} />
          </View>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Show my profile in the stack</Text>
            <Text style={styles.toggleSubtitle}>
              If turned off, your profile will not appear in other students&apos; Home screens.
            </Text>
          </View>
        </View>
        <Switch
          value={privacy.is_visible}
          onValueChange={toggleVisibility}
          disabled={auth.isGuest}
          trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
          thumbColor={privacy.is_visible ? colors.surface : colors.surfaceSecondary}
        />
      </View>

      <View style={styles.blockedCard}>
        <Text style={styles.blockedTitle}>Blocked Profiles</Text>
        {privacy.blocked_profiles.length === 0 ? (
          <Text style={styles.blockedEmpty}>You have not blocked any profiles.</Text>
        ) : (
          privacy.blocked_profiles.map((profile) => (
            <View key={profile.id} style={styles.blockedRow} testID={`blocked-profile-${profile.id}`}>
              <View>
                <Text style={styles.blockedName}>{profile.name}</Text>
                <Text style={styles.blockedId}>{profile.id}</Text>
              </View>
              <Pressable
                style={[styles.unblockButton, auth.isGuest && styles.unblockButtonDisabled]}
                onPress={() => unblockProfile(profile.id)}
                disabled={auth.isGuest}
                testID={`unblock-${profile.id}`}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      {saving && <Text style={styles.saveText}>Saving privacy settings…</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
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
  unblockText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrand },
  saveText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brand, marginTop: spacing.sm, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginTop: spacing.sm, textAlign: "center" },
  guestReadOnlyBanner: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  guestReadOnlyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onSurface },
  guestReadOnlyText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
});
