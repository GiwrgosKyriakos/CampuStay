import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useMatches, matchesStore } from "@/src/store/matches";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const matches = useMatches();

  return (
    <View style={styles.container} testID="matches-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.subtitle}>
          {matches.length > 0
            ? `${matches.length} roommate${matches.length > 1 ? "s" : ""} you liked`
            : "People you like will show up here"}
        </Text>
      </View>

      {matches.length === 0 ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptySub}>Start swiping to find your future flatmate!</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {matches.map((p) => (
            <View key={p.id} style={styles.card} testID={`match-card-${p.id}`}>
              <Image source={{ uri: p.photo }} style={styles.photo} contentFit="cover" transition={150} />
              <LinearGradient
                colors={["transparent", "rgba(26,26,26,0.9)"]}
                locations={[0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
              <Pressable
                style={styles.removeBtn}
                onPress={() => matchesStore.remove(p.id)}
                testID={`match-remove-${p.id}`}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors.onSurface} />
              </Pressable>
              <View style={styles.cardBody}>
                <Text style={styles.name}>
                  {p.name}, {p.age}
                </Text>
                <Text style={styles.meta}>{p.university}</Text>
                <View style={styles.budgetPill}>
                  <Ionicons name="wallet-outline" size={13} color={colors.onBrand} />
                  <Text style={styles.budgetText}>
                    {CURRENCY}
                    {p.budget}/mo
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "47.5%",
    aspectRatio: 0.74,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  removeBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md, gap: 4 },
  name: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurfaceInverse },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.85)" },
  budgetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,230,118,0.25)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  budgetText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary, textAlign: "center" },
});
