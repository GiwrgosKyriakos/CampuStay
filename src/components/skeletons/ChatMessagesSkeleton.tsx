import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

type BubbleConfig = { align: "left" | "right"; width: number };

const BUBBLES: BubbleConfig[] = [
  { align: "left", width: 170 },
  { align: "right", width: 120 },
  { align: "left", width: 210 },
  { align: "right", width: 150 },
  { align: "left", width: 130 },
];

type Props = {
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ChatMessagesSkeleton({ testID, style }: Props) {
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
      {BUBBLES.map((bubble, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bubble,
            bubble.align === "left" ? styles.bubbleLeft : styles.bubbleRight,
            { width: bubble.width, opacity: pulse },
          ]}
        />
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    bubble: {
      height: 40,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceTertiary,
    },
    bubbleLeft: { alignSelf: "flex-start" },
    bubbleRight: { alignSelf: "flex-end" },
  });
}
