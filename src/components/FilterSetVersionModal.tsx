import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { addDoc, collection, collectionGroup, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import type { LatLng } from "@/src/utils/geometry";
import type { HardCriteriaKey } from "@/src/types/filters";
import { BrokerModificationBadge } from "@/src/components/BrokerModificationBadge";
import { t } from "@/src/locales";

export type FilterSetSortOption = "newest" | "oldest" | "price_asc" | "price_desc" | "size_asc" | "size_desc" | "price_sqm_asc" | "price_sqm_desc";

export interface FilterSetVersionData {
  version: number;
  title: string;
  rentMin?: string;
  rentMax?: string;
  minSqmPrice?: string;
  maxSqmPrice?: string;
  cityQuery?: string;
  sizeMin?: string;
  sizeMax?: string;
  petFriendly: boolean;
  nearMetro: boolean;
  sortBy?: FilterSetSortOption;
  summary: string;
  showMatchScore?: boolean;
  propertyTypes?: string[];
  propertyCategories?: string[];
  floors?: string[];
  bedroomsMin?: string;
  bathroomsMin?: string;
  furnishedStatus?: "all" | "furnished" | "unfurnished";
  heatingTypes?: string[];
  energyClasses?: string[];
  constructionYearMin?: string;
  renovationYearMin?: string;
  selectedAmenities?: string[];
  polygonCoordinates?: LatLng[];
  updatedAt: number;
  origin?: "client_created" | "broker_created";
  brokerModCount?: number;
  lastModifiedByBrokerId?: string;
  lastModifiedByBrokerName?: string;
  lastModifiedAt?: number;
  isSharedWithClient?: boolean;
  userHardCriteria?: HardCriteriaKey[];
}

export interface SharedFilterSetRecord {
  id: string;
  userId: string;
  title: string;
  currentVersion: number;
  versions: FilterSetVersionData[];
  sharedBrokers: Array<{ brokerId: string; brokerName: string; brokerAvatar?: string; sharedAt: number }>;
  createdAt: number;
  updatedAt: number;
}

type BrokerDirectoryItem = { id: string; name: string; avatar: string };

type Props = {
  visible: boolean;
  filterSet: SharedFilterSetRecord | null;
  onClose: () => void;
  onUpdated?: (filterSet: SharedFilterSetRecord) => void;
};

const SORT_LABELS: Record<FilterSetSortOption, string> = {
  newest: "Πιο πρόσφατα", oldest: "Πιο παλιά", price_asc: "Αύξουσα τιμή", price_desc: "Φθίνουσα τιμή",
  size_asc: "Αύξον εμβαδόν", size_desc: "Φθίνουσα εμβαδόν", price_sqm_asc: "Αύξουσα τιμή/τ.μ.", price_sqm_desc: "Φθίνουσα τιμή/τ.μ.",
};
const SORT_OPTIONS = Object.keys(SORT_LABELS) as FilterSetSortOption[];

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function versionFromMessage(filterSet: SharedFilterSetRecord, snapshot: FilterSetVersionData): SharedFilterSetRecord {
  return { ...filterSet, currentVersion: snapshot.version, versions: [...filterSet.versions, snapshot], updatedAt: snapshot.updatedAt };
}

export default function FilterSetVersionModal({ visible, filterSet, onClose, onUpdated }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brokers, setBrokers] = useState<BrokerDirectoryItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [draft, setDraft] = useState<FilterSetVersionData | null>(null);

  const activeVersion = filterSet?.versions[selectedVersion] ?? filterSet?.versions[filterSet.versions.length - 1] ?? null;

  useEffect(() => {
    if (!visible || !filterSet) return;
    const index = Math.max(0, filterSet.versions.findIndex((version) => version.version === filterSet.currentVersion));
    setSelectedVersion(index);
    setEditing(false);
    setDraft(activeVersion);
  }, [filterSet, visible]);

  useEffect(() => {
    if (activeVersion && editing) setDraft(activeVersion);
  }, [activeVersion, editing]);

  const startEditing = () => {
    if (!activeVersion) return;
    setDraft({ ...activeVersion });
    setEditing(true);
  };

  const saveVersion = async () => {
    if (!filterSet || !draft || !auth.userId || saving) return;
    setSaving(true);
    try {
      const updatedAt = Date.now();
      const nextVersion = filterSet.versions.length + 1;
      const next: FilterSetVersionData = {
        version: nextVersion,
        title: filterSet.title,
        rentMin: nonEmpty(draft.rentMin ?? ""), rentMax: nonEmpty(draft.rentMax ?? ""),
        minSqmPrice: nonEmpty(draft.minSqmPrice ?? ""), maxSqmPrice: nonEmpty(draft.maxSqmPrice ?? ""),
        cityQuery: nonEmpty(draft.cityQuery ?? ""), sizeMin: nonEmpty(draft.sizeMin ?? ""), sizeMax: nonEmpty(draft.sizeMax ?? ""),
        petFriendly: draft.petFriendly === true, nearMetro: draft.nearMetro === true,
        sortBy: draft.sortBy, summary: draft.summary, showMatchScore: draft.showMatchScore === true,
        propertyTypes: draft.propertyTypes, propertyCategories: draft.propertyCategories, floors: draft.floors,
        bedroomsMin: nonEmpty(draft.bedroomsMin ?? ""), bathroomsMin: nonEmpty(draft.bathroomsMin ?? ""),
        furnishedStatus: draft.furnishedStatus, heatingTypes: draft.heatingTypes, energyClasses: draft.energyClasses,
        constructionYearMin: nonEmpty(draft.constructionYearMin ?? ""), renovationYearMin: nonEmpty(draft.renovationYearMin ?? ""),
        selectedAmenities: draft.selectedAmenities, polygonCoordinates: draft.polygonCoordinates, userHardCriteria: draft.userHardCriteria, updatedAt,
      };
      const updated = { ...filterSet, currentVersion: nextVersion, versions: [...filterSet.versions, next], updatedAt };
      await updateDoc(doc(db, "users", filterSet.userId, "sharedFilterSets", filterSet.id), updated);
      const messages = await getDocs(query(collectionGroup(db, "messages"), where("filterSetId", "==", filterSet.id)));
      await Promise.all(messages.docs.map((message) => updateDoc(message.ref, { filterSetData: next, filterSetId: filterSet.id, updatedAt })));
      onUpdated?.(updated);
      setSelectedVersion(updated.versions.length - 1);
      setEditing(false);
    } catch (error) {
      console.error("[FilterSetVersionModal] Error saving version:", error);
    } finally {
      setSaving(false);
    }
  };

  const openShare = async () => {
    if (!filterSet || sharing) return;
    setSharing(true);
    try {
      const snapshot = await getDocs(query(collection(db, "users"), where("is_broker", "==", true)));
      const excluded = new Set(filterSet.sharedBrokers.map((broker) => broker.brokerId));
      setBrokers(snapshot.docs.flatMap((brokerDoc) => {
        if (excluded.has(brokerDoc.id)) return [];
        const data = brokerDoc.data() as { name?: string; photoUrl?: string; avatar?: string; photos?: string[]; is_visible?: boolean; isVisible?: boolean };
        if (data.is_visible === false || data.isVisible === false) return [];
        return [{ id: brokerDoc.id, name: data.name?.trim() || "Μεσίτης", avatar: data.photoUrl || data.avatar || data.photos?.[0] || "" }];
      }));
    } catch (error) {
      console.error("[FilterSetVersionModal] Error loading brokers:", error);
      setBrokers([]);
    } finally {
      setSharing(false);
    }
  };

  const shareWithBroker = async (broker: BrokerDirectoryItem) => {
    if (!filterSet || !activeVersion || !auth.userId) return;
    const chatRoomId = [auth.userId, broker.id].sort().join("_");
    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: auth.userId, receiverId: broker.id, type: "filter_set_share", filterSetId: filterSet.id,
        filterSetData: activeVersion, text: `[Κριτήρια Αναζήτησης: ${filterSet.title}]`, createdAt: serverTimestamp(), isRead: false,
      });
      const sharedAt = Date.now();
      const sharedBroker = { brokerId: broker.id, brokerName: broker.name, ...(broker.avatar ? { brokerAvatar: broker.avatar } : {}), sharedAt };
      const updated = { ...filterSet, sharedBrokers: [...filterSet.sharedBrokers, sharedBroker], updatedAt: sharedAt };
      await updateDoc(doc(db, "users", filterSet.userId, "sharedFilterSets", filterSet.id), { sharedBrokers: updated.sharedBrokers, updatedAt: sharedAt });
      onUpdated?.(updated);
      setBrokers((previous) => previous.filter((item) => item.id !== broker.id));
    } catch (error) {
      console.error("[FilterSetVersionModal] Error sharing filter set:", error);
    }
  };

  if (!filterSet || !activeVersion) return null;
  const setDraftValue = (key: keyof FilterSetVersionData, value: string | boolean) => setDraft((previous) => previous ? { ...previous, [key]: value } : previous);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, editing && styles.cardEditing]} testID="filter-set-version-modal">
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{filterSet.title || "Set Φίλτρων"}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable>
          </View>
          {editing && draft ? (
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {([['rentMin', 'Ελάχιστο ενοίκιο'], ['rentMax', 'Μέγιστο ενοίκιο'], ['minSqmPrice', 'Ελάχιστη τιμή/τ.μ.'], ['maxSqmPrice', 'Μέγιστη τιμή/τ.μ.'], ['cityQuery', 'Πόλη / περιοχή'], ['sizeMin', 'Ελάχιστο εμβαδόν'], ['sizeMax', 'Μέγιστο εμβαδόν']] as const).map(([key, label]) => (
                <View key={key} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={String(draft[key] ?? "")} onChangeText={(value) => setDraftValue(key, value)} placeholderTextColor={colors.onSurfaceTertiary} /></View>
              ))}
              <View style={styles.switchRow}><Text style={styles.label}>{t("filterSetVersion.petFriendly")}</Text><Switch value={draft.petFriendly} onValueChange={(value) => setDraftValue("petFriendly", value)} /></View>
              <View style={styles.switchRow}><Text style={styles.label}>{t("filterSetVersion.nearMetro")}</Text><Switch value={draft.nearMetro} onValueChange={(value) => setDraftValue("nearMetro", value)} /></View>
              <Text style={styles.label}>{t("filterSetVersion.sort")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{SORT_OPTIONS.map((option) => <Pressable key={option} style={[styles.pill, draft.sortBy === option && styles.pillActive]} onPress={() => setDraftValue("sortBy", option)}><Text style={[styles.pillText, draft.sortBy === option && styles.pillTextActive]}>{SORT_LABELS[option]}</Text></Pressable>)}</ScrollView>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.criteria}>
              <View style={styles.versionBadge}><Text style={styles.versionText}>{t("filterSetVersion.version", { version: activeVersion.version })}</Text></View>
              <Text style={styles.summary}>{activeVersion.summary || "Όλα τα διαμερίσματα"}</Text>
              <BrokerModificationBadge
                modCount={activeVersion.brokerModCount}
                brokerName={activeVersion.lastModifiedByBrokerName}
                modifiedAt={activeVersion.lastModifiedAt}
              />
              {Object.entries({ "Ενοίκιο": [activeVersion.rentMin, activeVersion.rentMax].filter(Boolean).join(" - "), "Τιμή/τ.μ.": [activeVersion.minSqmPrice, activeVersion.maxSqmPrice].filter(Boolean).join(" - "), "Περιοχή": activeVersion.cityQuery, "Εμβαδόν": [activeVersion.sizeMin, activeVersion.sizeMax].filter(Boolean).join(" - "), "Κατοικίδια": activeVersion.petFriendly ? "Ναι" : "Όχι", "Μετρό": activeVersion.nearMetro ? "Ναι" : "Όχι", "Ταξινόμηση": activeVersion.sortBy ? SORT_LABELS[activeVersion.sortBy] : "" }).filter(([, value]) => value).map(([label, value]) => <View key={label} style={styles.criteriaPill}><Text style={styles.criteriaLabel}>{label}</Text><Text style={styles.criteriaValue}>{value}</Text></View>)}
            </ScrollView>
          )}
          {filterSet.versions.length >= 2 && !editing ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{filterSet.versions.map((version, index) => <Pressable key={version.version} style={[styles.pill, index === selectedVersion && styles.pillActive]} onPress={() => setSelectedVersion(index)}><Text style={[styles.pillText, index === selectedVersion && styles.pillTextActive]}>{t("filterSetVersion.version", { version: version.version })}</Text></Pressable>)}</ScrollView> : null}
          <View style={styles.actions}>
            <Pressable style={styles.actionButton} onPress={() => void openShare()}><Ionicons name="share-social-outline" size={18} color={colors.brand} /><Text style={styles.actionText}>{t("filterSetVersion.share")}</Text></Pressable>
            {auth.userId === filterSet.userId ? <Pressable style={[styles.actionButton, styles.primaryButton]} onPress={editing ? () => void saveVersion() : startEditing} disabled={saving}><Ionicons name={editing ? "bookmark-outline" : "create-outline"} size={18} color={colors.onBrand} />{saving ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.primaryText}>{editing ? "Αποθήκευση" : "Επεξεργασία"}</Text>}</Pressable> : null}
          </View>
          {brokers.length > 0 ? <View style={styles.brokerPicker}><Text style={styles.label}>Επιλογή μεσίτη</Text>{brokers.map((broker) => <Pressable key={broker.id} style={styles.brokerRow} onPress={() => void shareWithBroker(broker)}>{broker.avatar ? <Image source={{ uri: broker.avatar }} style={styles.avatar} /> : <Ionicons name="person-circle-outline" size={38} color={colors.onSurfaceTertiary} />}<Text style={styles.brokerName}>{broker.name}</Text><Ionicons name="paper-plane-outline" size={18} color={colors.brand} /></Pressable>)}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.48)", padding: spacing.lg },
  card: { width: "100%", maxHeight: "82%", borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  cardEditing: { height: "92%", maxHeight: "92%" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, title: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  criteria: { gap: spacing.sm }, versionBadge: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, versionText: { fontFamily: fonts.bold, color: colors.brand }, summary: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary }, criteriaPill: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm }, criteriaLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.semibold }, criteriaValue: { flex: 1, textAlign: "right", color: colors.onSurface, fontFamily: fonts.semibold }, form: { gap: spacing.sm, paddingBottom: spacing.sm }, field: { gap: spacing.xs }, label: { color: colors.onSurface, fontFamily: fonts.semibold }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, pills: { gap: spacing.xs }, pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, pillActive: { backgroundColor: colors.brand, borderColor: colors.brand }, pillText: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.sm }, pillTextActive: { color: colors.onBrand }, actions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }, actionButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.sm }, actionText: { color: colors.brand, fontFamily: fonts.bold }, primaryButton: { backgroundColor: colors.brand }, primaryText: { color: colors.onBrand, fontFamily: fonts.bold }, brokerPicker: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }, brokerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }, avatar: { width: 38, height: 38, borderRadius: radius.pill }, brokerName: { flex: 1, color: colors.onSurface, fontFamily: fonts.semibold },
});
