import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import Dropdown from "@/src/components/Dropdown";
import StandardLeadSourcePicker from "@/src/components/StandardLeadSourcePicker";
import type { StandardLeadSource } from "@/src/types/analytics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AddManualClientModalProps {
  visible: boolean;
  brokerId: string;
  onClose: () => void;
  onCreated?: (clientId: string) => void;
}

export default function AddManualClientModal({ visible, brokerId, onClose, onCreated }: AddManualClientModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const cities = t("editProfile.options.cities") as unknown as string[];
  const [name, setName] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [leadSource, setLeadSource] = useState<StandardLeadSource>("other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (saving) return;
    setName("");
    setCity(null);
    setLeadSource("other");
    setError("");
    onClose();
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanCity = city?.trim() ?? "";
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
        leadSource,
        lead_source: leadSource,
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
        leadSource,
        lead_source: leadSource,
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
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}>
        <View style={styles.card} testID="add-manual-client-modal">
          <ScrollView contentContainerStyle={[styles.scrollContent, { flexGrow: 1, paddingBottom: Math.max(insets.bottom, spacing.md) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.title}>{t("manualClient.title")}</Text>
              <Pressable onPress={close} disabled={saving} hitSlop={8} testID="add-manual-client-close">
                <Ionicons name="close-outline" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.label}>{t("manualClient.labels.fullName")}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={t("manualClient.placeholders.fullName")} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} autoFocus testID="manual-client-name-input" />
            <Text style={styles.label}>{t("manualClient.labels.city")}</Text>
            <Dropdown value={city} options={cities} placeholder={t("editProfile.cityPlaceholder")} onSelect={setCity} testID="manual-client-city-input" />
            <Text style={styles.label}>Πηγή lead</Text>
            <StandardLeadSourcePicker value={leadSource} onChange={setLeadSource} testID="manual-client-lead-source" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={close} disabled={saving}><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
              <Pressable style={styles.saveButton} onPress={() => void handleSave()} disabled={saving} testID="manual-client-save-button">
                {saving ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="person-add-outline" size={18} color={colors.onBrand} />}
                <Text style={styles.saveText}>{t("common.actions.add")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    card: { width: "100%", maxWidth: 440, maxHeight: "90%", borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    scrollContent: { padding: spacing.lg, gap: spacing.sm },
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
