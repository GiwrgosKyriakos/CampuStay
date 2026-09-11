import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";

type ContractPreviewModalProps = {
  visible: boolean;
  title: string;
  html: string;
  onClose: () => void;
};

export default function ContractPreviewModal({ visible, title, html, onClose }: ContractPreviewModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar style={colors.isDark ? "light" : "dark"} />
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.brandTertiary,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: Math.max(insets.bottom, spacing.sm),
          },
        ]}
      >
        <View style={[styles.documentShell, { backgroundColor: colors.surface }]}>
          <WebView
            source={{ html }}
            originWhitelist={["*"]}
            style={styles.document}
            showsVerticalScrollIndicator
            startInLoadingState
          />
        </View>

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.controls, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surface }, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.accessibility.closePreview")}
              testID="contract-preview-close"
            >
              <Ionicons name="chevron-back" size={21} color={colors.onSurface} />
            </Pressable>
            <View style={[styles.titlePill, { backgroundColor: colors.surface }]}>
              <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>{title}</Text>
            </View>
            <View style={styles.controlSpacer} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.sm },
    documentShell: {
      flex: 1,
      overflow: "hidden",
      borderRadius: radius.lg,
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    document: { flex: 1, backgroundColor: "#FFFFFF" },
    controls: { position: "absolute", left: spacing.sm, right: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
    closeButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    titlePill: { flex: 1, minHeight: 38, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    title: { fontFamily: fonts.bold, fontSize: fontSize.sm, textAlign: "center" },
    controlSpacer: { width: 42 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  });
}