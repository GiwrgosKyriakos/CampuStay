import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing } from "@/src/theme";

export type AssignmentMode = "simple" | "exclusive";

export interface PropertyAssignmentSetupModalProps {
  visible: boolean;
  apartmentTitle: string;
  defaultCommissionRate?: number;
  onClose: () => void;
  onContinue: (values: { mode: AssignmentMode; commissionRatePercentage: number }) => void;
}

export default function PropertyAssignmentSetupModal({ visible, apartmentTitle, defaultCommissionRate, onClose, onContinue }: PropertyAssignmentSetupModalProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<AssignmentMode>("simple");
  const [commissionRate, setCommissionRate] = useState("2");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!visible) return;
    setMode("simple");
    setCommissionRate(typeof defaultCommissionRate === "number" && Number.isFinite(defaultCommissionRate) ? String(defaultCommissionRate) : "2");
    setErrorText("");
  }, [defaultCommissionRate, visible]);

  const handleContinue = () => {
    const normalized = Number(commissionRate.replace(",", "."));
    if (!Number.isFinite(normalized) || normalized <= 0 || normalized > 100) {
      setErrorText(t("esign.assignmentRateError"));
      return;
    }
    onContinue({ mode, commissionRatePercentage: normalized });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.onSurface }]}>{t("esign.assignmentSetupTitle")}</Text>
              <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]} numberOfLines={2}>{apartmentTitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="assignment-setup-close"><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
          </View>
          <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.assignmentModeLabel")}</Text>
          <View style={styles.modeRow}>
            {(["simple", "exclusive"] as AssignmentMode[]).map((item) => {
              const active = mode === item;
              return <Pressable key={item} style={[styles.modeButton, { borderColor: active ? colors.brand : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }]} onPress={() => setMode(item)} testID={`assignment-mode-${item}`}><Ionicons name={item === "exclusive" ? "lock-closed-outline" : "document-outline"} size={18} color={active ? colors.brand : colors.onSurfaceTertiary} /><Text style={[styles.modeText, { color: active ? colors.brand : colors.onSurface }]}>{t(item === "exclusive" ? "esign.assignmentExclusive" : "esign.assignmentSimple")}</Text></Pressable>;
            })}
          </View>
          <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.commissionRateLabel")}</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><TextInput value={commissionRate} onChangeText={(value) => { setCommissionRate(value.replace(/[^0-9.,]/g, "")); setErrorText(""); }} keyboardType="decimal-pad" style={[styles.input, { color: colors.onSurface }]} placeholder="2" placeholderTextColor={colors.onSurfaceTertiary} testID="assignment-commission-input" /><Text style={[styles.percent, { color: colors.onSurfaceTertiary }]}>%</Text></View>
          <Text style={[styles.vatHint, { color: colors.onSurfaceTertiary }]}>{t("esign.vatIncluded")}</Text>
          {!!errorText && <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>}
          <View style={styles.actions}><Pressable style={[styles.cancelButton, { borderColor: colors.border }]} onPress={onClose} testID="assignment-setup-cancel"><Text style={[styles.cancelText, { color: colors.onSurface }]}>{t("common.actions.cancel")}</Text></Pressable><Pressable style={[styles.continueButton, { backgroundColor: colors.brand }]} onPress={handleContinue} testID="assignment-setup-continue"><Ionicons name="document-text-outline" size={18} color={colors.onBrand} /><Text style={[styles.continueText, { color: colors.onBrand }]}>{t("esign.startSigning")}</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(5,33,40,0.72)" },
  card: { width: "100%", maxWidth: 430, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.display, fontSize: fontSize.xl },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeButton: { flex: 1, minHeight: 62, borderWidth: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: spacing.xs },
  modeText: { fontFamily: fonts.bold, fontSize: fontSize.sm, textAlign: "center" },
  inputWrap: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.base },
  percent: { fontFamily: fonts.bold, fontSize: fontSize.base },
  vatHint: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  continueButton: { flex: 1.35, minHeight: 48, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  continueText: { fontFamily: fonts.bold, fontSize: fontSize.base },
});