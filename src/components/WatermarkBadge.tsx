import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius } from "@/src/theme";
import type { WatermarkConfig } from "@/src/types/listing";

export type WatermarkPosition = "top-left" | "bottom-left" | "top-right" | "bottom-right";

interface WatermarkBadgeProps {
  config?: WatermarkConfig | null;
  position?: WatermarkPosition;
  style?: StyleProp<ViewStyle>;
}

export const WatermarkBadge: React.FC<WatermarkBadgeProps> = ({ config, position = "top-left", style }) => {
  const { colors } = useTheme();

  if (!config?.enabled) return null;

  const positionStyle: ViewStyle = {
    top: position.includes("top") ? 10 : undefined,
    bottom: position.includes("bottom") ? 14 : undefined,
    left: position.includes("left") ? 10 : undefined,
    right: position.includes("right") ? 10 : undefined,
  };

  if (config.type === "agency_logo" && config.logoUrl) {
    return (
      <View
        pointerEvents="none"
        style={[styles.baseContainer, styles.logoContainer, styles.logoWithBg, positionStyle, style]}
      >
        <Image source={{ uri: config.logoUrl }} contentFit="contain" style={styles.logoImage} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.baseContainer, styles.textContainer, positionStyle, style]}
    >
      <Text style={[styles.brandText, { color: colors.brand }]}>{config.text || "CampuStay"}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    position: "absolute",
    zIndex: 15,
  },
  textContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: "rgba(18, 18, 18, 0.45)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    opacity: 0.75,
  },
  brandText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
  },
  logoContainer: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    opacity: 0.75,
  },
  logoWithBg: {
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  logoImage: {
    width: 64,
    height: 26,
  },
});
