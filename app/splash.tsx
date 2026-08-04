import React, { useMemo } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";

import { fonts, fontSize, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";

export default function SplashScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>{t("common.brandName")}</Text>
      <ActivityIndicator color={colors.brand} size="large" style={styles.loader} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  logo: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["4xl"],
    color: colors.onSurface,
    marginBottom: 24,
  },
  loader: {
    marginTop: 24,
  },
});
