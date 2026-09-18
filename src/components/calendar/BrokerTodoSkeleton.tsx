import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

export default function BrokerTodoSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.82, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={styles.content} testID="broker-todo-skeleton">
      {["first", "second", "third"].map((row) => (
        <View key={row} style={styles.row}>
          <Animated.View style={[styles.checkbox, { opacity: shimmer }]} />
          <View style={styles.copy}>
            <Animated.View style={[styles.primaryLine, { opacity: shimmer }]} />
            <Animated.View style={[styles.secondaryLine, { opacity: shimmer }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
    checkbox: { width: 22, height: 22, borderRadius: radius.sm, backgroundColor: colors.border },
    copy: { flex: 1, gap: spacing.xs },
    primaryLine: { width: "82%", height: 12, borderRadius: radius.sm, backgroundColor: colors.border },
    secondaryLine: { width: "54%", height: 10, borderRadius: radius.sm, backgroundColor: colors.border },
  });
}