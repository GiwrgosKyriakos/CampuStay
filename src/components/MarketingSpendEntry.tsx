import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { saveCampaignSpend } from "@/src/api/marketingSpend";
import StandardLeadSourcePicker from "@/src/components/StandardLeadSourcePicker";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { StandardLeadSource } from "@/src/types/analytics";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function MarketingSpendEntry({ agencyId, recordedBy }: { agencyId: string; recordedBy: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<StandardLeadSource>("other");
  const [month, setMonth] = useState(currentMonth);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const reset = () => { setSource("other"); setMonth(currentMonth()); setAmount(""); };
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveCampaignSpend({ agencyId, recordedBy, source, month, spendAmount: Number(amount.replace(",", ".")) });
      reset();
      setVisible(false);
    } catch (error) {
      Alert.alert("Η καταχώριση απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally { setSaving(false); }
  };
  return <>
    <Pressable style={styles.trigger} onPress={() => setVisible(true)} testID="marketing-spend-open"><Ionicons name="receipt-outline" size={18} color={colors.brand} /><Text style={styles.triggerText}>Καταχώριση marketing spend</Text></Pressable>
    <BaseBottomSheet visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.content} testID="marketing-spend-form"><View style={styles.header}><View><Text style={styles.title}>Marketing spend</Text><Text style={styles.subtitle}>Μηνιαία καταχώριση τιμολογίου</Text></View><Pressable onPress={() => setVisible(false)} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View><Text style={styles.label}>Κανάλι</Text><StandardLeadSourcePicker value={source} onChange={setSource} testID="marketing-spend-source-picker" /><Text style={styles.label}>Μήνας</Text><TextInput value={month} onChangeText={setMonth} placeholder="YYYY-MM" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="numbers-and-punctuation" testID="marketing-spend-month" /><Text style={styles.label}>Ποσό (€)</Text><TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="decimal-pad" testID="marketing-spend-amount" /><Pressable style={[styles.submit, (saving || !amount.trim()) && styles.disabled]} disabled={saving || !amount.trim()} onPress={() => void submit()} testID="marketing-spend-submit">{saving ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="save-outline" size={18} color={colors.onBrand} /><Text style={styles.submitText}>Αποθήκευση</Text></>}</Pressable></View>
    </BaseBottomSheet>
  </>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  trigger: { minHeight: 40, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  triggerText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.brand },
  content: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, color: colors.onSurface, fontFamily: fonts.regular },
  submit: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  disabled: { opacity: 0.45 },
  submitText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});