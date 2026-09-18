import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing } from "@/src/theme";

type Props = {
  rowCount?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type RowProps = {
  index: number;
  progress: SharedValue<number>;
  testID?: string;
};

function AmenitySkeletonRow({ index, progress, testID }: RowProps) {
  const { colors } = useTheme();
  const checkPhase = (index + 0) % 2 === 0;
  const crossPhase = (index + 1) % 2 === 0;
  const checkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], checkPhase ? [0.25, 0.85] : [0.85, 0.25]),
  }));
  const crossStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], crossPhase ? [0.25, 0.85] : [0.85, 0.25]),
  }));

  return (
    <View style={styles.row} testID={testID}>
      <View style={[styles.label, { backgroundColor: colors.surfaceTertiary }]} />
      <Animated.View style={[styles.circle, { backgroundColor: colors.brandTertiary }, checkStyle]} />
      <Animated.View style={[styles.circle, { backgroundColor: colors.surfaceTertiary }, crossStyle]} />
    </View>
  );
}

export default function BraidedAmenitySkeletonLoader({ rowCount = 8, style, testID = "braided-amenity-skeleton" }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [progress]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {Array.from({ length: rowCount }, (_, index) => (
        <AmenitySkeletonRow key={index} index={index} progress={progress} testID={`${testID}-row-${index}`} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 32,
  },
  label: {
    borderRadius: radius.sm,
    flex: 1,
    height: 14,
  },
  circle: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
});
