import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { type ThemeColors } from "@/src/theme";

interface CalendarGridShimmerCellProps {
  row: number;
  column: number;
}

export default function CalendarGridShimmerCell({ row, column }: CalendarGridShimmerCellProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shimmer = useRef(new Animated.Value(0.3)).current;
  const delay = (row + column) * 50;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(shimmer, { toValue: 0.85, duration: 520, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 520, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, shimmer]);

  return <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: shimmer }]} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 8,
      backgroundColor: colors.brandTertiary,
    },
  });
}