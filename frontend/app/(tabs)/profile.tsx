import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useMatches } from "@/src/store/matches";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;

const ME = {
  name: "Alex Mercer",
  age: 23,
  gender: "Non-binary",
  budget: 700,
  university: "TU Berlin",
  program: "MSc Data Science",
  photo:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&w=900&q=85",
};

const SETTINGS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "person-outline", label: "Edit profile" },
  { icon: "options-outline", label: "Roommate preferences" },
  { icon: "notifications-outline", label: "Notifications" },
  { icon: "shield-checkmark-outline", label: "Privacy & safety" },
  { icon: "help-circle-outline", label: "Help & support" },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const matches = useMatches();

  return (
    <View style={styles.container} testID="profile-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[styles.roomieWrap, { marginTop: insets.top + spacing.md }]}
          onPress={() => router.push("/roomie-profile")}
          testID="roomie-profile-row"
        >
          <LinearGradient
            colors={[colors.brand, colors.brandSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roomieCard}
          >
            <View style={styles.roomieIcon}>
              <Ionicons name="sparkles" size={22} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roomieTitle}>Roomie Profile</Text>
              <Text style={styles.roomieSub}>Complete your compatibility quiz</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.onBrand} />
          </LinearGradient>
        </Pressable>

        <View style={[styles.hero, { paddingTop: spacing.xl }]}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: ME.photo }} style={styles.avatar} contentFit="cover" />
            <Pressable style={styles.editBadge} testID="edit-photo-button">
              <Ionicons name="pencil" size={14} color={colors.onBrand} />
            </Pressable>
          </View>
          <Text style={styles.name}>
            {ME.name}, {ME.age}
          </Text>
          <Text style={styles.sub}>
            {ME.program} · {ME.university}
          </Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{matches.length}</Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{ME.gender}</Text>
            <Text style={styles.statLabel}>Gender</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>
              {CURRENCY}
              {ME.budget}
            </Text>
            <Text style={styles.statLabel}>Max budget</Text>
          </View>
        </View>

        <View style={styles.section}>
          {SETTINGS.map((s, i) => (
            <Pressable
              key={s.label}
              style={[styles.row, i < SETTINGS.length - 1 && styles.rowBorder]}
              testID={`setting-${s.label}`}
              onPress={s.label === "Edit profile" ? () => router.push("/edit-profile") : undefined}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={s.icon} size={20} color={colors.onSurface} />
              </View>
              <Text style={styles.rowLabel}>{s.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logout} testID="logout-button">
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  roomieWrap: { marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden" },
  roomieCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  roomieIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  roomieTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onBrand },
  roomieSub: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrand, opacity: 0.8 },
  hero: { alignItems: "center", paddingBottom: spacing.xl, gap: spacing.xs },
  avatarWrap: { marginBottom: spacing.sm },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.brand,
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.surface,
  },
  name: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  statLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  statDivider: { width: 1, height: 36, backgroundColor: colors.divider },
  section: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  logoutText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.error },
});
