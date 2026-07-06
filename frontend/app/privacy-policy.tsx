import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, fonts, fontSize } from "@/src/theme";
import { formatMonthYear, t } from "@/src/locales";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        testID="privacy-policy-screen"
      >
        <Pressable style={styles.backButton} onPress={() => router.back()} testID="privacy-policy-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          <Text style={styles.backText}>{t("common.actions.back")}</Text>
        </Pressable>

        <Text style={styles.title}>{t("privacyPolicy.title")}</Text>
        <Text style={styles.updated}>{t("privacyPolicy.lastUpdated", { date: formatMonthYear(new Date(2026, 6, 1)) })}</Text>

        <Text style={styles.paragraph}>{t("privacyPolicy.intro")}</Text>

        <Text style={styles.sectionTitle}>{t("privacyPolicy.collectTitle")}</Text>
        <Text style={styles.paragraph}>{t("privacyPolicy.collectBody")}</Text>

        <Text style={styles.sectionTitle}>{t("privacyPolicy.useTitle")}</Text>
        <Text style={styles.paragraph}>{t("privacyPolicy.useBody")}</Text>

        <Text style={styles.sectionTitle}>{t("privacyPolicy.controlsTitle")}</Text>
        <Text style={styles.paragraph}>{t("privacyPolicy.controlsBody")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["3xl"],
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  updated: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
});
