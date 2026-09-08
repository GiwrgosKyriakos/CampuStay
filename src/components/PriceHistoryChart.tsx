import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

export type PriceHistoryEntry = {
  price: number;
  expectedPrice?: number | null;
  timestamp: number;
  dateLabel: string;
  brokerName?: string;
  brokerId?: string;
};

type PriceHistoryChartProps = {
  history: PriceHistoryEntry[];
  selectedHistoryNode: PriceHistoryEntry | null;
  onSelectNode: (entry: PriceHistoryEntry) => void;
  colors: ThemeColors;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    priceHistoryChart: {
      height: 292,
      width: "100%",
      position: "relative",
      overflow: "hidden",
    },
    priceHistoryGridLine: {
      position: "absolute",
      height: 1,
      backgroundColor: colors.divider,
    },
    priceHistoryAxisLabel: {
      position: "absolute",
      width: 48,
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textAlign: "right",
    },
    priceHistoryLine: {
      position: "absolute",
      height: 2,
      backgroundColor: colors.brand,
    },
    priceHistoryExpectationLine: {
      position: "absolute",
      height: 2,
      backgroundColor: colors.onSurfaceTertiary,
    },
    priceHistoryNode: {
      position: "absolute",
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.brand,
      borderWidth: 2,
      borderColor: colors.surfaceSecondary,
    },
    priceHistoryNodeSelected: {
      backgroundColor: colors.brandSecondary,
      borderColor: colors.onBrand,
      transform: [{ scale: 1.2 }],
    },
    priceHistoryExpectationNode: {
      position: "absolute",
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.onSurfaceTertiary,
      borderWidth: 2,
      borderColor: colors.surfaceSecondary,
    },
    priceHistoryDateLabel: {
      position: "absolute",
      width: 56,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    priceHistoryTooltip: {
      position: "absolute",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.sm,
      gap: 2,
      elevation: 4,
      shadowColor: colors.onSurface,
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      zIndex: 5,
    },
    priceHistoryTooltipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    priceHistoryTooltipPointer: {
      position: "absolute",
      bottom: -5,
      left: "50%",
      width: 10,
      height: 10,
      backgroundColor: colors.surfaceSecondary,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      transform: [{ rotate: "45deg" }],
    },
    priceHistoryLegend: {
      position: "absolute",
      left: 52,
      right: 16,
      top: 238,
      gap: spacing.xs,
    },
    priceHistoryLegendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    priceHistoryLegendBrandIndicator: {
      width: 10,
      height: 10,
      backgroundColor: colors.brand,
    },
    priceHistoryLegendExpectationIndicator: {
      width: 10,
      height: 10,
      backgroundColor: colors.onSurfaceTertiary,
    },
    priceHistoryLegendText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
  });
}

export default function PriceHistoryChart({ history, selectedHistoryNode, onSelectNode, colors }: PriceHistoryChartProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = useState(0);
  const sortedHistory = useMemo(
    () => [...history].sort((left, right) => left.timestamp - right.timestamp),
    [history],
  );
  const chartHeight = 220;
  const plotLeft = 52;
  const plotRight = 16;
  const plotTop = 20;
  const plotBottom = 42;
  const plotWidth = Math.max(1, chartWidth - plotLeft - plotRight);
  const plotHeight = chartHeight - plotTop - plotBottom;
  const prices = sortedHistory.flatMap((entry) =>
    entry.expectedPrice !== null && entry.expectedPrice !== undefined
      ? [entry.price, entry.expectedPrice]
      : [entry.price],
  );
  const lowestPrice = prices.length ? Math.min(...prices) : 0;
  const highestPrice = prices.length ? Math.max(...prices) : 1;
  const pricePadding = Math.max((highestPrice - lowestPrice) * 0.12, 1);
  const minPrice = Math.max(0, lowestPrice - pricePadding);
  const maxPrice = highestPrice + pricePadding;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const getPointPosition = (entry: PriceHistoryEntry, index: number) => {
    const x = sortedHistory.length <= 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (plotWidth * index) / (sortedHistory.length - 1);
    const y = plotTop + plotHeight - ((entry.price - minPrice) / priceRange) * plotHeight;
    return { x, y };
  };
  const getExpectedPointPosition = (entry: PriceHistoryEntry, index: number) => {
    const position = getPointPosition(entry, index);
    if (entry.expectedPrice === null || entry.expectedPrice === undefined) return position;
    return {
      ...position,
      y: plotTop + plotHeight - ((entry.expectedPrice - minPrice) / priceRange) * plotHeight,
    };
  };
  const selectedIndex = selectedHistoryNode
    ? sortedHistory.findIndex((entry) => entry.timestamp === selectedHistoryNode.timestamp)
    : -1;
  const selectedPosition = selectedIndex >= 0 ? getPointPosition(sortedHistory[selectedIndex], selectedIndex) : null;
  const tooltipWidth = 190;
  const tooltipLeft = selectedPosition
    ? Math.min(Math.max(selectedPosition.x - tooltipWidth / 2, plotLeft), Math.max(plotLeft, chartWidth - plotRight - tooltipWidth))
    : 0;
  const tooltipTop = selectedPosition ? Math.max(2, selectedPosition.y - 76) : 2;

  return (
    <View
      style={styles.priceHistoryChart}
      onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      testID="create-listing-history-chart"
    >
      {chartWidth > 0 ? (
        <>
          {[0, 1, 2, 3].map((step) => {
            const ratio = step / 3;
            const y = plotTop + plotHeight * ratio;
            const value = Math.round(maxPrice - priceRange * ratio);
            return (
              <View key={`history-grid-${step}`}>
                <View style={[styles.priceHistoryGridLine, { left: plotLeft, right: plotRight, top: y }]} />
                <Text style={[styles.priceHistoryAxisLabel, { left: 0, top: y - 8 }]}>{`${value}€`}</Text>
              </View>
            );
          })}

          {sortedHistory.slice(1).map((entry, index) => {
            const start = getPointPosition(sortedHistory[index], index);
            const end = getPointPosition(entry, index + 1);
            const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            const angle = `${Math.atan2(end.y - start.y, end.x - start.x)}rad`;
            return (
              <View
                key={`history-line-${entry.timestamp}`}
                style={[
                  styles.priceHistoryLine,
                  {
                    left: (start.x + end.x - length) / 2,
                    top: (start.y + end.y) / 2 - 1,
                    width: length,
                    transform: [{ rotate: angle }],
                  },
                ]}
              />
            );
          })}

          {sortedHistory
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.expectedPrice !== null && entry.expectedPrice !== undefined)
            .slice(1)
            .map(({ entry, index }, expectationIndex) => {
              const previous = sortedHistory
                .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(({ candidate }) => candidate.expectedPrice !== null && candidate.expectedPrice !== undefined)[expectationIndex];
              if (!previous) return null;
              const start = getExpectedPointPosition(previous.candidate, previous.candidateIndex);
              const end = getExpectedPointPosition(entry, index);
              const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
              const angle = `${Math.atan2(end.y - start.y, end.x - start.x)}rad`;
              return (
                <View
                  key={`history-expectation-line-${entry.timestamp}`}
                  style={[
                    styles.priceHistoryExpectationLine,
                    {
                      left: (start.x + end.x - length) / 2,
                      top: (start.y + end.y) / 2 - 1,
                      width: length,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })}

          {sortedHistory.map((entry, index) => {
            const position = getPointPosition(entry, index);
            const isSelected = selectedHistoryNode?.timestamp === entry.timestamp;
            return (
              <Pressable
                key={`history-node-${entry.timestamp}`}
                style={[
                  styles.priceHistoryNode,
                  isSelected && styles.priceHistoryNodeSelected,
                  { left: position.x - 7, top: position.y - 7 },
                ]}
                onPress={() => onSelectNode(entry)}
                testID={`create-listing-history-node-${index}`}
                hitSlop={6}
              />
            );
          })}

          {sortedHistory.map((entry, index) => {
            if (entry.expectedPrice === null || entry.expectedPrice === undefined) return null;
            const position = getExpectedPointPosition(entry, index);
            return (
              <Pressable
                key={`history-expectation-node-${entry.timestamp}`}
                style={[styles.priceHistoryExpectationNode, { left: position.x - 5, top: position.y - 5 }]}
                onPress={() => onSelectNode(entry)}
                hitSlop={6}
              />
            );
          })}

          {sortedHistory.map((entry, index) => {
            const position = getPointPosition(entry, index);
            return (
              <Text
                key={`history-date-${entry.timestamp}`}
                style={[styles.priceHistoryDateLabel, { left: position.x - 28, top: plotTop + plotHeight + 12 }]}
                numberOfLines={1}
              >
                {new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(
                  new Date(entry.timestamp),
                )}
              </Text>
            );
          })}

          {selectedHistoryNode && selectedPosition ? (
            <View style={[styles.priceHistoryTooltip, { left: tooltipLeft, top: tooltipTop, width: tooltipWidth }]}>
              <Text style={styles.priceHistoryTooltipText}>{`Τιμή Αγγελίας: €${selectedHistoryNode.price}`}</Text>
              {selectedHistoryNode.expectedPrice !== null && selectedHistoryNode.expectedPrice !== undefined ? (
                <Text style={styles.priceHistoryTooltipText}>{`Προσδοκία Ιδιοκτήτη: €${selectedHistoryNode.expectedPrice}`}</Text>
              ) : null}
              <Text style={styles.priceHistoryTooltipText}>{`Ημερομηνία: ${selectedHistoryNode.dateLabel}`}</Text>
              <Text style={styles.priceHistoryTooltipText}>{`Μεσίτης: ${selectedHistoryNode.brokerName || "Μεσίτης"}`}</Text>
              <View style={styles.priceHistoryTooltipPointer} />
            </View>
          ) : null}
          <View style={styles.priceHistoryLegend}>
            <View style={styles.priceHistoryLegendItem}>
              <View style={styles.priceHistoryLegendBrandIndicator} />
              <Text style={styles.priceHistoryLegendText}>Ιστορικό τιμών αγγελίας</Text>
            </View>
            <View style={styles.priceHistoryLegendItem}>
              <View style={styles.priceHistoryLegendExpectationIndicator} />
              <Text style={styles.priceHistoryLegendText}>Ιστορικό τιμών προσδοκιών ιδιοκτήτη</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}
