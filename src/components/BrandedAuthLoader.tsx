import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import type { AuthTransition } from "@/src/context/auth";
import { t } from "@/src/locales";
import { fonts, fontSize, spacing, type ThemeColors } from "@/src/theme";

interface BrandedAuthLoaderProps {
  style?: StyleProp<ViewStyle>;
  transition?: AuthTransition | null;
}

const transitionStatusKeys: Record<AuthTransition, string> = {
  "signing-in": "auth.signingIn",
  "creating-account": "auth.creatingAccount",
  "setting-up-profile": "auth.settingUpProfile",
};

export default function BrandedAuthLoader({ style, transition }: BrandedAuthLoaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0.18,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => animation.stop();
  }, [progress]);

  const progressScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.94],
  });

  return (
    <View style={[styles.container, style]} testID="branded-auth-loader">
      <View style={styles.brandGroup}>
        <Image
          source={require("@/assets/campuStayLogoTransparent.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>{t("common.brandName")}</Text>
      </View>

      <View style={styles.progressArea}>
        <Text style={styles.status}>{t(transition ? transitionStatusKeys[transition] : "auth.loadingSession")}</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { transform: [{ scaleX: progressScale }] }]} />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing["2xl"],
    },
    brandGroup: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    logo: {
      width: 156,
      height: 112,
    },
    brandName: {
      fontFamily: fonts.display,
      fontSize: fontSize["3xl"],
      color: colors.onSurface,
    },
    progressArea: {
      width: "100%",
      maxWidth: 280,
      gap: spacing.sm,
    },
    status: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    progressTrack: {
      height: 4,
      overflow: "hidden",
      borderRadius: 999,
      backgroundColor: colors.surfaceTertiary,
    },
    progressFill: {
      height: "100%",
      width: "100%",
      borderRadius: 999,
      backgroundColor: colors.brand,
      transformOrigin: "left",
    },
  });
}