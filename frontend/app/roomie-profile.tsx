import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { QUIZ_SECTIONS, TOTAL_QUESTIONS } from "@/src/data/quiz";
import { getUserId } from "@/src/utils/userId";
import { getRoomieProfile, saveRoomieProfile } from "@/src/api/roomieProfile";

export default function RoomieProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = await getUserId();
        const data = await getRoomieProfile(id);
        if (mounted) {
          setUserId(id);
          setAnswers(data.answers ?? {});
        }
      } catch {
        // network/back-end unavailable — start with empty answers
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const select = useCallback((qid: string, idx: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: idx }));
  }, []);

  const handleBack = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (userId) await saveRoomieProfile(userId, answers);
    } catch {
      // swallow — still navigate back
    } finally {
      router.back();
    }
  }, [answers, userId, saving, router]);

  const answeredCount = Object.keys(answers).length;

  return (
    <View style={styles.container} testID="roomie-profile-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Roomie Profile</Text>
            <Text style={styles.subtitle}>
              {answeredCount}/{TOTAL_QUESTIONS} answered
            </Text>
          </View>
          <Pressable style={styles.backBtn} onPress={handleBack} testID="roomie-back-button" hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.onSurface} />
            ) : (
              <>
                <Text style={styles.backText}>Back</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurface} />
              </>
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center} testID="roomie-loading">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing["3xl"] }]}
          showsVerticalScrollIndicator={false}
        >
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
                    const selected = answers[q.id] === idx;
                    return (
                      <Pressable
                        key={idx}
                        style={[styles.option, selected && styles.optionSelected]}
                        onPress={() => select(q.id, idx)}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary, marginTop: 2 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 76,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  backText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
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
});
