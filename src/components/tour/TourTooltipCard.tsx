import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { TourAnchorBounds, TourStep } from "@/src/types/tour";

interface TourTooltipCardProps {
  step: TourStep;
  current: number;
  total: number;
  target: TourAnchorBounds;
  onNext: () => void;
  onSkip: () => void;
}

export function TourTooltipCard({ step, current, total, target, onNext, onSkip }: TourTooltipCardProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(0);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safeTop = insets.top + spacing.md;
  const safeBottom = height - insets.bottom - spacing.md - cardHeight;
  const belowTop = target.y + target.height + spacing.md;
  const aboveTop = target.y - cardHeight - spacing.md;
  const top = step.placement === "center"
    ? Math.max(safeTop, (height - cardHeight) / 2)
    : step.placement === "top" && aboveTop >= safeTop
      ? aboveTop
      : belowTop <= safeBottom
        ? belowTop
        : Math.max(safeTop, aboveTop);

  return (
    <View style={[styles.card, { top }]} onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}>
      <Text style={styles.stepIndicator}>{t("tour.common.stepIndicator", { current, total })}</Text>
      <Text style={styles.title}>{t(step.titleKey)}</Text>
      <Text style={styles.description}>{t(step.descriptionKey)}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipLabel}>{t("tour.common.skip")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onNext} style={styles.nextButton}>
          <Text style={styles.nextLabel}>{current === total ? t("tour.common.finish") : t("tour.common.next")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceInverse,
      borderWidth: 1,
      borderColor: colors.brand,
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    stepIndicator: {
      color: colors.brandSecondary,
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      textTransform: "uppercase",
    },
    title: {
      marginTop: spacing.sm,
      color: colors.onSurfaceInverse,
      fontFamily: fonts.display,
      fontSize: fontSize.xl,
    },
    description: {
      marginTop: spacing.sm,
      color: colors.onSurfaceInverse,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 21,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    skipButton: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    skipLabel: {
      color: colors.onSurfaceInverse,
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
    },
    nextButton: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
    },
    nextLabel: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
    },
  });
}