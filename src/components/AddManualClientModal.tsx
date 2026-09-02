import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

interface AddManualClientModalProps {
  visible: boolean;
  brokerId: string;
  onClose: () => void;
  onCreated?: (clientId: string) => void;
}

export default function AddManualClientModal({ visible, brokerId, onClose, onCreated }: AddManualClientModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (saving) return;
    setName("");
    setCity("");
    setError("");
    onClose();
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanCity = city.trim();
    if (!cleanName || !cleanCity || !brokerId) {
      setError(t("manualClient.errors.missingDetails"));
      return;
    }

    setSaving(true);
    setError("");
    const clientUserId = `manual_client_${Date.now()}`;
    const profileId = `${brokerId}_${clientUserId}`;
    const chatRoomId = `${brokerId}_${clientUserId}`;
    try {
      await setDoc(doc(db, "users", clientUserId), {
        name: cleanName,
        city: cleanCity,
        is_manual_client: true,
        createdByBrokerId: brokerId,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "brokerClientProfiles", profileId), {
        brokerId,
        clientId: clientUserId,
        clientUserId,
        clientName: cleanName,
        clientCity: cleanCity,
        role: "client",
        isManual: true,
        pipelineStage: "new_lead",
        leadReadiness: "warm",
        chatRoomId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await setDoc(doc(db, "chats", chatRoomId), {
        users: [brokerId, clientUserId],
        type: "host",
        brokerChatRole: "client",
        manualClientUserId: clientUserId,
        status: "active",
        participantDisplayNames: { [brokerId]: t("manualClient.brokerRole"), [clientUserId]: cleanName },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onCreated?.(clientUserId);
      close();
    } catch (saveError) {
      console.error("[AddManualClientModal] Failed to create manual client:", saveError);
      setError(t("manualClient.errors.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="add-manual-client-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{t("manualClient.title")}</Text>
            <Pressable onPress={close} disabled={saving} hitSlop={8} testID="add-manual-client-close">
              <Ionicons name="close-outline" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <Text style={styles.label}>{t("manualClient.labels.fullName")}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t("manualClient.placeholders.fullName")} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} autoFocus testID="manual-client-name-input" />
          <Text style={styles.label}>{t("manualClient.labels.city")}</Text>
          <TextInput value={city} onChangeText={setCity} placeholder={t("manualClient.placeholders.city")} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="manual-client-city-input" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={close} disabled={saving}><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
            <Pressable style={styles.saveButton} onPress={() => void handleSave()} disabled={saving} testID="manual-client-save-button">
              {saving ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="person-add-outline" size={18} color={colors.onBrand} />}
              <Text style={styles.saveText}>{t("common.actions.add")}</Text>
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
    label: { marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    input: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.regular },
    error: { color: colors.error, fontFamily: fonts.regular, fontSize: fontSize.sm },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.md },
    cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    cancelText: { fontFamily: fonts.semibold, color: colors.onSurface },
    saveButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brand },
    saveText: { fontFamily: fonts.bold, color: colors.onBrand },
  });
}
