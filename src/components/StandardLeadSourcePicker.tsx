import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { StandardLeadSource } from "@/src/types/analytics";

export const STANDARD_LEAD_SOURCES: StandardLeadSource[] = [
  "spitogatos",
  "xe_gr",
  "meta_ads",
  "google_ads",
  "agency_website",
  "referral",
  "walk_in",
  "signboard",
  "other",
];

export const STANDARD_LEAD_SOURCE_LABELS: Record<StandardLeadSource, string> = {
  spitogatos: "Σπιτόγατος",
  xe_gr: "Χρυσή Ευκαιρία",
  meta_ads: "Facebook/Instagram Ads",
  google_ads: "Google Ads",
  agency_website: "Ιστοσελίδα agency",
  referral: "Σύσταση",
  walk_in: "Walk-in",
  signboard: "Πινακίδα",
  other: "Άλλο",
};

export default function StandardLeadSourcePicker({ value, onChange, testID }: { value: StandardLeadSource; onChange: (source: StandardLeadSource) => void; testID?: string }) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const styles = createStyles(colors);
  return <>
    <Pressable style={styles.trigger} onPress={() => setVisible(true)} testID={testID}>
      <Text style={styles.triggerText}>{STANDARD_LEAD_SOURCE_LABELS[value]}</Text>
      <Ionicons name="chevron-down-outline" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.modal} testID={testID ? `${testID}-options` : undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Πηγή lead</Text><Pressable onPress={() => setVisible(false)} hitSlop={8}><Ionicons name="close-outline" size={23} color={colors.onSurface} /></Pressable></View>
          {STANDARD_LEAD_SOURCES.map((source) => <Pressable key={source} style={[styles.option, source === value && styles.optionActive]} onPress={() => { onChange(source); setVisible(false); }} testID={testID ? `${testID}-${source}` : undefined}><Text style={[styles.optionText, source === value && styles.optionTextActive]}>{STANDARD_LEAD_SOURCE_LABELS[source]}</Text>{source === value ? <Ionicons name="checkmark-outline" size={19} color={colors.brand} /> : null}</Pressable>)}
        </View>
      </View>
    </Modal>
  </>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  trigger: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  triggerText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  modal: { width: "100%", maxWidth: 420, maxHeight: "85%", borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.xs },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.sm },
  modalTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  option: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionActive: { backgroundColor: colors.brandTertiary },
  optionText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
  optionTextActive: { fontFamily: fonts.semibold, color: colors.brand },
});