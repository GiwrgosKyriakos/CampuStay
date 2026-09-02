import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { loadCEOAnalyticsSummary } from "@/src/api/ceoAnalytics";
import { isExecutiveAnalyticsRole } from "@/src/utils/analyticsEngine";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { AnalyticsTimeWindow, CEOAnalyticsSummary, LeadSource, LostDealReason } from "@/src/types/analytics";
import { t } from "@/src/locales";

const TIME_WINDOWS: { value: AnalyticsTimeWindow; label: string }[] = [
  { value: "month", label: "Αυτό το Μήνα" },
  { value: "quarter", label: "Τρίμηνο" },
  { value: "year", label: "Έτος" },
  { value: "all", label: "Όλα" },
];

const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  spitogatos: "Σπιτόγατος",
  xe: "ΧΕ",
  social_ads: "Social Ads",
  agency_website: "Website",
  referral: "Συστάσεις",
  yard_sign: "Πινακίδα",
  walk_in: "Walk-in",
  other: "Άλλο",
};

const LOST_REASON_LABELS: Record<LostDealReason, string> = {
  price_too_high: "Υψηλή τιμή",
  property_flaws: "Τεχνικό πρόβλημα",
  legal_tax_issues: "Νομικό / φορολογικό",
  competitor_won: "Ανταγωνισμός",
  buyer_withdrew: "Υπαναχώρηση πελάτη",
  owner_cancelled: "Ακύρωση ιδιοκτήτη",
};

function formatMoney(value: number): string {
  return `€${Math.round(value).toLocaleString("el-GR")}`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("el-GR");
}

function ratioColor(ratio: number, colors: ReturnType<typeof useTheme>["colors"]): string {
  if (ratio >= 5) return colors.error;
  if (ratio >= 2) return colors.warning;
  return colors.success;
}

export default function ExecutiveAnalyticsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isExecutive = isExecutiveAnalyticsRole(auth.agencyRole);
  const [window, setWindow] = useState<AnalyticsTimeWindow>("month");
  const [summary, setSummary] = useState<CEOAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isExecutive || !auth.userId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSummary(await loadCEOAnalyticsSummary({ userId: auth.userId, agencyId: auth.agencyId, window }));
    } catch (loadError) {
      setSummary(null);
      setError(loadError instanceof Error ? loadError.message : "Δεν ήταν δυνατή η φόρτωση των αναφορών.");
    } finally {
      setLoading(false);
    }
  }, [auth.agencyId, auth.userId, isExecutive, window]);

  useEffect(() => { void load(); }, [load]);

  if (!isExecutive) return null;

  const activePipelineActions = summary
    ? summary.totalInquiries + summary.agentsMetrics.reduce((total, agent) => total + agent.showingsCount, 0)
    : 0;
  const maxLeadCount = summary ? Math.max(1, ...Object.values(summary.leadDistribution)) : 1;
  const totalLost = summary?.lostDealsSummary.totalLost ?? 0;
  const maxAreaRatio = summary ? Math.max(1, ...Object.values(summary.roommateAnalytics.supplyDemandRatioByArea).map((area) => area.ratio)) : 1;

  return (
    <View style={styles.container} testID="executive-analytics-screen">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Executive view</Text>
          <Text style={styles.title}>{t("analytics.title")}</Text>
          <Text style={styles.subtitle}>Απόδοση agency, pipeline και αγορά συγκατοίκησης</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => void load()} style={styles.iconButton} hitSlop={8} testID="analytics-refresh-button">
            <Ionicons name="refresh-outline" size={21} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8} testID="analytics-back-button">
            <Ionicons name="close-outline" size={23} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.windowRow}>
        {TIME_WINDOWS.map((option) => (
          <Pressable key={option.value} style={[styles.windowChip, window === option.value && styles.windowChipActive]} onPress={() => setWindow(option.value)} testID={`analytics-window-${option.value}`}>
            <Text style={[styles.windowChipText, window === option.value && styles.windowChipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.brand} /><Text style={styles.loadingText}>Φόρτωση αναφορών...</Text></View> : error ? <View style={styles.errorState}><Ionicons name="alert-circle-outline" size={28} color={colors.error} /><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void load()}><Text style={styles.retryText}>Δοκιμή ξανά</Text></Pressable></View> : summary ? <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.kpiGrid}>
          <KpiCard icon="cash-outline" label={t("analytics.realizedRevenue")} value={formatMoney(summary.realizedRevenue.totalRevenue)} detail={`Agency net ${formatMoney(summary.realizedRevenue.agencyRetainedNet)} · Πωλήσεις ${formatMoney(summary.realizedRevenue.salesCommission)} · Ενοικιάσεις ${formatMoney(summary.realizedRevenue.rentalsCommission)}`} colors={colors} styles={styles} />
          <KpiCard icon="trending-up-outline" label={t("analytics.weightedForecast")} value={formatMoney(summary.weightedForecastRevenue)} detail="Σταθμισμένο pipeline" colors={colors} styles={styles} />
          <KpiCard icon="flash-outline" label="Υποδείξεις & Leads" value={formatNumber(activePipelineActions)} detail={`${formatNumber(summary.totalInquiries)} εισερχόμενα leads`} colors={colors} styles={styles} />
          <KpiCard icon="time-outline" label={t("analytics.daysOnMarket")} value={`${formatNumber(summary.averageDaysOnMarket)} ημέρες`} detail={summary.averageDaysOnMarket > 45 ? "Πάνω από το benchmark" : "Εντός benchmark"} colors={colors} styles={styles} />
        </View>

        <Section title="Listing Performance & DOM" icon="business-outline" styles={styles} colors={colors}>
          <View style={styles.performanceStats}><View><Text style={styles.performanceValue}>{formatNumber(summary.totalActiveListings)}</Text><Text style={styles.performanceLabel}>Ενεργές αγγελίες</Text></View><View><Text style={styles.performanceValue}>{summary.listingConversionRate.toFixed(1)}%</Text><Text style={styles.performanceLabel}>Conversion</Text></View></View>
          <View style={styles.funnelBlock}>
            <View style={styles.funnelLabelRow}><Text style={styles.funnelLabel}>Προβολές</Text><Text style={styles.funnelValue}>{formatNumber(summary.totalViews)}</Text></View>
            <View style={styles.funnelTrack}><View style={[styles.funnelFillViews, { width: `${summary.totalViews > 0 ? 100 : 0}%` }]} /></View>
            <View style={styles.funnelLabelRow}><Text style={styles.funnelLabel}>Ερωτήματα / Leads</Text><Text style={styles.funnelValue}>{formatNumber(summary.totalInquiries)} · {summary.listingConversionRate.toFixed(1)}%</Text></View>
            <View style={styles.funnelTrack}><View style={[styles.funnelFillLeads, { width: `${Math.min(100, summary.listingConversionRate)}%` }]} /></View>
          </View>
          <Text style={styles.subsectionTitle}>Μεγαλύτερη παραμονή στην αγορά</Text>
          {summary.longestPendingListings.length === 0 ? <Text style={styles.muted}>Δεν υπάρχουν καταχωρίσεις στο επιλεγμένο διάστημα.</Text> : summary.longestPendingListings.map((listing) => <View key={listing.id} style={styles.pendingRow}><View style={styles.pendingCopy}><Text style={styles.pendingTitle} numberOfLines={1}>{listing.title}</Text><Text style={styles.pendingMeta}>{listing.area}</Text></View><Text style={[styles.pendingDays, listing.daysOnMarket > 45 && styles.alertText]}>{formatNumber(listing.daysOnMarket)} ημέρες</Text></View>)}
          {summary.longestPendingListings.some((listing) => listing.daysOnMarket > 45) ? <View style={styles.alertBanner}><Ionicons name="warning-outline" size={18} color={colors.warning} /><Text style={styles.alertBannerText}>Υπέρβαση μέσου χρόνου αγοράς (&gt;45 ημέρες) · Προτείνεται αναπροσαρμογή τιμής</Text></View> : null}
        </Section>

        <Section title={`${t("analytics.leadSources")} · ${t("analytics.marketingRoi")}`} icon="megaphone-outline" styles={styles} colors={colors}>
          {Object.entries(summary.leadDistribution).map(([source, count]) => { const typedSource = source as LeadSource; const roi = summary.roiBySource[typedSource]; return <View key={source} style={styles.sourceRow}><View style={styles.sourceHeader}><Text style={styles.sourceName}>{LEAD_SOURCE_LABELS[typedSource]}</Text><Text style={styles.sourceCount}>{formatNumber(count)}</Text></View><View style={styles.sourceTrack}><View style={[styles.sourceFill, { width: `${(count / maxLeadCount) * 100}%` }]} /></View><View style={styles.roiRow}><Text style={styles.roiRevenue}>{formatMoney(roi.revenue)} revenue · {formatMoney(roi.spend)} spend</Text><View style={[styles.roiPill, { backgroundColor: roi.roiRatio >= 1 ? colors.success : colors.surfaceTertiary }]}><Text style={[styles.roiText, { color: roi.roiRatio >= 1 ? colors.onBrand : colors.onSurfaceTertiary }]}>{roi.roiRatio > 0 ? `${roi.roiRatio.toFixed(1)}x ROI` : "No spend data"}</Text></View></View></View>; })}
        </Section>

        <Section title={t("analytics.agentProductivity")} icon="people-outline" styles={styles} colors={colors}>
          {summary.agentsMetrics.length === 0 ? <Text style={styles.muted}>Δεν υπάρχουν δεδομένα συνεργατών.</Text> : summary.agentsMetrics.map((agent, index) => <View key={agent.brokerId} style={styles.agentRow}><View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View><View style={styles.agentCopy}><Text style={styles.agentName} numberOfLines={1}>{agent.brokerName}</Text><Text style={styles.agentMeta}>{agent.showingsCount} υποδείξεις · {agent.dealsClosedCount} κλειστά · {agent.activeListingsCount} ενεργές αγγελίες</Text></View><View style={styles.agentScore}><Text style={styles.agentWinRate}>{agent.winRate.toFixed(0)}%</Text><Text style={styles.agentScoreLabel}>win rate</Text></View></View>)}
          <View style={styles.divider} />
          <Text style={styles.subsectionTitle}>{t("analytics.lostDealsTitle")}</Text>
          <View style={styles.lossSummary}><Text style={styles.lossTotal}>{formatNumber(totalLost)} συνολικά</Text><View style={styles.lossChips}>{Object.entries(summary.lostDealsSummary.reasonsBreakdown).filter(([, count]) => count > 0).map(([reason, count]) => <View key={reason} style={styles.lossChip}><Text style={styles.lossChipText}>{LOST_REASON_LABELS[reason as LostDealReason]} · {totalLost > 0 ? Math.round((count / totalLost) * 100) : 0}%</Text></View>)}</View></View>
        </Section>

        <Section title={t("analytics.roommatesMarket")} icon="home-outline" styles={styles} colors={colors}>
          {Object.entries(summary.roommateAnalytics.supplyDemandRatioByArea).length === 0 ? <Text style={styles.muted}>{t("analytics.supplyDemand")}</Text> : Object.entries(summary.roommateAnalytics.supplyDemandRatioByArea).map(([area, values]) => <View key={area} style={styles.areaCard}><View style={styles.areaHeader}><Text style={styles.areaName}>{area}</Text><View style={[styles.demandPill, { backgroundColor: ratioColor(values.ratio, colors) }]}><Text style={styles.demandPillText} numberOfLines={2}>{values.ratio >= 3 ? t("analytics.highDemandAlert") : "Ισορροπημένη"}</Text></View></View><Text style={styles.areaNumbers}>{formatNumber(values.seekers)} αναζητήσεις · {formatNumber(values.availableRooms)} διαθέσιμα δωμάτια</Text><View style={styles.demandTrack}><View style={[styles.demandFill, { width: `${Math.min(100, (values.ratio / maxAreaRatio) * 100)}%`, backgroundColor: ratioColor(values.ratio, colors) }]} /></View></View>)}
          <View style={styles.marketMetrics}><View style={styles.marketMetric}><Text style={styles.marketValue}>{formatNumber(summary.roommateAnalytics.averageMatchTimeDays)} ημέρες</Text><Text style={styles.marketLabel}>Μέσος χρόνος match</Text></View><View style={styles.marketMetric}><Text style={styles.marketValue}>{summary.roommateAnalytics.successfulMatchRate.toFixed(0)}%</Text><Text style={styles.marketLabel}>Επιτυχία match</Text></View><View style={styles.marketMetric}><Text style={styles.marketValue}>{formatMoney(summary.roommateAnalytics.estimatedCAC)}</Text><Text style={styles.marketLabel}>Εκτιμώμενο CAC</Text></View></View>
        </Section>
      </ScrollView> : null}
    </View>
  );
}

function KpiCard({ icon, label, value, detail, colors, styles }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; detail: string; colors: ReturnType<typeof useTheme>["colors"]; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.kpiCard}><View style={styles.kpiIcon}><Ionicons name={icon} size={19} color={colors.brand} /></View><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue} numberOfLines={1}>{value}</Text><Text style={styles.kpiDetail} numberOfLines={2}>{detail}</Text></View>;
}

function Section({ title, icon, colors, styles, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; colors: ReturnType<typeof useTheme>["colors"]; styles: ReturnType<typeof createStyles>; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name={icon} size={18} color={colors.brand} /></View><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1, gap: 3 },
  headerActions: { flexDirection: "row", gap: spacing.xs },
  iconButton: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  eyebrow: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  windowRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  windowChip: { minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  windowChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  windowChipText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  windowChipTextActive: { color: colors.onBrand },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpiCard: { width: "48.5%", minHeight: 142, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: 4 },
  kpiIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary, marginBottom: spacing.xs },
  kpiLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  kpiValue: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  kpiDetail: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 16, color: colors.onSurfaceTertiary },
  section: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, gap: spacing.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  sectionTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  subsectionTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  funnelBlock: { gap: spacing.xs },
  performanceStats: { flexDirection: "row", gap: spacing.lg },
  performanceValue: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onSurface },
  performanceLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  funnelLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  funnelLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  funnelValue: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  funnelTrack: { height: 10, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceTertiary, marginBottom: spacing.xs },
  funnelFillViews: { height: "100%", backgroundColor: colors.brandSecondary },
  funnelFillLeads: { height: "100%", backgroundColor: colors.brand },
  pendingRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pendingCopy: { flex: 1, gap: 2 },
  pendingTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  pendingMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  pendingDays: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  alertText: { color: colors.error },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.sm, backgroundColor: "rgba(245,158,11,0.12)" },
  alertBannerText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.xs, lineHeight: 17, color: colors.warning },
  sourceRow: { gap: 4 },
  sourceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sourceName: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  sourceCount: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  sourceTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  sourceFill: { height: "100%", minWidth: 2, borderRadius: radius.pill, backgroundColor: colors.brand },
  roiRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  roiRevenue: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  roiPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  roiText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  agentRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  rankText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
  agentCopy: { flex: 1, gap: 3 },
  agentName: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  agentMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  agentScore: { minWidth: 54, alignItems: "flex-end" },
  agentWinRate: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.brand },
  agentScoreLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.onSurfaceTertiary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  lossSummary: { gap: spacing.sm },
  lossTotal: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  lossChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  lossChip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: "rgba(239,68,68,0.1)" },
  lossChipText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.error },
  areaCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.xs },
  areaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  areaName: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  demandPill: { maxWidth: "58%", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  demandPillText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: "#FFFFFF", textAlign: "center" },
  areaNumbers: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  demandTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceTertiary, marginTop: spacing.xs },
  demandFill: { height: "100%", borderRadius: radius.pill },
  marketMetrics: { flexDirection: "row", gap: spacing.sm },
  marketMetric: { flex: 1, minHeight: 68, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, gap: 3 },
  marketValue: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  marketLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  loadingText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  errorText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.error, textAlign: "center" },
  retryButton: { minHeight: 42, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  retryText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
});