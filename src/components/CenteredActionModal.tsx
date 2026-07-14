import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

export type CenteredModalAction = {
  label: string;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  variant?: "solid" | "outline" | "muted" | "danger";
  testID?: string;
};

type CenteredActionModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  onDismiss?: () => void;
  actions: CenteredModalAction[];
  actionsLayout?: "vertical" | "horizontal";
  testID?: string;
};

export default function CenteredActionModal({
  visible,
  title,
  description,
  onDismiss,
  actions,
  actionsLayout = "vertical",
  testID,
}: CenteredActionModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

        <View style={styles.modalCard} testID={testID}>
          <View style={styles.headerAccent} />
          <Text style={styles.title}>{title}</Text>
          {!!description && <Text style={styles.description}>{description}</Text>}

          <View style={[styles.actionsWrap, actionsLayout === "horizontal" && styles.actionsWrapHorizontal]}>
            {actions.map((action) => {
              const outline = action.variant === "outline";
              const danger = action.variant === "danger";
              const muted = action.variant === "muted";
              const iconColor = danger
                ? colors.onError
                : muted
                  ? colors.onSurface
                  : outline
                    ? colors.brandSecondary
                    : colors.onBrand;
              return (
                <Pressable
                  key={action.label}
                  style={[
                    styles.actionButton,
                    actionsLayout === "horizontal" && styles.actionButtonHorizontal,
                    danger ? styles.actionDanger : muted ? styles.actionMuted : outline ? styles.actionOutline : styles.actionSolid,
                  ]}
                  onPress={action.onPress}
                  testID={action.testID}
                >
                  {!!action.iconName && (
                    <Ionicons
                      name={action.iconName}
                      size={18}
                      color={iconColor}
                    />
                  )}
                  <Text
                    style={[
                      styles.actionText,
                      danger
                        ? styles.actionDangerText
                        : muted
                          ? styles.actionMutedText
                          : outline
                            ? styles.actionOutlineText
                            : styles.actionSolidText,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 33, 40, 0.68)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    gap: spacing.sm,
  },
  headerAccent: {
    width: 52,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignSelf: "center",
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    textAlign: "center",
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 21,
    textAlign: "center",
  },
  actionsWrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  actionsWrapHorizontal: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  actionButtonHorizontal: {
    flex: 1,
  },
  actionSolid: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  actionOutline: {
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  actionMuted: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDanger: {
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: colors.error,
  },
  actionText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
  },
  actionSolidText: {
    color: colors.onBrand,
  },
  actionOutlineText: {
    color: colors.brandSecondary,
  },
  actionMutedText: {
    color: colors.onSurface,
  },
  actionDangerText: {
    color: colors.onError,
  },
});
