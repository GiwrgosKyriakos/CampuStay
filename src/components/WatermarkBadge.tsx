import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";

import { t } from "@/src/locales";
import { fonts, fontSize } from "@/src/theme";
import type { WatermarkConfig } from "@/src/types/listing";

export type WatermarkPosition = "top-left" | "bottom-left" | "top-right" | "bottom-right";

interface WatermarkBadgeProps {
  config?: WatermarkConfig | null;
  position?: WatermarkPosition;
  style?: StyleProp<ViewStyle>;
}

export const WatermarkBadge: React.FC<WatermarkBadgeProps> = ({ config, position = "top-left", style }) => {
  if (!config?.enabled) return null;

  const positionStyle: ViewStyle = {
    top: position.includes("top") ? 12 : undefined,
    bottom: position.includes("bottom") ? 16 : undefined,
    left: position.includes("left") ? 12 : undefined,
    right: position.includes("right") ? 12 : undefined,
  };

  if (config.type === "agency_logo" && config.logoUrl) {
    return (
      <View
        pointerEvents="none"
        style={[styles.baseContainer, positionStyle, style]}
      >
        <Image source={{ uri: config.logoUrl }} contentFit="contain" style={styles.logoImage} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.baseContainer, positionStyle, style]}
    >
      <Text style={styles.brandText}>{config.text || t("watermark.fallbackText")}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    position: "absolute",
    zIndex: 15,
  },
  brandText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.72)",
  },
  logoImage: {
    width: 64,
    height: 26,
  },
});
