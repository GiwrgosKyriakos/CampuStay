import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SkeletonBox } from "@/src/components/ui/SkeletonBox";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing } from "@/src/theme";

export default function ApartmentDetailSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="apartment-detail-skeleton">
      <View style={[styles.heroWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <SkeletonBox width="100%" height={280} borderRadius={0} />
        <View style={styles.heroRentBadge}>
          <SkeletonBox width={110} height={42} borderRadius={radius.pill} />
        </View>
      </View>

      <View style={styles.bodyContent}>
        <View style={styles.titleRow}>
          <SkeletonBox width="65%" height={26} borderRadius={radius.sm} />
          <SkeletonBox width={42} height={42} borderRadius={radius.pill} />
        </View>
        <SkeletonBox width="45%" height={16} borderRadius={radius.sm} />

        <View style={styles.statsRow}>
          <SkeletonBox width={88} height={28} borderRadius={radius.pill} />
          <SkeletonBox width={88} height={28} borderRadius={radius.pill} />
          <SkeletonBox width={72} height={28} borderRadius={radius.pill} />
        </View>

        <View style={styles.sectionBlock}>
          <SkeletonBox width="35%" height={20} borderRadius={radius.sm} />
          <View style={styles.amenitiesGrid}>
            {Array.from({ length: 6 }, (_item, index) => (
              <View
                key={`amenity-skeleton-${index}`}
                style={[styles.amenityCell, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <SkeletonBox width={24} height={24} borderRadius={radius.sm} />
                <SkeletonBox width="70%" height={12} borderRadius={radius.sm} />
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.descBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <SkeletonBox width="100%" height={14} borderRadius={radius.sm} />
          <SkeletonBox width="92%" height={14} borderRadius={radius.sm} />
          <SkeletonBox width="60%" height={14} borderRadius={radius.sm} />
        </View>
      </View>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: spacing.lg + insets.bottom,
          },
        ]}
      >
        <SkeletonBox width="100%" height={56} borderRadius={radius.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroWrap: {
    position: "relative",
    height: 280,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  heroRentBadge: {
    position: "absolute",
    bottom: spacing.md + 4,
    right: spacing.md + 4,
  },
  bodyContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionBlock: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  amenitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  amenityCell: {
    width: "30%",
    flexGrow: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  descBox: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
  },
});