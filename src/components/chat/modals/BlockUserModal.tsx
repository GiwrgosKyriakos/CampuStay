import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import KeyboardAwareModal from "@/src/components/common/KeyboardAwareModal";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

export interface BlockUserModalProps {
  visible: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onBlockOnly: () => void;
  onBlockAndReport: (reason: string) => void;
}

export default function BlockUserModal({ visible, isSubmitting, onClose, onBlockOnly, onBlockAndReport }: BlockUserModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const close = () => {
    if (isSubmitting) return;
    setExpanded(false);
    setReason("");
    onClose();
  };

  return (
    <KeyboardAwareModal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={styles.backdrop}><View style={styles.card}>
        <Text style={styles.title}>{t("chat.blockModal.title")}</Text>
        <Pressable style={[styles.button, isSubmitting && styles.disabled]} onPress={onBlockOnly} disabled={isSubmitting} testID="chat-block-confirm-button"><Text style={styles.buttonText}>{t("chat.blockModal.blockOnly")}</Text></Pressable>
        <Pressable style={[styles.toggle, isSubmitting && styles.disabled]} onPress={() => setExpanded(true)} disabled={isSubmitting} testID="chat-block-report-expand"><Text style={styles.toggleText}>{t("chat.blockModal.blockAndReport")}</Text></Pressable>
        {expanded ? <View style={styles.reportWrap}><TextInput value={reason} onChangeText={setReason} placeholder={t("chat.blockModal.reportReasonPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} multiline numberOfLines={4} textAlignVertical="top" editable={!isSubmitting} testID="chat-block-report-reason-input" /><Pressable style={[styles.button, (!reason.trim() || isSubmitting) && styles.disabled]} onPress={() => onBlockAndReport(reason.trim())} disabled={!reason.trim() || isSubmitting} testID="chat-block-report-submit"><Text style={styles.buttonText}>{t("chat.blockModal.submitBlockAndReport")}</Text></Pressable></View> : null}
        <Pressable style={styles.cancel} onPress={close} disabled={isSubmitting} testID="chat-block-cancel"><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
      </View></View>
    </KeyboardAwareModal>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  button: { borderRadius: radius.md, backgroundColor: colors.brand, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: "center" },
  buttonText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onBrand },
  toggle: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: "center" },
  toggleText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  reportWrap: { gap: spacing.sm },
  input: { minHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface },
  cancel: { alignItems: "center", paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  disabled: { opacity: 0.5 },
});
