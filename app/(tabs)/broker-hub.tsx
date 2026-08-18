import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

export default function BrokerHubScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedOption, setSelectedOption] = useState<"option1" | "option2">("option1");

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]} testID="broker-hub-screen">
      <View style={styles.toggleShell}>
        <Pressable
          style={[styles.toggleOption, selectedOption === "option1" && styles.toggleOptionActive]}
          onPress={() => setSelectedOption("option1")}
          testID="broker-hub-toggle-opt1"
        >
          <Text style={[styles.toggleText, selectedOption === "option1" && styles.toggleTextActive]}>Option 1</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleOption, selectedOption === "option2" && styles.toggleOptionActive]}
          onPress={() => setSelectedOption("option2")}
          testID="broker-hub-toggle-opt2"
        >
          <Text style={[styles.toggleText, selectedOption === "option2" && styles.toggleTextActive]}>Option 2</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
    },
    toggleShell: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.pill,
      padding: 4,
      gap: 4,
    },
    toggleOption: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    toggleOptionActive: {
      backgroundColor: colors.brand,
    },
    toggleText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    toggleTextActive: {
      color: colors.onBrand,
    },
  });
