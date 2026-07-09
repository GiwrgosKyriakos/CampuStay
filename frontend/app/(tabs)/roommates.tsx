import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";
import SwipeDeck, { SwipeDeckHandle } from "@/src/components/SwipeDeck";
import FilterSheet, { Filters, DEFAULT_FILTERS } from "@/src/components/FilterSheet";
import { getUserId } from "@/src/utils/userId";
import { getCandidateMatchRecords, postSwipe, resetDislikedSwipes } from "@/src/api/discover";
import { getUserProfile } from "@/src/api/userProfile";
import { useAuth } from "@/src/context/auth";
import { db, firebaseAuth } from "@/src/config/firebase";
import { t } from "@/src/locales";
import { registerForPushNotificationsAsync } from "@/src/utils/notificationService";
import { calculateMatchScore } from "@/src/utils/matchAlgorithm";
import type { CompatibilityQuiz, CompatibilityQuizAnswers, UserProfile as MatchUserProfile } from "@/src/utils/matchAlgorithm";

const CURRENCY = "€";
const TAB_BAR_SPACE = 84;

function normalizeMatchGender(gender: string | null | undefined): MatchUserProfile["gender"] {
  if (gender === "Male" || gender === "Female" || gender === "Prefer Not To Say") return gender;
  return "Prefer Not To Say";
}

function buildCompatibilityQuiz(answers: Record<string, string>): CompatibilityQuizAnswers {
  const quiz: CompatibilityQuizAnswers = {};

  (Object.keys(answers) as (keyof CompatibilityQuiz)[]).forEach((key) => {
    const value = answers[key];
    if (typeof value === "string" && value.trim().length > 0) {
      quiz[key] = value as CompatibilityQuiz[typeof key];
    }
  });

  return quiz;
}

function toMatchProfile(
  userId: string,
  profile: { city?: string | null; budget?: number | null; gender?: string | null },
  answers: Record<string, string>,
): MatchUserProfile {
  return {
    uid: userId,
    city: profile.city?.trim() || "",
    gender: normalizeMatchGender(profile.gender),
    monthlyBudget: typeof profile.budget === "number" ? profile.budget : 0,
    quiz: buildCompatibilityQuiz(answers),
  };
}

function toScoredCandidate(candidate: RoommateProfile, matchScore: number): RoommateProfile {
  return {
    ...candidate,
    matchScore,
  };
}

export default function RoommatesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

useEffect(() => {
  const setupNotifications = async () => {
    if (!firebaseAuth.currentUser) {
      console.log('[Notifications] No authenticated user yet.');
      return;
    }

    const token = await registerForPushNotificationsAsync();

    if (token) {
      try {
        const userDocRef = doc(db, 'users', firebaseAuth.currentUser.uid);
        await updateDoc(userDocRef, {
          expoPushToken: token,
        });
        console.log('[Notifications] Push token saved to Firestore.');
      } catch (error) {
        console.error('[Notifications] Failed saving push token to Firestore:', error);
      }
    }
  };

  setupNotifications();
}, []);


  const load = useCallback(async () => {
    try {
      setLoading(true);
      const uid = auth.isGuest ? "guest" : await getUserId();
      userIdRef.current = uid;

      const [profile, quizSnap] = await Promise.all([
        auth.isGuest ? Promise.resolve(null) : getUserProfile(uid).catch(() => null),
        auth.isGuest ? Promise.resolve(null) : getDoc(doc(db, "quiz_answers", uid)).catch(() => null),
      ]);

      const candidateRecords = await getCandidateMatchRecords(uid, profile?.city ?? null).catch(() => []);

      const quizData = quizSnap?.exists() ? (quizSnap.data() as { answers?: Record<string, string> }) : null;
      const currentMatchProfile = toMatchProfile(uid, profile ?? {}, quizData?.answers ?? {});

      const scoredCandidates = candidateRecords
        .map(({ profile: candidateProfile, quizAnswers }) => {
          const candidateMatchProfile = toMatchProfile(candidateProfile.id, candidateProfile, quizAnswers);
          const matchScore = calculateMatchScore(currentMatchProfile, candidateMatchProfile);

          return toScoredCandidate(candidateProfile, matchScore);
        })
        .sort((left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0));

      setCandidates(scoredCandidates);
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

      if (!auth.userId) {
        setQuizAnsweredCount(0);
        return;
      }

      const ref = doc(db, "quiz_answers", auth.userId);
      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const data = snapshot.exists() ? (snapshot.data() as { answers?: Record<string, string> }) : null;
          setQuizAnsweredCount(Object.keys(data?.answers ?? {}).length);
        },
        () => {
          setQuizAnsweredCount(0);
        },
      );

      return () => {
        unsubscribe();
      };
    }, [auth.isGuest, auth.userId]),
  );

  const filtered = useMemo(
    () =>
      candidates
        .filter(
          (p) =>
            (filters.gender === "all" ||
              (filters.gender === "female" && p.gender === "Female") ||
              (filters.gender === "male" && p.gender === "Male") ||
              (filters.gender === "nonBinary" && p.gender === "Non-binary")) &&
            p.age >= filters.ageMin &&
            p.age <= filters.ageMax &&
            p.budget <= filters.budgetMax,
        )
        .sort((left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0)),
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

  const handleDeckReset = useCallback(async () => {
    const uid = userIdRef.current;
    if (!auth.isGuest && uid) {
      await resetDislikedSwipes(uid);
    }
    await load();
  }, [auth.isGuest, load]);

  const press = (action: "left" | "right") => {
    Haptics.selectionAsync();
    triggerActionFeedback(action);
    if (action === "right") deckRef.current?.swipeRight();
    else deckRef.current?.swipeLeft();
  };

  return (
    <View style={styles.container} testID="roommates-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brand}>
              {t("common.brandPrefix")}<Text style={styles.brandAccent}>{t("common.brandSuffix")}</Text>
            </Text>
          </View>
          {quizAnsweredCount === 0 && (
            <Pressable
              style={styles.quizPill}
              onPress={() => router.push("/roomie-profile")}
              testID="roommates-quiz-pill"
            >
              <Text style={styles.quizPillText}>{t("roommates.quiz")}</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={styles.filterPill} onPress={openSheet} testID="filter-open-button">
          <Text style={styles.filterText}>{t("roommates.preferences")}</Text>
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
            ///onSwipeAction={ActionFeedbacktrigger}
            onEmptyReset={handleDeckReset}
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
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandTextWrap: { flex: 1 },
  brand: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  brandAccent: { color: colors.brand },
  quizPill: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  quizPillText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
  filterPill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
  filterText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurfaceInverse },
  deckArea: { flex: 1, marginHorizontal: spacing.lg },
  actions: { flexDirection: "row", justifyContent: "center", gap: spacing.xl, paddingVertical: spacing.md },
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
