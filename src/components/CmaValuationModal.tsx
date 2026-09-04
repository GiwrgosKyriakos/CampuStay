import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import { AiServiceError, fetchComparativeMarketAnalysis, type CmaAnalysisInput, type CmaAnalysisResult } from "@/src/services/aiFeatureService";
import { db } from "@/src/config/firebase";
import Dropdown from "@/src/components/Dropdown";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

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

interface CmaHistoryEntry {
  id: string;
  createdAt?: unknown;
  suggestedPriceRange: { min: number; max: number; optimal: number };
  optimalPrice: number;
  comparablesUsed: number;
}

function historyTimestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function historyLabel(entry: CmaHistoryEntry): string {
  const date = historyTimestamp(entry.createdAt);
  return `${date ? new Date(date).toLocaleDateString("el-GR") : "Παλαιότερη έκδοση"} · €${entry.optimalPrice.toLocaleString("el-GR")}`;
}

export default function CmaValuationModal({ visible, onClose, apartmentId, transactionType, targetPrice, area, sqm, rooms, floor }: CmaValuationModalProps) {
  const { colors } = useTheme();
  const [result, setResult] = useState<CmaAnalysisResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<CmaHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const nextAllowedRequest = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = onSnapshot(
      query(collection(db, "apartments", apartmentId, "cma_history"), orderBy("createdAt", "desc"), limit(20)),
      (snapshot) => setHistory(snapshot.docs.map((document) => {
        const data = document.data() as Record<string, unknown>;
        const range = data.suggestedPriceRange && typeof data.suggestedPriceRange === "object" ? data.suggestedPriceRange as Record<string, unknown> : {};
        return {
          id: document.id,
          createdAt: data.createdAt,
          suggestedPriceRange: { min: Number(range.min) || 0, max: Number(range.max) || 0, optimal: Number(range.optimal) || Number(data.optimalPrice) || 0 },
          optimalPrice: Number(data.optimalPrice) || Number(range.optimal) || 0,
          comparablesUsed: Number(data.comparablesUsed) || 0,
        };
      })),
      () => setHistory([]),
    );
    return unsubscribe;
  }, [apartmentId, visible]);

  const runAnalysis = async () => {
    if (isLoading || Date.now() < nextAllowedRequest.current) return;
    nextAllowedRequest.current = Date.now() + 3000;
    setIsLoading(true);
    setErrorText(null);
    try {
      setResult(await fetchComparativeMarketAnalysis({ apartmentId, transactionType, targetPrice, area, sqm, rooms, floor }));
      setSelectedHistoryId(null);
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
  }, [visible, apartmentId, transactionType]);

  const badgeColor = result?.marketCompetitiveness === "overpriced"
    ? colors.error
    : result?.marketCompetitiveness === "high"
      ? colors.warning
      : result?.marketCompetitiveness === "fair"
        ? colors.success
        : colors.onSurfaceTertiary;

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="86%">
        <View style={styles.contentWrap}>
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
            <View style={styles.content}>
              <View style={[styles.priceCard, { backgroundColor: colors.brandTertiary, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.onSurfaceTertiary }]}>Προτεινόμενο εύρος τιμής</Text>
                <View style={styles.priceRow}>
                    <View style={styles.priceCell}><Text style={[styles.priceCaption, { color: colors.onSurfaceTertiary }]}>Min</Text><Text style={[styles.priceValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.min.toLocaleString("el-GR")}</Text></View>
                    <View style={[styles.optimalCell, { borderColor: colors.brand }]}><Text style={[styles.priceCaption, { color: colors.brand }]}>Optimal</Text><Text style={[styles.optimalValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.optimal.toLocaleString("el-GR")}</Text></View>
                    <View style={styles.priceCell}><Text style={[styles.priceCaption, { color: colors.onSurfaceTertiary }]}>Max</Text><Text style={[styles.priceValue, { color: colors.onSurface }]}>€{result.suggestedPriceRange.max.toLocaleString("el-GR")}</Text></View>
                </View>
                  <Text style={[styles.sqmValue, { color: colors.onSurfaceTertiary }]}>Εκτίμηση: €{result.pricePerSqmEstimate.toLocaleString("el-GR")} / τ.μ.{transactionType === "rent" ? " / μήνα" : ""}</Text>
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

              {history.length > 0 ? <View style={[styles.historySection, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Ιστορικό εκτιμήσεων</Text>
                <Dropdown
                  value={selectedHistoryId ? historyLabel(history.find((entry) => entry.id === selectedHistoryId) ?? history[0]) : null}
                  options={history.map(historyLabel)}
                  placeholder="Επιλέξτε παλαιότερη έκδοση"
                  onSelect={(label) => setSelectedHistoryId(history.find((entry) => historyLabel(entry) === label)?.id ?? null)}
                  testID="cma-history-dropdown"
                />
                {selectedHistoryId ? (() => {
                  const selectedHistory = history.find((entry) => entry.id === selectedHistoryId);
                  return selectedHistory ? <View style={styles.historySummary}>
                    <Text style={[styles.historyText, { color: colors.onSurfaceTertiary }]}>Προηγούμενη πρόταση: <Text style={{ color: colors.onSurface, fontWeight: "700" }}>€{selectedHistory.optimalPrice.toLocaleString("el-GR")}</Text></Text>
                    <Text style={[styles.historyText, { color: colors.onSurfaceTertiary }]}>Εύρος: €{selectedHistory.suggestedPriceRange.min.toLocaleString("el-GR")} - €{selectedHistory.suggestedPriceRange.max.toLocaleString("el-GR")} · {selectedHistory.comparablesUsed} συγκρίσιμα</Text>
                  </View> : null;
                })() : null}
              </View> : null}
            </View>
          ) : null}
        </View>
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  contentWrap: { padding: spacing.lg, gap: spacing.md },
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
  historySection: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  historySummary: { gap: spacing.xs },
  historyText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
});
