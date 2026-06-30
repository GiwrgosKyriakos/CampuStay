import React, { forwardRef, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

export type GenderFilter = "All" | "Male" | "Female" | "Non-binary";

export interface Filters {
  gender: GenderFilter;
  ageMin: number;
  ageMax: number;
  budgetMax: number;
}

export const DEFAULT_FILTERS: Filters = {
  gender: "All",
  ageMin: 18,
  ageMax: 30,
  budgetMax: 1000,
};

const GENDERS: GenderFilter[] = ["All", "Female", "Male", "Non-binary"];

interface Props {
  current: Filters;
  currency: string;
  onApply: (f: Filters) => void;
}

const FilterSheet = forwardRef<BottomSheetModal, Props>(function FilterSheet(
  { current, currency, onApply },
  ref,
) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Filters>(current);
  const snapPoints = useMemo(() => ["62%"], []);

  useEffect(() => {
    setDraft(current);
  }, [current]);

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
      )}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.title} testID="filter-sheet-title">
          Preferences
        </Text>

        <Text style={styles.label}>Gender</Text>
        <View style={styles.chipRow}>
          {GENDERS.map((g) => {
            const active = draft.gender === g;
            return (
              <Pressable
                key={g}
                onPress={() => set({ gender: g })}
                style={[styles.chip, active && styles.chipActive]}
                testID={`filter-gender-${g}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Age range</Text>
          <Text style={styles.value}>
            {draft.ageMin} – {draft.ageMax}
          </Text>
        </View>
        <Text style={styles.subLabel}>Minimum age</Text>
        <Slider
          minimumValue={18}
          maximumValue={40}
          step={1}
          value={draft.ageMin}
          onValueChange={(v) => set({ ageMin: Math.min(Math.round(v), draft.ageMax) })}
          minimumTrackTintColor={colors.brand}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.onSurface}
          testID="filter-age-min-slider"
        />
        <Text style={styles.subLabel}>Maximum age</Text>
        <Slider
          minimumValue={18}
          maximumValue={40}
          step={1}
          value={draft.ageMax}
          onValueChange={(v) => set({ ageMax: Math.max(Math.round(v), draft.ageMin) })}
          minimumTrackTintColor={colors.brand}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.onSurface}
          testID="filter-age-max-slider"
        />

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Max budget</Text>
          <Text style={styles.value}>
            {currency}
            {draft.budgetMax}/mo
          </Text>
        </View>
        <Slider
          minimumValue={300}
          maximumValue={1500}
          step={50}
          value={draft.budgetMax}
          onValueChange={(v) => set({ budgetMax: Math.round(v) })}
          minimumTrackTintColor={colors.brand}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.onSurface}
          testID="filter-budget-slider"
        />

        <View style={styles.actions}>
          <Pressable
            style={styles.resetBtn}
            onPress={() => setDraft(DEFAULT_FILTERS)}
            testID="filter-reset-button"
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
          <Pressable
            style={styles.applyBtn}
            onPress={() => onApply(draft)}
            testID="filter-apply-button"
          >
            <Text style={styles.applyText}>Show roommates</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

export default FilterSheet;

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  handle: { backgroundColor: colors.border, width: 44 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface, marginTop: spacing.md },
  subLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  value: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrandTertiary, marginTop: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  chipTextActive: { color: colors.onSurfaceInverse },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  resetBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  applyBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
