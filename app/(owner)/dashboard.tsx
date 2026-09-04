import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { BarChart, LineChart } from "react-native-chart-kit";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { buildOwnerActivityPdfReport } from "@/src/services/pdfGenerator";

import { AiServiceError, fetchOwnerPerformanceReport, fetchShowingFeedbackSentiment, type FeedbackSentimentAnalysis, type OwnerReportResult } from "@/src/services/aiFeatureService";
import Dropdown from "@/src/components/Dropdown";

interface DashboardApartment {
  id: string;
  title: string;
  area: string;
  address: string;
}

interface LiveMetrics {
  views: number;
  inquiries: number;
  showings: number;
  feedbackComments: string[];
  trendLabels: string[];
  viewsTrend: number[];
  showingsTrend: number[];
  feedbackTrend: { positive: number[]; neutral: number[]; friction: number[] };
}

interface OwnerReportHistoryEntry extends OwnerReportResult {
  id: string;
}

function eventTimestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
  }
  return 0;
}

function makeTrendLabels(): string[] {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (5 - index) * 7);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  });
}

function bucketForEvent(data: Record<string, unknown>, labels: string[]): number {
  const timestamp = eventTimestamp(data.createdAt ?? data.timestamp ?? data.date ?? data.created_at);
  if (!timestamp) return labels.length - 1;
  const ageWeeks = Math.floor((Date.now() - timestamp) / (7 * 24 * 60 * 60 * 1000));
  return Math.min(labels.length - 1, Math.max(0, labels.length - 1 - ageWeeks));
}

function historyLabel(entry: OwnerReportHistoryEntry): string {
  const date = eventTimestamp(entry.createdAt);
  return `${date ? new Date(date).toLocaleDateString("el-GR") : "Παλαιότερη έκδοση"} · ${entry.reportPeriod}`;
}

export default function OwnerDashboardScreen() {
  const { colors } = useTheme();
  const auth = useAuth();
  const [apartments, setApartments] = useState<DashboardApartment[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [apartmentsLoading, setApartmentsLoading] = useState(true);
  const [apartmentsError, setApartmentsError] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [liveMetricsError, setLiveMetricsError] = useState<string | null>(null);
  const [report, setReport] = useState<OwnerReportResult | null>(null);
  const [sentiment, setSentiment] = useState<FeedbackSentimentAnalysis | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportExportLoading, setReportExportLoading] = useState(false);
  const [reportExportError, setReportExportError] = useState<string | null>(null);
  const [reportHistory, setReportHistory] = useState<OwnerReportHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [agentPhone, setAgentPhone] = useState<string | undefined>(undefined);
  const nextReportRequest = useRef(0);

  useEffect(() => {
    if (!auth.userId || auth.isGuest) {
      setAgentPhone(undefined);
      return;
    }
    let active = true;
    getDoc(doc(db, "users", auth.userId)).then((snapshot) => {
      if (!active) return;
      const data = snapshot.data() as Record<string, unknown> | undefined;
      const phone = data && [data.phone_number, data.phoneNumber, data.phone].find((value): value is string => typeof value === "string" && value.trim().length > 0);
      setAgentPhone(phone?.trim());
    }).catch(() => { if (active) setAgentPhone(undefined); });
    return () => { active = false; };
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    let active = true;
    const loadApartments = () => {
      if (!auth.userId || auth.isGuest) {
        if (active) {
          setApartments([]);
          setSelectedApartmentId(null);
          setApartmentsLoading(false);
        }
        return;
      }
      setApartmentsLoading(true);
      setApartmentsError(null);
      const listingQueries = [
        query(collection(db, "apartments"), where("hostId", "==", auth.userId)),
        query(collection(db, "apartments"), where("ownerId", "==", auth.userId)),
        ...(auth.agencyId ? [query(collection(db, "apartments"), where("agencyId", "==", auth.agencyId))] : []),
      ];
      const listingSnapshots = new Map<number, Map<string, DashboardApartment>>();
      let pendingSnapshots = listingQueries.length;
      const handleSnapshot = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }, queryIndex: number) => {
        if (!active) return;
        const listings = new Map<string, DashboardApartment>();
        snapshot.docs.forEach((document) => {
          const data = document.data();
          listings.set(document.id, {
            id: document.id,
            title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Ακίνητο χωρίς τίτλο",
            area: typeof data.area === "string" && data.area.trim() ? data.area.trim() : typeof data.municipality === "string" ? data.municipality : "Περιοχή μη διαθέσιμη",
            address: typeof data.address === "string" && data.address.trim() ? data.address.trim() : [data.area, data.city].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(", "),
          });
        });
        listingSnapshots.set(queryIndex, listings);
        const merged = new Map<string, DashboardApartment>();
        listingSnapshots.forEach((snapshotListings) => snapshotListings.forEach((apartment, id) => merged.set(id, apartment)));
        const nextApartments = Array.from(merged.values());
        setApartments(nextApartments);
        setSelectedApartmentId((selected) => selected && merged.has(selected) ? selected : nextApartments[0]?.id ?? null);
        pendingSnapshots -= 1;
        if (pendingSnapshots === 0) setApartmentsLoading(false);
      };
      const handleError = () => {
        if (!active) return;
        setApartmentsError("Δεν ήταν δυνατή η φόρτωση των ακινήτων σας.");
        setApartmentsLoading(false);
      };
      const unsubscribes = listingQueries.map((listingQuery, queryIndex) => onSnapshot(listingQuery, (snapshot) => handleSnapshot(snapshot, queryIndex), handleError));
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
    const unsubscribe = loadApartments();
    return () => { active = false; unsubscribe?.(); };
  }, [auth.agencyId, auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!selectedApartmentId || auth.isGuest || !auth.userId) {
      setLiveMetrics(null);
      setLiveMetricsError(null);
      return;
    }
    setLiveMetrics({ views: 0, inquiries: 0, showings: 0, feedbackComments: [], trendLabels: makeTrendLabels(), viewsTrend: [0, 0, 0, 0, 0, 0], showingsTrend: [0, 0, 0, 0, 0, 0], feedbackTrend: { positive: [0, 0, 0, 0, 0, 0], neutral: [0, 0, 0, 0, 0, 0], friction: [0, 0, 0, 0, 0, 0] } });
    setLiveMetricsError(null);
    const subscriptions: Array<[keyof Omit<LiveMetrics, "feedbackComments">, string]> = [
      ["views", "apartment_views"],
      ["inquiries", "inquiries"],
      ["showings", "showings"],
    ];
    const unsubscribes = subscriptions.map(([metric, collectionName]) => onSnapshot(
      query(collection(db, collectionName), where("apartmentId", "==", selectedApartmentId)),
      (snapshot) => setLiveMetrics((current) => {
        if (!current) return current;
        const trend = [0, 0, 0, 0, 0, 0];
        snapshot.docs.forEach((document) => trend[bucketForEvent(document.data(), current.trendLabels)] += 1);
        return { ...current, [metric]: snapshot.size, ...(metric === "views" ? { viewsTrend: trend } : { showingsTrend: trend }) };
      }),
      () => setLiveMetricsError("Δεν ήταν δυνατή η ζωντανή φόρτωση των μετρήσεων."),
    ));
    unsubscribes.push(onSnapshot(
      query(collection(db, "post_visit_feedbacks"), where("apartmentId", "==", selectedApartmentId)),
      (snapshot) => setLiveMetrics((current) => current ? {
        ...current,
        feedbackComments: snapshot.docs
          .map((document) => document.data())
          .map((data) => typeof data.feedback === "string" ? data.feedback : typeof data.comment === "string" ? data.comment : typeof data.notes === "string" ? data.notes : "")
          .map((comment) => comment.trim())
          .filter(Boolean)
          .slice(0, 3),
        feedbackTrend: snapshot.docs.reduce((trend, document) => {
          const data = document.data();
          const bucket = bucketForEvent(data, current.trendLabels);
          const sentimentValue = String(data.sentiment ?? data.overallSentiment ?? "neutral").toLowerCase();
          if (sentimentValue === "positive") trend.positive[bucket] += 1;
          else if (sentimentValue === "negative" || sentimentValue === "friction") trend.friction[bucket] += 1;
          else trend.neutral[bucket] += 1;
          return trend;
        }, { positive: [0, 0, 0, 0, 0, 0], neutral: [0, 0, 0, 0, 0, 0], friction: [0, 0, 0, 0, 0, 0] }),
      } : current),
      () => setLiveMetricsError("Δεν ήταν δυνατή η ζωντανή φόρτωση των σχολίων."),
    ));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [auth.isGuest, auth.userId, selectedApartmentId]);

  useEffect(() => {
    if (!selectedApartmentId || auth.isGuest || !auth.userId) {
      setReportHistory([]);
      setSelectedHistoryId(null);
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, "apartments", selectedApartmentId, "owner_reports"), orderBy("createdAt", "desc"), limit(20)),
      (snapshot) => setReportHistory(snapshot.docs.map((document) => ({ id: document.id, ...(document.data() as Omit<OwnerReportHistoryEntry, "id">) }))),
      () => setReportHistory([]),
    );
    return unsubscribe;
  }, [auth.isGuest, auth.userId, selectedApartmentId]);

  const sentimentColor = useMemo(() => {
    switch (sentiment?.overallSentiment) {
      case "positive":
        return colors.success;
      case "negative":
        return colors.error;
      default:
        return colors.warning;
    }
  }, [colors, sentiment?.overallSentiment]);

  const handleReport = async () => {
    if (!selectedApartmentId || reportLoading || Date.now() < nextReportRequest.current) return;
    nextReportRequest.current = Date.now() + 3000;
    setReportLoading(true);
    setReportError(null);
    setReportExportError(null);
    try {
      const nextReport = await fetchOwnerPerformanceReport(selectedApartmentId, 30);
      setReport(nextReport);
      setSelectedHistoryId(nextReport.reportId ?? null);
      try {
        setSentiment(await fetchShowingFeedbackSentiment(selectedApartmentId));
      } catch {
        setSentiment(null);
      }
    } catch (error) {
      setReportError(error instanceof AiServiceError ? error.message : "Δεν ήταν δυνατή η δημιουργία της αναφοράς.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportReport = async () => {
    if (!selectedApartmentId || !report || reportExportLoading) return;
    const apartment = apartments.find((candidate) => candidate.id === selectedApartmentId);
    if (!apartment) return;
    setReportExportLoading(true);
    setReportExportError(null);
    try {
      const pdf = await buildOwnerActivityPdfReport({
        apartmentId: selectedApartmentId,
        propertyTitle: apartment.title,
        propertyAddress: apartment.address || apartment.area,
        report: {
          ...report,
          sentimentSummary: sentiment
            ? `${sentiment.overallSentiment}. ${sentiment.positivePoints.join(" ")}${sentiment.frictionPoints.length ? ` Ανησυχίες: ${sentiment.frictionPoints.join(" ")}` : ""}`
            : "Δεν υπάρχει ξεχωριστή ανάλυση συναισθήματος για την περίοδο.",
          priceRecommendation: sentiment?.priceAdjustmentRecommendation
            ? `Προτείνεται προσαρμογή ${sentiment.priceAdjustmentRecommendation.suggestedReductionPercent}%: ${sentiment.priceAdjustmentRecommendation.justification}`
            : "Δεν διατυπώθηκε αυτόματη πρόταση προσαρμογής τιμής από τα διαθέσιμα δεδομένα.",
        },
        agentName: auth.user?.name ?? undefined,
        agentEmail: auth.user?.email ?? undefined,
        agentPhone,
      });
      setReport((current) => current ? { ...current, generatedPdfUrl: pdf.generatedPdfUrl } : current);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, { dialogTitle: "Owner Performance Report" });
      } else {
        await Linking.openURL(pdf.generatedPdfUrl);
      }
    } catch (error) {
      setReportExportError(error instanceof Error ? error.message : "Δεν ήταν δυνατή η εξαγωγή του PDF.");
    } finally {
      setReportExportLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.onSurface }]}>{t("ai.ownerReportTitle")}</Text>

      <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Επιλογή ακινήτου</Text>
        {apartmentsLoading ? <ActivityIndicator color={colors.brand} /> : apartments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
            {apartments.map((apartment) => {
              const selected = apartment.id === selectedApartmentId;
              return <Pressable key={apartment.id} onPress={() => { setSelectedApartmentId(apartment.id); setReport(null); setSentiment(null); setReportError(null); }} style={[styles.apartmentOption, { borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandTertiary : colors.surface }]}><Text style={[styles.apartmentTitle, { color: colors.onSurface }]} numberOfLines={1}>{apartment.title}</Text><Text style={[styles.apartmentArea, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{apartment.area}</Text></Pressable>;
            })}
          </ScrollView>
        ) : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>{apartmentsError ?? "Δεν βρέθηκαν διαθέσιμα ακίνητα για αναφορά."}</Text>}
      </View>

      {reportError ? <View style={[styles.errorCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.error }]}><Text style={[styles.errorText, { color: colors.error }]}>{reportError}</Text><Pressable style={[styles.retryButton, { borderColor: colors.error }]} onPress={() => void handleReport()} disabled={reportLoading}><Text style={[styles.retryText, { color: colors.error }]}>Επανάληψη</Text></Pressable></View> : null}
      {reportExportError ? <View style={[styles.errorCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.error }]}><Text style={[styles.errorText, { color: colors.error }]}>{reportExportError}</Text></View> : null}

      {liveMetrics ? <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Ζωντανές μετρήσεις</Text>
        <View style={styles.metricGrid}>
          <View style={styles.liveMetric}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Προβολές</Text><Text style={[styles.metricValue, { color: colors.onSurface }]}>{liveMetrics.views}</Text></View>
          <View style={styles.liveMetric}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Ερωτήματα</Text><Text style={[styles.metricValue, { color: colors.onSurface }]}>{liveMetrics.inquiries}</Text></View>
          <View style={styles.liveMetric}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Υποδείξεις</Text><Text style={[styles.metricValue, { color: colors.onSurface }]}>{liveMetrics.showings}</Text></View>
        </View>
        <Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Σχόλια: {liveMetrics.feedbackComments.length > 0 ? liveMetrics.feedbackComments.length : "κανένα"}</Text>
        {liveMetrics.feedbackComments.map((comment) => <Text key={comment} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>{comment}</Text>)}
        {liveMetricsError ? <Text style={[styles.errorText, { color: colors.error }]}>{liveMetricsError}</Text> : null}
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Τάσεις τελευταίων 6 εβδομάδων</Text>
        <LineChart
          data={{ labels: liveMetrics.trendLabels, datasets: [{ data: liveMetrics.viewsTrend, color: () => colors.brand, strokeWidth: 2 }, { data: liveMetrics.showingsTrend, color: () => colors.success, strokeWidth: 2 }] }}
          width={Math.max(280, Dimensions.get("window").width - 60)}
          height={190}
          yAxisInterval={1}
          chartConfig={{ backgroundColor: colors.surfaceSecondary, backgroundGradientFrom: colors.surfaceSecondary, backgroundGradientTo: colors.surfaceSecondary, decimalPlaces: 0, color: () => colors.onSurfaceTertiary, labelColor: () => colors.onSurfaceTertiary, propsForDots: { r: "3" } }}
          bezier
          withInnerLines={false}
          style={styles.chart}
        />
        <BarChart
          data={{ labels: liveMetrics.trendLabels, datasets: [{ data: liveMetrics.feedbackTrend.positive }, { data: liveMetrics.feedbackTrend.neutral }, { data: liveMetrics.feedbackTrend.friction }] }}
          width={Math.max(280, Dimensions.get("window").width - 60)}
          height={190}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{ backgroundColor: colors.surfaceSecondary, backgroundGradientFrom: colors.surfaceSecondary, backgroundGradientTo: colors.surfaceSecondary, decimalPlaces: 0, color: () => colors.onSurfaceTertiary, labelColor: () => colors.onSurfaceTertiary }}
          fromZero
          showValuesOnTopOfBars
          withInnerLines={false}
          style={styles.chart}
        />
      </View> : null}

      {report ? (
        <>
          {reportHistory.length > 0 ? <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Ιστορικό αναφορών</Text>
            <Dropdown
              value={selectedHistoryId ? historyLabel(reportHistory.find((entry) => entry.id === selectedHistoryId) ?? reportHistory[0]) : null}
              options={reportHistory.map(historyLabel)}
              placeholder="Επιλέξτε έκδοση αναφοράς"
              onSelect={(label) => {
                const selected = reportHistory.find((entry) => historyLabel(entry) === label);
                if (selected) { setSelectedHistoryId(selected.id); setReport(selected); }
              }}
              testID="owner-report-history-dropdown"
            />
          </View> : null}
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Σύνοψη περιόδου</Text>
            <Text style={[styles.periodText, { color: colors.onSurfaceTertiary }]}>{report.reportPeriod}</Text>
            <Text style={[styles.summaryText, { color: colors.onSurface }]}>{report.executiveSummary}</Text>
          </View>

          <View style={styles.metricGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Υποδείξεις</Text><Text style={[styles.metricValue, { color: colors.onSurface }]}>{report.showingMetrics.totalVisits}</Text></View>
            <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Θετικά σήματα</Text><Text style={[styles.metricValue, { color: colors.success }]}>{report.showingMetrics.positiveSignalsCount}</Text></View>
            <View style={[styles.metricCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.metricLabel, { color: colors.onSurfaceTertiary }]}>Ανησυχίες</Text><Text style={[styles.metricValue, { color: colors.error }]}>{report.showingMetrics.concernsCount}</Text></View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Συναισθηματική εικόνα</Text>
            {sentiment ? <><View style={[styles.summaryPill, { backgroundColor: sentimentColor }]}><Text style={[styles.summaryPillText, { color: colors.onBrand }]}>{sentiment.overallSentiment.toUpperCase()}</Text></View>{sentiment.positivePoints.map((point) => <Text key={`positive-${point}`} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>+ {point}</Text>)}{sentiment.frictionPoints.map((point) => <Text key={`friction-${point}`} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>- {point}</Text>)}</> : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχει διαθέσιμη ξεχωριστή ανάλυση συναισθήματος.</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Θέματα ενδιαφερομένων</Text>
            {report.buyerFeedbackThemes.length > 0 ? report.buyerFeedbackThemes.map((theme) => <View key={`${theme.theme}-${theme.sentiment}`} style={styles.themeRow}><Text style={[styles.themeText, { color: colors.onSurface }]}>{theme.theme}</Text><Text style={[styles.themeBadge, { color: theme.sentiment === "positive" ? colors.success : theme.sentiment === "negative" ? colors.error : colors.warning }]}>{theme.sentiment}</Text></View>) : <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν καταγεγραμμένα θέματα από τις επισκέψεις.</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Στρατηγικές προτάσεις</Text>
            {report.strategicRecommendations.map((item) => <Text key={item} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>• {item}</Text>)}
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Ενέργειες ιδιοκτήτη</Text>
            {report.ownerActionItems.map((item) => <Text key={item} style={[styles.summaryItem, { color: colors.onSurfaceTertiary }]}>□ {item}</Text>)}
          </View>

          {report.showingMetrics.totalVisits === 0 && report.buyerFeedbackThemes.length === 0 ? <View style={[styles.emptyState, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Ionicons name="information-circle-outline" size={22} color={colors.onSurfaceTertiary} /><Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν ακόμα υποδείξεις ή σχόλια για την επιλεγμένη περίοδο.</Text></View> : null}
          <Pressable style={[styles.secondaryButton, { borderColor: colors.brand }]} onPress={() => void handleExportReport()} disabled={reportExportLoading}>
            {reportExportLoading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="download-outline" size={18} color={colors.brand} />}
            <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>{reportExportLoading ? "Εξαγωγή..." : "Export PDF"}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        style={[styles.primaryButton, { backgroundColor: colors.brand }]}
        onPress={() => void handleReport()}
        disabled={reportLoading || !selectedApartmentId}
      >
        {reportLoading ? <ActivityIndicator color={colors.onBrand} /> : <Ionicons name="sparkles-outline" size={18} color={colors.onBrand} />}
        <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{reportLoading ? "Δημιουργία..." : report ? "Δημιουργία νέας αναφοράς" : t("ai.sendReportToOwner")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "700" },
  selectorRow: { gap: 8 },
  apartmentOption: { width: 190, borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  apartmentTitle: { fontSize: 14, fontWeight: "700" },
  apartmentArea: { fontSize: 12 },
  metricGrid: { flexDirection: "row", gap: 12 },
  metricCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  metricLabel: { fontSize: 12, marginBottom: 8 },
  metricValue: { fontSize: 22, fontWeight: "700" },
  liveMetric: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  summaryPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  summaryPillText: { fontSize: 11, fontWeight: "800" },
  summaryText: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  summaryItem: { marginTop: 4, fontSize: 13 },
  periodText: { fontSize: 12 },
  themeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  themeText: { flex: 1, fontSize: 14 },
  themeBadge: { fontSize: 12, fontWeight: "700" },
  emptyText: { fontSize: 13, lineHeight: 19 },
  emptyState: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, padding: 14 },
  errorCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  errorText: { fontSize: 13, lineHeight: 19 },
  retryButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { fontSize: 13, fontWeight: "700" },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  secondaryButtonText: { fontSize: 15, fontWeight: "700" },
  chart: { marginVertical: 4, borderRadius: 12 },
});
