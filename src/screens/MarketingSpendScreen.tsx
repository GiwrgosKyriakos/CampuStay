import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MarketingSpendEntry from "@/src/components/MarketingSpendEntry";
import { FadeInView } from "@/src/components/ui/FadeInView";
import { SkeletonBox } from "@/src/components/ui/SkeletonBox";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

interface MarketingSpendRecord {
  id: string;
  channel: string;
  amount: number;
  period: string;
  recordedBy?: string;
  createdAtMillis?: number;
  notes?: string;
}

interface MarketingSpendDocument {
  channel?: unknown;
  source?: unknown;
  amount?: unknown;
  spendAmount?: unknown;
  period?: unknown;
  month?: unknown;
  recordedByName?: unknown;
  recordedBy?: unknown;
  createdAt?: unknown;
  recordedAt?: unknown;
  notes?: unknown;
}

interface TimestampLike {
  toMillis: () => number;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function MarketingSpendScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const agencyId = auth.agencyId ?? "";
  const [spendHistory, setSpendHistory] = useState<MarketingSpendRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setSpendHistory([]);
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    const spendQuery = query(
      collection(db, "agencies", agencyId, "campaign_spends"),
      orderBy("recordedAt", "desc"),
      limit(30),
    );

    const unsubscribe = onSnapshot(
      spendQuery,
      (snapshot) => {
        const records: MarketingSpendRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as MarketingSpendDocument;
          const recordedAt = data.createdAt ?? data.recordedAt;
          const createdAtMillis = isTimestampLike(recordedAt)
            ? recordedAt.toMillis()
            : typeof recordedAt === "number"
              ? recordedAt
              : Date.now();

          return {
            id: docSnap.id,
            channel: stringValue(data.channel ?? data.source, "Άλλο"),
            amount: numberValue(data.amount ?? data.spendAmount),
            period: stringValue(data.period ?? data.month, "Τρέχων μήνας"),
            recordedBy: typeof (data.recordedByName ?? data.recordedBy) === "string" ? String(data.recordedByName ?? data.recordedBy) : undefined,
            createdAtMillis,
            notes: typeof data.notes === "string" ? data.notes : undefined,
          };
        });
        setSpendHistory(records);
        setLoadingHistory(false);
      },
      () => setLoadingHistory(false),
    );

    return unsubscribe;
  }, [agencyId]);

  const currentMonthSpend = useMemo(
    () => spendHistory.reduce((sum, item) => sum + numberValue(item.amount), 0),
    [spendHistory],
  );

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

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {loadingHistory ? (
          <MarketingSpendSkeleton styles={styles} />
        ) : (
          <FadeInView>
            <View style={styles.entrySection}>
              <MarketingSpendEntry agencyId={agencyId} recordedBy={auth.userId ?? ""} />
            </View>

            <View style={styles.divider} />

            <View style={styles.historyHeaderRow}>
              <Text style={styles.sectionTitle}>Ιστορικό & Πρόσφατες Καταγραφές</Text>
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>Σύνολο: €{currentMonthSpend.toLocaleString("el-GR")}</Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryLabel}>Συνολική Δαπάνη Καταγεγραμμένη</Text>
                <Text style={styles.summaryValue}>€{currentMonthSpend.toLocaleString("el-GR")}</Text>
              </View>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryLabel}>Πλήθος Εγγραφών</Text>
                <Text style={styles.summaryValue}>{spendHistory.length.toLocaleString("el-GR")}</Text>
              </View>
            </View>

            {spendHistory.length === 0 ? (
              <View style={styles.emptyHistoryCard}>
                <Ionicons color={colors.onSurfaceTertiary} name="receipt-outline" size={24} />
                <Text style={styles.emptyHistoryText}>Δεν έχουν καταγραφεί πρόσφατα έξοδα.</Text>
              </View>
            ) : (
              spendHistory.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyIconBox}>
                    <Ionicons color={colors.brand} name="megaphone-outline" size={16} />
                  </View>

                  <View style={styles.historyDetails}>
                    <Text numberOfLines={1} style={styles.historyChannel}>{item.channel}</Text>
                    <Text style={styles.historyMeta}>
                      Περίοδος: {item.period}{item.recordedBy ? ` · Από: ${item.recordedBy}` : ""}
                    </Text>
                  </View>

                  <View style={styles.amountPill}>
                    <Text style={styles.amountText}>€{numberValue(item.amount).toLocaleString("el-GR")}</Text>
                  </View>
                </View>
              ))
            )}
          </FadeInView>
        )}
      </ScrollView>
    </View>
  );
}

function MarketingSpendSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <>
      <View style={styles.formSkeleton}>
        <SkeletonBox width="55%" height={16} borderRadius={radius.sm} />
        <SkeletonBox width="100%" height={30} borderRadius={radius.md} />
        <SkeletonBox width="100%" height={30} borderRadius={radius.md} />
      </View>

      <View style={styles.divider} />

      <View style={styles.historyHeaderRow}>
        <SkeletonBox width="58%" height={14} borderRadius={radius.sm} />
        <SkeletonBox width={78} height={22} borderRadius={radius.pill} />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryMetric}>
          <SkeletonBox width="40%" height={12} borderRadius={radius.sm} />
          <SkeletonBox width="60%" height={22} borderRadius={radius.sm} />
        </View>
        <View style={styles.summaryMetric}>
          <SkeletonBox width="40%" height={12} borderRadius={radius.sm} />
          <SkeletonBox width="60%" height={22} borderRadius={radius.sm} />
        </View>
      </View>

      {Array.from({ length: 3 }, (_item, index) => (
        <View key={`marketing-skeleton-${index}`} style={styles.historyCard}>
          <SkeletonBox width={34} height={34} borderRadius={radius.sm} />
          <View style={styles.historyDetails}>
            <SkeletonBox width="65%" height={14} borderRadius={radius.sm} />
            <SkeletonBox width="85%" height={10} borderRadius={radius.sm} />
          </View>
          <SkeletonBox width={55} height={22} borderRadius={radius.pill} />
        </View>
      ))}
    </>
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
    scrollContent: {
      paddingTop: spacing.sm,
    },
    entrySection: {
      minHeight: 40,
    },
    formSkeleton: {
      height: 130,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      gap: spacing.sm,
    },
    sectionTitle: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    totalBadge: {
      backgroundColor: colors.brandTertiary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    totalBadgeText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    summaryCard: {
      flexDirection: "row",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    summaryMetric: {
      flex: 1,
      gap: spacing.xs,
    },
    summaryLabel: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    summaryValue: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.brand,
    },
    historyCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceSecondary,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    historyIconBox: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyDetails: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    historyChannel: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    historyMeta: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    amountPill: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    amountText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    emptyHistoryCard: {
      marginHorizontal: spacing.lg,
      padding: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    emptyHistoryText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
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