import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { useTheme } from "@/src/context/ThemeContext";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

const MAX_FEEDBACK_LENGTH = 500;

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();

  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const atCharacterLimit = text.length >= MAX_FEEDBACK_LENGTH;
  const hasContent = text.trim().length > 0;

  const handleSend = async () => {
    if (isSubmitting) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "feedback"), {
        userId: auth.userId || "anonymous",
        userEmail: auth.user?.email || "not_provided",
        message: trimmed,
        createdAt: serverTimestamp(),
      });

      setSuccessModalVisible(true);
    } catch {
      setErrorModalVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          hitSlop={8}
          testID="feedback-close-button"
        >
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>

        <Text style={styles.headerTitle}>{t("feedback.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        testID="feedback-screen"
      >
        <Text style={styles.description}>{t("feedback.description")}</Text>

        <TextInput
          style={styles.input}
          multiline
          value={text}
          onChangeText={setText}
          textAlignVertical="top"
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder={t("feedback.placeholder")}
          placeholderTextColor={colors.onSurfaceTertiary}
          testID="feedback-input"
        />

        <Text style={styles.counter} testID="feedback-counter">
          {t("feedback.counter", { count: text.length, max: MAX_FEEDBACK_LENGTH })}
        </Text>

        {atCharacterLimit && (
          <Text style={styles.limitWarning} testID="feedback-limit-warning">
            {t("feedback.limitWarning", { max: MAX_FEEDBACK_LENGTH })}
          </Text>
        )}

        <Pressable
          style={[styles.sendButton, isSubmitting && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isSubmitting || !hasContent}
          testID="feedback-send-button"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.onBrand} />
          ) : (
            <Text style={styles.sendButtonText}>{t("feedback.send")}</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>

      <CenteredActionModal
        visible={successModalVisible}
        title={t("feedback.alerts.successTitle")}
        description={t("feedback.alerts.successDescription")}
        onDismiss={() => setSuccessModalVisible(false)}
        actions={[
          {
            label: t("feedback.alerts.successAction"),
            iconName: "checkmark-circle-outline",
            onPress: () => {
              setText("");
              setSuccessModalVisible(false);
              router.back();
            },
          },
        ]}
        testID="feedback-success-modal"
      />

      <CenteredActionModal
        visible={errorModalVisible}
        title={t("feedback.alerts.errorTitle")}
        description={t("feedback.alerts.errorDescription")}
        onDismiss={() => setErrorModalVisible(false)}
        actions={[
          {
            label: t("common.actions.gotIt"),
            onPress: () => setErrorModalVisible(false),
          },
        ]}
        testID="feedback-error-modal"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceTertiary,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    headerSpacer: {
      width: 40,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    description: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
      marginBottom: spacing.md,
    },
    input: {
      minHeight: 180,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    counter: {
      marginTop: spacing.xs,
      alignSelf: "flex-end",
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    limitWarning: {
      marginTop: spacing.xs,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.warning,
    },
    sendButton: {
      marginTop: spacing.lg,
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    sendButtonDisabled: {
      opacity: 0.75,
    },
    sendButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onBrand,
    },
  });
}