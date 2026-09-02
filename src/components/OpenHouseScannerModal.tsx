import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { registerOpenHouseLead } from "@/src/api/agencyCollaboration";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function OpenHouseScannerModal({ visible, agencyId, apartmentId, apartmentTitle, brokerId, onClose, onRegistered }: { visible: boolean; agencyId: string; apartmentId: string; apartmentTitle: string; brokerId: string; onClose: () => void; onRegistered?: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const styles = createStyles(colors);
  const reset = () => { setName(""); setPhone(""); setEmail(""); setBudget(""); };
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await registerOpenHouseLead({ agencyId, apartmentId, apartmentTitle, clientName: name, phone, email, budget: budget.trim() ? Number(budget) : undefined, registeredByBrokerId: brokerId });
      reset();
      onRegistered?.();
      onClose();
    } catch (error) {
      Alert.alert("Η καταχώριση απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Εγγραφή επισκέπτη Open House</Text><Text style={styles.subtitle} numberOfLines={1}>{apartmentTitle}</Text></View><Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View><View style={styles.scannerHint}><Ionicons name="qr-code-outline" size={22} color={colors.brand} /><Text style={styles.scannerHintText}>Γρήγορη καταχώριση επισκέπτη</Text></View><TextInput value={name} onChangeText={setName} placeholder="Ονοματεπώνυμο *" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} autoCapitalize="words" testID="open-house-lead-name" /><TextInput value={phone} onChangeText={setPhone} placeholder="Τηλέφωνο" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="phone-pad" testID="open-house-lead-phone" /><TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="email-address" autoCapitalize="none" testID="open-house-lead-email" /><TextInput value={budget} onChangeText={(value) => setBudget(value.replace(/[^0-9.]/g, ""))} placeholder="Budget" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="decimal-pad" testID="open-house-lead-budget" /><Pressable style={[styles.submit, (!name.trim() || saving) && styles.disabled]} disabled={!name.trim() || saving} onPress={() => void submit()} testID="open-house-lead-submit">{saving ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="person-add-outline" size={19} color={colors.onBrand} /><Text style={styles.submitText}>Καταχώριση Lead</Text></>}</Pressable></View></View></Modal>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  scannerHint: { minHeight: 42, borderRadius: radius.md, backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  scannerHintText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.regular },
  submit: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  disabled: { opacity: 0.45 },
  submitText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});