import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AiServiceError, fetchShowingFeedbackSentiment, type FeedbackSentimentAnalysis } from "@/src/services/aiFeatureService";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

type FeedbackSentimentCardProps = {
  apartmentId: string;
  feedbackCount?: number;
  refreshKey?: number;
};

export default function FeedbackSentimentCard({ apartmentId, feedbackCount, refreshKey = 0 }: FeedbackSentimentCardProps) {
  const { colors } = useTheme();
  const [result, setResult] = useState<FeedbackSentimentAnalysis | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const nextAllowedRequest = useRef(0);

  const refresh = async () => {
    if (isLoading || Date.now() < nextAllowedRequest.current) return;
    nextAllowedRequest.current = Date.now() + 3000;
    setIsLoading(true);
    setErrorText(null);
    try {
      setResult(await fetchShowingFeedbackSentiment(apartmentId));
    } catch (error) {
      setErrorText(error instanceof AiServiceError ? error.message : "Δεν ήταν δυνατή η ανάλυση των σχολίων.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [apartmentId, refreshKey]);

  const sentimentColor = result?.overallSentiment === "positive" ? colors.success : result?.overallSentiment === "negative" ? colors.error : colors.warning;
  const hasFeedback = typeof feedbackCount !== "number" || feedbackCount > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="feedback-sentiment-card">
      <View style={styles.headerRow}>
        <View style={styles.titleRow}><Ionicons name="analytics-outline" size={20} color={colors.brand} /><Text style={[styles.title, { color: colors.onSurface }]}>Ανάλυση σχολίων υποδείξεων</Text></View>
        <Pressable onPress={() => void refresh()} disabled={isLoading} hitSlop={8} accessibilityLabel="Ανανέωση ανάλυσης συναισθήματος">
          {isLoading ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="refresh-outline" size={20} color={colors.onSurfaceTertiary} />}
        </Pressable>
      </View>

      {isLoading && !result ? (
        <View style={styles.loadingBlock} testID="sentiment-loading">
          <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceTertiary }]} />
          <View style={[styles.skeletonLineShort, { backgroundColor: colors.surfaceTertiary }]} />
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : errorText ? (
        <View style={styles.errorBlock} testID="sentiment-error">
          <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
          <Pressable style={[styles.retryButton, { borderColor: colors.error }]} onPress={() => void refresh()} disabled={isLoading}><Text style={[styles.retryText, { color: colors.error }]}>Επανάληψη</Text></Pressable>
        </View>
      ) : !hasFeedback ? (
        <View style={styles.emptyBlock} testID="sentiment-empty"><Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.onSurfaceTertiary} /><Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν έχουν καταγραφεί ακόμα σχόλια για αυτό το ακίνητο.</Text></View>
      ) : result ? (
        <View style={styles.content}>
          <View style={[styles.sentimentBadge, { backgroundColor: sentimentColor }]}><Text style={[styles.sentimentBadgeText, { color: colors.onBrand }]}>{result.overallSentiment === "positive" ? "Θετική εικόνα" : result.overallSentiment === "negative" ? "Αρνητική εικόνα" : "Ουδέτερη εικόνα"}</Text></View>
          <View style={styles.columns}>
            <View style={styles.column}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Δυνατά σημεία</Text>{result.positivePoints.length > 0 ? result.positivePoints.map((point) => <Text key={`positive-${point}`} style={[styles.item, { color: colors.onSurfaceTertiary }]}>+ {point}</Text>) : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν αναφέρθηκαν.</Text>}</View>
            <View style={styles.column}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Σημεία τριβής</Text>{result.frictionPoints.length > 0 ? result.frictionPoints.map((point) => <Text key={`friction-${point}`} style={[styles.item, { color: colors.onSurfaceTertiary }]}>- {point}</Text>) : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν αναφέρθηκαν.</Text>}</View>
          </View>
          {result.recurringPatterns.length > 0 ? <View style={styles.patterns}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Επαναλαμβανόμενα μοτίβα</Text>{result.recurringPatterns.map((pattern) => <View key={pattern.issue} style={styles.pattern}><View style={styles.patternHeader}><Text style={[styles.item, { color: colors.onSurface }]}>{pattern.issue}</Text><Text style={[styles.percentage, { color: colors.brand }]}>{Math.round(pattern.frequencyPercentage)}%</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceTertiary }]}><View style={[styles.progress, { width: `${Math.min(100, Math.max(0, pattern.frequencyPercentage))}%`, backgroundColor: colors.brand }]} /></View></View>)}</View> : null}
          {result.priceAdjustmentRecommendation ? <View style={[styles.recommendation, { backgroundColor: colors.brandTertiary, borderColor: colors.brand }]}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Πρόταση προσαρμογής τιμής</Text><Text style={[styles.recommendationValue, { color: colors.brand }]}>{result.priceAdjustmentRecommendation.suggestedReductionPercent}% μείωση</Text><Text style={[styles.item, { color: colors.onSurface }]}>{result.priceAdjustmentRecommendation.justification}</Text></View> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.base },
  content: { gap: spacing.md },
  loadingBlock: { minHeight: 130, justifyContent: "center", alignItems: "center", gap: spacing.md },
  skeletonLine: { width: "65%", height: 16, borderRadius: radius.sm },
  skeletonLineShort: { width: "42%", height: 12, borderRadius: radius.sm },
  errorBlock: { alignItems: "flex-start", gap: spacing.sm },
  errorText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19 },
  retryButton: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  retryText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  emptyBlock: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  emptyText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19 },
  sentimentBadge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sentimentBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  columns: { flexDirection: "row", gap: spacing.md },
  column: { flex: 1, gap: spacing.xs },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  item: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  patterns: { gap: spacing.sm },
  pattern: { gap: spacing.xs },
  patternHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  percentage: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  track: { height: 7, borderRadius: radius.pill, overflow: "hidden" },
  progress: { height: "100%", borderRadius: radius.pill },
  recommendation: { borderLeftWidth: 3, borderRadius: radius.sm, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  recommendationValue: { fontFamily: fonts.bold, fontSize: fontSize.lg },
});
