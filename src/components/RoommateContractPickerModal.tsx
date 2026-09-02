import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing } from "@/src/theme";
import type { ContractType } from "@/src/types/esignature";

export interface RoommateContractPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (contractType: Extract<ContractType, "roommate_agreement" | "holding_deposit_viewing">) => void;
}

export default function RoommateContractPickerModal({ visible, onClose, onSelect }: RoommateContractPickerModalProps) {
  const { colors } = useTheme();
  const options: { type: Extract<ContractType, "roommate_agreement" | "holding_deposit_viewing">; icon: keyof typeof Ionicons.glyphMap; label: string; description: string }[] = [
    { type: "roommate_agreement", icon: "people-outline", label: t("esign.roommateAgreement"), description: t("esign.roommateAgreementDescription") },
    { type: "holding_deposit_viewing", icon: "wallet-outline", label: t("esign.holdingDeposit"), description: t("esign.holdingDepositDescription") },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.headerRow}><Text style={[styles.title, { color: colors.onSurface }]}>{t("esign.chooseContract")}</Text><Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable></View>
          {options.map((option) => <Pressable key={option.type} style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} onPress={() => onSelect(option.type)} testID={`roommate-contract-${option.type}`}><View style={[styles.iconWrap, { backgroundColor: colors.brandTertiary }]}><Ionicons name={option.icon} size={22} color={colors.brand} /></View><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.onSurface }]}>{option.label}</Text><Text style={[styles.optionDescription, { color: colors.onSurfaceTertiary }]}>{option.description}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.onSurfaceTertiary} /></Pressable>)}
          <Pressable style={styles.cancelButton} onPress={onClose}><Text style={[styles.cancelText, { color: colors.brand }]}>{t("common.actions.cancel")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(5,33,40,0.72)" },
  card: { width: "100%", maxWidth: 440, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  title: { flex: 1, fontFamily: fonts.display, fontSize: fontSize.xl },
  option: { minHeight: 78, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base },
  optionDescription: { fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 17 },
  cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  cancelText: { fontFamily: fonts.bold, fontSize: fontSize.base },
});