import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { calculateCommissionSplits, getAgencyClosedDeals, issueCommissionSettlement } from "@/src/api/agencyCollaboration";
import type { Deal } from "@/src/types/deal";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

type SplitInputs = { agency: string; listing: string; buyer: string; covering: string; invoice: string };

function defaultInputs(deal: Deal): SplitInputs {
  const listing = deal.brokerSplits.find((split) => split.role === "listing_agent");
  const buyer = deal.brokerSplits.find((split) => split.role === "buyer_agent");
  const covering = deal.brokerSplits.find((split) => split.role === "covering_agent");
  return { agency: String(deal.agencyCutPercentage || 50), listing: String(listing?.percentage ?? 50), buyer: String(buyer?.percentage ?? 50), covering: String(covering?.percentage ?? 0), invoice: "" };
}

export default function SecretariatSettlementsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [inputs, setInputs] = useState<Record<string, SplitInputs>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const allowed = !!auth.agencyId && ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  const load = useCallback(async () => {
    if (!allowed || !auth.agencyId) { setDeals([]); setLoading(false); return; }
    setLoading(true);
    try {
      const loaded = await getAgencyClosedDeals(auth.agencyId);
      setDeals(loaded);
      setInputs((previous) => Object.fromEntries(loaded.map((deal) => [deal.id, previous[deal.id] ?? defaultInputs(deal)])));
    } catch { setDeals([]); } finally { setLoading(false); }
  }, [allowed, auth.agencyId]);

  useEffect(() => { void load(); }, [load]);

  const updateInput = (dealId: string, key: keyof SplitInputs, value: string) => setInputs((previous) => ({ ...previous, [dealId]: { ...(previous[dealId] ?? { agency: "50", listing: "50", buyer: "50", covering: "0", invoice: "" }), [key]: value } }));
  const settle = async (deal: Deal) => {
    if (!auth.agencyId || workingId) return;
    const values = inputs[deal.id] ?? defaultInputs(deal);
    const listingSplit = deal.brokerSplits.find((split) => split.role === "listing_agent");
    const buyerSplit = deal.brokerSplits.find((split) => split.role === "buyer_agent");
    const coveringSplit = deal.brokerSplits.find((split) => split.role === "covering_agent");
    setWorkingId(deal.id);
    try {
      const calculated = calculateCommissionSplits({
        totalCommission: deal.commissionTotal,
        agencyCutPercentage: Number(values.agency),
        listingPercentage: Number(values.listing),
        buyerPercentage: Number(values.buyer),
        listingBroker: { id: deal.listingBrokerId, name: listingSplit?.brokerName || "Listing broker" },
        buyerBroker: { id: deal.buyerBrokerId, name: buyerSplit?.brokerName || "Buyer broker" },
        ...(coveringSplit && deal.coveringBrokerId ? { coveringBroker: { id: deal.coveringBrokerId, name: coveringSplit.brokerName, percentage: Number(values.covering) } } : {}),
      });
      await issueCommissionSettlement({ agencyId: auth.agencyId, deal, apartmentTitle: String((deal as Deal & { apartmentTitle?: string }).apartmentTitle || "Ακίνητο"), invoiceNumber: values.invoice, agencyShare: calculated.agencyAmount, brokerSplits: calculated.brokerSplits });
      Alert.alert("Η εκκαθάριση ολοκληρώθηκε", "Το τιμολόγιο εκδόθηκε και οι εμπλεκόμενοι μεσίτες ενημερώθηκαν.");
      await load();
    } catch (error) { Alert.alert("Η εκκαθάριση απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά."); } finally { setWorkingId(null); }
  };

  if (!allowed) return <View style={styles.center}><Ionicons name="lock-closed-outline" size={36} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Η οθόνη είναι διαθέσιμη μόνο στη Γραμματεία και τον CEO.</Text></View>;
  return <View style={styles.container} testID="secretariat-settlements-screen"><View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><View style={styles.headerCopy}><Text style={styles.title}>Εκκαθαρίσεις & Τιμολόγια</Text><Text style={styles.subtitle}>Deals στο στάδιο 100%</Text></View><Pressable onPress={() => void load()} hitSlop={8}><Ionicons name="refresh-outline" size={23} color={colors.onSurface} /></Pressable></View>{loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> : deals.length === 0 ? <View style={styles.center}><Ionicons name="receipt-outline" size={38} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Δεν υπάρχουν κλειστά deals για εκκαθάριση.</Text></View> : <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>{deals.map((deal) => { const values = inputs[deal.id] ?? defaultInputs(deal); const listing = deal.brokerSplits.find((split) => split.role === "listing_agent"); const buyer = deal.brokerSplits.find((split) => split.role === "buyer_agent"); const calculated = calculateCommissionSplits({ totalCommission: deal.commissionTotal, agencyCutPercentage: Number(values.agency), listingPercentage: Number(values.listing), buyerPercentage: Number(values.buyer), listingBroker: { id: deal.listingBrokerId, name: listing?.brokerName || "Listing broker" }, buyerBroker: { id: deal.buyerBrokerId, name: buyer?.brokerName || "Buyer broker" } }); return <View key={deal.id} style={styles.card} testID={`settlement-deal-${deal.id}`}><View style={styles.cardHeader}><View style={styles.cardHeaderCopy}><Text style={styles.cardTitle}>Ακίνητο {deal.apartmentId}</Text><Text style={styles.cardMeta}>Συνολική προμήθεια: €{deal.commissionTotal.toFixed(2)}</Text></View><View style={styles.closedBadge}><Text style={styles.closedBadgeText}>100%</Text></View></View><View style={styles.inputsRow}><View style={styles.inputGroup}><Text style={styles.inputLabel}>Agency %</Text><TextInput value={values.agency} onChangeText={(value) => updateInput(deal.id, "agency", value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} /></View><View style={styles.inputGroup}><Text style={styles.inputLabel}>Listing %</Text><TextInput value={values.listing} onChangeText={(value) => updateInput(deal.id, "listing", value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} /></View><View style={styles.inputGroup}><Text style={styles.inputLabel}>Buyer %</Text><TextInput value={values.buyer} onChangeText={(value) => updateInput(deal.id, "buyer", value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} /></View></View><View style={styles.calculation}><Text style={styles.calcLine}>Agency: €{calculated.agencyAmount.toFixed(2)}</Text>{calculated.brokerSplits.map((split) => <Text key={split.brokerId} style={styles.calcLine}>{split.brokerName}: €{split.amount.toFixed(2)}</Text>)}</View><TextInput value={values.invoice} onChangeText={(value) => updateInput(deal.id, "invoice", value)} placeholder="Αριθμός τιμολογίου (προαιρετικό)" placeholderTextColor={colors.onSurfaceTertiary} style={styles.invoiceInput} /><Pressable style={styles.settleButton} disabled={workingId === deal.id} onPress={() => void settle(deal)}>{workingId === deal.id ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="receipt-outline" size={18} color={colors.onBrand} /><Text style={styles.settleText}>Έκδοση Τιμολογίου & Εκκαθάριση</Text></>}</Pressable></View>; })}</ScrollView>}</View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md },
  card: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardHeaderCopy: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  closedBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.success },
  closedBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  inputsRow: { flexDirection: "row", gap: spacing.sm },
  inputGroup: { flex: 1, gap: spacing.xs },
  inputLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  input: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface },
  calculation: { borderRadius: radius.sm, padding: spacing.sm, backgroundColor: colors.surface, gap: 3 },
  calcLine: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
  invoiceInput: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface },
  settleButton: { minHeight: 46, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand },
  settleText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  empty: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
});