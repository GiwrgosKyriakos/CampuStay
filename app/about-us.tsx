import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";

const VISION_POINTS = [
  "aboutUs.vision.point1",
  "aboutUs.vision.point2",
  "aboutUs.vision.point3",
];

const FEATURES = [
  "aboutUs.features.item1",
  "aboutUs.features.item2",
  "aboutUs.features.item3",
  "aboutUs.features.item4",
  "aboutUs.features.item5",
];

export default function AboutUsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          style={styles.closeButton}
          onPress={() => router.back()}
          hitSlop={8}
          testID="about-us-close-button"
        >
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("aboutUs.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        testID="about-us-screen"
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>CampuStay</Text>
          <Text style={styles.heroTitle}>{t("aboutUs.heroTitle")}</Text>
          <Text style={styles.heroSubtitle}>
            {t("aboutUs.heroSubtitle")}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t("aboutUs.vision.title")}</Text>
          {VISION_POINTS.map((point) => (
            <Text key={point} style={styles.paragraph}>
              • {t(point)}
            </Text>
          ))}
          <Text style={styles.highlight}>{t("aboutUs.vision.highlight")}</Text>
        </View>

        <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t("aboutUs.about.title")}</Text>
        <Text style={styles.paragraph}>
          {t("aboutUs.about.body")}
        </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t("aboutUs.features.title")}</Text>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{t(feature)}</Text>
            </View>
          ))}
        </View>
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
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceTertiary,
    },
    headerTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    headerSpacer: {
      width: 40,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    heroCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: colors.isDark ? 0.24 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    kicker: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.onSurfaceTertiary,
      marginBottom: spacing.sm,
    },
    heroTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      marginBottom: spacing.sm,
      lineHeight: 30,
    },
    heroSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
    },
    sectionCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: colors.isDark ? 0.2 : 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
      marginBottom: spacing.md,
    },
    paragraph: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
      marginBottom: spacing.sm,
    },
    highlight: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.lg,
      lineHeight: 24,
      color: colors.brand,
      marginTop: spacing.sm,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    bulletDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.brand,
      marginTop: 8,
    },
    bulletText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
    },
  });
}