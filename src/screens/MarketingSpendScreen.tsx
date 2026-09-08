import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MarketingSpendEntry from "@/src/components/MarketingSpendEntry";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

export default function MarketingSpendScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isExecutive =
    Boolean(auth.agencyId) &&
    ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  if (!isExecutive) {
    return (
      <View style={styles.stateCenter}>
        <View style={styles.iconCircleMuted}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Περιορισμένη Πρόσβαση</Text>
        <Text style={styles.emptySubtitle}>
          Η οθόνη καταγραφής εξόδων marketing είναι διαθέσιμη αποκλειστικά στη Γραμματεία και τη Διοίκηση (CEO) του γραφείου.
        </Text>
      </View>
    );
  }

  const agencyId = auth.agencyId ?? "";

  return (
    <View style={styles.container} testID="marketing-spend-screen">
      {/* Curved Elevated Header matching the rest of the application */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Marketing Spend
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Μηνιαία παρακολούθηση επενδύσεων ανά κανάλι
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <MarketingSpendEntry agencyId={agencyId} recordedBy={auth.userId ?? ""} />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
      zIndex: 2,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    titleWrap: {
      flex: 1,
      width: "100%",
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    content: {
      flex: 1,
    },
    stateCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing["2xl"],
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    iconCircleMuted: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
      lineHeight: 19,
      maxWidth: 300,
    },
  });
}