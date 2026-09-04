import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { ChecklistCategory, ChecklistStatus, DealChecklistItem } from "@/src/types/checklist";

const CATEGORY_CONFIG: Record<ChecklistCategory, { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  engineering: { title: "Τεχνικός Έλεγχος & Μηχανικός", icon: "construct-outline" },
  legal: { title: "Νομικός Έλεγχος & Τίτλοι", icon: "scale-outline" },
  tax: { title: "Φορολογικά & ΑΑΔΕ", icon: "business-outline" },
  closing: { title: "Συμβολαιογράφος & Κλείσιμο", icon: "create-outline" },
};

const CATEGORY_ORDER: ChecklistCategory[] = ["engineering", "legal", "tax", "closing"];
const ASSIGNEE_LABELS: Record<DealChecklistItem["assignedToRole"], string> = {
  client: "Πελάτης",
  owner: "Ιδιοκτήτης",
  broker: "Μεσίτης",
  secretariat: "Γραμματεία",
};
const STATUS_META: Record<ChecklistStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { label: "Εκκρεμεί", icon: "ellipse-outline", color: "#6B7280" },
  uploaded: { label: "Προς Έλεγχο", icon: "time-outline", color: "#F97316" },
  verified: { label: "Εγκρίθηκε", icon: "checkmark-circle", color: "#16A34A" },
  rejected: { label: "Απορρίφθηκε", icon: "close-circle", color: "#DC2626" },
};

type DealChecklistSectionProps = {
  items: DealChecklistItem[];
  canReview: boolean;
  uploadingItemId?: string | null;
  highlightItemId?: string;
  onHighlightedItemLayout?: (itemId: string) => void;
  onUpload: (item: DealChecklistItem) => void;
  onPreview: (item: DealChecklistItem) => void;
  onReview: (item: DealChecklistItem, action: "verify" | "reject") => void;
};

export default function DealChecklistSection({ items, canReview, uploadingItemId, highlightItemId, onHighlightedItemLayout, onUpload, onPreview, onReview }: DealChecklistSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedCategories, setExpandedCategories] = useState<Set<ChecklistCategory>>(new Set(CATEGORY_ORDER));
  const [expandedRejectionId, setExpandedRejectionId] = useState<string | null>(null);
  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const verifiedCount = items.filter((item) => item.status === "verified").length;
  const progressPercent = items.length === 0 ? 0 : Math.round((verifiedCount / items.length) * 100);
  const phase = progressPercent >= 100
    ? "Οριστικό Συμβόλαιο & Μεταγραφή (100%)"
    : progressPercent >= 90
      ? "Προσύμφωνο & Φορολογικά (90% - 99%)"
      : "Συλλογή Δικαιολογητικών (0 - 89%)";

  useEffect(() => {
    if (!highlightItemId) return;
    const highlightedItem = items.find((item) => item.id === highlightItemId);
    if (!highlightedItem) return;
    setExpandedCategories((previous) => new Set(previous).add(highlightedItem.category));
    highlightOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(highlightOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(highlightOpacity, { toValue: 0, duration: 900, delay: 700, useNativeDriver: true }),
    ]).start();
  }, [highlightItemId, highlightOpacity, items]);

  const toggleCategory = (category: ChecklistCategory) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  return (
    <View style={styles.container} testID="deal-checklist-section">
      <View style={styles.progressHeader}>
        <View style={styles.progressTitleRow}>
          <View style={styles.progressTitleWrap}>
            <Ionicons name="documents-outline" size={18} color={colors.brand} />
            <Text style={styles.progressTitle}>{`${verifiedCount}/${items.length} Έγγραφα Εγκρίθηκαν (${progressPercent}%)`}</Text>
          </View>
          <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{phase}</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>
      </View>

      {CATEGORY_ORDER.map((category) => {
        const categoryItems = items.filter((item) => item.category === category);
        if (categoryItems.length === 0) return null;
        const categoryVerified = categoryItems.filter((item) => item.status === "verified").length;
        const expanded = expandedCategories.has(category);
        const config = CATEGORY_CONFIG[category];
        return (
          <View key={category} style={styles.categorySection}>
            <Pressable style={styles.categoryHeader} onPress={() => toggleCategory(category)} accessibilityRole="button" testID={`checklist-category-${category}`}>
              <View style={styles.categoryTitleWrap}>
                <Ionicons name={config.icon} size={18} color={colors.brand} />
                <Text style={styles.categoryTitle}>{config.title}</Text>
                <Text style={styles.categoryCount}>{`${categoryVerified}/${categoryItems.length}`}</Text>
              </View>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
            {expanded ? categoryItems.map((item) => {
              const status = STATUS_META[item.status] ?? STATUS_META.pending;
              const isUploading = uploadingItemId === item.id;
              const rejectionExpanded = expandedRejectionId === item.id;
              return (
                <View
                  key={item.id}
                  onLayout={() => item.id === highlightItemId && onHighlightedItemLayout?.(item.id)}
                  style={[styles.itemRow, { borderLeftColor: status.color }]}
                >
                  {item.id === highlightItemId ? <Animated.View pointerEvents="none" style={[styles.highlightOverlay, { opacity: highlightOpacity }]} /> : null}
                  <View style={styles.itemMain}>
                    <View style={styles.itemTitleRow}>
                      <Ionicons name={status.icon} size={20} color={status.color} />
                      <Text style={styles.itemTitle}>{item.title}</Text>
                    </View>
                    <Text style={styles.itemDescription}>{item.description || "Απαιτείται για την ολοκλήρωση της συναλλαγής."}</Text>
                    <View style={styles.itemMetaRow}>
                      <View style={styles.statusLabel}><Text style={[styles.statusLabelText, { color: status.color }]}>{status.label}</Text></View>
                      <View style={styles.assigneePill}><Ionicons name="person-outline" size={12} color={colors.onSurfaceTertiary} /><Text style={styles.assigneeText}>{ASSIGNEE_LABELS[item.assignedToRole]}</Text></View>
                    </View>
                    {item.status === "rejected" && item.rejectionReason ? (
                      <Pressable onPress={() => setExpandedRejectionId(rejectionExpanded ? null : item.id)} style={styles.rejectionNotice} testID={`checklist-rejection-${item.id}`}>
                        <Text numberOfLines={rejectionExpanded ? undefined : 1} style={styles.rejectionText}>{`Λόγος απόρριψης: ${item.rejectionReason}`}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.itemActions}>
                    <Pressable onPress={() => onUpload(item)} disabled={isUploading || item.status === "verified"} style={[styles.iconAction, item.status === "verified" && styles.disabledAction]} accessibilityLabel={item.fileUrl ? "Αντικατάσταση αρχείου" : "Μεταφόρτωση αρχείου"} testID={`checklist-upload-${item.id}`}>
                      {isUploading ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name={item.fileUrl ? "refresh-outline" : "cloud-upload-outline"} size={18} color={item.status === "verified" ? colors.onSurfaceTertiary : colors.brand} />}
                    </Pressable>
                    <Pressable onPress={() => onPreview(item)} disabled={!item.fileUrl} style={[styles.iconAction, !item.fileUrl && styles.disabledAction]} accessibilityLabel="Προεπισκόπηση εγγράφου" testID={`checklist-preview-${item.id}`}>
                      <Ionicons name="eye-outline" size={18} color={item.fileUrl ? colors.brand : colors.onSurfaceTertiary} />
                    </Pressable>
                    {canReview && item.status === "uploaded" ? (
                      <>
                        <Pressable onPress={() => onReview(item, "verify")} style={[styles.iconAction, styles.approveAction]} accessibilityLabel="Έγκριση εγγράφου" testID={`checklist-approve-${item.id}`}>
                          <Ionicons name="checkmark" size={18} color="#15803D" />
                        </Pressable>
                        <Pressable onPress={() => onReview(item, "reject")} style={[styles.iconAction, styles.rejectAction]} accessibilityLabel="Απόρριψη εγγράφου" testID={`checklist-reject-${item.id}`}>
                          <Ionicons name="close" size={18} color="#B91C1C" />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            }) : null}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { marginTop: spacing.sm, gap: spacing.sm },
    progressHeader: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    progressTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    progressTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    progressTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
    phaseBadge: { maxWidth: "45%", paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
    phaseBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.brand, textAlign: "center" },
    progressTrack: { height: 7, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: "#16A34A" },
    categorySection: { overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    categoryHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.sm },
    categoryTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    categoryTitle: { flexShrink: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
    categoryCount: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
    itemRow: { position: "relative", flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, padding: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderLeftWidth: 3 },
    highlightOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.brand, opacity: 0.12 },
    itemMain: { flex: 1, minWidth: 0, gap: 4 },
    itemTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
    itemTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    itemDescription: { fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 16, color: colors.onSurfaceTertiary },
    itemMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
    statusLabel: { paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    statusLabelText: { fontFamily: fonts.bold, fontSize: 10 },
    assigneePill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    assigneeText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.onSurfaceTertiary },
    rejectionNotice: { padding: spacing.xs, borderRadius: radius.sm, backgroundColor: "rgba(220, 38, 38, 0.08)" },
    rejectionText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, lineHeight: 16, color: "#B91C1C" },
    itemActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 3, maxWidth: 112 },
    iconAction: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surface },
    disabledAction: { opacity: 0.4 },
    approveAction: { backgroundColor: "rgba(22, 163, 74, 0.12)" },
    rejectAction: { backgroundColor: "rgba(220, 38, 38, 0.1)" },
  });
}
