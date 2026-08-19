import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import type { BrokerApartment, FilterSetPayload } from "./(tabs)/broker-hub";

function numberValue(value?: string) { const parsed = Number(value); return Number.isFinite(parsed) && value !== "" ? parsed : null; }
function matchesFilter(apartment: BrokerApartment, filters: FilterSetPayload) {
  const rent = numberValue(filters.rentMin); const rentMax = numberValue(filters.rentMax); const size = numberValue(filters.sizeMin); const sizeMax = numberValue(filters.sizeMax); const sqmMin = numberValue(filters.minSqmPrice); const sqmMax = numberValue(filters.maxSqmPrice); const sqm = apartment.size > 0 ? apartment.rent / apartment.size : 0;
  if (rent !== null && apartment.rent < rent || rentMax !== null && apartment.rent > rentMax || size !== null && apartment.size < size || sizeMax !== null && apartment.size > sizeMax || sqmMin !== null && sqm < sqmMin || sqmMax !== null && sqm > sqmMax) return false;
  if (filters.cityQuery?.trim() && !`${apartment.city} ${apartment.area}`.toLocaleLowerCase().includes(filters.cityQuery.trim().toLocaleLowerCase())) return false;
  const tags = apartment.tags.map((tag) => tag.toLocaleLowerCase());
  if (filters.petFriendly && !tags.some((tag) => tag.includes("pet") || tag.includes("κατοικ"))) return false;
  if (filters.nearMetro && !tags.some((tag) => tag.includes("metro") || tag.includes("μετρο"))) return false;
  return true;
}

export interface ClientPurchasingPowerData {
  cashOnHand?: number | null;
  approvedMortgage?: number | null;
  moveInDeadline?: string;
  purchasePurpose?: string;
  updatedAt?: number;
}

export default function BrokerClientDetailScreen() {
  const insets = useSafeAreaInsets(); const router = useRouter(); const auth = useAuth(); const params = useLocalSearchParams<{ clientUserId?: string; clientName?: string; clientAvatar?: string; chatRoomId?: string; sharedFilterSet?: string }>(); const { colors } = useTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const [apartments, setApartments] = useState<BrokerApartment[]>([]); const [loading, setLoading] = useState(true);
  const [isPurchasingPowerExpanded, setIsPurchasingPowerExpanded] = useState(false);
  const [cashOnHand, setCashOnHand] = useState("");
  const [approvedMortgage, setApprovedMortgage] = useState("");
  const [moveInDeadline, setMoveInDeadline] = useState("");
  const [purchasePurpose, setPurchasePurpose] = useState("");
  const [savingPurchasingPower, setSavingPurchasingPower] = useState(false);
  const [purchasingPowerSavedSuccess, setPurchasingPowerSavedSuccess] = useState(false);
  const filters = useMemo<FilterSetPayload | null>(() => { try { return params.sharedFilterSet ? JSON.parse(params.sharedFilterSet) as FilterSetPayload : null; } catch { return null; } }, [params.sharedFilterSet]);
  useEffect(() => { let active = true; if (!auth.userId) return; void getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))).then((snapshot) => { const mapped = snapshot.docs.map((item) => { const data = item.data() as Record<string, unknown>; return { ...data, id: item.id, title: String(data.title ?? "Ακίνητο"), rent: Number(data.rent ?? data.price ?? 0), city: String(data.city ?? ""), area: String(data.area ?? ""), size: Number(data.size ?? 0), image: String(data.image ?? data.imageUrl ?? ""), tags: Array.isArray(data.tags) ? data.tags.map(String) : [] } as BrokerApartment; }); if (active) setApartments(filters ? mapped.filter((apartment) => matchesFilter(apartment, filters)) : mapped); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [auth.userId, filters]);
  useEffect(() => {
    if (!auth.userId || !params.clientUserId) return;
    let active = true;
    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`));
        if (!snapshot.exists() || !active) return;
        const data = snapshot.data() as ClientPurchasingPowerData;
        setCashOnHand(typeof data.cashOnHand === "number" ? String(data.cashOnHand) : "");
        setApprovedMortgage(typeof data.approvedMortgage === "number" ? String(data.approvedMortgage) : "");
        setMoveInDeadline(data.moveInDeadline || "");
        setPurchasePurpose(data.purchasePurpose || "");
      } catch (error) {
        console.error("[BrokerClientDetail] Error loading purchasing power:", error);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, params.clientUserId]);

  const handleSavePurchasingPower = async () => {
    if (!auth.userId || !params.clientUserId || savingPurchasingPower) return;
    setSavingPurchasingPower(true);
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        cashOnHand: cashOnHand.trim().length > 0 ? Number(cashOnHand.replace(/[^0-9]/g, "")) : null,
        approvedMortgage: approvedMortgage.trim().length > 0 ? Number(approvedMortgage.replace(/[^0-9]/g, "")) : null,
        moveInDeadline: moveInDeadline.trim(),
        purchasePurpose: purchasePurpose.trim(),
        updatedAt: Date.now(),
      }, { merge: true });
      setPurchasingPowerSavedSuccess(true);
      setTimeout(() => setPurchasingPowerSavedSuccess(false), 2000);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving purchasing power:", error);
    } finally {
      setSavingPurchasingPower(false);
    }
  };
  return <View style={[styles.container, { paddingTop: insets.top }]} testID="broker-client-detail-screen">
    <View style={styles.header}><Pressable style={styles.iconButton} onPress={() => router.back()} testID="broker-client-back-btn"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><Text style={styles.headerTitle}>Στοιχεία Πελάτη</Text><View style={styles.iconSpacer} /></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>{params.clientAvatar ? <Image source={{ uri: params.clientAvatar }} style={styles.avatar} /> : <DefaultProfileAvatar size={64} />}<Text style={styles.clientName}>{params.clientName || "Πελάτης"}</Text><Pressable style={styles.chatButton} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: params.clientUserId || "", chatRoomId: params.chatRoomId || "" } })} testID="broker-client-chat-cta"><Ionicons name="chatbubbles-outline" size={20} color={colors.onBrand} /><Text style={styles.chatButtonText}>Μετάβαση στη Συνομιλία</Text></Pressable></View>
      <View style={styles.purchasingPowerCard}>
        <Pressable style={styles.purchasingPowerHeader} onPress={() => setIsPurchasingPowerExpanded((previous) => !previous)} testID="broker-client-purchasing-power-toggle"><View style={styles.purchasingPowerTitleWrap}><Ionicons name="wallet-outline" size={21} color={colors.brand} /><Text style={styles.purchasingPowerTitle}>Πραγματική αγοραστική δύναμη</Text></View><Ionicons name={isPurchasingPowerExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurfaceTertiary} /></Pressable>
        {isPurchasingPowerExpanded ? <View style={styles.purchasingPowerContent}><Text style={styles.fieldLabel}>Μετρητά στο χέρι (€)</Text><TextInput value={cashOnHand} onChangeText={(value) => setCashOnHand(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 50000" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-cash-input" /><Text style={styles.fieldLabel}>Εγκεκριμένο στεγαστικό δάνειο (€)</Text><TextInput value={approvedMortgage} onChangeText={(value) => setApprovedMortgage(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 120000" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-mortgage-input" /><Text style={styles.fieldLabel}>Προθεσμία μετακόμισης</Text><TextInput value={moveInDeadline} onChangeText={setMoveInDeadline} placeholder="π.χ. Έως τέλος Σεπτεμβρίου 2026 / Άμεσα" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-deadline-input" /><Text style={styles.fieldLabel}>Σκοπός αγοράς / ενοικίασης</Text><TextInput value={purchasePurpose} onChangeText={setPurchasePurpose} placeholder="π.χ. Ιδιοκατοίκηση, Επενδυτικό (απόδοση), Φοιτητική στέγαση..." placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-purpose-input" /><Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSavePurchasingPower()} disabled={savingPurchasingPower} testID="broker-client-purchasing-power-save">{savingPurchasingPower ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="bookmark-outline" size={18} color={colors.onBrand} />}<Text style={styles.purchasingPowerSaveText}>Αποθήκευση στοιχείων</Text></Pressable>{purchasingPowerSavedSuccess ? <View style={styles.purchasingPowerSuccess}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={styles.purchasingPowerSuccessText}>Τα στοιχεία αποθηκεύτηκαν</Text></View> : null}</View> : null}
      </View>
      <Text style={styles.sectionTitle}>Κριτήρια Αναζήτησης Πελάτη</Text>{filters ? <View style={styles.criteriaCard}><Text style={styles.criteriaTitle}>{filters.title || "Κριτήρια Αναζήτησης Πελάτη"}</Text><View style={styles.chipsRow}>{[`${filters.rentMin || "0"} - ${filters.rentMax || "∞"} €`, `${filters.sizeMin || "0"} - ${filters.sizeMax || "∞"} m²`, `${filters.minSqmPrice || "0"} - ${filters.maxSqmPrice || "∞"} €/m²`, filters.cityQuery || "Όλες οι περιοχές", `Κατοικίδια: ${filters.petFriendly ? "Ναι" : "Όχι"}`, `Μετρό: ${filters.nearMetro ? "Ναι" : "Όχι"}`].map((chip) => <Text key={chip} style={styles.criteriaChip}>{chip}</Text>)}</View>{filters.summary ? <Text style={styles.body}>{filters.summary}</Text> : null}</View> : <Text style={styles.emptyHint}>Ο πελάτης δεν έχει διαμοιραστεί σετ φίλτρων ακόμα.</Text>}<Text style={styles.sectionTitle}>Προτεινόμενα Ακίνητα από το Χαρτοφυλάκιο</Text>{loading ? <ActivityIndicator color={colors.brand} /> : apartments.map((apartment) => <Pressable key={apartment.id} style={styles.apartmentRow} testID={`broker-matched-apartment-${apartment.id}`} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}><Text style={styles.cardTitle}>{apartment.title}</Text><Text style={styles.body}>{apartment.city}{apartment.area ? ` · ${apartment.area}` : ""}</Text><Text style={styles.price}>{apartment.rent} € · {apartment.size} m²</Text></Pressable>)}{!loading && apartments.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν διαθέσιμα ακίνητα στο χαρτοφυλάκιό σας που να πληρούν όλα τα κριτήρια.</Text> : null}</ScrollView>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconSpacer: { width: 40 },
  headerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  content: { padding: spacing.lg, paddingBottom: spacing["3xl"] },
  profileCard: { alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  avatar: { width: 64, height: 64, borderRadius: radius.pill },
  clientName: { marginTop: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
  chatButton: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brand },
  chatButtonText: { fontFamily: fonts.semibold, color: colors.onBrand },
  purchasingPowerCard: { marginTop: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  purchasingPowerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  purchasingPowerTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  purchasingPowerTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  purchasingPowerContent: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  fieldLabel: { marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  input: { minHeight: 46, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, fontFamily: fonts.semibold, color: colors.onSurface },
  purchasingPowerSaveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
  purchasingPowerSaveText: { fontFamily: fonts.semibold, color: colors.onBrand },
  purchasingPowerSuccess: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingTop: spacing.xs },
  purchasingPowerSuccessText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.success },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  criteriaCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  criteriaTitle: { fontFamily: fonts.semibold, color: colors.onSurface },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  criteriaChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  body: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  apartmentRow: { padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.semibold, color: colors.onSurface },
  price: { marginTop: spacing.xs, fontFamily: fonts.bold, color: colors.brand },
  emptyHint: { padding: spacing.md, textAlign: "center", fontFamily: fonts.regular, color: colors.onSurfaceTertiary },
});
