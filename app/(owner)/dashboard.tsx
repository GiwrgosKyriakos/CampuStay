import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import type { FeedbackSentimentAnalysis } from "@/src/types/aiFeatures";

const mockSentiment: FeedbackSentimentAnalysis = {
  overallSentiment: "neutral",
  positivePoints: ["Καλή τοποθεσία", "Άνετη διαρρύθμιση", "Υψηλό ενδιαφέρον"],
  frictionPoints: ["Στάθμευση", "Μικρό μπάνιο", "Τιμή"],
  recurringPatterns: [
    { issue: "Έλλειψη Parking", frequencyPercentage: 68 },
    { issue: "Υψηλή Τιμή", frequencyPercentage: 52 },
    { issue: "Μικρό μπάνιο", frequencyPercentage: 35 },
  ],
  priceAdjustmentRecommendation: {
    suggestedReductionPercent: 6,
    justification: "Το ενδιαφέρον είναι καλό, αλλά η συχνότητα αναφοράς για parking και τιμή δείχνει ότι μια μικρή προσαρμογή θα βοηθήσει στη σύγκλιση μέσης προσφοράς.",
  },
};

const feedbackRows = [
  { rating: 5, sentiment: "positive", label: "Positive" },
  { rating: 4, sentiment: "neutral", label: "Neutral" },
  { rating: 2, sentiment: "friction", label: "Μικρό μπάνιο" },
  { rating: 5, sentiment: "positive", label: "Positive" },
];

export default function OwnerDashboardScreen() {
  const { colors } = useTheme();
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const sentimentColor = useMemo(() => {
    switch (mockSentiment.overallSentiment) {
      case "positive":
        return colors.success;
      case "negative":
        return colors.error;
      default:
        return colors.warning;
    }
  }, [colors]);

  const handleReport = async () => {
    setReportLoading(true);
    try {
      const html = `<html><body style="font-family: sans-serif; color: #17212b; padding: 24px"><h1>CampuStay Owner Activity Report</h1><p>Last 30 days</p><h2>Activity</h2><p>Views: 4,200<br/>Inquiries / Likes: 184<br/>Completed showings: 18</p><h2>Feedback sentiment</h2><p>Overall sentiment: ${mockSentiment.overallSentiment}</p><ul>${mockSentiment.recurringPatterns.map((pattern) => `<li>${pattern.issue}: ${pattern.frequencyPercentage}%</li>`).join("")}</ul><p>${mockSentiment.priceAdjustmentRecommendation?.justification ?? ""}</p></body></html>`;
      const result = await Print.printToFileAsync({ html });
      setReportGenerated(true);
      await Linking.openURL(result.uri);
    } catch {
      Alert.alert("Report unavailable", "The activity report could not be generated.");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.onSurface }]}>{t("ai.ownerReportTitle")}</Text>

      <View style={styles.metricGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
          <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Total Public Views</Text>
          <Text style={[styles.metricValue, { color: colors.onSurface }]}>4.2k</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
          <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Inquiries / Likes</Text>
          <Text style={[styles.metricValue, { color: colors.onSurface }]}>184</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
          <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Completed Showings</Text>
          <Text style={[styles.metricValue, { color: colors.onSurface }]}>18</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Showing Feedback Feed</Text>
        {feedbackRows.map((row, index) => (
          <View key={`${row.label}-${index}`} style={styles.feedRow}>
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }).map((_, starIndex) => (
                <Ionicons
                  key={starIndex}
                  name={starIndex < row.rating ? "star" : "star-outline"}
                  size={16}
                  color={row.sentiment === "friction" ? colors.warning : colors.brand}
                />
              ))}
            </View>
            <View style={[styles.sentimentBadge, { backgroundColor: row.sentiment === "friction" ? colors.warning : row.sentiment === "positive" ? colors.success : colors.surface, borderColor: colors.border }]}> 
              <Text style={[styles.sentimentBadgeText, { color: row.sentiment === "friction" ? colors.onBrand : colors.onSurface }]}>
                {row.sentiment === "friction" ? "🔴 Friction" : row.sentiment === "positive" ? "🟢 Positive" : "🟡 Neutral"}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>AI Sentiment Summary</Text>
        <View style={[styles.summaryPill, { backgroundColor: sentimentColor }]}>
          <Text style={[styles.summaryPillText, { color: colors.onBrand }]}>{mockSentiment.overallSentiment.toUpperCase()}</Text>
        </View>
        <Text style={[styles.summaryText, { color: colors.onSurface }]}>Dominant themes:</Text>
        {mockSentiment.recurringPatterns.map((pattern) => (
          <Text key={pattern.issue} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>
            • {pattern.issue}: {pattern.frequencyPercentage}% of visitors mention it.
          </Text>
        ))}

        {mockSentiment.priceAdjustmentRecommendation ? (
          <Text style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>
            Suggested price reduction: {mockSentiment.priceAdjustmentRecommendation.suggestedReductionPercent}%
          </Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.primaryButton, { backgroundColor: colors.brand }]}
        onPress={() => void handleReport()}
        disabled={reportLoading}
      >
        <Ionicons name={reportLoading ? "hourglass-outline" : "download-outline"} size={18} color={colors.onBrand} />
        <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{reportLoading ? "Generating..." : reportGenerated ? "Report Ready" : t("ai.sendReportToOwner")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "700" },
  metricGrid: { flexDirection: "row", gap: 12 },
  metricCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  metricLabel: { fontSize: 12, marginBottom: 8 },
  metricValue: { fontSize: 22, fontWeight: "700" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  feedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  starsRow: { flexDirection: "row", alignItems: "center" },
  sentimentBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  sentimentBadgeText: { fontSize: 12, fontWeight: "700" },
  summaryPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  summaryPillText: { fontSize: 11, fontWeight: "800" },
  summaryText: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  summaryItem: { marginTop: 4, fontSize: 13 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
});
