import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { QUIZ_SECTIONS, TOTAL_QUESTIONS } from "@/src/data/quiz";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";

export default function RoomieProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const guestLocked = auth.isGuest;

  useEffect(() => {
    if (guestLocked) {
      setUserId(null);
      setAnswers({});
      setLoading(false);
      return;
    }

    if (!auth.userId) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setUserId(auth.userId);
    const ref = doc(db, "quiz_answers", auth.userId);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as { answers?: Record<string, string> }) : null;
        setAnswers(data?.answers ?? {});
        setLoading(false);
      },
      () => {
        // If listener fails, render fallback state rather than blocking the screen.
        setAnswers({});
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [auth.userId, guestLocked]);

  const select = useCallback((qid: string, selectedOption: string) => {
    if (guestLocked) return;

    // Optimistic local update so UI reflects selection immediately, then persist in background.
    setAnswers((prev) => {
      const updatedAnswers = { ...prev, [qid]: selectedOption };

      if (userId) {
        void setDoc(
          doc(db, "quiz_answers", userId),
          {
            answers: updatedAnswers,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch((err) => {
          console.error("[RoomieProfile] Failed to persist quiz answer:", err);
        });
      }

      return updatedAnswers;
    });
  }, [guestLocked, userId]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const answeredCount = Object.keys(answers).length;
  const progressPct = Math.min(100, Math.round((answeredCount / TOTAL_QUESTIONS) * 100));

  return (
    <View style={styles.container} testID="roomie-profile-screen">
      <View style={[styles.stickyHeader, { paddingTop: insets.top + spacing.sm }]}> 
        <View style={styles.headerRow}>
          <View style={[styles.headerSide, styles.headerLeft]}>
            <Pressable style={styles.backBtn} onPress={handleBack} testID="roomie-back-button" hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>Roomie Profile</Text>
          </View>

          <View style={[styles.headerSide, styles.headerRight]}>
            <Text style={styles.counter}>{answeredCount}/{TOTAL_QUESTIONS} answered</Text>
          </View>
        </View>

        <View style={styles.progressTrack} testID="roomie-progress-track">
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} testID="roomie-progress-fill" />
        </View>
      </View>

      {loading ? (
        <View style={styles.center} testID="roomie-loading">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing["5xl"] }]}
            showsVerticalScrollIndicator={false}
          >
            {guestLocked && (
              <GuestModeTopBanner
                onPress={() => router.push("/auth-landing")}
                testID="roomie-guest-notice"
                buttonTestID="roomie-top-signin-button"
                style={styles.guestTopBannerSpacing}
              />
            )}

            {QUIZ_SECTIONS.map((section) => (
              <View key={section.category} style={styles.section}>
                <View style={styles.categoryRow}>
                  <View style={styles.categoryDot} />
                  <Text style={styles.category}>{section.category}</Text>
                </View>
                {section.questions.map((q) => (
                  <View key={q.id} style={styles.questionBlock} testID={`question-${q.id}`}>
                    <Text style={styles.question}>
                      {q.emoji}  {q.question}
                    </Text>
                    {q.options.map((opt, idx) => {
                      const selected = answers[q.id] === opt;
                      return (
                        <Pressable
                          key={idx}
                          style={[styles.option, selected && styles.optionSelected, guestLocked && styles.optionDisabled]}
                          onPress={guestLocked ? undefined : () => select(q.id, opt)}
                          disabled={guestLocked}
                          testID={`option-${q.id}-${idx}`}
                        >
                          <View style={[styles.radio, selected && styles.radioSelected]}>
                            {selected && <View style={styles.radioInner} />}
                          </View>
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          {guestLocked && (
            <GuestModeStickyFooter
              onPress={() => router.push("/auth-landing")}
              bottomInset={insets.bottom}
              buttonTestID="roomie-signin-button"
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stickyHeader: {
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    minHeight: 52,
  },
  headerSide: { width: 120 },
  headerLeft: { alignItems: "flex-start" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerRight: { alignItems: "flex-end" },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  counter: { fontFamily: fonts.displayExtra, fontSize: fontSize.base, color: colors.onSurface },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brand,
  },
  scroll: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  categoryDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  category: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 1 },
  questionBlock: { gap: spacing.sm },
  question: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 24, marginBottom: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  optionDisabled: { opacity: 0.45 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.onSurfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.onBrandTertiary },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.onBrandTertiary },
  optionText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface },
  optionTextSelected: { fontFamily: fonts.semibold, color: colors.onBrandTertiary },
  guestTopBannerSpacing: {
    marginBottom: spacing.sm,
  },
});
