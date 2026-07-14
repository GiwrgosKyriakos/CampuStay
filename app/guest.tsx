import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { t } from "@/src/locales";

export default function GuestScreen() {
  const router = useRouter();

  return (
    <View style={styles.container} testID="guest-screen">
      <View style={styles.card}>
        <Ionicons name="eye-off-outline" size={44} color={colors.onSurfaceTertiary} />
        <Text style={styles.title}>{t("guest.title")}</Text>
        <Text style={styles.subtitle}>{t("guest.description")}</Text>
        <Pressable style={styles.button} onPress={() => router.replace("/roommates")} testID="guest-continue-button">
          <Text style={styles.buttonText}>{t("guest.continue")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  card: {
    width: "100%",
    borderRadius: radius.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["2xl"],
    color: colors.onSurface,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },
});
