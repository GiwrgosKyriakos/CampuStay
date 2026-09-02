import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function EditVisitModal({
  visible,
  appointmentDate,
  isSaving,
  onClose,
  onSave,
  onCancelAppointment,
}: {
  visible: boolean;
  appointmentDate?: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (date: string) => void;
  onCancelAppointment: () => void;
}) {
  const { colors } = useTheme();
  const [date, setDate] = useState(appointmentDate ?? "");
  useEffect(() => { if (visible) setDate(appointmentDate ?? ""); }, [appointmentDate, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Επεξεργασία ραντεβού</Text>
            <Pressable onPress={onClose} disabled={isSaving} hitSlop={8}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
          </View>
          <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>Ημερομηνία και ώρα</Text>
          <TextInput value={date} onChangeText={setDate} placeholder="2026-09-01T17:30" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} autoCapitalize="none" testID="edit-visit-date-input" />
          <View style={styles.actions}>
            <Pressable onPress={onCancelAppointment} disabled={isSaving} style={[styles.cancelAction, { borderColor: colors.error }]} testID="cancel-visit-action"><Text style={[styles.cancelText, { color: colors.error }]}>Ακύρωση ραντεβού</Text></Pressable>
            <Pressable onPress={() => onSave(date.trim())} disabled={isSaving || !date.trim()} style={[styles.saveAction, { backgroundColor: colors.brand }, (isSaving || !date.trim()) && styles.disabled]} testID="save-visit-action">{isSaving ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Ionicons name="checkmark" size={18} color={colors.onBrand} />}<Text style={[styles.saveText, { color: colors.onBrand }]}>Αποθήκευση</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.base },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  cancelAction: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  saveAction: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  saveText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  disabled: { opacity: 0.5 },
});