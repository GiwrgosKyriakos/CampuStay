import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

type Props = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function ApartmentCardSkeleton({ style, testID }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.card, style]} testID={testID}>
      <Animated.View style={[styles.cover, { opacity: pulse }]} />
      <Animated.View style={[styles.priceBadge, { opacity: pulse }]} />
      <View style={styles.bottomContent}>
        <Animated.View style={[styles.locationLine, { opacity: pulse }]} />
        <Animated.View style={[styles.specsLine, { opacity: pulse }]} />
        <View style={styles.tagsRow}>
          <Animated.View style={[styles.tag, styles.tagWide, { opacity: pulse }]} />
          <Animated.View style={[styles.tag, styles.tagShort, { opacity: pulse }]} />
          <Animated.View style={[styles.tag, styles.tagTiny, { opacity: pulse }]} />
        </View>
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      height: 260,
      position: "relative",
      overflow: "hidden",
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceTertiary,
    },
    cover: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.surfaceTertiary,
    },
    priceBadge: {
      position: "absolute",
      top: spacing.md,
      right: spacing.md,
      width: 96,
      height: 38,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    bottomContent: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.lg,
      gap: spacing.sm,
    },
    locationLine: {
      width: "40%",
      height: 14,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSecondary,
    },
    specsLine: {
      width: "60%",
      height: 13,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSecondary,
    },
    tagsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    tag: {
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    tagWide: { width: 78 },
    tagShort: { width: 58 },
    tagTiny: { width: 42 },
  });
}
