import React from "react";
import { StyleSheet, View } from "react-native";

import { spacing, radius, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

export interface FilterSheetSkeletonProps {
  sectionCount?: number;
}

function FilterSheetSkeleton({ sectionCount = 4 }: FilterSheetSkeletonProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container} testID="apartments-filter-skeleton">
      <View style={styles.actionRow}>
        <View style={styles.smallBlock} />
        <View style={styles.actionBlocks}>
          <View style={styles.iconBlock} />
          <View style={styles.iconBlock} />
          <View style={styles.iconBlock} />
        </View>
      </View>
      <View style={styles.titleBlock} />
      <View style={styles.fieldBlock} />
      {Array.from({ length: sectionCount }, (_, sectionIndex) => (
        <View key={`filter-skeleton-section-${sectionIndex}`} style={styles.section}>
          <View style={styles.labelBlock} />
          <View style={styles.chipRow}>
            <View style={styles.chipBlock} />
            <View style={[styles.chipBlock, styles.chipBlockWide]} />
            <View style={styles.chipBlock} />
          </View>
          <View style={styles.rangeRow}>
            <View style={styles.rangeBlock} />
            <View style={styles.rangeBlock} />
          </View>
        </View>
      ))}
      <View style={styles.toggleSection}>
        <View style={styles.labelBlock} />
        <View style={styles.toggleRow} />
        <View style={styles.toggleRow} />
        <View style={styles.toggleRow} />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      height: 380,
      marginTop: spacing.sm,
      padding: spacing.xl,
      gap: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    actionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    actionBlocks: { flexDirection: "row", gap: spacing.sm },
    smallBlock: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
    iconBlock: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
    titleBlock: { width: "42%", height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    fieldBlock: { height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
    section: { gap: spacing.sm },
    labelBlock: { width: "34%", height: 15, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    chipRow: { flexDirection: "row", gap: spacing.sm },
    chipBlock: { width: 76, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    chipBlockWide: { width: 118 },
    rangeRow: { flexDirection: "row", gap: spacing.sm },
    rangeBlock: { flex: 1, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
    toggleSection: { gap: spacing.sm },
    toggleRow: { height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  });
}

export default FilterSheetSkeleton;
