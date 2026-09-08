import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { subscribeCEOAnalyticsSummary } from "@/src/api/ceoAnalytics";
import { isExecutiveAnalyticsRole } from "@/src/utils/analyticsEngine";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { AnalyticsTimeWindow, CEOAnalyticsSummary, LeadSource, LostDealReason } from "@/src/types/analytics";
import { t } from "@/src/locales";

const TAB_BAR_BOTTOM_SPACE = 90;

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

  useEffect(() => {
    if (!isExecutive || !auth.userId) {
      setSummary(null);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    setError(null);
    let subscribed = true;

    const unsubscribe = subscribeCEOAnalyticsSummary(
      { userId: auth.userId, agencyId: auth.agencyId, window },
      (nextSummary) => {
        if (subscribed) {
          setSummary(nextSummary);
          setLoading(false);
          setError(null);
        }
      },
      (subscriptionError) => {
        if (subscribed) {
          setSummary(null);
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
        <View style={styles.stateCenter}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Φόρτωση αναφορών & αναλυτικών...</Text>
        </View>
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

            <Text style={styles.subheadingText}>Μεγαλύτερη παραμονή στην αγορά</Text>
            {summary.longestPendingListings.length === 0 ? (
              <Text style={styles.emptyInlineText}>Δεν υπάρχουν καταχωρίσεις στο επιλεγμένο διάστημα.</Text>
            ) : (
              summary.longestPendingListings.map((listing) => (
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

            {summary.longestPendingListings.some((listing) => listing.daysOnMarket > 45) ? (
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
              summary.agentsMetrics.map((agent, index) => (
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
              ))
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