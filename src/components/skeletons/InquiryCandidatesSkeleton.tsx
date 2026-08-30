import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

export default function InquiryCandidatesSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.container} testID="apartment-detail-inquiries-loading">
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.row}>
          <Animated.View style={[styles.avatar, { opacity: pulse }]} />
          <View style={styles.content}>
            <Animated.View style={[styles.name, { opacity: pulse }]} />
            <View style={styles.pills}>
              <Animated.View style={[styles.pill, styles.pillShort, { opacity: pulse }]} />
              <Animated.View style={[styles.pill, styles.pillMedium, { opacity: pulse }]} />
              <Animated.View style={[styles.pill, styles.pillLong, { opacity: pulse }]} />
            </View>
          </View>
          <Animated.View style={[styles.action, { opacity: pulse }]} />
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    content: { flex: 1, gap: spacing.sm },
    name: {
      width: "55%",
      height: 14,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceTertiary,
    },
    pills: { flexDirection: "row", gap: spacing.xs },
    pill: {
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    pillShort: { width: 28 },
    pillMedium: { width: 48 },
    pillLong: { width: 64 },
    action: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
  });
}
