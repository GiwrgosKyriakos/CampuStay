import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { FilterSetMessageData } from "@/src/components/chat/modals/types";

export interface SharedSearchHistoryItem {
  id: string;
  kind: "query" | "criteria";
  label: string;
  city?: string;
  budget?: string;
  createdAtMillis: number;
  filterSetData?: FilterSetMessageData;
}

export interface SearchHistorySelection {
  queries: string[];
  filterSets: { id: string; title: string; data: FilterSetMessageData }[];
}

interface SearchHistoryPickerModalProps {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
  onConfirm: (selection: SearchHistorySelection) => void;
}

function timestampToMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

function describeCriteria(data: FilterSetMessageData): { city?: string; budget?: string } {
  const city = data.cityQuery?.trim() || undefined;
  const minimum = data.rentMin?.trim();
  const maximum = data.rentMax?.trim();
  const budget = minimum || maximum ? `${minimum || "0"} - ${maximum || "∞"} €` : undefined;
  return { city, budget };
}

export default function SearchHistoryPickerModal({ visible, userId, onClose, onConfirm }: SearchHistoryPickerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<SharedSearchHistoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    setLoading(true);
    setSelectedIds(new Set());

    void (async () => {
      try {
        const [recentSnapshot, savedSnapshot] = await Promise.all([
          getDocs(query(collection(db, "users", userId, "recentSearches"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "users", userId, "savedFilterSets"), orderBy("updatedAt", "desc"))),
        ]);
        const recentItems: SharedSearchHistoryItem[] = recentSnapshot.docs.map((searchDoc) => {
          const data = searchDoc.data() as { query?: unknown; createdAt?: unknown };
          const label = typeof data.query === "string" ? data.query.trim() : "";
          return { id: `query:${searchDoc.id}`, kind: "query" as const, label, createdAtMillis: timestampToMillis(data.createdAt) };
        }).filter((item) => item.label.length > 0);
        const savedItems: SharedSearchHistoryItem[] = savedSnapshot.docs.map((savedDoc) => {
          const data = savedDoc.data() as FilterSetMessageData & { updatedAt?: unknown };
          const criteria = describeCriteria(data);
          return {
            id: `criteria:${savedDoc.id}`,
            kind: "criteria",
            label: data.title?.trim() || "Αποθηκευμένα κριτήρια",
            city: criteria.city,
            budget: criteria.budget,
            createdAtMillis: timestampToMillis(data.updatedAt),
            filterSetData: data,
          };
        });
        if (active) setItems([...recentItems, ...savedItems].sort((first, second) => second.createdAtMillis - first.createdAtMillis));
      } catch (error) {
        console.warn("[SearchHistoryPicker] Failed to load search history:", error);
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [userId, visible]);

  const toggleItem = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = items.filter((item) => selectedIds.has(item.id));
    onConfirm({
      queries: selected.filter((item) => item.kind === "query").map((item) => item.label),
      filterSets: selected.filter((item): item is SharedSearchHistoryItem & { filterSetData: FilterSetMessageData } => item.kind === "criteria" && !!item.filterSetData).map((item) => ({
        id: item.id.replace(/^criteria:/, ""),
        title: item.label,
        data: item.filterSetData,
      })),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="search-history-picker-modal">
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Ionicons name="search-outline" size={21} color={colors.brand} />
              <Text style={styles.title}>Ιστορικό αναζητήσεων</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="search-history-picker-close">
              <Ionicons name="close-circle-outline" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Επιλέξτε όσα θέλετε να μοιραστείτε με τον μεσίτη.</Text>
          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {items.length === 0 ? <Text style={styles.emptyText}>Δεν υπάρχουν αποθηκευμένες αναζητήσεις.</Text> : items.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <Pressable key={item.id} style={[styles.item, selected && styles.itemSelected]} onPress={() => toggleItem(item.id)} testID={`search-history-item-${item.id}`}>
                    <Ionicons name={selected ? "checkbox" : "square-outline"} size={22} color={selected ? colors.brand : colors.onSurfaceTertiary} />
                    <View style={styles.itemText}>
                      <Text style={styles.itemLabel} numberOfLines={1}>{item.label}</Text>
                      <View style={styles.metaRow}>
                        {item.kind === "query" ? <Ionicons name="search-outline" size={13} color={colors.onSurfaceTertiary} /> : <Ionicons name="options-outline" size={13} color={colors.onSurfaceTertiary} />}
                        {item.city ? <Text style={styles.metaText}>{item.city}</Text> : null}
                        {item.budget ? <Text style={styles.metaText}>{item.budget}</Text> : null}
                        {!item.city && !item.budget ? <Text style={styles.metaText}>{item.kind === "query" ? "Πρόσφατη αναζήτηση" : "Κριτήρια"}</Text> : null}
                        {item.createdAtMillis > 0 ? <Text style={styles.metaText}>{new Date(item.createdAtMillis).toLocaleDateString("el-GR")}</Text> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} testID="search-history-picker-cancel"><Text style={styles.cancelText}>Ακύρωση</Text></Pressable>
            <Pressable style={[styles.confirmButton, selectedIds.size === 0 && styles.confirmButtonDisabled]} onPress={handleConfirm} disabled={selectedIds.size === 0} testID="search-history-picker-confirm">
              <Ionicons name="share-outline" size={17} color={colors.onBrand} />
              <Text style={styles.confirmText}>Διαμοιρασμός ({selectedIds.size})</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
    card: { width: "100%", maxWidth: 460, maxHeight: "82%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19, color: colors.onSurfaceTertiary },
    loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
    list: { flexShrink: 1 },
    listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
    item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    itemSelected: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    itemText: { flex: 1, minWidth: 0, gap: 3 },
    itemLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    metaText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    emptyText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textAlign: "center", paddingVertical: spacing.xl },
    actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingTop: spacing.sm },
    cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    confirmButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brand },
    confirmButtonDisabled: { opacity: 0.45 },
    confirmText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  });
}
