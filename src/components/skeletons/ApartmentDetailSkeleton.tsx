import React, { useEffect, useMemo, useRef } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/src/theme";

export default function ApartmentDetailSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="apartment-detail-skeleton">
      <Animated.View style={[styles.hero, { opacity: pulse }]}>
        <Animated.View style={[styles.heroBadge, { opacity: pulse }]} />
      </Animated.View>

      <View style={styles.infoBlock}>
        <Animated.View style={[styles.titleLine, { opacity: pulse }]} />
        <Animated.View style={[styles.locationLine, { opacity: pulse }]} />
        <View style={styles.specsRow}>
          <Animated.View style={[styles.specPill, { opacity: pulse }]} />
          <Animated.View style={[styles.specPill, { opacity: pulse }]} />
          <Animated.View style={[styles.specPill, { opacity: pulse }]} />
        </View>
      </View>

      <View style={styles.section}>
        <Animated.View style={[styles.sectionTitle, { opacity: pulse }]} />
        <View style={styles.amenitiesGrid}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Animated.View key={index} style={[styles.amenityCell, { opacity: pulse }]} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Animated.View style={[styles.sectionTitle, styles.descriptionTitle, { opacity: pulse }]} />
        <Animated.View style={[styles.descriptionLine, { opacity: pulse }]} />
        <Animated.View style={[styles.descriptionLine, styles.descriptionLineMedium, { opacity: pulse }]} />
        <Animated.View style={[styles.descriptionLine, { opacity: pulse }]} />
        <Animated.View style={[styles.descriptionLine, styles.descriptionLineShort, { opacity: pulse }]} />
      </View>

      <View style={styles.section}>
        <Animated.View style={[styles.sectionTitle, { opacity: pulse }]} />
        <Animated.View style={[styles.map, { opacity: pulse }]} />
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    content: { paddingBottom: spacing.xl, gap: spacing.lg },
    hero: {
      height: 280,
      position: "relative",
      backgroundColor: colors.surfaceTertiary,
    },
    heroBadge: {
      position: "absolute",
      right: spacing.lg,
      bottom: spacing.lg,
      width: 100,
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    infoBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
    titleLine: { width: "72%", height: 28, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    locationLine: { width: "44%", height: 16, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    specsRow: { flexDirection: "row", gap: spacing.sm },
    specPill: { width: 86, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    sectionTitle: { width: "38%", height: 20, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    descriptionTitle: { width: "32%" },
    amenitiesGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    amenityCell: { width: "22%", height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
    descriptionLine: { width: "100%", height: 13, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    descriptionLineMedium: { width: "88%" },
    descriptionLineShort: { width: "64%" },
    map: { height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  });
}
