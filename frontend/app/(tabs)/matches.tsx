import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useMatches } from "@/src/store/matches";

const TAB_BAR_SPACE = 100;

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
            <Ionicons name="chatbubbles-outline" size={42} color={colors.onBrandTertiary} />
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
            <Pressable
              key={p.id}
              style={styles.row}
              testID={`chat-row-${p.id}`}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: p.id } })}
            >
              <Image source={{ uri: p.photo }} style={styles.avatar} contentFit="cover" transition={150} />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.rowMsg} numberOfLines={1}>
                  Hey there! 👋
                </Text>
              </View>
              <Ionicons name="paper-plane-outline" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
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
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: { width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  rowText: { flex: 1, gap: 3 },
  rowName: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  rowMsg: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
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
