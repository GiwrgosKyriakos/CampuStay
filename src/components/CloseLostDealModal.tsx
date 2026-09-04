import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { LostDealReason } from "@/src/types/analytics";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

const LOSS_OPTIONS: { value: LostDealReason; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "price_dispute", label: "Διαφωνία τιμής", icon: "pricetag-outline" },
  { value: "legal_defect", label: "Νομικό ελάττωμα", icon: "document-text-outline" },
  { value: "competitor_won", label: "Επιλογή Άλλου Ακινήτου", icon: "home-outline" },
  { value: "financial_issue", label: "Οικονομικό ζήτημα", icon: "cash-outline" },
  { value: "buyer_withdrew", label: "Υπαναχώρηση Πελάτη", icon: "person-remove-outline" },
  { value: "owner_cancelled", label: "Ακύρωση Ιδιοκτήτη", icon: "close-circle-outline" },
];

export default function CloseLostDealModal({ visible, apartmentTitle, onClose, onConfirm }: { visible: boolean; apartmentTitle: string; onClose: () => void; onConfirm: (reason: LostDealReason, notes?: string) => void }) {
  const { colors } = useTheme();
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (visible) {
      setSelectedOptionIndex(null);
      setNotes("");
    }
  }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.title, { color: colors.onSurface }]}>Αιτιολογία Απώλειας Συμφωνίας</Text><Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{apartmentTitle}</Text></View><Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.options} bounces={false}>{LOSS_OPTIONS.map((option, index) => {
        const selected = selectedOptionIndex === index;
        return <Pressable key={option.label} style={[styles.option, { borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandTertiary : colors.surfaceSecondary }]} onPress={() => setSelectedOptionIndex(index)} testID={`close-lost-deal-reason-${index}`}><Ionicons name={option.icon} size={20} color={selected ? colors.brand : colors.onSurfaceTertiary} /><Text style={[styles.optionText, { color: colors.onSurface }]}>{option.label}</Text><Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={21} color={selected ? colors.brand : colors.onSurfaceTertiary} /></Pressable>;
      })}</ScrollView>
      <TextInput value={notes} onChangeText={setNotes} placeholder="Προαιρετικές σημειώσεις" placeholderTextColor={colors.onSurfaceTertiary} multiline style={[styles.notesInput, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} />
      <View style={styles.actions}><Pressable style={[styles.cancelButton, { borderColor: colors.border }]} onPress={onClose}><Text style={[styles.cancelText, { color: colors.onSurface }]}>Ακύρωση</Text></Pressable><Pressable style={[styles.confirmButton, { backgroundColor: colors.error }, selectedOptionIndex === null && styles.disabled]} disabled={selectedOptionIndex === null} onPress={() => selectedOptionIndex !== null && onConfirm(LOSS_OPTIONS[selectedOptionIndex].value, notes.trim() || undefined)} testID="close-lost-deal-confirm"><Ionicons name="archive-outline" size={18} color={colors.onBrand} /><Text style={[styles.confirmText, { color: colors.onBrand }]}>Καταχώριση</Text></Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.48)" },
  card: { width: "100%", maxHeight: "84%", borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  options: { gap: spacing.sm },
  option: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  optionText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  notesInput: { minHeight: 72, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: spacing.sm },
  cancelButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  confirmButton: { flex: 1, minHeight: 46, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  confirmText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  disabled: { opacity: 0.4 },
});