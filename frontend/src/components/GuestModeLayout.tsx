import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { t } from "@/src/locales";

type GuestModeTopBannerProps = {
  onPress: () => void;
  testID?: string;
  buttonTestID?: string;
  style?: StyleProp<ViewStyle>;
};

type GuestModeStickyFooterProps = {
  onPress: () => void;
  testID?: string;
  buttonTestID?: string;
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
};

export function GuestModeTopBanner({ onPress, testID, buttonTestID, style }: GuestModeTopBannerProps) {
  return (
    <View style={[styles.topBanner, style]} testID={testID}>
      <Text style={styles.topBannerText}>{t("common.guest.readOnlyBanner")}</Text>
      <Pressable style={styles.topBannerButton} onPress={onPress} testID={buttonTestID}>
        <Text style={styles.topBannerButtonText}>{t("common.cta.signInOrRegister")}</Text>
      </Pressable>
    </View>
  );
}

export function GuestModeStickyFooter({ onPress, testID, buttonTestID, bottomInset, style }: GuestModeStickyFooterProps) {
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + spacing.md }, style]} testID={testID}>
      <Pressable onPress={onPress} testID={buttonTestID}>
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

const styles = StyleSheet.create({
  topBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  topBannerButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  topBannerButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
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
