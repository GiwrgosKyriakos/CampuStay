import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, spacing } from "@/src/theme";

interface BrokerModificationBadgeProps {
  modCount?: number;
  brokerName?: string;
  modifiedAt?: number;
}

export function BrokerModificationBadge({ modCount, brokerName, modifiedAt }: BrokerModificationBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!modCount || modCount < 1 || !modifiedAt) return null;

  const formattedDate = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(modifiedAt));

  return (
    <View style={styles.container} testID="broker-modification-badge">
      <Ionicons color={colors.onSurfaceTertiary} name="create-outline" size={13} />
      <Text style={styles.text} numberOfLines={2}>
        {`Τροποποίηση ${modCount} από μεσίτη ${brokerName || "Μεσίτης"} στις ${formattedDate}`}
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingTop: spacing.xs,
      marginTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    text: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
      fontStyle: "italic",
    },
  });
}
