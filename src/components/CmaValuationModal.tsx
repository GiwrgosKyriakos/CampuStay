import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AiServiceError, fetchComparativeMarketAnalysis, type CmaAnalysisInput, type CmaAnalysisResult } from "@/src/services/aiFeatureService";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

type CmaValuationModalProps = CmaAnalysisInput & {
  visible: boolean;
  onClose: () => void;
};

const competitivenessLabels: Record<CmaAnalysisResult["marketCompetitiveness"], string> = {
  low: "Χαμηλή ανταγωνιστικότητα",
  fair: "Δίκαιη τιμή",
  high: "Υψηλή ανταγωνιστικότητα",
  overpriced: "Υπερτιμημένο",
};

export default function CmaValuationModal({ visible, onClose, apartmentId, targetPrice, area, sqm, rooms, floor }: CmaValuationModalProps) {
  const { colors } = useTheme();
  const [result, setResult] = useState<CmaAnalysisResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const nextAllowedRequest = useRef(0);

  const runAnalysis = async () => {
    if (isLoading || Date.now() < nextAllowedRequest.current) return;
    nextAllowedRequest.current = Date.now() + 3000;
    setIsLoading(true);
    setErrorText(null);
    try {
      setResult(await fetchComparativeMarketAnalysis({ apartmentId, targetPrice, area, sqm, rooms, floor }));
    } catch (error) {
      setErrorText(error instanceof AiServiceError ? error.message : "Δεν ήταν δυνατή η εκτίμηση της αξίας του ακινήτου.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setResult(null);
    setErrorText(null);
    void runAnalysis();
  }, [visible, apartmentId]);

  const badgeColor = result?.marketCompetitiveness === "overpriced"
    ? colors.error
    : result?.marketCompetitiveness === "high"
      ? colors.warning
      : result?.marketCompetitiveness === "fair"
        ? colors.success
        : colors.onSurfaceTertiary;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.onSurface }]}>AI Εκτίμηση Αξίας (CMA)</Text>
              <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{area || "Τοπική αγορά"}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} disabled={isLoading} accessibilityLabel="Κλείσιμο εκτίμησης">
              <Ionicons name="close-outline" size={26} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loadingBlock} testID="cma-loading">
              <ActivityIndicator color={colors.brand} size="large" />
              <View style={[styles.skeletonLine, { backgroundColor: colors.surfaceTertiary }]} />
              <View style={[styles.skeletonLineShort, { backgroundColor: colors.surfaceTertiary }]} />
              <Text style={[styles.loadingText, { color: colors.onSurfaceTertiary }]}>Ανάλυση συγκρίσιμων ακινήτων...</Text>
            </View>
          ) : errorText ? (
            <View style={[styles.errorBlock, { borderColor: colors.error, backgroundColor: colors.surfaceSecondary }]} testID="cma-error">
              <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>
              <Pressable style={[styles.retryButton, { borderColor: colors.error }]} onPress={() => void runAnalysis()} disabled={isLoading}>
                <Text style={[styles.retryText, { color: colors.error }]}>Επανάληψη</Text>
              </Pressable>
            </View>
          ) : result ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={[styles.priceCard, { backgroundColor: colors.brandTertiary, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.onSurfaceTertiary }]}>Προτεινόμενο εύρος τιμής</Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceCell}><Text style={[styles.priceCaption, { color: colors.onSurfaceTertiary }]}>Min</Text><Text style={[styles.priceValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.min.toLocaleString("el-GR")}</Text></View>
                  <View style={[styles.optimalCell, { borderColor: colors.brand }]}><Text style={[styles.priceCaption, { color: colors.brand }]}>Optimal</Text><Text style={[styles.optimalValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.optimal.toLocaleString("el-GR")}</Text></View>
                  <View style={styles.priceCell}><Text style={[styles.priceCaption, { color: colors.onSurfaceTertiary }]}>Max</Text><Text style={[styles.priceValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.max.toLocaleString("el-GR")}</Text></View>
                </View>
                <Text style={[styles.sqmValue, { color: colors.onSurfaceTertiary }]}>Εκτίμηση: €{result.pricePerSqmEstimate.toLocaleString("el-GR")} / τ.μ.</Text>
              </View>

              <View style={[styles.badge, { backgroundColor: badgeColor }]}><Ionicons name="analytics-outline" size={16} color={colors.onBrand} /><Text style={[styles.badgeText, { color: colors.onBrand }]}>{competitivenessLabels[result.marketCompetitiveness]}</Text></View>

              <View style={[styles.section, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Διαφοροποιητικά στοιχεία</Text>
                {result.keyDifferentiators.length > 0 ? result.keyDifferentiators.map((item) => <Text key={item} style={[styles.listItem, { color: colors.onSurfaceTertiary }]}>• {item}</Text>) : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν εντοπίστηκαν επιπλέον διαφοροποιητικά στοιχεία.</Text>}
              </View>

              <View style={[styles.insightBox, { borderColor: colors.brand, backgroundColor: colors.brandTertiary }]}>
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Εικόνα αγοράς</Text>
                <Text style={[styles.insightText, { color: colors.onSurface }]}>{result.marketInsightsSummary}</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  sheet: { maxHeight: "86%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  loadingBlock: { minHeight: 270, alignItems: "center", justifyContent: "center", gap: spacing.md },
  skeletonLine: { width: "80%", height: 18, borderRadius: radius.sm },
  skeletonLineShort: { width: "52%", height: 14, borderRadius: radius.sm },
  loadingText: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  errorBlock: { alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  errorText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20, textAlign: "center" },
  retryButton: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  retryText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  priceCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  cardLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  priceRow: { flexDirection: "row", alignItems: "stretch", justifyContent: "space-between", gap: spacing.xs },
  priceCell: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  optimalCell: { flex: 1.2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: radius.sm, paddingVertical: spacing.sm, gap: spacing.xs },
  priceCaption: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  priceValue: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  optimalValue: { fontFamily: fonts.bold, fontSize: fontSize.xl },
  sqmValue: { fontFamily: fonts.semibold, fontSize: fontSize.sm, textAlign: "center" },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  badgeText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  section: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base },
  listItem: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  insightBox: { borderLeftWidth: 3, borderRadius: radius.sm, padding: spacing.md, gap: spacing.sm },
  insightText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 21 },
});
