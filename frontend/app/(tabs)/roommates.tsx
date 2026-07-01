import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
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
  const [activeAction, setActiveAction] = useState<"left" | "right" | null>(null);
  const actionTimeout = useRef<NodeJS.Timeout | null>(null);

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

  const openSheet = useCallback(() => sheetRef.current?.present(), []);
  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    sheetRef.current?.dismiss();
  }, []);

  const onLike = useCallback((p: (typeof PROFILES)[number]) => matchesStore.add(p), []);
  const onNope = useCallback(() => {}, []);

  const triggerActionFeedback = useCallback((action: "left" | "right") => {
    setActiveAction(action);
    actionTimeout.current && clearTimeout(actionTimeout.current);
    actionTimeout.current = setTimeout(() => setActiveAction(null), 220);
  }, []);

  useEffect(() => {
    return () => {
      actionTimeout.current && clearTimeout(actionTimeout.current);
    };
  }, []);

  const press = (action: "left" | "right") => {
    Haptics.selectionAsync();
    triggerActionFeedback(action);
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
          <Text style={styles.filterText}>Roomate Preferences</Text>
        </Pressable>
      </View>

      <View style={styles.deckArea}>
        <SwipeDeck
          key={deckKey}
          ref={deckRef}
          profiles={filtered}
          currency={CURRENCY}
          onLike={onLike}
          onNope={onNope}
          onSwipeAction={triggerActionFeedback}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[
            styles.actionBtn,
            styles.nopeBtn,
            activeAction === "left" && styles.actionBtnActive,
          ]}
          onPress={() => press("left")}
          testID="nope-button"
        >
          <Ionicons
            name="close"
            size={32}
            color={activeAction === "left" ? colors.brand : colors.onBrand}
          />
        </Pressable>
        <Pressable
          style={[
            styles.actionBtn,
            styles.likeBtn,
            activeAction === "right" && styles.actionBtnActive,
          ]}
          onPress={() => press("right")}
          testID="like-button"
        >
          <Ionicons
            name="heart"
            size={30}
            color={activeAction === "right" ? colors.brand : colors.onBrand}
          />
        </Pressable>
      </View>

      <View style={{ height: TAB_BAR_SPACE + insets.bottom }} />

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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
  filterText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurfaceInverse },
  deckArea: { flex: 1, marginHorizontal: spacing.lg },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  actionBtnActive: {
    backgroundColor: "#78A3A8",
  },
  nopeBtn: {},
  likeBtn: {},
});
