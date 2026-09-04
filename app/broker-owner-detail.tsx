import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { uploadListingDocumentAsync } from "@/src/api/imageUpload";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { OWNER_MOTIVATION_OPTIONS } from "@/src/screens/CreateListingScreen";
import type { BrokerApartment, BrokerDocument } from "./(tabs)/broker";

type DocumentCategoryKey = "topographicPlans" | "ownershipContracts" | "buildingPermits" | "engineerCertificates" | "unauthorizedConstructionsSettlement" | "energyCertificates" | "signedBrokerageAgreement" | "gdprConsent";
const DOCUMENT_CATEGORIES: { key: DocumentCategoryKey; title: string }[] = [
  { key: "topographicPlans", title: "Τοπογραφικά διαγράμματα και έγγραφα" },
  { key: "ownershipContracts", title: "Συμβόλαια ιδιοκτησίας" },
  { key: "buildingPermits", title: "Οικοδομικές άδειες" },
  { key: "engineerCertificates", title: "Βεβαιώσεις μηχανικού" },
  { key: "unauthorizedConstructionsSettlement", title: "Τακτοποίηση αυθαιρέτων" },
  { key: "energyCertificates", title: "Πιστοποιητικά ενεργειακής απόδοσης" },
  { key: "signedBrokerageAgreement", title: "Υπογεγραμμένη σύμβαση ανάθεσης με τον ιδιοκτήτη" },
  { key: "gdprConsent", title: "Έγγραφη συγκατάθεση επεξεργασίας προσωπικών δεδομένων" },
];
const digitsOnly = (value: string) => value.replace(/[^0-9]/g, "");

function mapDocuments(value: unknown): Record<DocumentCategoryKey, BrokerDocument[]> {
  return DOCUMENT_CATEGORIES.reduce((result, category) => {
    const entries = value && typeof value === "object" ? (value as Record<string, unknown>)[category.key] : undefined;
    result[category.key] = Array.isArray(entries) ? entries
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && typeof entry.url === "string")
      .map((entry, index) => ({ id: typeof entry.id === "string" ? entry.id : `${category.key}-${index}`, name: typeof entry.name === "string" ? entry.name : `Έγγραφο ${index + 1}`, url: entry.url as string, size: Number(entry.size) || 0, uploadedAt: typeof entry.uploadedAt === "string" ? entry.uploadedAt : "" })) : [];
    return result;
  }, {} as Record<DocumentCategoryKey, BrokerDocument[]>);
}

export default function BrokerOwnerDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ownerName?: string; ownerAvatar?: string; apartmentIds?: string }>();
  const { colors } = useTheme();
  const auth = useAuth();
  const styles = useMemo(() => ({ ...createStyles(colors), ...createExtraStyles(colors) }), [colors]);
  const [apartments, setApartments] = useState<BrokerApartment[]>([]);
  const [expandedApartmentIds, setExpandedApartmentIds] = useState<Set<string>>(new Set());
  const [editedPriceExpectations, setEditedPriceExpectations] = useState<Record<string, string>>({});
  const [savingExpectationId, setSavingExpectationId] = useState<string | null>(null);
  const [savedExpectationId, setSavedExpectationId] = useState<string | null>(null);
  const [motivationApartmentId, setMotivationApartmentId] = useState<string | null>(null);
  const [documentApartmentId, setDocumentApartmentId] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<DocumentCategoryKey | null>(null);
  const [loading, setLoading] = useState(true);
  const apartmentIds = useMemo(() => { try { return JSON.parse(params.apartmentIds ?? "[]") as string[]; } catch { return []; } }, [params.apartmentIds]);

  useEffect(() => {
    let active = true;
    void Promise.all(apartmentIds.map(async (id) => {
      const snapshot = await getDoc(doc(db, "apartments", id));
      if (!snapshot.exists()) return null;
      const data = snapshot.data() as Record<string, unknown>;
      const assignedBrokerIds = Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds : [];
      if (auth.userId && data.hostId !== auth.userId && !assignedBrokerIds.includes(auth.userId)) return null;
      return { ...data, id, title: String(data.title ?? "Ακίνητο"), rent: Number(data.rent ?? data.price ?? 0), area: String(data.area ?? ""), city: String(data.city ?? ""), size: Number(data.size ?? data.sqft ?? 0), image: String(data.image ?? data.imageUrl ?? (Array.isArray(data.images) ? data.images[0] ?? "" : "")), tags: Array.isArray(data.tags) ? data.tags.map(String) : [], documents: mapDocuments(data.documents) } as BrokerApartment;
    })).then((items) => {
      if (!active) return;
      const loaded = items.filter((item): item is BrokerApartment => item !== null);
      setApartments(loaded);
      setEditedPriceExpectations(Object.fromEntries(loaded.map((apartment) => [apartment.id, String(apartment.ownerDetails?.priceExpectation ?? apartment.rent)])));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apartmentIds, auth.userId]);

  const toggleApartment = (apartmentId: string) => setExpandedApartmentIds((previous) => {
    const next = new Set(previous);
    if (next.has(apartmentId)) next.delete(apartmentId); else next.add(apartmentId);
    return next;
  });
  const updateApartmentDocuments = (apartmentId: string, documents: Record<DocumentCategoryKey, BrokerDocument[]>) => setApartments((previous) => previous.map((apartment) => apartment.id === apartmentId ? { ...apartment, documents } : apartment));

  const saveExpectation = async (apartment: BrokerApartment) => {
    const value = Number(editedPriceExpectations[apartment.id]);
    if (!Number.isFinite(value)) return;
    setSavingExpectationId(apartment.id);
    try {
      await updateDoc(doc(db, "apartments", apartment.id), { "ownerDetails.priceExpectation": value, updatedAt: serverTimestamp() });
      setApartments((previous) => previous.map((item) => item.id === apartment.id ? { ...item, ownerDetails: { ...item.ownerDetails, priceExpectation: value } } : item));
      setSavedExpectationId(apartment.id);
      setTimeout(() => setSavedExpectationId((current) => current === apartment.id ? null : current), 2000);
    } finally { setSavingExpectationId(null); }
  };

  const attachDocument = async (apartment: BrokerApartment, categoryKey: DocumentCategoryKey) => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: true });
    if (result.canceled) return;
    setUploadingCategory(categoryKey);
    try {
      const uploaded = await Promise.all(result.assets.filter((asset) => asset.uri.trim().length > 0).map(async (asset, index) => ({
        id: `${categoryKey}-${Date.now()}-${index}`, name: asset.name?.trim() || `Έγγραφο ${index + 1}`,
        url: await uploadListingDocumentAsync({ uri: asset.uri, apartmentId: apartment.id, categoryKey, fileName: asset.name || `document-${index + 1}`, mimeType: asset.mimeType }),
        size: Number(asset.size) || 0, uploadedAt: new Date().toISOString(),
      })));
      const documents = mapDocuments(apartment.documents);
      documents[categoryKey] = [...documents[categoryKey], ...uploaded];
      await updateDoc(doc(db, "apartments", apartment.id), { documents, updatedAt: serverTimestamp() });
      updateApartmentDocuments(apartment.id, documents);
    } finally { setUploadingCategory(null); }
  };

  const removeDocument = async (apartment: BrokerApartment, categoryKey: DocumentCategoryKey, documentId: string) => {
    const documents = mapDocuments(apartment.documents);
    documents[categoryKey] = documents[categoryKey].filter((document) => document.id !== documentId);
    await updateDoc(doc(db, "apartments", apartment.id), { documents, updatedAt: serverTimestamp() });
    updateApartmentDocuments(apartment.id, documents);
  };
  const selectedApartment = apartments.find((apartment) => apartment.id === documentApartmentId) ?? null;
  const documentCount = selectedApartment ? DOCUMENT_CATEGORIES.filter((category) => (selectedApartment.documents?.[category.key]?.length ?? 0) > 0).length : 0;

  return <View style={[styles.container, { paddingTop: insets.top }]} testID="broker-owner-detail-screen">
    <View style={styles.header}><Pressable style={styles.iconButton} onPress={() => router.back()} testID="broker-owner-back-btn"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><Text style={styles.headerTitle}>Στοιχεία Ιδιοκτήτη</Text><View style={styles.iconSpacer} /></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}><View style={styles.profileHeader}>{params.ownerAvatar ? <Image source={{ uri: params.ownerAvatar }} style={styles.ownerAvatar} contentFit="cover" /> : <DefaultProfileAvatar size={64} iconSize={30} />}<View style={styles.profileInfo}><Text style={styles.ownerName}>{params.ownerName || "Ιδιοκτήτης"}</Text><View style={styles.profileBadge}><Ionicons name="briefcase-outline" size={14} color={colors.brand} /><Text style={styles.profileBadgeText}>Ιδιοκτήτης</Text></View></View></View></View>
      <Text style={styles.sectionTitle}>Ακίνητα Ιδιοκτήτη</Text>
      {loading ? <ActivityIndicator color={colors.brand} /> : apartments.map((apartment) => {
        const isExpanded = expandedApartmentIds.has(apartment.id);
        const documentsReady = DOCUMENT_CATEGORIES.filter((category) => (apartment.documents?.[category.key]?.length ?? 0) > 0).length;
        return <View key={apartment.id} style={styles.apartmentCard} testID={`broker-owner-apartment-${apartment.id}`}>
          <Pressable style={styles.apartmentHeader} onPress={() => toggleApartment(apartment.id)} testID={`broker-owner-apartment-toggle-${apartment.id}`}>
            {apartment.image ? <Image source={{ uri: apartment.image }} style={styles.apartmentImage} contentFit="cover" /> : <View style={[styles.apartmentImage, styles.imagePlaceholder]}><Ionicons name="home-outline" size={28} color={colors.brand} /></View>}
            <View style={styles.apartmentInfo}><Text style={styles.cardTitle} numberOfLines={1}>{apartment.title}</Text><Text style={styles.body} numberOfLines={1}>{apartment.area || apartment.city}{apartment.area && apartment.city ? ` · ${apartment.city}` : ""}</Text><Text style={styles.price}>{apartment.rent} €</Text></View>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
          {isExpanded ? <View style={styles.expandedContent}>
            <View style={styles.detailSection}><Text style={styles.label}>Κίνητρο ιδιοκτήτη</Text><Pressable style={styles.selectionPill} onPress={() => setMotivationApartmentId(apartment.id)} testID={`broker-owner-motivation-${apartment.id}`}><Text style={styles.selectionPillText}>{apartment.ownerDetails?.motivation || "Επιλέξτε κίνητρο"}</Text><Ionicons name="chevron-down" size={16} color={colors.brand} /></Pressable></View>
            <Pressable style={styles.legalRow} onPress={() => setDocumentApartmentId(apartment.id)} testID={`broker-owner-documents-${apartment.id}`}><Ionicons name={documentsReady === 0 ? "alert-circle-outline" : documentsReady === DOCUMENT_CATEGORIES.length ? "checkmark-circle" : "document-text-outline"} size={22} color={documentsReady === 0 ? colors.error : documentsReady === DOCUMENT_CATEGORIES.length ? colors.success : colors.brand} /><Text style={styles.legalLabel}>Νομική Ετοιμότητα</Text><Text style={styles.scoreBadge}>{documentsReady}/{DOCUMENT_CATEGORIES.length}</Text><Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} /></Pressable>
            <View style={styles.detailSection}><Text style={styles.label}>Προσδοκία τιμής κλεισίματος</Text><View style={styles.expectationRow}><TextInput value={editedPriceExpectations[apartment.id] ?? ""} onChangeText={(value) => setEditedPriceExpectations((previous) => ({ ...previous, [apartment.id]: digitsOnly(value) }))} keyboardType="number-pad" style={styles.expectationInput} /><Pressable style={styles.saveButton} onPress={() => void saveExpectation(apartment)} disabled={savingExpectationId === apartment.id} testID={`broker-owner-save-expectation-${apartment.id}`}>{savingExpectationId === apartment.id ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="save-outline" size={18} color={colors.onBrand} />}</Pressable></View>{savedExpectationId === apartment.id ? <Text style={styles.successCaption}>Αποθηκεύτηκε επιτυχώς</Text> : null}</View>
            <View style={styles.expandedFooter}><Pressable style={styles.openApartmentButton} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)} testID={`broker-owner-open-apartment-${apartment.id}`}><Ionicons name="arrow-forward" size={18} color={colors.onBrand} /><Text style={styles.openApartmentText}>Μετάβαση στην αγγελία</Text></Pressable></View>
          </View> : null}
        </View>;
      })}
      {!loading && apartments.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν ακίνητα.</Text> : null}
    </ScrollView>
    <BaseBottomSheet visible={selectedApartment !== null} onClose={() => setDocumentApartmentId(null)} maxHeight="90%" scrollable={false}><View style={[styles.repositorySheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Αρχειοθήκη Εγγράφων</Text><Text style={styles.modalSubtitle}>{selectedApartment?.title} · {documentCount}/{DOCUMENT_CATEGORIES.length}</Text></View><Pressable onPress={() => setDocumentApartmentId(null)} hitSlop={8}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable></View>
      <ScrollView showsVerticalScrollIndicator={false}>{selectedApartment ? DOCUMENT_CATEGORIES.map((category) => { const files = selectedApartment.documents?.[category.key] ?? []; return <View key={category.key} style={styles.documentBlock}><View style={styles.documentRow}><Text style={styles.documentTitle}>{category.title}</Text><Pressable onPress={() => void attachDocument(selectedApartment, category.key)} disabled={uploadingCategory === category.key} hitSlop={8} testID={`broker-owner-document-attach-${category.key}`}>{uploadingCategory === category.key ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="attach-outline" size={21} color={colors.brand} />}</Pressable></View>{files.map((file) => <View key={file.id} style={styles.fileRow}><Pressable style={styles.fileNameWrap} onPress={() => void Linking.openURL(file.url)}><Ionicons name="document-outline" size={18} color={colors.onSurfaceTertiary} /><Text style={styles.fileName} numberOfLines={1}>{file.name}</Text></Pressable><Pressable onPress={() => void removeDocument(selectedApartment, category.key, file.id)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable></View>)}</View>; }) : null}</ScrollView>
    </View></BaseBottomSheet>
    <Modal visible={motivationApartmentId !== null} transparent animationType="fade" onRequestClose={() => setMotivationApartmentId(null)}><View style={styles.modalBackdrop}><View style={[styles.motivationSheet, { paddingBottom: insets.bottom + spacing.lg }]}><Text style={styles.modalTitle}>Κίνητρο ιδιοκτήτη</Text>{OWNER_MOTIVATION_OPTIONS.map((option) => <Pressable key={option} style={styles.motivationOption} onPress={() => { const apartment = apartments.find((item) => item.id === motivationApartmentId); if (!apartment) return; void updateDoc(doc(db, "apartments", apartment.id), { "ownerDetails.motivationType": option, "ownerDetails.motivation": option, updatedAt: serverTimestamp() }).then(() => { setApartments((previous) => previous.map((item) => item.id === apartment.id ? { ...item, ownerDetails: { ...item.ownerDetails, motivation: option } } : item)); setMotivationApartmentId(null); }); }}><Text style={styles.motivationOptionText}>{option}</Text><Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} /></Pressable>)}<Pressable style={styles.cancelButton} onPress={() => setMotivationApartmentId(null)}><Text style={styles.cancelButtonText}>Ακύρωση</Text></Pressable></View></View></Modal>
  </View>;
}

const createExtraStyles = (colors: ThemeColors) => StyleSheet.create({
  profileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ownerAvatar: { width: 64, height: 64, borderRadius: 32 },
  profileInfo: { flex: 1, gap: spacing.xs },
  profileBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  profileBadgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
  selectionPill: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42, marginTop: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  selectionPillText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  successCaption: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.success },
  openApartmentText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  expandedFooter: { marginTop: spacing.md },
  openApartmentButton: { width: "100%", minHeight: 46, flexDirection: "row", gap: spacing.sm, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  motivationSheet: { width: "100%", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  motivationOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  motivationOptionText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  cancelButton: { alignItems: "center", marginTop: spacing.md, paddingVertical: spacing.md },
  cancelButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.brand },
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, iconSpacer: { width: 40 }, headerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface }, content: { padding: spacing.lg, paddingBottom: spacing["3xl"] }, profileCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, ownerName: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface }, sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface }, apartmentCard: { marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" }, apartmentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm }, apartmentImage: { width: 88, height: 76, borderRadius: radius.lg }, imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }, apartmentInfo: { flex: 1 }, cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface }, body: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs }, price: { marginTop: spacing.xs, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand }, expandedContent: { padding: spacing.md, paddingTop: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, detailSection: { paddingTop: spacing.md }, label: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }, legalRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }, legalLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface }, scoreBadge: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand }, expectationRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }, expectationInput: { flex: 1, height: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.onSurface, fontFamily: fonts.semibold }, saveButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand }, expandedFooter: { alignItems: "flex-end", marginTop: spacing.md }, openApartmentButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand }, emptyHint: { paddingVertical: spacing.xl, textAlign: "center", color: colors.onSurfaceTertiary, fontFamily: fonts.regular }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }, repositorySheet: { maxHeight: "88%", minHeight: "62%", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }, modalTitle: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface }, modalSubtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }, documentBlock: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, documentRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, documentTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface }, fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, paddingLeft: spacing.sm }, fileNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }, fileName: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.brand },
});