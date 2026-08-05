import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as MailComposer from "expo-mail-composer";

import { useTheme } from "@/src/context/ThemeContext";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";

const MAX_FEEDBACK_LENGTH = 500;
const FEEDBACK_RECIPIENT = "gkiriakos92@gmail.com";
const FEEDBACK_SUBJECT = t("feedback.mailSubject");

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [text, setText] = useState("");
  const atCharacterLimit = text.length >= MAX_FEEDBACK_LENGTH;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert(t("feedback.alerts.errorTitle"), t("feedback.alerts.emptyMessage"));
      return;
    }

    try {
      let isSuccessful = false;
      const isMailComposerAvailable = await MailComposer.isAvailableAsync();

      if (isMailComposerAvailable) {
        const result = await MailComposer.composeAsync({
          recipients: [FEEDBACK_RECIPIENT],
          subject: FEEDBACK_SUBJECT,
          body: text,
        });

        isSuccessful = result.status === MailComposer.MailComposerStatus.SENT || result.status === "sent";
      } else {
        const mailtoUrl = `mailto:${FEEDBACK_RECIPIENT}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(text)}`;
        const canOpen = await Linking.canOpenURL(mailtoUrl);
        if (!canOpen) {
          throw new Error("mail-client-unavailable");
        }

        await Linking.openURL(mailtoUrl);
        isSuccessful = true;
      }

      if (isSuccessful) {
        Alert.alert(t("feedback.alerts.successTitle"), t("feedback.alerts.successMessage"));
        setText("");
      }
    } catch {
      Alert.alert(t("feedback.alerts.errorTitle"), t("feedback.alerts.sendFailedMessage"));
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
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

        <Pressable style={styles.sendButton} onPress={handleSend} testID="feedback-send-button">
          <Text style={styles.sendButtonText}>{t("feedback.send")}</Text>
        </Pressable>
      </ScrollView>
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
    sendButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onBrand,
    },
  });
}