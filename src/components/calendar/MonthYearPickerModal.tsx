import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GREEK_MONTHS = [
  "Ιανουάριος",
  "Φεβρουάριος",
  "Μάρτιος",
  "Απρίλιος",
  "Μάιος",
  "Ιούνιος",
  "Ιούλιος",
  "Αύγουστος",
  "Σεπτέμβριος",
  "Οκτώβριος",
  "Νοέμβριος",
  "Δεκέμβριος",
] as const;

export default function MonthYearPickerModal({
  visible,
  currentDate,
  onClose,
  onSelect,
}: {
  visible: boolean;
  currentDate: Date;
  onClose: () => void;
  onSelect: (date: Date) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(), []);
  const insets = useSafeAreaInsets();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [yearRibbonWidth, setYearRibbonWidth] = useState(0);
  const yearRibbonRef = useRef<ScrollView | null>(null);
  const currentYear = currentDate.getFullYear();
  const yearRange = useMemo(() => Array.from({ length: 9 }, (_, index) => currentYear - 4 + index), [currentYear]);

  useEffect(() => {
    if (!visible) return;
    setSelectedYear(currentYear);
    setSelectedMonth(currentDate.getMonth());
  }, [currentDate, currentYear, visible]);

  useEffect(() => {
    if (!visible || yearRibbonWidth === 0) return;
    const yearPillWidth = 76;
    const gap = spacing.sm;
    const selectedIndex = yearRange.indexOf(selectedYear);
    const centeredOffset = selectedIndex * (yearPillWidth + gap) - (yearRibbonWidth - yearPillWidth) / 2 + spacing.xs;
    yearRibbonRef.current?.scrollTo({ x: Math.max(0, centeredOffset), animated: false });
  }, [selectedYear, visible, yearRange, yearRibbonWidth]);

  const handleApply = () => {
    onSelect(new Date(selectedYear, selectedMonth, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Επιλογή Μήνα και Έτους</Text>
          <View style={styles.section}>
            <Text style={[styles.columnTitle, { color: colors.onSurfaceTertiary }]}>Έτος</Text>
            <ScrollView
              ref={yearRibbonRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearScrollContent}
              onLayout={(event) => setYearRibbonWidth(event.nativeEvent.layout.width)}
            >
              {yearRange.map((year) => {
                const active = year === selectedYear;
                return (
                  <Pressable key={year} onPress={() => setSelectedYear(year)} style={[styles.yearItem, { backgroundColor: active ? colors.brand : colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Text style={[styles.yearItemText, { color: active ? colors.onBrand : colors.onSurfaceTertiary }]}>{year}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.section}>
            <Text style={[styles.columnTitle, { color: colors.onSurfaceTertiary }]}>Μήνας</Text>
            <View style={styles.monthGrid}>
              {GREEK_MONTHS.map((monthLabel, monthIndex) => {
                const active = monthIndex === selectedMonth;
                return (
                  <Pressable key={monthLabel} onPress={() => setSelectedMonth(monthIndex)} style={[styles.monthItem, { backgroundColor: active ? colors.brand : colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.monthItemText, { color: active ? colors.onBrand : colors.onSurface }]}>{monthLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable style={[styles.applyButton, { backgroundColor: colors.brand, marginBottom: Math.max(insets.bottom, spacing.md) }]} onPress={handleApply} testID="month-year-picker-apply">
            <Text style={[styles.applyButtonText, { color: colors.onBrand }]}>Εφαρμογή</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
    modalCard: { width: "100%", maxWidth: 520, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.lg },
    modalTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, textAlign: "center" },
    section: { width: "100%", gap: spacing.sm },
    columnTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
    yearScrollContent: { gap: spacing.sm, paddingHorizontal: spacing.xs },
    yearItem: { width: 76, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
    yearItemText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
    monthGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    monthItem: { flexBasis: "31.5%", flexGrow: 1, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
    monthItemText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, flexShrink: 1, textAlign: "center" },
    applyButton: { height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    applyButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  });
}
