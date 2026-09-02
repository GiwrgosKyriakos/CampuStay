import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

interface AssignClientEmailModalProps {
  visible: boolean;
  brokerId: string;
  clientUserId: string;
  onClose: () => void;
  onSaved?: (email: string) => void;
}

export default function AssignClientEmailModal({ visible, brokerId, clientUserId, onClose, onSaved }: AssignClientEmailModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setEmail("");
      setError("");
    }
  }, [visible]);

  const handleSave = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(t("assignClientEmail.errors.invalidEmail"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", clientUserId), {
        email: cleanEmail,
        pendingClaimEmail: cleanEmail,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "brokerClientProfiles", `${brokerId}_${clientUserId}`), {
        clientEmail: cleanEmail,
        updatedAt: Date.now(),
      });
      onSaved?.(cleanEmail);
      onClose();
    } catch (saveError) {
      console.error("[AssignClientEmailModal] Failed to assign email:", saveError);
      setError(t("assignClientEmail.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="assign-client-email-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{t("assignClientEmail.title")}</Text>
            <Pressable onPress={onClose} disabled={saving} hitSlop={8} testID="assign-client-email-close"><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable>
          </View>
          <Text style={styles.subtitle}>{t("assignClientEmail.description")}</Text>
          <TextInput value={email} onChangeText={setEmail} autoFocus keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder={t("assignClientEmail.emailPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="assign-client-email-input" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={saving}><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
            <Pressable style={styles.saveButton} onPress={() => void handleSave()} disabled={saving} testID="assign-client-email-save">
              {saving ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="mail-outline" size={18} color={colors.onBrand} />}
              <Text style={styles.saveText}>{t("common.actions.save")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    card: { width: "100%", maxWidth: 440, padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19, color: colors.onSurfaceTertiary },
    input: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.regular },
    error: { color: colors.error, fontFamily: fonts.regular, fontSize: fontSize.sm },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
    cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    cancelText: { fontFamily: fonts.semibold, color: colors.onSurface },
    saveButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brand },
    saveText: { fontFamily: fonts.bold, color: colors.onBrand },
  });
}
