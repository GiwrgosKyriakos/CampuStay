import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

export default function BrokerClientDetailSkeleton() {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.content} testID="broker-client-detail-skeleton">
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeaderRow}>
          <View style={styles.titleLine} />
          <View style={styles.actionPill} />
        </View>
        <View style={styles.monthLine} />
        <View style={styles.calendarGrid}>
          {Array.from({ length: 6 }, (_, index) => <View key={index} style={styles.calendarCell} />)}
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar} />
        <View style={styles.profileName} />
        <View style={styles.profileButton} />
        <View style={styles.statusRow} />
      </View>

      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitle} />
        <View style={styles.actionPill} />
      </View>
      <View style={styles.interactionCard}>
        <View style={styles.filterLine} />
        <View style={styles.metricsLine} />
        <View style={styles.logLine} />
        <View style={styles.logLineShort} />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { gap: spacing.md, paddingTop: spacing.md },
    calendarCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
    calendarHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    titleLine: { width: "42%", height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    actionPill: { width: 82, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    monthLine: { width: "55%", height: 14, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    calendarCell: { width: "30%", height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    profileCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.sm },
    avatar: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    profileName: { width: "38%", height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    profileButton: { width: "100%", height: 38, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    statusRow: { width: "100%", height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    sectionHeaderRow: { marginHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    sectionTitle: { width: "45%", height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    interactionCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
    filterLine: { width: "72%", height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    metricsLine: { width: "100%", height: 42, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    logLine: { width: "92%", height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    logLineShort: { width: "68%", height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  });
}
