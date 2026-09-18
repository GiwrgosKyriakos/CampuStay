import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

export default function SwipeDeckSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.82, duration: 850, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={styles.deckArea} testID="swipe-deck-skeleton">
      <View style={styles.card}>
        <Animated.View style={[styles.matchBadge, { opacity: shimmer }]} />
        <Animated.View style={[styles.image, { opacity: shimmer }]} />
        <View style={styles.scrim} />
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Animated.View style={[styles.namePlaceholder, { opacity: shimmer }]} />
            <Animated.View style={[styles.agePlaceholder, { opacity: shimmer }]} />
          </View>
          <Animated.View style={[styles.universityPlaceholder, { opacity: shimmer }]} />
          <View style={styles.pillRow}>
            <Animated.View style={[styles.metaPill, { opacity: shimmer }]} />
            <Animated.View style={[styles.metaPill, styles.budgetPill, { opacity: shimmer }]} />
          </View>
          <Animated.View style={[styles.bioLine, { opacity: shimmer }]} />
          <Animated.View style={[styles.bioLineShort, { opacity: shimmer }]} />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    deckArea: { flex: 1, alignItems: "center", justifyContent: "center" },
    card: {
      flex: 1,
      width: "100%",
      overflow: "hidden",
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceTertiary,
    },
    image: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.border,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(26,26,26,0.72)",
    },
    matchBadge: {
      position: "absolute",
      top: spacing.md,
      right: spacing.md,
      zIndex: 2,
      width: 92,
      height: 28,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
    },
    cardBody: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: spacing.xl,
      gap: spacing.sm,
    },
    nameRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    namePlaceholder: { width: "58%", height: 34, borderRadius: radius.sm, backgroundColor: colors.border },
    agePlaceholder: { width: 38, height: 26, borderRadius: radius.sm, backgroundColor: colors.border },
    universityPlaceholder: { width: "72%", height: 16, borderRadius: radius.sm, backgroundColor: colors.border },
    pillRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    metaPill: { width: 112, height: 32, borderRadius: radius.pill, backgroundColor: colors.border },
    budgetPill: { width: 128 },
    bioLine: { width: "86%", height: 12, borderRadius: radius.sm, backgroundColor: colors.border },
    bioLineShort: { width: "58%", height: 12, borderRadius: radius.sm, backgroundColor: colors.border },
  });
}