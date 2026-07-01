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
    [auth.userId],
  );

  const toggleVisibility = useCallback(
    (value: boolean) => {
      persistPrivacy({ ...privacy, is_visible: value });
    },
    [privacy, persistPrivacy],
  );

  const unblockProfile = useCallback(
    (id: string) => {
      const nextPrivacy = {
        ...privacy,
        blocked_profiles: privacy.blocked_profiles.filter((p) => p.id !== id),
      };
      persistPrivacy(nextPrivacy);
    },
    [privacy, persistPrivacy],
  );

  if (auth.isLoading || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (auth.isGuest) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + spacing.lg }]}> 
        <Text style={styles.guestText}>Privacy settings are not available in Guest Mode.</Text>
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
      testID="privacy-safety-screen"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Privacy & Safety</Text>
        <Text style={styles.subtitle}>Control who sees your profile and manage blocked accounts.</Text>
      </View>
      <Text style={styles.subtitle}>Control who sees your profile and manage blocked accounts.</Text>

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
              <Pressable style={styles.unblockButton} onPress={() => unblockProfile(profile.id)} testID={`unblock-${profile.id}`}>
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
  unblockText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrand },
  saveText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brand, marginTop: spacing.sm, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginTop: spacing.sm, textAlign: "center" },
  guestText: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface, textAlign: "center" },
  guestButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  guestButtonText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
