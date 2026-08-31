import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing } from "@/src/theme";

type BrokerHubSkeletonProps = {
  cardCount?: number;
};

export default function BrokerHubSkeleton({ cardCount = 5 }: BrokerHubSkeletonProps) {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container} testID="broker-hub-skeleton">
      {Array.from({ length: cardCount }).map((_, index) => (
        <View
          key={`broker-skeleton-${index}`}
          style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        >
          <View style={styles.cardHeader}>
            <Animated.View style={[styles.avatar, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
            <View style={styles.textCol}>
              <Animated.View style={[styles.titleLine, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
              <Animated.View style={[styles.metaLine, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
            </View>
            <View style={styles.badgesRow}>
              <Animated.View style={[styles.percentBadge, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
              <Animated.View style={[styles.iconBadge, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
              <Animated.View style={[styles.iconBadge, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
              <Animated.View style={[styles.iconBadge, { backgroundColor: colors.surfaceTertiary, opacity: pulseAnim }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
  },
  textCol: {
    flex: 1,
    gap: 6,
  },
  titleLine: {
    width: "60%",
    height: 16,
    borderRadius: radius.sm,
  },
  metaLine: {
    width: "45%",
    height: 12,
    borderRadius: radius.sm,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  percentBadge: {
    width: 38,
    height: 24,
    borderRadius: radius.pill,
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
  },
});
