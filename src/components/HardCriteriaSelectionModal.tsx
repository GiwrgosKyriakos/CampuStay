import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { HardCriteriaKey } from "@/src/types/filters";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export const HARD_CRITERIA_OPTIONS: { key: HardCriteriaKey; label: string }[] = [
  { key: "rent", label: "filters.hardCriteria.options.rent" },
  { key: "size", label: "filters.hardCriteria.options.size" },
  { key: "floor", label: "filters.hardCriteria.options.floor" },
  { key: "propertyType", label: "filters.hardCriteria.options.propertyType" },
  { key: "bedrooms", label: "filters.hardCriteria.options.bedrooms" },
  { key: "bathrooms", label: "filters.hardCriteria.options.bathrooms" },
  { key: "furnished", label: "filters.hardCriteria.options.furnished" },
  { key: "heating", label: "filters.hardCriteria.options.heating" },
  { key: "petFriendly", label: "filters.hardCriteria.options.petFriendly" },
  { key: "nearMetro", label: "filters.hardCriteria.options.nearMetro" },
  { key: "amenities", label: "filters.hardCriteria.options.amenities" },
];

interface HardCriteriaSelectionModalProps {
  visible: boolean;
  selected: HardCriteriaKey[];
  onClose: () => void;
  onToggle: (key: HardCriteriaKey) => void;
}

export default function HardCriteriaSelectionModal({ visible, selected, onClose, onToggle }: HardCriteriaSelectionModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="hard-criteria-selection-modal">
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{t("filters.hardCriteria.title")}</Text>
              <Text style={styles.description}>{t("filters.hardCriteria.description")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="hard-criteria-close-button"><Ionicons name="close-outline" size={24} color={colors.onSurfaceTertiary} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
            {HARD_CRITERIA_OPTIONS.map((option) => {
              const active = selected.includes(option.key);
              return <Pressable key={option.key} style={[styles.option, active && styles.optionActive]} onPress={() => onToggle(option.key)} testID={`hard-criteria-option-${option.key}`}><Text style={[styles.optionText, active && styles.optionTextActive]}>{t(option.label)}</Text><Ionicons name={active ? "checkbox" : "square-outline"} size={22} color={active ? colors.brand : colors.onSurfaceTertiary} /></Pressable>;
            })}
          </ScrollView>
          <Pressable style={styles.doneButton} onPress={onClose} testID="hard-criteria-done-button"><Text style={styles.doneText}>{t("common.actions.done")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: "rgba(0,0,0,0.45)" },
    card: { width: "100%", maxWidth: 420, maxHeight: "82%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    titleWrap: { flex: 1, gap: 2 },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    description: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    options: { gap: spacing.xs, paddingVertical: spacing.xs },
    option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    optionActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    optionText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
    optionTextActive: { fontFamily: fonts.bold, color: colors.brand },
    doneButton: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
    doneText: { fontFamily: fonts.bold, color: colors.onBrand },
  });
}
