import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from "react-native";
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
import { getPipelineStageConfig, PIPELINE_STAGES, type LossReasonKey, type PipelineStageKey } from "@/src/constants/pipeline";
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
  pipelineStage?: PipelineStageKey;
  stageUpdatedAt?: number;
  dealCommission?: number;
  lossReason?: LossReasonKey;
  lossCustomReason?: string;
  lossApartmentId?: string;
  lossApartmentTitle?: string;
  lossReportedAt?: number;
  brokerId?: string;
  clientUserId?: string;
  clientName?: string;
  chatRoomId?: string;
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
  const [pipelineStage, setPipelineStage] = useState<PipelineStageKey>("new_lead");
  const [stageUpdatedAt, setStageUpdatedAt] = useState(Date.now());
  const [dealCommission, setDealCommission] = useState<number | undefined>();
  const [isStageModalVisible, setIsStageModalVisible] = useState(false);
  const [isLossModalVisible, setIsLossModalVisible] = useState(false);
  const [lossReason, setLossReason] = useState<LossReasonKey>("high_price");
  const [lossCustomReason, setLossCustomReason] = useState("");
  const [lossApartmentId, setLossApartmentId] = useState<string | undefined>();
  const [lossApartmentTitle, setLossApartmentTitle] = useState<string | undefined>();
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
        setPipelineStage(getPipelineStageConfig(data.pipelineStage).key);
        setStageUpdatedAt(typeof data.stageUpdatedAt === "number" ? data.stageUpdatedAt : Date.now());
        setDealCommission(typeof data.dealCommission === "number" ? data.dealCommission : undefined);
        setLossReason(data.lossReason ?? "high_price");
        setLossCustomReason(data.lossCustomReason ?? "");
        setLossApartmentId(data.lossApartmentId);
        setLossApartmentTitle(data.lossApartmentTitle);
      } catch (error) {
        console.error("[BrokerClientDetail] Error loading purchasing power:", error);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, params.clientUserId]);

  useEffect(() => {
    if (!params.chatRoomId) return;
    void getDoc(doc(db, "chats", params.chatRoomId)).then((snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as { apartmentId?: unknown; apartmentTitle?: unknown };
      setLossApartmentId(typeof data.apartmentId === "string" ? data.apartmentId : undefined);
      setLossApartmentTitle(typeof data.apartmentTitle === "string" ? data.apartmentTitle : undefined);
    }).catch((error) => console.warn("[BrokerClientDetail] Could not load chat metadata for loss report:", error));
  }, [params.chatRoomId]);

  const currentStageConfig = getPipelineStageConfig(pipelineStage);
  const elapsedDays = Math.max(0, Math.floor((Date.now() - stageUpdatedAt) / (1000 * 60 * 60 * 24)));
  const isStagnant = currentStageConfig.probability >= 0.5 && currentStageConfig.probability < 1 && elapsedDays >= 5;
  const stagnationColor = elapsedDays >= 10 ? "#EF4444" : elapsedDays >= 7 ? "#F97316" : "#EAB308";
  const stagnationIcon = elapsedDays >= 10 ? "warning-outline" : "alert-circle-outline";

  const handleStageSelection = async (selectedStageKey: PipelineStageKey) => {
    if (!auth.userId || !params.clientUserId) return;
    const nextStageUpdatedAt = Date.now();
    setPipelineStage(selectedStageKey);
    setStageUpdatedAt(nextStageUpdatedAt);
    setIsStageModalVisible(false);
    try {
      const docRef = doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`);
      await setDoc(docRef, {
        pipelineStage: selectedStageKey,
        dealCommission: dealCommission ?? null,
        stageUpdatedAt: nextStageUpdatedAt,
        brokerId: auth.userId,
        clientUserId: params.clientUserId,
        clientName: params.clientName ?? "Πελάτης",
        chatRoomId: params.chatRoomId ?? null,
        updatedAt: nextStageUpdatedAt,
      }, { merge: true });
      if (selectedStageKey === "closed_lost") setIsLossModalVisible(true);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving pipeline stage to brokerClientProfiles (permission or network issue):", error);
    }
  };

  const handleSaveLossReport = async () => {
    if (!auth.userId || !params.clientUserId) return;
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        lossReason,
        ...(lossReason === "other" && lossCustomReason.trim() ? { lossCustomReason: lossCustomReason.trim() } : { lossCustomReason: null }),
        lossApartmentId: lossApartmentId ?? null,
        lossApartmentTitle: lossApartmentTitle ?? null,
        lossReportedAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });
      setIsLossModalVisible(false);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving closed-lost analysis:", error);
    }
  };

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
      console.error("[BrokerClientDetail] Error saving purchasing power to brokerClientProfiles (permission or network issue):", error);
    } finally {
      setSavingPurchasingPower(false);
    }
  };
  return <View style={[styles.container, { paddingTop: insets.top }]} testID="broker-client-detail-screen">
    <View style={styles.header}><Pressable style={styles.iconButton} onPress={() => router.back()} testID="broker-client-back-btn"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><Text style={styles.headerTitle}>Στοιχεία Πελάτη</Text><View style={styles.iconSpacer} /></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>{params.clientAvatar ? <Image source={{ uri: params.clientAvatar }} style={styles.avatar} /> : <DefaultProfileAvatar size={64} />}<Text style={styles.clientName}>{params.clientName || "Πελάτης"}</Text><Pressable style={styles.chatButton} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: params.clientUserId || "", chatRoomId: params.chatRoomId || "" } })} testID="broker-client-chat-cta"><Ionicons name="chatbubbles-outline" size={20} color={colors.onBrand} /><Text style={styles.chatButtonText}>Μετάβαση στη Συνομιλία</Text></Pressable></View>
      <Pressable style={styles.stageCard} onPress={() => setIsStageModalVisible(true)} testID="broker-client-stage-card"><View style={styles.stageTitleWrap}><Ionicons name="trending-up-outline" size={21} color={colors.brand} /><Text style={styles.stageTitle}>Στάδιο Συμφωνίας (Pipeline)</Text></View><View style={styles.stageValueRow}><Text style={styles.stageValue}>{getPipelineStageConfig(pipelineStage).label} ({Math.round(getPipelineStageConfig(pipelineStage).probability * 100)}%)</Text><Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} /></View></Pressable>
        {isStagnant ? <View style={[styles.stagnationBanner, { backgroundColor: `${stagnationColor}22`, borderColor: stagnationColor }]} testID="broker-deal-stagnation-banner"><View style={styles.stagnationHeaderRow}><Ionicons name={stagnationIcon} size={22} color={stagnationColor} /><Text style={[styles.stagnationTitle, { color: stagnationColor }]}>Προσοχή: Κίνδυνος να χαθεί το deal</Text></View><Text style={[styles.stagnationBody, { color: colors.onSurface }]}>Ο πελάτης έχει μείνει {elapsedDays} μέρες στο στάδιο «{currentStageConfig.label}».</Text></View> : null}
      <View style={styles.purchasingPowerCard}>
        <Pressable style={styles.purchasingPowerHeader} onPress={() => setIsPurchasingPowerExpanded((previous) => !previous)} testID="broker-client-purchasing-power-toggle"><View style={styles.purchasingPowerTitleWrap}><Ionicons name="wallet-outline" size={21} color={colors.brand} /><Text style={styles.purchasingPowerTitle}>Πραγματική αγοραστική δύναμη</Text></View><Ionicons name={isPurchasingPowerExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurfaceTertiary} /></Pressable>
        {isPurchasingPowerExpanded ? <View style={styles.purchasingPowerContent}><Text style={styles.fieldLabel}>Μετρητά στο χέρι (€)</Text><TextInput value={cashOnHand} onChangeText={(value) => setCashOnHand(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 50000" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-cash-input" /><Text style={styles.fieldLabel}>Εγκεκριμένο στεγαστικό δάνειο (€)</Text><TextInput value={approvedMortgage} onChangeText={(value) => setApprovedMortgage(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 120000" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-mortgage-input" /><Text style={styles.fieldLabel}>Προθεσμία μετακόμισης</Text><TextInput value={moveInDeadline} onChangeText={setMoveInDeadline} placeholder="π.χ. Έως τέλος Σεπτεμβρίου 2026 / Άμεσα" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-deadline-input" /><Text style={styles.fieldLabel}>Σκοπός αγοράς / ενοικίασης</Text><TextInput value={purchasePurpose} onChangeText={setPurchasePurpose} placeholder="π.χ. Ιδιοκατοίκηση, Επενδυτικό (απόδοση), Φοιτητική στέγαση..." placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-purpose-input" /><Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSavePurchasingPower()} disabled={savingPurchasingPower} testID="broker-client-purchasing-power-save">{savingPurchasingPower ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="bookmark-outline" size={18} color={colors.onBrand} />}<Text style={styles.purchasingPowerSaveText}>Αποθήκευση στοιχείων</Text></Pressable>{purchasingPowerSavedSuccess ? <View style={styles.purchasingPowerSuccess}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={styles.purchasingPowerSuccessText}>Τα στοιχεία αποθηκεύτηκαν</Text></View> : null}</View> : null}
      </View>
      <Text style={styles.sectionTitle}>Κριτήρια Αναζήτησης Πελάτη</Text>{filters ? <View style={styles.criteriaCard}><Text style={styles.criteriaTitle}>{filters.title || "Κριτήρια Αναζήτησης Πελάτη"}</Text><View style={styles.chipsRow}>{[`${filters.rentMin || "0"} - ${filters.rentMax || "∞"} €`, `${filters.sizeMin || "0"} - ${filters.sizeMax || "∞"} m²`, `${filters.minSqmPrice || "0"} - ${filters.maxSqmPrice || "∞"} €/m²`, filters.cityQuery || "Όλες οι περιοχές", `Κατοικίδια: ${filters.petFriendly ? "Ναι" : "Όχι"}`, `Μετρό: ${filters.nearMetro ? "Ναι" : "Όχι"}`].map((chip) => <Text key={chip} style={styles.criteriaChip}>{chip}</Text>)}</View>{filters.summary ? <Text style={styles.body}>{filters.summary}</Text> : null}</View> : <Text style={styles.emptyHint}>Ο πελάτης δεν έχει διαμοιραστεί σετ φίλτρων ακόμα.</Text>}<Text style={styles.sectionTitle}>Προτεινόμενα Ακίνητα από το Χαρτοφυλάκιο</Text>{loading ? <ActivityIndicator color={colors.brand} /> : apartments.map((apartment) => <Pressable key={apartment.id} style={styles.apartmentRow} testID={`broker-matched-apartment-${apartment.id}`} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}><Text style={styles.cardTitle}>{apartment.title}</Text><Text style={styles.body}>{apartment.city}{apartment.area ? ` · ${apartment.area}` : ""}</Text><Text style={styles.price}>{apartment.rent} € · {apartment.size} m²</Text></Pressable>)}{!loading && apartments.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν διαθέσιμα ακίνητα στο χαρτοφυλάκιό σας που να πληρούν όλα τα κριτήρια.</Text> : null}</ScrollView>
    <Modal visible={isStageModalVisible} transparent animationType="fade" onRequestClose={() => setIsStageModalVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setIsStageModalVisible(false)}><Pressable style={styles.stageModal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>Επιλογή Σταδίου</Text>{PIPELINE_STAGES.map((stage) => <Pressable key={stage.key} style={styles.stageOption} onPress={() => void handleStageSelection(stage.key)} testID={`broker-stage-option-${stage.key}`}><Text style={styles.stageOptionLabel}>{stage.label}</Text><Text style={styles.probabilityBadge}>{Math.round(stage.probability * 100)}%</Text><Ionicons name={stage.key === pipelineStage ? "checkmark-circle" : "ellipse-outline"} size={21} color={stage.key === pipelineStage ? colors.brand : colors.onSurfaceTertiary} /></Pressable>)}</Pressable></Pressable></Modal>
    <Modal visible={isLossModalVisible} transparent animationType="fade" onRequestClose={() => setIsLossModalVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setIsLossModalVisible(false)}><Pressable style={styles.stageModal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>Γιατί χάθηκε η συμφωνία;</Text>{([{ key: "high_price", label: "Υψηλή τιμή" }, { key: "loan_rejected", label: "Απόρριψη δανείου από τράπεζα" }, { key: "chose_another_property", label: "Προτίμησε άλλο ακίνητο" }, { key: "owner_withdrew", label: "Υπαναχώρηση ιδιοκτήτη" }, { key: "other", label: "Άλλο" }] as const).map((reason) => <Pressable key={reason.key} style={styles.stageOption} onPress={() => setLossReason(reason.key)} testID={`broker-loss-reason-${reason.key}`}><Text style={styles.stageOptionLabel}>{reason.label}</Text><Ionicons name={lossReason === reason.key ? "checkmark-circle" : "ellipse-outline"} size={21} color={lossReason === reason.key ? colors.brand : colors.onSurfaceTertiary} /></Pressable>)}{lossReason === "other" ? <TextInput value={lossCustomReason} onChangeText={setLossCustomReason} placeholder="Περιγράψτε τον λόγο" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-loss-custom-reason" /> : null}<Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSaveLossReport()} testID="broker-loss-confirm"><Text style={styles.purchasingPowerSaveText}>Αποθήκευση λόγου</Text></Pressable></Pressable></Pressable></Modal>
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
  stageCard: { marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  stageTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stageTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  stageValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm },
  stageValue: { flex: 1, fontFamily: fonts.semibold, color: colors.brand },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  stageModal: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalTitle: { marginBottom: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  stageOption: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stageOptionLabel: { flex: 1, fontFamily: fonts.semibold, color: colors.onSurface },
  probabilityBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, fontFamily: fonts.bold, color: colors.brand },
  stagnationBanner: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  stagnationHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stagnationTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base },
  stagnationBody: { marginTop: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm },
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
