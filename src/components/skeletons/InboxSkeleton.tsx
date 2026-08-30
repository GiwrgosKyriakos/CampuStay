import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

type Props = {
  rows?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function InboxSkeleton({ rows = 7, testID, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.row}>
          <Animated.View style={[styles.avatar, { opacity: pulse }]} />
          <View style={styles.textColumn}>
            <Animated.View style={[styles.lineName, { opacity: pulse }]} />
            <Animated.View style={[styles.lineMessage, { opacity: pulse }]} />
          </View>
          <Animated.View style={[styles.badge, { opacity: pulse }]} />
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    avatar: {
      width: 60,
      height: 60,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    textColumn: { flex: 1, gap: spacing.sm },
    lineName: {
      width: "50%",
      height: 14,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceTertiary,
    },
    lineMessage: {
      width: "75%",
      height: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceTertiary,
    },
    badge: {
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
  });
}
