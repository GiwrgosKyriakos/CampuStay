import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { getAgencyClaimRecords, getAgencyLeads, getAgencyPoolApartments, getAgencyStaff, reassignAgencyLead, resolveApartmentClaim, subscribeAgencyClaimRecords, subscribeAgencyLeads, type AgencyClaimRecord, type AgencyLead, type AgencyStaffMember } from "@/src/api/agencyCollaboration";
import LeadsPoolSection from "@/src/components/LeadsPoolSection";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

type SubTab = "listings" | "leads";
const INACTIVITY_WINDOW = 24 * 60 * 60 * 1000;

function timestampMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000 + Math.floor((candidate.nanoseconds || 0) / 1_000_000);
  }
  return 0;
}

function countdown(lead: AgencyLead): string {
  const assignedAt = timestampMillis(lead.assignedAt);
  if (!assignedAt) return "Χωρίς ώρα ανάθεσης";
  const remaining = Math.max(0, INACTIVITY_WINDOW - (Date.now() - assignedAt));
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return remaining > 0 ? `Αδράνεια σε ${hours}ω ${minutes}λ` : "Έτοιμο για ανακατανομή";
}

export default function SecretariatPoolManagementScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<SubTab>("listings");
  const [claims, setClaims] = useState<AgencyClaimRecord[]>([]);
  const [poolApartments, setPoolApartments] = useState<(Record<string, unknown> & { id: string })[]>([]);
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [staff, setStaff] = useState<AgencyStaffMember[]>([]);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const allowed = !!auth.agencyId && ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  const load = useCallback(async () => {
    if (!allowed || !auth.agencyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [claimRows, leadRows, staffRows, poolRows] = await Promise.all([getAgencyClaimRecords(auth.agencyId), getAgencyLeads(auth.agencyId), getAgencyStaff(auth.agencyId), getAgencyPoolApartments(auth.agencyId, auth.userId ?? "")]);
      setClaims(claimRows.filter((claim) => claim.status === "pending"));
      setPoolApartments(poolRows);
      setLeads(leadRows);
      setStaff(staffRows.filter((member) => member.id !== auth.userId && member.agencyRole !== "secretary" && member.agencyRole !== "secretariat"));
    } catch { setClaims([]); setPoolApartments([]); setLeads([]); setStaff([]); } finally { setLoading(false); }
  }, [allowed, auth.agencyId, auth.userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!allowed || !auth.agencyId) return;
    const unsubscribeClaims = subscribeAgencyClaimRecords(auth.agencyId, (nextClaims) => setClaims(nextClaims.filter((claim) => claim.status === "pending")));
    const unsubscribeLeads = subscribeAgencyLeads(auth.agencyId, setLeads);
    return () => {
      unsubscribeClaims();
      unsubscribeLeads();
    };
  }, [allowed, auth.agencyId]);
  const resolveClaim = async (claim: AgencyClaimRecord, approved: boolean) => {
    if (!auth.userId || workingId) return;
    setWorkingId(claim.id);
    try { await resolveApartmentClaim({ claimId: claim.id, reviewerId: auth.userId, approved }); setClaims((previous) => previous.filter((item) => item.id !== claim.id)); } catch (error) { Alert.alert("Η ενέργεια απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά."); } finally { setWorkingId(null); }
  };
  const reassign = async (lead: AgencyLead, target: AgencyStaffMember) => {
    if (!auth.userId || workingId) return;
    setWorkingId(lead.id);
    try { await reassignAgencyLead({ leadId: lead.id, reviewerId: auth.userId, targetBrokerId: target.id }); setExpandedLeadId(null); await load(); } catch (error) { Alert.alert("Η ανάθεση απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά."); } finally { setWorkingId(null); }
  };
  if (!allowed) return <View style={styles.center}><Ionicons name="lock-closed-outline" size={36} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Η οθόνη είναι διαθέσιμη μόνο στη Γραμματεία και τον CEO.</Text></View>;
  const assignedLeads = leads.filter((lead) => lead.status === "assigned");
  return <View style={styles.container} testID="secretariat-pool-management-screen"><View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><View style={styles.headerCopy}><Text style={styles.title}>Εποπτεία Pool</Text><Text style={styles.subtitle}>Αναθέσεις ακινήτων και leads</Text></View><Pressable onPress={() => void load()} hitSlop={8}><Ionicons name="refresh-outline" size={23} color={colors.onSurface} /></Pressable></View><View style={styles.tabs}><Pressable style={[styles.tab, tab === "listings" && styles.tabActive]} onPress={() => setTab("listings")} testID="secretariat-pool-listings-tab"><Text style={[styles.tabText, tab === "listings" && styles.tabTextActive]}>Ακίνητα ({claims.length})</Text></Pressable><Pressable style={[styles.tab, tab === "leads" && styles.tabActive]} onPress={() => setTab("leads")} testID="secretariat-pool-leads-tab"><Text style={[styles.tabText, tab === "leads" && styles.tabActive]}>Leads ({assignedLeads.length})</Text></Pressable></View>{loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> : tab === "listings" ? <ScrollView contentContainerStyle={styles.list}><Text style={styles.sectionTitle}>Pool Ακινήτων ({poolApartments.length})</Text>{poolApartments.map((apartment) => <View key={apartment.id} style={styles.poolListingRow} testID={`secretariat-pool-listing-${apartment.id}`}><View style={styles.cardCopy}><Text style={styles.cardTitle}>{String(apartment.title || "Ακίνητο")}</Text><Text style={styles.cardMeta}>{String(apartment.area || "")}{apartment.city ? `, ${String(apartment.city)}` : ""}</Text><Text style={styles.cardMeta}>{apartment.pendingClaimBrokerId ? "Υπάρχει εκκρεμές αίτημα" : "Διαθέσιμο για ανάληψη"}</Text></View><Ionicons name={apartment.pendingClaimBrokerId ? "time-outline" : "business-outline"} size={20} color={apartment.pendingClaimBrokerId ? colors.warning : colors.brand} /></View>)}<Text style={styles.sectionTitle}>Εκκρεμή αιτήματα ({claims.length})</Text>{claims.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν εκκρεμή αιτήματα ανάθεσης.</Text> : claims.map((claim) => <View key={claim.id} style={styles.card} testID={`secretariat-claim-${claim.id}`}><View style={styles.cardCopy}><Text style={styles.cardTitle}>{claim.apartmentTitle}</Text><Text style={styles.cardMeta}>Αίτημα από {claim.brokerName}</Text></View><View style={styles.actions}><Pressable style={styles.approve} disabled={workingId === claim.id} onPress={() => void resolveClaim(claim, true)}><Ionicons name="checkmark" size={19} color={colors.onBrand} /></Pressable><Pressable style={styles.reject} disabled={workingId === claim.id} onPress={() => void resolveClaim(claim, false)}><Ionicons name="close" size={19} color={colors.onBrand} /></Pressable></View></View>)}<View style={styles.poolSection}><Text style={styles.sectionTitle}>Αδιάθετα Leads</Text>{auth.agencyId && auth.userId ? <LeadsPoolSection agencyId={auth.agencyId} brokerId={auth.userId} onChanged={() => void load()} /> : null}</View></ScrollView> : <ScrollView contentContainerStyle={styles.list}>{assignedLeads.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν αναθέσεις leads.</Text> : assignedLeads.map((lead) => <View key={lead.id} style={styles.card} testID={`secretariat-lead-${lead.id}`}><View style={styles.cardCopy}><Text style={styles.cardTitle}>{lead.clientName}</Text><Text style={styles.cardMeta}>{lead.assignedBrokerId || "Χωρίς broker"} · {countdown(lead)}</Text><Text style={styles.cardMeta}>{lead.lastContactTimestamp ? "Υπάρχει επικοινωνία" : "Δεν έχει γίνει επικοινωνία"}</Text></View><Pressable style={styles.reassignButton} onPress={() => setExpandedLeadId((previous) => previous === lead.id ? null : lead.id)}><Ionicons name="swap-horizontal-outline" size={17} color={colors.brand} /><Text style={styles.reassignText}>Ανάθεση</Text></Pressable>{expandedLeadId === lead.id ? <View style={styles.staffList}>{staff.map((member) => <Pressable key={member.id} style={styles.staffRow} disabled={workingId === lead.id} onPress={() => void reassign(lead, member)}><Text style={styles.staffName}>{member.name}</Text><Ionicons name="chevron-forward" size={17} color={colors.onSurfaceTertiary} /></Pressable>)}</View> : null}</View>)}</ScrollView>}</View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  tabs: { marginHorizontal: spacing.lg, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, flexDirection: "row", gap: 4 },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  tabTextActive: { color: colors.onBrand },
  list: { padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  cardCopy: { flex: 1, minWidth: 160, gap: 3 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  actions: { flexDirection: "row", gap: spacing.sm },
  approve: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.success },
  reject: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.error },
  reassignButton: { minHeight: 36, borderRadius: radius.md, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.brand },
  reassignText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
  staffList: { width: "100%", gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  staffRow: { minHeight: 38, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.sm, backgroundColor: colors.surface },
  staffName: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  poolListingRow: { minHeight: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  poolSection: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  empty: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
});