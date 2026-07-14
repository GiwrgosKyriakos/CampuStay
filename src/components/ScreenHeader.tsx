import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

type ScreenHeaderProps = {
  title: string;
  onBackPress: () => void;
  backDisabled?: boolean;
  backButtonTestID?: string;
};

export default function ScreenHeader({
  title,
  onBackPress,
  backDisabled = false,
  backButtonTestID,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        style={[styles.iconBtn, backDisabled && styles.iconBtnDisabled]}
        onPress={onBackPress}
        disabled={backDisabled}
        testID={backButtonTestID}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
  },
  headerSpacer: {
    width: 40,
  },
});