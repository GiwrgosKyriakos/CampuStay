import React, { useMemo, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";
import SwipeDeck, { SwipeDeckHandle } from "@/src/components/SwipeDeck";
import FilterSheet, { Filters, DEFAULT_FILTERS } from "@/src/components/FilterSheet";
import { getUserId } from "@/src/utils/userId";
import { getCandidates, postSwipe } from "@/src/api/discover";
import { getRoomieProfile } from "@/src/api/roomieProfile";
import { useAuth } from "@/src/context/auth";

const CURRENCY = "€";
const TAB_BAR_SPACE = 84;
const TOTAL_QUESTIONS_PLACEHOLDER = 15;

export default function RoommatesScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const userIdRef = useRef<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeAction, setActiveAction] = useState<"left" | "right" | null>(null);
  const [candidates, setCandidates] = useState<RoommateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizAnsweredCount, setQuizAnsweredCount] = useState(0);
  const actionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const uid = auth.isGuest ? "guest" : await getUserId();
      userIdRef.current = uid;
      const list = await getCandidates(uid);
      setCandidates(list);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [auth.isGuest]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        if (actionTimeout.current) clearTimeout(actionTimeout.current);
      };
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.isGuest) {
        setQuizAnsweredCount(0);
        return;
      }

      let mounted = true;
      (async () => {
        try {
          const uid = await getUserId();
          const quiz = await getRoomieProfile(uid).catch(() => ({ answers: {} }));
          if (mounted) setQuizAnsweredCount(Object.keys(quiz.answers ?? {}).length);
        } catch {
          if (mounted) setQuizAnsweredCount(0);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [auth.isGuest]),
  );

  const filtered = useMemo(
    () =>
      candidates.filter(
        (p) =>
          (filters.gender === "All" || p.gender === filters.gender) &&
          p.age >= filters.ageMin &&
          p.age <= filters.ageMax &&
          p.budget <= filters.budgetMax,
      ),
    [candidates, filters],
  );

  const deckKey = `${filters.gender}-${filters.ageMin}-${filters.ageMax}-${filters.budgetMax}-${candidates.length}`;

  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const handleFiltersChange = useCallback((nextFilters: Filters) => {
    setFilters(nextFilters);
  }, []);

  const onLike = useCallback((p: RoommateProfile) => {
    if (auth.isGuest) return;
    if (userIdRef.current) postSwipe(userIdRef.current, p.id, "right");
  }, [auth.isGuest]);
  const onNope = useCallback((p: RoommateProfile) => {
    if (auth.isGuest) return;
    if (userIdRef.current) postSwipe(userIdRef.current, p.id, "left");
  }, [auth.isGuest]);

  const triggerActionFeedback = useCallback((action: "left" | "right") => {
    setActiveAction(action);
    if (actionTimeout.current) clearTimeout(actionTimeout.current);
    actionTimeout.current = setTimeout(() => setActiveAction(null), 220);
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
        <View style={styles.brandRow}>
          <Text style={styles.brand}>
            Roomie<Text style={{ color: colors.brand }}>Swipe</Text>
          </Text>
          {quizAnsweredCount === 0 && (
            <Pressable
              style={styles.quizPill}
              onPress={() => router.push("/roomie-profile")}
              testID="roommates-quiz-pill"
            >
              <Text style={styles.quizPillText}>Quiz</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={styles.filterPill} onPress={openSheet} testID="filter-open-button">
          <Text style={styles.filterText}>Roomate Preferences</Text>
        </Pressable>
      </View>

      <View style={styles.deckArea}>
        {loading ? (
          <View style={styles.center} testID="deck-loading">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <SwipeDeck
            key={deckKey}
            ref={deckRef}
            profiles={filtered}
            currency={CURRENCY}
            onLike={onLike}
            onNope={onNope}
            onSwipeAction={triggerActionFeedback}
            onEmptyReset={load}
          />
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, activeAction === "left" && styles.actionBtnActive]}
          onPress={() => press("left")}
          testID="nope-button"
        >
          <Ionicons name="close" size={32} color={activeAction === "left" ? colors.brand : colors.onBrand} />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, activeAction === "right" && styles.actionBtnActive]}
          onPress={() => press("right")}
          testID="like-button"
        >
          <Ionicons name="heart" size={30} color={activeAction === "right" ? colors.brand : colors.onBrand} />
        </Pressable>
      </View>

      <View style={{ height: TAB_BAR_SPACE + insets.bottom }} />

      <FilterSheet
        current={filters}
        currency={CURRENCY}
        visible={sheetVisible}
        onChange={handleFiltersChange}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brand: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  quizPill: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  quizPillText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  filterPill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
  filterText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurfaceInverse },
  deckArea: { flex: 1, marginHorizontal: spacing.lg },
  actions: { flexDirection: "row", justifyContent: "center", gap: spacing.xl, paddingVertical: spacing.lg },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  actionBtnActive: { backgroundColor: colors.muted },
});
