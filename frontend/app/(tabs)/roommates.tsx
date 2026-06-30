import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { PROFILES } from "@/src/data/profiles";
import SwipeDeck, { SwipeDeckHandle } from "@/src/components/SwipeDeck";
import FilterSheet, { Filters, DEFAULT_FILTERS } from "@/src/components/FilterSheet";
import { matchesStore } from "@/src/store/matches";

const CURRENCY = "€";
const TAB_BAR_SPACE = 84;

export default function RoommatesScreen() {
  const insets = useSafeAreaInsets();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = useMemo(
    () =>
      PROFILES.filter(
        (p) =>
          (filters.gender === "All" || p.gender === filters.gender) &&
          p.age >= filters.ageMin &&
          p.age <= filters.ageMax &&
          p.budget <= filters.budgetMax,
      ),
    [filters],
  );

  const deckKey = `${filters.gender}-${filters.ageMin}-${filters.ageMax}-${filters.budgetMax}`;

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(filters.gender === "All" ? "Everyone" : filters.gender);
    parts.push(`${filters.ageMin}-${filters.ageMax}`);
    parts.push(`≤${CURRENCY}${filters.budgetMax}`);
    return parts.join(" · ");
  }, [filters]);

  const openSheet = useCallback(() => sheetRef.current?.present(), []);
  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    sheetRef.current?.dismiss();
  }, []);

  const onLike = useCallback((p: (typeof PROFILES)[number]) => matchesStore.add(p), []);
  const onNope = useCallback(() => {}, []);

  const press = (action: "left" | "right") => {
    Haptics.selectionAsync();
    if (action === "right") deckRef.current?.swipeRight();
    else deckRef.current?.swipeLeft();
  };

  return (
    <View style={styles.container} testID="roommates-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.brand}>
          Roomie<Text style={{ color: colors.brand }}>Swipe</Text>
        </Text>
        <Pressable style={styles.filterPill} onPress={openSheet} testID="filter-open-button">
          <Ionicons name="options-outline" size={18} color={colors.onSurface} />
          <Text style={styles.filterText} numberOfLines={1}>
            {filterSummary}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <View style={[styles.deckArea, { marginBottom: TAB_BAR_SPACE + insets.bottom }]}>
        <SwipeDeck
          key={deckKey}
          ref={deckRef}
          profiles={filtered}
          currency={CURRENCY}
          onLike={onLike}
          onNope={onNope}
        />
      </View>

      <View
        style={[styles.actions, { bottom: TAB_BAR_SPACE + insets.bottom - 28 }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={[styles.actionBtn, styles.nopeBtn]}
          onPress={() => press("left")}
          testID="nope-button"
        >
          <Ionicons name="close" size={32} color={colors.error} />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.likeBtn]}
          onPress={() => press("right")}
          testID="like-button"
        >
          <Ionicons name="heart" size={30} color={colors.onBrand} />
        </Pressable>
      </View>

      <FilterSheet ref={sheetRef} current={filters} currency={CURRENCY} onApply={applyFilters} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  brand: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    maxWidth: "92%",
  },
  filterText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  deckArea: { flex: 1, marginHorizontal: spacing.lg },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  nopeBtn: { borderWidth: 2, borderColor: colors.error },
  likeBtn: { backgroundColor: colors.brand },
});
