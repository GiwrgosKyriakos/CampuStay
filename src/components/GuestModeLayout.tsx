import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

type GuestModeStickyFooterProps = {
  onPress?: () => void;
  testID?: string;
  buttonTestID?: string;
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
};

export function GuestModeStickyFooter({ onPress, testID, buttonTestID, bottomInset, style }: GuestModeStickyFooterProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    onPress?.();
  };

  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + spacing.md }, style]} testID={testID}>
      <Pressable onPress={() => void handlePress()} testID={buttonTestID}>
        <LinearGradient
          colors={[colors.brand, colors.brandSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.footerButton}
        >
            <Text style={styles.footerButtonText}>{t("common.cta.signInOrRegister")}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerButton: {
      borderRadius: radius.pill,
      paddingVertical: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    footerButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onBrand,
    },
  });
}
