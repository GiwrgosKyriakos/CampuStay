import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

import { AiServiceError, fetchOwnerPerformanceReport, fetchShowingFeedbackSentiment, type FeedbackSentimentAnalysis, type OwnerReportResult } from "@/src/services/aiFeatureService";

interface DashboardApartment {
  id: string;
  title: string;
  area: string;
}

export default function OwnerDashboardScreen() {
  const { colors } = useTheme();
  const auth = useAuth();
  const [apartments, setApartments] = useState<DashboardApartment[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [apartmentsLoading, setApartmentsLoading] = useState(true);
  const [apartmentsError, setApartmentsError] = useState<string | null>(null);
  const [report, setReport] = useState<OwnerReportResult | null>(null);
  const [sentiment, setSentiment] = useState<FeedbackSentimentAnalysis | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const nextReportRequest = useRef(0);

  useEffect(() => {
    let active = true;
    const loadApartments = async () => {
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
      try {
        const listingQueries = [
          getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))),
          getDocs(query(collection(db, "apartments"), where("ownerId", "==", auth.userId))),
          ...(auth.agencyId ? [getDocs(query(collection(db, "apartments"), where("agencyId", "==", auth.agencyId)))] : []),
        ];
        const snapshots = await Promise.all(listingQueries);
        const listings = new Map<string, DashboardApartment>();
        snapshots.flatMap((snapshot) => snapshot.docs).forEach((document) => {
          const data = document.data();
          listings.set(document.id, {
            id: document.id,
            title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Ακίνητο χωρίς τίτλο",
            area: typeof data.area === "string" && data.area.trim() ? data.area.trim() : typeof data.municipality === "string" ? data.municipality : "Περιοχή μη διαθέσιμη",
          });
        });
        const nextApartments = Array.from(listings.values());
        if (!active) return;
        setApartments(nextApartments);
        setSelectedApartmentId((current) => current && listings.has(current) ? current : nextApartments[0]?.id ?? null);
      } catch {
        if (active) setApartmentsError("Δεν ήταν δυνατή η φόρτωση των ακινήτων σας.");
      } finally {
        if (active) setApartmentsLoading(false);
      }
    };
    void loadApartments();
    return () => {
      active = false;
    };
  }, [auth.agencyId, auth.isGuest, auth.userId]);

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
    try {
      const nextReport = await fetchOwnerPerformanceReport(selectedApartmentId, 30);
      setReport(nextReport);
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

      {report ? (
        <>
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
});
