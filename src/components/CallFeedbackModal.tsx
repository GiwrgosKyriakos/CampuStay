import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import { fontSize, fonts, radius, spacing } from "@/src/theme";
import { getWordCount } from "@/src/utils/noteValidation";

const MAX_CALL_FEEDBACK_CHARS = 500;

export interface PendingCallDetails {
  apartmentId: string;
  apartmentTitle: string;
  brokerId: string;
  brokerName: string;
  startedAt: number;
}

interface CallFeedbackModalProps {
  visible: boolean;
  pendingCall: PendingCallDetails | null;
  isSubmitting: boolean;
  onSubmit: (text: string) => void;
  onCallNotPlaced: () => void;
}

export default function CallFeedbackModal({ visible, pendingCall, isSubmitting, onSubmit, onCallNotPlaced }: CallFeedbackModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText("");
  }, [visible, pendingCall?.startedAt]);

  const wordCount = getWordCount(text);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCallNotPlaced}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="call-feedback-modal">
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="call-outline" size={22} color={colors.onBrand} />
            </View>
            <Pressable onPress={onCallNotPlaced} disabled={isSubmitting} hitSlop={8} testID="call-feedback-close">
              <Ionicons name="close-outline" size={26} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <Text style={styles.title}>{t("callFeedback.title")}</Text>
          <Text style={styles.description}>{t("callFeedback.description")}</Text>
          {pendingCall?.apartmentTitle ? <Text style={styles.apartmentTitle}>{pendingCall.apartmentTitle}</Text> : null}
          <View style={styles.voiceInputWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={MAX_CALL_FEEDBACK_CHARS}
              textAlignVertical="top"
              placeholder={t("callFeedback.placeholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.input, styles.voiceInput]}
              testID="call-feedback-input"
            />
            <View style={styles.voiceButtonWrap}>
              <VoiceInputButton
                onTextAppend={(spokenText) => setText((current) => current.trim() ? `${current.trim()} ${spokenText}` : spokenText)}
                color={colors.onSurfaceTertiary}
                disabled={isSubmitting}
              />
            </View>
          </View>
          <View style={styles.counterRow}>
            <Text style={styles.counter}>{t("callFeedback.wordCount", { count: wordCount })}</Text>
            <Text style={styles.counter}>{`${text.length}/${MAX_CALL_FEEDBACK_CHARS}`}</Text>
          </View>
          <Pressable style={[styles.submitButton, isSubmitting && styles.disabled]} onPress={() => onSubmit(text)} disabled={isSubmitting} testID="call-feedback-submit">
            {isSubmitting ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.submitText}>{t("callFeedback.submit")}</Text>}
          </Pressable>
          <Pressable style={styles.dismissButton} onPress={onCallNotPlaced} disabled={isSubmitting} testID="call-feedback-not-placed">
            <Text style={styles.dismissText}>{t("callFeedback.notPlaced")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.48)" },
    card: { width: "100%", maxWidth: 460, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    iconWrap: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    description: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20, color: colors.onSurfaceTertiary },
    apartmentTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    input: { minHeight: 125, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.md, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
    voiceInputWrap: { position: "relative" },
    voiceInput: { paddingRight: 48 },
    voiceButtonWrap: { position: "absolute", top: 4, right: 4 },
    counterRow: { flexDirection: "row", justifyContent: "space-between" },
    counter: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    submitButton: { minHeight: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
    submitText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
    dismissButton: { alignItems: "center", paddingVertical: spacing.sm },
    dismissText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    disabled: { opacity: 0.6 },
  });
}
