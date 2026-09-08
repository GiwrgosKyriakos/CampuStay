import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { subscribeCEOAnalyticsSummary } from "@/src/api/ceoAnalytics";
import { SkeletonBox } from "@/src/components/ui/SkeletonBox";
import { isExecutiveAnalyticsRole } from "@/src/utils/analyticsEngine";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { AnalyticsTimeWindow, CEOAnalyticsSummary, LeadSource, LostDealReason } from "@/src/types/analytics";
import { t } from "@/src/locales";

const TAB_BAR_BOTTOM_SPACE = 90;

type AgentSortMode = "winRate" | "showings" | "velocity";

const TIME_WINDOWS: { value: AnalyticsTimeWindow; label: string }[] = [
  { value: "month", label: "Αυτό το Μήνα" },
  { value: "quarter", label: "Τρίμηνο" },
  { value: "year", label: "Έτος" },
  { value: "all", label: "Όλα" },
];

const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  spitogatos: "Σπιτόγατος",
  xe_gr: "ΧΕ",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  agency_website: "Website agency",
  referral: "Συστάσεις",
  walk_in: "Walk-in",
  signboard: "Πινακίδα",
  other: "Άλλο",
};

const LOST_REASON_LABELS: Record<LostDealReason, string> = {
  price_dispute: "Διαφωνία τιμής",
  legal_defect: "Νομικό ελάττωμα",
  competitor_won: "Ανταγωνισμός",
  buyer_withdrew: "Υπαναχώρηση πελάτη",
  owner_cancelled: "Ακύρωση ιδιοκτήτη",
  financial_issue: "Οικονομικό ζήτημα",
};

function formatMoney(value: number): string {
  return `€${Math.round(value).toLocaleString("el-GR")}`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("el-GR");
}

function ratioColor(ratio: number, colors: ThemeColors): string {
  if (ratio >= 5) return colors.error;
  if (ratio >= 2) return colors.warning;
  return colors.success;
}

export default function ExecutiveAnalyticsScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isExecutive = isExecutiveAnalyticsRole(auth.agencyRole);
  const [window, setWindow] = useState<AnalyticsTimeWindow>("month");
  const [revenueGranularity, setRevenueGranularity] = useState<"month" | "quarter" | "year">("month");
  const [revenueMode, setRevenueMode] = useState<"gross" | "sale" | "rent">("gross");
  const [summary, setSummary] = useState<CEOAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [, setSummaryCache] = useState<Partial<Record<AnalyticsTimeWindow, CEOAnalyticsSummary>>>({});
  const summaryCacheRef = useRef<Partial<Record<AnalyticsTimeWindow, CEOAnalyticsSummary>>>({});
  const cacheOwnerRef = useRef<string | null>(null);
  const [agentSort, setAgentSort] = useState<AgentSortMode>("winRate");
  const [domFilterStagnantOnly, setDomFilterStagnantOnly] = useState(false);
  const [simulatedClosings, setSimulatedClosings] = useState(0);

  useEffect(() => {
    const cacheOwner = `${auth.userId ?? ""}:${auth.agencyId ?? ""}`;
    if (cacheOwnerRef.current !== cacheOwner) {
      cacheOwnerRef.current = cacheOwner;
      summaryCacheRef.current = {};
      setSummaryCache({});
    }

    if (!isExecutive || !auth.userId || !auth.agencyId) {
      setSummary(null);
      setLoading(false);
      return () => undefined;
    }

    const cachedSummary = summaryCacheRef.current[window];
    if (cachedSummary) {
      setSummary(cachedSummary);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    let subscribed = true;

    const unsubscribe = subscribeCEOAnalyticsSummary(
      { userId: auth.userId, agencyId: auth.agencyId, window },
      (nextSummary) => {
        if (subscribed) {
          summaryCacheRef.current = { ...summaryCacheRef.current, [window]: nextSummary };
          setSummaryCache((previous) => ({ ...previous, [window]: nextSummary }));
          setSummary(nextSummary);
          setLoading(false);
          setError(null);
        }
      },
      (subscriptionError) => {
        if (subscribed) {
          if (!summaryCacheRef.current[window]) setSummary(null);
          setLoading(false);
          setError(subscriptionError.message);
        }
      },
    );

    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, [auth.agencyId, auth.userId, isExecutive, refreshToken, window]);

  const sortedAgents = useMemo(() => {
    if (!summary?.agentsMetrics) return [];
    return [...summary.agentsMetrics].sort((first, second) => {
      if (agentSort === "winRate") return second.winRate - first.winRate;
      if (agentSort === "showings") return second.showingsCount - first.showingsCount;
      return first.avgClosingTimeDays - second.avgClosingTimeDays;
    });
  }, [summary?.agentsMetrics, agentSort]);

  const displayedPendingListings = useMemo(() => {
    if (!summary?.longestPendingListings) return [];
    if (!domFilterStagnantOnly) return summary.longestPendingListings;
    return summary.longestPendingListings.filter((listing) => listing.daysOnMarket > 45);
  }, [summary?.longestPendingListings, domFilterStagnantOnly]);

  if (!isExecutive) {
    return (
      <View style={styles.stateCenter}>
        <View style={styles.iconCircleMuted}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Περιορισμένη Πρόσβαση</Text>
        <Text style={styles.emptySubtitle}>
          Η πρόσβαση στον πίνακα αναφορών και αναλυτικών στοιχείων επιτρέπεται αποκλειστικά στη Διοίκηση (CEO) του γραφείου.
        </Text>
      </View>
    );
  }

  const activePipelineActions = summary
    ? summary.totalInquiries + summary.agentsMetrics.reduce((total, agent) => total + agent.showingsCount, 0)
    : 0;
  const maxLeadCount = summary ? Math.max(1, ...Object.values(summary.leadDistribution)) : 1;
  const totalLost = summary?.lostDealsSummary.totalLost ?? 0;
  const maxAreaRatio = summary
    ? Math.max(1, ...Object.values(summary.roommateAnalytics.supplyDemandRatioByArea).map((area) => area.ratio))
    : 1;
  const revenuePoints = summary?.revenueTimeSeries[revenueGranularity] ?? [];
  const maxRevenue = Math.max(
    1,
    ...revenuePoints.map((point) =>
      revenueMode === "sale"
        ? point.saleCommission
        : revenueMode === "rent"
        ? point.rentCommission
        : point.grossCommission,
    ),
  );

  const averageRevenuePerClosedDeal = summary && summary.listingFunnel.closedDeals > 0
    ? summary.realizedRevenue.totalRevenue / summary.listingFunnel.closedDeals
    : 0;
  const simulatedRevenue = summary
    ? summary.realizedRevenue.totalRevenue + simulatedClosings * averageRevenuePerClosedDeal
    : 0;
  const simulatedAchievementPercent = summary && summary.benchmarkMetrics.targetMonthlyRevenue > 0
    ? (simulatedRevenue / summary.benchmarkMetrics.targetMonthlyRevenue) * 100
    : 0;

  const frictionLabels = {
    views_to_inquiries: "Προβολές προς leads",
    inquiries_to_showings: "Leads προς υποδείξεις",
    showings_to_offers: "Υποδείξεις προς προσφορές",
    offers_to_closed: "Προσφορές προς κλειστά",
  };

  return (
    <View style={styles.container} testID="executive-analytics-screen">
      {/* Curved Elevated Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>Executive View</Text>
            <Text style={styles.title} numberOfLines={1}>
              {t("analytics.title")}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Απόδοση agency, pipeline και αγορά συγκατοίκησης
            </Text>
          </View>
        </View>

        {/* Time Window Pill Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.windowScroll}
        >
          {TIME_WINDOWS.map((option) => {
            const isActive = window === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.windowChip, isActive && styles.windowChipActive]}
                onPress={() => setWindow(option.value)}
                testID={`analytics-window-${option.value}`}
              >
                <Text style={[styles.windowChipText, isActive && styles.windowChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ExecutiveAnalyticsSkeleton styles={styles} insetsBottom={insets.bottom} />
      ) : error ? (
        <View style={styles.stateCenter}>
          <View style={styles.iconCircleMuted}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
          </View>
          <Text style={styles.emptyTitle}>Σφάλμα Φόρτωσης</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => setRefreshToken((val) => val + 1)}
          >
            <Ionicons name="refresh" size={18} color={colors.onBrand} />
            <Text style={styles.retryButtonText}>Δοκιμή ξανά</Text>
          </Pressable>
        </View>
      ) : summary ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Key Metric Grid */}
          <View style={styles.kpiGrid}>
            <KpiCard
              icon="cash-outline"
              label={t("analytics.realizedRevenue")}
              value={formatMoney(summary.realizedRevenue.totalRevenue)}
              detail={`Net: ${formatMoney(summary.realizedRevenue.agencyRetainedNet)} · Πωλήσεις: ${formatMoney(summary.realizedRevenue.salesCommission)} · Ενοίκια: ${formatMoney(summary.realizedRevenue.rentalsCommission)}`}
              colors={colors}
              styles={styles}
            />
            <KpiCard
              icon="trending-up-outline"
              label={t("analytics.weightedForecast")}
              value={formatMoney(summary.weightedForecastRevenue)}
              detail={`30ημ: ${formatMoney(summary.weightedForecast.next30Days)} · 60ημ: ${formatMoney(summary.weightedForecast.next60Days)}`}
              colors={colors}
              styles={styles}
            />
            <KpiCard
              icon="flash-outline"
              label="Υποδείξεις & Leads"
              value={formatNumber(activePipelineActions)}
              detail={`${formatNumber(summary.totalInquiries)} εισερχόμενα leads σε εξέλιξη`}
              colors={colors}
              styles={styles}
            />
            <KpiCard
              icon="time-outline"
              label={t("analytics.daysOnMarket")}
              value={`${formatNumber(summary.averageDaysOnMarket)} ημ.`}
              detail={
                summary.benchmarkMetrics.daysOnMarketDelta > 0
                  ? `+${formatNumber(summary.benchmarkMetrics.daysOnMarketDelta)} ημ. έναντι στόχου`
                  : "Εντός προγραμματισμένου benchmark"
              }
              colors={colors}
              styles={styles}
            />
          </View>

          {/* Forecast & Benchmarks Section */}
          <Section title="Financial Forecast & Targets" icon="analytics-outline" styles={styles} colors={colors}>
            <View style={styles.forecastTargetHeader}>
              <View>
                <Text style={styles.performanceLabel}>Πραγματοποιημένα έσοδα</Text>
                <Text style={styles.performanceValue}>{formatMoney(summary.realizedRevenue.totalRevenue)}</Text>
              </View>
              <Text style={styles.forecastTargetValue}>
                {summary.benchmarkMetrics.revenueAchievementPercent.toFixed(0)}% του στόχου
              </Text>
            </View>

            <View style={styles.trackContainer}>
              <View
                style={[
                  styles.trackFillPrimary,
                  { width: `${Math.min(100, Math.max(0, summary.benchmarkMetrics.revenueAchievementPercent))}%` },
                ]}
              />
            </View>
            <Text style={styles.metaSubtext}>
              Μηνιαίος στόχος: {formatMoney(summary.benchmarkMetrics.targetMonthlyRevenue)} · Σταθμισμένη πρόβλεψη
            </Text>

            <View style={styles.targetSimulationBox}>
              <View style={styles.targetSimulationHeader}>
                <View style={styles.targetSimulationCopy}>
                  <Text style={styles.subheadingText}>Προσομοίωση νέων κλεισιμάτων</Text>
                  <Text style={styles.metaSubtext}>Μέση αξία ανά κλειστό deal: {formatMoney(averageRevenuePerClosedDeal)}</Text>
                </View>
                <View style={styles.simulationStepper}>
                  <Pressable
                    style={styles.simulationStepButton}
                    onPress={() => setSimulatedClosings((value) => Math.max(0, value - 1))}
                    disabled={simulatedClosings === 0}
                    accessibilityLabel="Μείωση προσομοιωμένων κλεισιμάτων"
                  >
                    <Ionicons name="remove" size={15} color={simulatedClosings === 0 ? colors.onSurfaceTertiary : colors.brand} />
                  </Pressable>
                  <Text style={styles.simulationStepValue}>{simulatedClosings}</Text>
                  <Pressable
                    style={styles.simulationStepButton}
                    onPress={() => setSimulatedClosings((value) => Math.min(99, value + 1))}
                    accessibilityLabel="Αύξηση προσομοιωμένων κλεισιμάτων"
                  >
                    <Ionicons name="add" size={15} color={colors.brand} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.targetSimulationMetricRow}>
                <Text style={styles.metaSubtext}>Προβλεπόμενα έσοδα</Text>
                <Text style={styles.targetSimulationValue}>{formatMoney(simulatedRevenue)}</Text>
                <Text style={styles.forecastTargetValue}>{simulatedAchievementPercent.toFixed(0)}%</Text>
              </View>
              <View style={styles.trackContainer}>
                <View
                  style={[
                    styles.trackFillSecondary,
                    { width: `${Math.min(100, Math.max(0, simulatedAchievementPercent))}%` },
                  ]}
                />
              </View>
            </View>

            <View style={styles.metricCardsRow}>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardLabel}>Επόμενες 30 ημέρες</Text>
                <Text style={styles.miniCardValue}>{formatMoney(summary.weightedForecast.next30Days)}</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardLabel}>Επόμενες 60 ημέρες</Text>
                <Text style={styles.miniCardValue}>{formatMoney(summary.weightedForecast.next60Days)}</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardLabel}>Win Rate / Στόχος</Text>
                <Text style={styles.miniCardValue}>
                  {(summary.benchmarkMetrics.actualWinRate * 100).toFixed(0)}% / {(summary.benchmarkMetrics.targetWinRate * 100).toFixed(0)}%
                </Text>
              </View>
            </View>
          </Section>

          {/* Listing Funnel & Days on Market */}
          <Section title="Listing Performance & DOM" icon="business-outline" styles={styles} colors={colors}>
            <View style={styles.performanceStatsRow}>
              <View>
                <Text style={styles.performanceValue}>{formatNumber(summary.totalActiveListings)}</Text>
                <Text style={styles.performanceLabel}>Ενεργές αγγελίες</Text>
              </View>
              <View>
                <Text style={styles.performanceValue}>{summary.listingConversionRate.toFixed(1)}%</Text>
                <Text style={styles.performanceLabel}>Conversion rate</Text>
              </View>
            </View>

            <View style={styles.funnelBlock}>
              {[
                { label: "Προβολές", value: summary.listingFunnel.views },
                { label: "Ερωτήματα / Leads", value: summary.listingFunnel.inquiries },
                { label: "Υποδείξεις", value: summary.listingFunnel.showings },
                { label: "Προσφορές", value: summary.listingFunnel.offers },
                { label: "Κλειστές συμφωνίες", value: summary.listingFunnel.closedDeals },
              ].map((stage, index, stages) => (
                <View key={stage.label} style={styles.funnelItemWrap}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.labelMuted}>{stage.label}</Text>
                    <Text style={styles.labelEmphasized}>
                      {formatNumber(stage.value)}
                      {index > 0
                        ? ` · ${[
                            summary.funnelAnalytics.viewsToInquiriesRate,
                            summary.funnelAnalytics.inquiriesToShowingsRate,
                            summary.funnelAnalytics.showingsToOffersRate,
                            summary.funnelAnalytics.offersToClosedRate,
                          ][index - 1].toFixed(1)}%`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.trackContainer}>
                    <View
                      style={[
                        index === 0 ? styles.trackFillSecondary : styles.trackFillPrimary,
                        { width: `${Math.min(100, (stage.value / Math.max(1, stages[0].value)) * 100)}%` },
                      ]}
                    />
                  </View>
                  {index > 0 ? (
                    <Text style={styles.dropOffText}>
                      Μείωση:{" "}
                      {formatNumber([
                        summary.funnelAnalytics.viewsToInquiriesDropOff,
                        summary.funnelAnalytics.inquiriesToShowingsDropOff,
                        summary.funnelAnalytics.showingsToOffersDropOff,
                        summary.funnelAnalytics.offersToClosedDropOff,
                      ][index - 1])}
                    </Text>
                  ) : null}
                </View>
              ))}

              <View style={styles.frictionBanner}>
                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                <Text style={styles.frictionText}>
                  Μεγαλύτερη τριβή: {frictionLabels[summary.funnelAnalytics.frictionStage]}
                </Text>
              </View>
            </View>

            <View style={styles.domHeaderRow}>
              <Text style={styles.subheadingText}>Μεγαλύτερη παραμονή στην αγορά</Text>
              <Pressable
                style={[styles.domFilterToggle, domFilterStagnantOnly && styles.domFilterToggleActive]}
                onPress={() => setDomFilterStagnantOnly((value) => !value)}
                hitSlop={6}
              >
                <Ionicons
                  name={domFilterStagnantOnly ? "alert-circle" : "filter-outline"}
                  size={12}
                  color={domFilterStagnantOnly ? colors.onBrand : colors.onSurfaceTertiary}
                />
                <Text style={[styles.domFilterToggleText, domFilterStagnantOnly && styles.domFilterToggleTextActive]}>
                  {domFilterStagnantOnly ? "Μόνο στάσιμα (>45 ημ)" : "Όλα"}
                </Text>
              </Pressable>
            </View>
            {displayedPendingListings.length === 0 ? (
              <Text style={styles.emptyInlineText}>Δεν υπάρχουν καταχωρίσεις στο επιλεγμένο διάστημα.</Text>
            ) : (
              displayedPendingListings.map((listing) => (
                <View key={listing.id} style={styles.pendingRow}>
                  <View style={styles.pendingCopy}>
                    <Text style={styles.pendingTitle} numberOfLines={1}>
                      {listing.title}
                    </Text>
                    <Text style={styles.pendingMeta}>{listing.area}</Text>
                  </View>
                  <Text style={[styles.pendingDays, listing.daysOnMarket > 45 && styles.alertText]}>
                    {formatNumber(listing.daysOnMarket)} ημέρες
                  </Text>
                </View>
              ))
            )}

            {displayedPendingListings.some((listing) => listing.daysOnMarket > 45) ? (
              <View style={styles.alertCard}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.alertCardText}>
                  Υπέρβαση μέσου χρόνου αγοράς (&gt;45 ημέρες) · Προτείνεται αναπροσαρμογή τιμολόγησης ή προώθησης.
                </Text>
              </View>
            ) : null}
          </Section>

          {/* Lead Channels & Marketing ROI */}
          <Section
            title={`${t("analytics.leadSources")} & ROI`}
            icon="megaphone-outline"
            styles={styles}
            colors={colors}
          >
            {Object.entries(summary.leadDistribution).map(([source, count]) => {
              const typedSource = source as LeadSource;
              const roi = summary.roiBySource[typedSource];
              return (
                <View key={source} style={styles.sourceBlock}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.sourceName}>{LEAD_SOURCE_LABELS[typedSource]}</Text>
                    <Text style={styles.sourceCount}>
                      {formatNumber(count)} leads · {formatNumber(roi.attributedDeals)} deals
                    </Text>
                  </View>
                  <View style={styles.trackContainerMini}>
                    <View
                      style={[styles.trackFillPrimary, { width: `${(count / maxLeadCount) * 100}%` }]}
                    />
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.sourceFinancials}>
                      {formatMoney(roi.revenue)} έσοδα · {formatMoney(roi.spend)} spend
                    </Text>
                    <View
                      style={[
                        styles.roiPill,
                        {
                          backgroundColor:
                            roi.spend <= 0
                              ? colors.surfaceTertiary
                              : roi.roiPercent >= 0
                              ? colors.brandTertiary
                              : "rgba(239,68,68,0.12)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roiText,
                          {
                            color:
                              roi.spend <= 0
                                ? colors.onSurfaceTertiary
                                : roi.roiPercent >= 0
                                ? colors.brand
                                : colors.error,
                          },
                        ]}
                      >
                        {roi.spend > 0 ? `${roi.roiPercent.toFixed(1)}% ROI` : "Χωρίς δαπάνη"}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Section>

          {/* Agent Productivity & Lost Deals */}
          <Section title={t("analytics.agentProductivity")} icon="people-outline" styles={styles} colors={colors}>
            {summary.agentsMetrics.length === 0 ? (
              <Text style={styles.emptyInlineText}>Δεν υπάρχουν δεδομένα συνεργατών.</Text>
            ) : (
              <>
                <View style={styles.agentSortBar}>
                  <Text style={styles.subheadingText}>Κατάταξη Συνεργατών</Text>
                  <View style={styles.agentSortPills}>
                    {(["winRate", "showings", "velocity"] as const).map((mode) => (
                      <Pressable
                        key={mode}
                        style={[styles.agentSortPill, agentSort === mode && styles.agentSortPillActive]}
                        onPress={() => setAgentSort(mode)}
                        hitSlop={4}
                      >
                        <Text style={[styles.agentSortPillText, agentSort === mode && styles.agentSortPillTextActive]}>
                          {mode === "winRate" ? "Win Rate" : mode === "showings" ? "Υποδείξεις" : "Ταχύτητα"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {sortedAgents.map((agent, index) => (
                <View key={agent.brokerId} style={styles.agentCard}>
                  <View style={styles.rankPill}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.agentCopy}>
                    <Text style={styles.agentName} numberOfLines={1}>
                      {agent.brokerName}
                    </Text>
                    <Text style={styles.agentMeta}>
                      {agent.callsCount} κλήσεις · {agent.scheduledShowingsCount} υποδείξεις · {agent.showingsCount} ολοκληρωμένες
                    </Text>
                    <Text style={styles.agentMeta}>
                      {agent.newListingsCount} νέες αγγελίες · {agent.avgClosingTimeDays.toFixed(0)} ημ. μέσος χρόνος
                    </Text>
                  </View>
                  <View style={styles.agentScoreCol}>
                    <Text style={styles.agentWinRate}>{agent.winRate.toFixed(0)}%</Text>
                    <Text style={styles.agentScoreLabel}>Win rate</Text>
                  </View>
                </View>
                ))}
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.subheadingText}>{t("analytics.lostDealsTitle")}</Text>
            <View style={styles.lossContainer}>
              <Text style={styles.lossTotalText}>{formatNumber(totalLost)} ακυρωμένες συμφωνίες</Text>
              <View style={styles.lossChipGrid}>
                {Object.entries(summary.lostDealsSummary.reasonsBreakdown)
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => (
                    <View key={reason} style={styles.lossChip}>
                      <Text style={styles.lossChipText}>
                        {LOST_REASON_LABELS[reason as LostDealReason]} ·{" "}
                        {totalLost > 0 ? Math.round((count / totalLost) * 100) : 0}%
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          </Section>

          {/* Revenue & Settlements */}
          <Section title="Revenue & Settlements" icon="bar-chart-outline" styles={styles} colors={colors}>
            <View style={styles.segmentContainer}>
              {(["month", "quarter", "year"] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setRevenueGranularity(option)}
                  style={[styles.segmentBtn, revenueGranularity === option && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, revenueGranularity === option && styles.segmentTextActive]}>
                    {option === "month" ? "Μήνες" : option === "quarter" ? "Τρίμηνα" : "Έτη"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.segmentContainer}>
              {(["gross", "sale", "rent"] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setRevenueMode(option)}
                  style={[styles.segmentBtn, revenueMode === option && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, revenueMode === option && styles.segmentTextActive]}>
                    {option === "gross" ? "Σύνολο" : option === "sale" ? "Πωλήσεις" : "Ενοικιάσεις"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {revenuePoints.length === 0 ? (
              <Text style={styles.emptyInlineText}>Δεν υπάρχουν ιστορικά έσοδα.</Text>
            ) : (
              revenuePoints.slice(-12).map((point) => {
                const value =
                  revenueMode === "sale"
                    ? point.saleCommission
                    : revenueMode === "rent"
                    ? point.rentCommission
                    : point.grossCommission;
                return (
                  <View key={point.period} style={styles.revenueRow}>
                    <Text style={styles.revenuePeriod}>{point.period}</Text>
                    <View style={styles.trackContainerMini}>
                      <View style={[styles.trackFillSecondary, { width: `${(value / maxRevenue) * 100}%` }]} />
                    </View>
                    <Text style={styles.revenueValue}>{formatMoney(value)}</Text>
                  </View>
                );
              })
            )}

            <View style={styles.accountingGrid}>
              <AccountingMetric
                label="Gross Commission"
                value={formatMoney(summary.settlementAccounting.grossCommission)}
                styles={styles}
              />
              <AccountingMetric
                label="Agency Retained"
                value={formatMoney(summary.settlementAccounting.agencyRetainedShare)}
                styles={styles}
              />
              <AccountingMetric
                label="Broker Payouts"
                value={formatMoney(summary.settlementAccounting.brokerSplitPayouts)}
                styles={styles}
              />
              <AccountingMetric
                label="Invoices Status"
                value={`${summary.settlementAccounting.settledInvoices} settled · ${summary.settlementAccounting.pendingInvoices} pending`}
                styles={styles}
              />
            </View>
          </Section>

          {/* Roommates & P2P Market Demand */}
          <Section title={t("analytics.roommatesMarket")} icon="home-outline" styles={styles} colors={colors}>
            {Object.entries(summary.roommateAnalytics.supplyDemandRatioByArea).length === 0 ? (
              <Text style={styles.emptyInlineText}>{t("analytics.supplyDemand")}</Text>
            ) : (
              Object.entries(summary.roommateAnalytics.supplyDemandRatioByArea).map(([area, values]) => (
                <View key={area} style={styles.areaDemandCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.areaName}>{area}</Text>
                    <View style={[styles.demandBadge, { backgroundColor: ratioColor(values.ratio, colors) }]}>
                      <Text style={styles.demandBadgeText}>
                        {values.ratio >= 3 ? t("analytics.highDemandAlert") : "Ισορροπημένη"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.areaStats}>
                    {formatNumber(values.seekers)} αναζητήσεις · {formatNumber(values.availableRooms)} διαθέσιμα δωμάτια
                  </Text>
                  <View style={styles.trackContainerMini}>
                    <View
                      style={[
                        styles.trackFillPrimary,
                        {
                          width: `${Math.min(100, (values.ratio / maxAreaRatio) * 100)}%`,
                          backgroundColor: ratioColor(values.ratio, colors),
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}

            <View style={styles.metricCardsRow}>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardValue}>
                  {formatNumber(summary.roommateAnalytics.averageMatchTimeDays)} ημ.
                </Text>
                <Text style={styles.miniCardLabel}>Μέσος χρόνος match</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardValue}>
                  {summary.roommateAnalytics.successfulMatchRate.toFixed(0)}%
                </Text>
                <Text style={styles.miniCardLabel}>Επιτυχία matching</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniCardValue}>
                  {formatMoney(summary.roommateAnalytics.estimatedCAC)}
                </Text>
                <Text style={styles.miniCardLabel}>Εκτιμώμενο CAC</Text>
              </View>
            </View>
          </Section>
        </ScrollView>
      ) : null}
    </View>
  );
}

function ExecutiveAnalyticsSkeleton({
  styles,
  insetsBottom,
}: {
  styles: ReturnType<typeof createStyles>;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insetsBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.kpiGrid}>
        {Array.from({ length: 4 }, (_item, index) => (
          <View key={`kpi-skeleton-${index}`} style={styles.kpiCard}>
            <SkeletonBox width={32} height={32} borderRadius={radius.sm} />
            <SkeletonBox width="64%" height={12} borderRadius={radius.sm} />
            <SkeletonBox width="76%" height={22} borderRadius={radius.sm} />
            <SkeletonBox width="92%" height={10} borderRadius={radius.sm} />
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <SkeletonBox width={30} height={30} borderRadius={radius.sm} />
          <SkeletonBox width="58%" height={16} borderRadius={radius.sm} />
        </View>
        <View style={styles.forecastTargetHeader}>
          <SkeletonBox width="42%" height={14} borderRadius={radius.sm} />
          <SkeletonBox width="28%" height={14} borderRadius={radius.sm} />
        </View>
        <SkeletonBox width="100%" height={8} borderRadius={radius.pill} />
        <SkeletonBox width="72%" height={10} borderRadius={radius.sm} />
        <View style={styles.targetSimulationBox}>
          <View style={styles.targetSimulationHeader}>
            <View style={styles.targetSimulationCopy}>
              <SkeletonBox width="70%" height={12} borderRadius={radius.sm} />
              <SkeletonBox width="86%" height={10} borderRadius={radius.sm} />
            </View>
            <SkeletonBox width={76} height={28} borderRadius={radius.pill} />
          </View>
          <SkeletonBox width="100%" height={8} borderRadius={radius.pill} />
        </View>
        <View style={styles.metricCardsRow}>
          <SkeletonBox width="31%" height={54} borderRadius={radius.md} />
          <SkeletonBox width="31%" height={54} borderRadius={radius.md} />
          <SkeletonBox width="31%" height={54} borderRadius={radius.md} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <SkeletonBox width={30} height={30} borderRadius={radius.sm} />
          <SkeletonBox width="62%" height={16} borderRadius={radius.sm} />
        </View>
        <View style={styles.performanceStatsRow}>
          <SkeletonBox width={76} height={24} borderRadius={radius.sm} />
          <SkeletonBox width={76} height={24} borderRadius={radius.sm} />
        </View>
        <View style={styles.funnelBlock}>
          {Array.from({ length: 4 }, (_item, index) => (
            <View key={`funnel-skeleton-${index}`} style={styles.funnelItemWrap}>
              <View style={styles.rowBetween}>
                <SkeletonBox width="35%" height={12} borderRadius={radius.sm} />
                <SkeletonBox width="18%" height={12} borderRadius={radius.sm} />
              </View>
              <SkeletonBox width="100%" height={8} borderRadius={radius.pill} />
            </View>
          ))}
        </View>
        <View style={styles.domHeaderRow}>
          <SkeletonBox width="58%" height={14} borderRadius={radius.sm} />
          <SkeletonBox width={54} height={24} borderRadius={radius.pill} />
        </View>
        <SkeletonBox width="72%" height={12} borderRadius={radius.sm} />
        <SkeletonBox width="48%" height={10} borderRadius={radius.sm} />
      </View>
    </ScrollView>
  );
}

function KpiCard({
  icon,
  label,
  value,
  detail,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  detail: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiIconWrapper}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.kpiDetail} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

function Section({
  title,
  icon,
  colors,
  styles,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={17} color={colors.brand} />
        </View>
        <Text style={styles.sectionTitleText}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function AccountingMetric({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.accountingItem}>
      <Text style={styles.accountingLabel}>{label}</Text>
      <Text style={styles.accountingValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
      zIndex: 2,
      gap: spacing.sm,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    titleWrap: {
      flex: 1,
      width: "100%",
      minWidth: 0,
    },
    eyebrow: {
      fontFamily: fonts.bold,
      fontSize: 10,
      color: colors.brand,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    title: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    windowScroll: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    windowChip: {
      height: 34,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    windowChipActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    windowChipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    windowChipTextActive: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.md,
    },
    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    kpiCard: {
      width: "48.5%",
      minHeight: 138,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
      gap: 3,
    },
    kpiIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandTertiary,
      marginBottom: spacing.xs,
    },
    kpiLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    kpiValue: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    kpiDetail: {
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 14,
      color: colors.onSurfaceTertiary,
      marginTop: 2,
    },
    sectionCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
      gap: spacing.sm,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: 2,
    },
    sectionIconWrap: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandTertiary,
    },
    sectionTitleText: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    subheadingText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
      marginTop: spacing.xs,
    },
    metaSubtext: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    rowBetween: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    labelMuted: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    labelEmphasized: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    trackContainer: {
      height: 8,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: colors.surfaceTertiary,
      marginVertical: 4,
    },
    trackContainerMini: {
      height: 6,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: colors.surfaceTertiary,
      marginVertical: 3,
      flex: 1,
    },
    trackFillPrimary: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
    },
    trackFillSecondary: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: colors.brandSecondary,
    },
    metricCardsRow: {
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: 2,
    },
    miniCard: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    miniCardLabel: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    miniCardValue: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    performanceStatsRow: {
      flexDirection: "row",
      gap: spacing.xl,
      paddingVertical: spacing.xs,
    },
    performanceValue: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    performanceLabel: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    forecastTargetHeader: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    forecastTargetValue: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.brand,
    },
    targetSimulationBox: {
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    targetSimulationHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    targetSimulationCopy: {
      flex: 1,
      gap: 2,
    },
    simulationStepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    simulationStepButton: {
      width: 28,
      height: 28,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandTertiary,
    },
    simulationStepValue: {
      minWidth: 20,
      textAlign: "center",
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    targetSimulationMetricRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    targetSimulationValue: {
      flex: 1,
      textAlign: "right",
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    funnelBlock: {
      gap: spacing.xs,
    },
    funnelItemWrap: {
      gap: 1,
    },
    dropOffText: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    frictionBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      padding: spacing.xs + 2,
      borderRadius: radius.sm,
      backgroundColor: "rgba(245,158,11,0.08)",
      marginTop: 2,
    },
    frictionText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.warning,
    },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.xs + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    pendingCopy: {
      flex: 1,
      gap: 1,
    },
    pendingTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    pendingMeta: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    pendingDays: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    domHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      gap: spacing.sm,
    },
    domFilterToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    domFilterToggleActive: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    domFilterToggleText: {
      fontFamily: fonts.semibold,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    domFilterToggleTextActive: {
      fontFamily: fonts.bold,
      color: colors.onBrand,
    },
    alertText: {
      color: colors.error,
    },
    alertCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      padding: spacing.sm,
      backgroundColor: "rgba(245,158,11,0.12)",
      marginTop: spacing.xs,
    },
    alertCardText: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      lineHeight: 16,
      color: colors.warning,
    },
    sourceBlock: {
      gap: 3,
      paddingVertical: 2,
    },
    sourceName: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    sourceCount: {
      fontFamily: fonts.bold,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
    },
    sourceFinancials: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    agentSortBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
      gap: spacing.sm,
    },
    agentSortPills: {
      flexDirection: "row",
      gap: 4,
    },
    agentSortPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    agentSortPillActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    agentSortPillText: {
      fontFamily: fonts.semibold,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    agentSortPillTextActive: {
      fontFamily: fonts.bold,
      color: colors.onBrand,
    },
    roiPill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    roiText: {
      fontFamily: fonts.bold,
      fontSize: 10,
    },
    agentCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    rankPill: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandTertiary,
    },
    rankText: {
      fontFamily: fonts.bold,
      fontSize: 11,
      color: colors.brand,
    },
    agentCopy: {
      flex: 1,
      gap: 1,
    },
    agentName: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    agentMeta: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    agentScoreCol: {
      alignItems: "flex-end",
      minWidth: 46,
    },
    agentWinRate: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.base,
      color: colors.brand,
    },
    agentScoreLabel: {
      fontFamily: fonts.regular,
      fontSize: 9,
      color: colors.onSurfaceTertiary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    lossContainer: {
      gap: spacing.xs,
    },
    lossTotalText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    lossChipGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    lossChip: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      backgroundColor: "rgba(239,68,68,0.1)",
    },
    lossChipText: {
      fontFamily: fonts.semibold,
      fontSize: 10,
      color: colors.error,
    },
    segmentContainer: {
      flexDirection: "row",
      gap: spacing.xs,
      backgroundColor: colors.surface,
      padding: 3,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentBtn: {
      flex: 1,
      height: 28,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentBtnActive: {
      backgroundColor: colors.brand,
    },
    segmentText: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
    },
    segmentTextActive: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
    },
    revenueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 2,
    },
    revenuePeriod: {
      width: 58,
      fontFamily: fonts.semibold,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    revenueValue: {
      width: 72,
      textAlign: "right",
      fontFamily: fonts.bold,
      fontSize: 10,
      color: colors.onSurface,
    },
    accountingGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    accountingItem: {
      width: "48%",
      gap: 2,
    },
    accountingLabel: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    accountingValue: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    areaDemandCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      backgroundColor: colors.surface,
      gap: 3,
    },
    areaName: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    demandBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    demandBadgeText: {
      fontFamily: fonts.bold,
      fontSize: 9,
      color: "#FFFFFF",
    },
    areaStats: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    stateCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing["2xl"],
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    iconCircleMuted: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
      lineHeight: 19,
      maxWidth: 310,
    },
    loadingText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    emptyInlineText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    retryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.pill,
      marginTop: spacing.md,
    },
    retryButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
    },
  });
}