import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { QUIZ_SECTIONS, type QuizQuestionId } from "@/src/data/quiz";

export type GenderFilter = "male" | "female" | "nonBinary";
export type RoommateHardCriteriaKey = QuizQuestionId;

export interface Filters {
  gender: GenderFilter[];
  ageMin: number;
  ageMax: number;
  budgetMin: number;
  budgetMax: number;
  userHardCriteria?: RoommateHardCriteriaKey[];
}

export const DEFAULT_FILTERS: Filters = {
  gender: [],
  ageMin: 18,
  ageMax: 30,
  budgetMin: 0,
  budgetMax: 1000,
  userHardCriteria: ["q5", "q13"],
};

const AGE_VALUES = Array.from({ length: 82 }, (_, index) => index + 18);
const BUDGET_VALUES = Array.from({ length: 41 }, (_, index) => index * 50);
const PICKER_ITEM_HEIGHT = 44;
const PICKER_VIEWPORT_HEIGHT = PICKER_ITEM_HEIGHT * 5;

type RangeName = "age" | "budget";
type RangeField = "min" | "max";
type PickerTarget = { range: RangeName; field: RangeField };
type NumericInputValues = Record<"ageMin" | "ageMax" | "budgetMin" | "budgetMax", string>;

const HARD_CRITERIA_OPTIONS = QUIZ_SECTIONS.flatMap((section) => section.questions.map((question) => ({ key: question.id, label: question.question })));

function inputValuesFromFilters(filters: Filters): NumericInputValues {
  return {
    ageMin: String(filters.ageMin),
    ageMax: String(filters.ageMax),
    budgetMin: String(filters.budgetMin),
    budgetMax: String(filters.budgetMax),
  };
}

function parseNumericInput(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(parsed) ? Math.round(parsed) : null;
}

const GENDERS: GenderFilter[] = ["female", "male", "nonBinary"];

function getGenderLabel(value: GenderFilter | "all"): string {
  switch (value) {
    case "female":
      return t("filters.options.female");
    case "male":
      return t("filters.options.male");
    case "nonBinary":
      return t("filters.options.nonBinary");
    default:
      return t("filters.options.all");
  }
}

interface Props {
  current: Filters;
  currency: string;
  visible: boolean;
  onChange: (f: Filters) => void;
  onClose: () => void;
}

const FilterSheet = ({ current, currency, visible, onChange, onClose }: Props) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Filters>(current);
  const [inputValues, setInputValues] = useState<NumericInputValues>(() => inputValuesFromFilters(current));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [hardCriteriaModalVisible, setHardCriteriaModalVisible] = useState(false);
  const draftRef = useRef(draft);
  const modalRef = useRef<BottomSheetModal>(null);
  const pickerScrollRef = useRef<ScrollView>(null);
  const isPresentedRef = useRef(false);
  const snapPoints = useMemo(() => ["86.4%"], []);
  const actionsBottomOffset = 0 // Math.max(insets.bottom + spacing.md, 40);
  const actionsTopOffset = 0 //Math.max(insets.top + spacing.md, 40);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (visible && !isPresentedRef.current) {
      modalRef.current?.present();
      isPresentedRef.current = true;
      return;
    }

    if (!visible && isPresentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setDraft(current);
      setInputValues(inputValuesFromFilters(current));
    }
  }, [current, visible]);

  const close = useCallback(() => {
    modalRef.current?.dismiss();
  }, []);

  const setAndCommit = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      setInputValues(inputValuesFromFilters(next));
      onChange(next);
    },
    [onChange],
  );

  const commitNumericField = useCallback(
    (range: RangeName, field: RangeField, rawValue: string) => {
      const currentDraft = draftRef.current;
      const isAge = range === "age";
      const minimum = isAge ? 18 : 0;
      const fallback = isAge
        ? field === "min" ? DEFAULT_FILTERS.ageMin : DEFAULT_FILTERS.ageMax
        : field === "min" ? DEFAULT_FILTERS.budgetMin : DEFAULT_FILTERS.budgetMax;
      const parsed = parseNumericInput(rawValue);
      const value = Math.max(minimum, parsed ?? fallback);
      const next = { ...currentDraft };

      if (range === "age") {
        if (field === "min") {
          next.ageMin = Math.min(99, value);
          if (next.ageMin > next.ageMax) next.ageMax = next.ageMin;
        } else {
          next.ageMax = Math.min(99, value);
          if (next.ageMax < next.ageMin) next.ageMin = next.ageMax;
        }
      } else if (field === "min") {
        next.budgetMin = value;
        if (next.budgetMin > next.budgetMax) next.budgetMax = next.budgetMin;
      } else {
        next.budgetMax = value;
        if (next.budgetMax < next.budgetMin) next.budgetMin = next.budgetMax;
      }

      draftRef.current = next;
      setDraft(next);
      setInputValues(inputValuesFromFilters(next));
      onChange(next);
    },
    [onChange],
  );

  const openPicker = useCallback(
    (target: PickerTarget) => {
      const key = `${target.range}${target.field === "min" ? "Min" : "Max"}` as keyof NumericInputValues;
      commitNumericField(target.range, target.field, inputValues[key]);
      setPicker(target);
    },
    [commitNumericField, inputValues],
  );

  useEffect(() => {
    if (!picker) return;
    const values = picker.range === "age" ? AGE_VALUES : BUDGET_VALUES;
    const selected = picker.range === "age"
      ? picker.field === "min" ? draft.ageMin : draft.ageMax
      : picker.field === "min" ? draft.budgetMin : draft.budgetMax;
    const index = Math.max(0, values.findIndex((value) => value === selected));
    requestAnimationFrame(() => {
      pickerScrollRef.current?.scrollTo({
        y: Math.max(0, index * PICKER_ITEM_HEIGHT - PICKER_ITEM_HEIGHT * 2),
        animated: false,
      });
    });
  }, [draft, picker]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0.58}
        pressBehavior="close"
        appearsOnIndex={0}
        disappearsOnIndex={-1}
      />
    ),
    [],
  );

  const handleDismiss = useCallback(() => {
    isPresentedRef.current = false;
    const next = draftRef.current;
    setTimeout(() => {
      onChange(next);
      onClose();
    }, 0);
  }, [onChange, onClose]);

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={snapPoints}
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      enablePanDownToClose
      enableHandlePanningGesture
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={[styles.sheetBody, { paddingBottom: insets.bottom + spacing.lg }]}> 
        <View style={[styles.sheetHandleArea]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title} testID="filter-sheet-title">
                {t("filters.title")}
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={12} testID="filter-close-button">
              <Text style={styles.closeText}>{t("common.actions.done")}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
            <Text style={styles.label}>{t("filters.gender")}</Text>
            <View style={styles.chipRow}>
              {["all" as const, ...GENDERS].map((g) => {
                const active = g === "all" ? draft.gender.length === 0 : draft.gender.includes(g);
                return (
                  <Pressable
                    key={g}
                    onPress={() => {
                      if (g === "all") {
                        setAndCommit({ gender: [] });
                        return;
                      }
                      const nextGender = draft.gender.includes(g)
                        ? draft.gender.filter((value) => value !== g)
                        : [...draft.gender, g];
                      setAndCommit({ gender: nextGender });
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                    testID={`filter-gender-${g}`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{getGenderLabel(g)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t("filters.ageRange")}</Text>
              <Text style={styles.value}>
                {draft.ageMin} – {draft.ageMax}
              </Text>
            </View>
            <RangeInputRow
              range="age"
              minValue={inputValues.ageMin}
              maxValue={inputValues.ageMax}
              onChangeMin={(value) => setInputValues((previous) => ({ ...previous, ageMin: value }))}
              onChangeMax={(value) => setInputValues((previous) => ({ ...previous, ageMax: value }))}
              onBlurMin={() => commitNumericField("age", "min", inputValues.ageMin)}
              onBlurMax={() => commitNumericField("age", "max", inputValues.ageMax)}
              onOpenMin={() => openPicker({ range: "age", field: "min" })}
              onOpenMax={() => openPicker({ range: "age", field: "max" })}
              minTestID="filter-age-min-input"
              maxTestID="filter-age-max-input"
            />

            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t("filters.budget")}</Text>
              <Text style={styles.value}>
                {currency}{draft.budgetMin} – {currency}{draft.budgetMax}{t("common.format.perMonthShort")}
              </Text>
            </View>
            <RangeInputRow
              range="budget"
              minValue={inputValues.budgetMin}
              maxValue={inputValues.budgetMax}
              onChangeMin={(value) => setInputValues((previous) => ({ ...previous, budgetMin: value }))}
              onChangeMax={(value) => setInputValues((previous) => ({ ...previous, budgetMax: value }))}
              onBlurMin={() => commitNumericField("budget", "min", inputValues.budgetMin)}
              onBlurMax={() => commitNumericField("budget", "max", inputValues.budgetMax)}
              onOpenMin={() => openPicker({ range: "budget", field: "min" })}
              onOpenMax={() => openPicker({ range: "budget", field: "max" })}
              prefix={currency}
              minTestID="filter-budget-min-input"
              maxTestID="filter-budget-max-input"
            />

            <View style={styles.hardCriteriaSection}>
              <View style={styles.hardCriteriaHeaderRow}>
                <Text style={styles.hardCriteriaTitle}>{t("filters.hardCriteria.title")}</Text>
                <Pressable style={styles.hardCriteriaEditButton} onPress={() => setHardCriteriaModalVisible(true)} testID="hard-criteria-edit-button">
                  <Ionicons name="add" size={15} color={colors.brand} />
                  <Text style={styles.hardCriteriaEditText}>{(draft.userHardCriteria ?? []).length > 0 ? "Επεξεργασία" : "Προσθήκη"}</Text>
                </Pressable>
              </View>
              <View style={styles.hardCriteriaPills}>
                {(draft.userHardCriteria ?? []).map((key) => {
                  const option = HARD_CRITERIA_OPTIONS.find((item) => item.key === key);
                  if (!option) return null;
                  return (
                    <View key={key} style={styles.hardCriteriaPill}>
                      <Text style={styles.hardCriteriaPillText}>{t(option.label)}</Text>
                      <Pressable onPress={() => setAndCommit({ userHardCriteria: (draft.userHardCriteria ?? []).filter((item) => item !== key) })} hitSlop={6} testID={`hard-criteria-remove-${key}`}>
                        <Ionicons name="close" size={14} color={colors.brand} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={[styles.actions, { marginBottom: actionsBottomOffset }, { marginTop: actionsTopOffset }]}>
              <Pressable
                style={styles.resetBtn}
                onPress={() => {
                  draftRef.current = DEFAULT_FILTERS;
                  setDraft(DEFAULT_FILTERS);
                  setInputValues(inputValuesFromFilters(DEFAULT_FILTERS));
                  onChange(DEFAULT_FILTERS);
                }}
                testID="filter-reset-button"
              >
                  <Text style={styles.resetText}>{t("common.actions.reset")}</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={close} testID="filter-apply-button">
                  <Text style={styles.applyText}>{t("filters.showRoommates")}</Text>
              </Pressable>
            </View>
        </View>
      </BottomSheetView>
      <HardCriteriaSelectionModal
        visible={hardCriteriaModalVisible}
        selected={draft.userHardCriteria ?? []}
        onClose={() => setHardCriteriaModalVisible(false)}
        onToggle={(key) => {
          const selected = draftRef.current.userHardCriteria ?? [];
          setAndCommit({ userHardCriteria: selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key] });
        }}
      />
      <ValuePickerModal
        picker={picker}
        value={picker?.range === "age"
          ? picker.field === "min" ? draft.ageMin : draft.ageMax
          : picker?.field === "min" ? draft.budgetMin : draft.budgetMax}
        currency={currency}
        onClose={() => setPicker(null)}
        onSelect={(value) => {
          if (!picker) return;
          commitNumericField(picker.range, picker.field, String(value));
          setPicker(null);
        }}
        scrollRef={pickerScrollRef}
      />
    </BottomSheetModal>
  );
};

export default FilterSheet;

interface RangeInputRowProps {
  range: RangeName;
  minValue: string;
  maxValue: string;
  onChangeMin: (value: string) => void;
  onChangeMax: (value: string) => void;
  onBlurMin: () => void;
  onBlurMax: () => void;
  onOpenMin: () => void;
  onOpenMax: () => void;
  prefix?: string;
  minTestID: string;
  maxTestID: string;
}

function RangeInputRow({ range, minValue, maxValue, onChangeMin, onChangeMax, onBlurMin, onBlurMax, onOpenMin, onOpenMax, prefix, minTestID, maxTestID }: RangeInputRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.inputRow}>
      <NumericInputCard
        fieldLabel={t("filters.from")}
        value={minValue}
        prefix={prefix}
        onChangeText={onChangeMin}
        onBlur={onBlurMin}
        onOpenPicker={onOpenMin}
        testID={minTestID}
      />
      <Text style={styles.rangeDash}>–</Text>
      <NumericInputCard
        fieldLabel={t("filters.to")}
        value={maxValue}
        prefix={prefix}
        onChangeText={onChangeMax}
        onBlur={onBlurMax}
        onOpenPicker={onOpenMax}
        testID={maxTestID}
      />
    </View>
  );
}

interface NumericInputCardProps {
  fieldLabel: string;
  value: string;
  prefix?: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  onOpenPicker: () => void;
  testID: string;
}

function NumericInputCard({ fieldLabel, value, prefix, onChangeText, onBlur, onOpenPicker, testID }: NumericInputCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.inputCard}>
      <Text style={styles.inputLabel}>{fieldLabel}</Text>
      <View style={styles.inputValueRow}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          style={styles.numericInput}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          accessibilityLabel={fieldLabel}
          testID={testID}
        />
      </View>
      <Pressable onPress={onOpenPicker} hitSlop={8} style={styles.pickerTrigger} testID={`${testID}-picker-trigger`}>
        <Ionicons name="chevron-down" size={18} color={colors.onSurfaceTertiary} />
      </Pressable>
    </View>
  );
}

interface HardCriteriaSelectionModalProps {
  visible: boolean;
  selected: RoommateHardCriteriaKey[];
  onClose: () => void;
  onToggle: (key: RoommateHardCriteriaKey) => void;
}

function HardCriteriaSelectionModal({ visible, selected, onClose, onToggle }: HardCriteriaSelectionModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.hardCriteriaBackdrop}>
        <View style={styles.hardCriteriaModal} testID="hard-criteria-selection-modal">
          <View style={styles.hardCriteriaHeader}>
            <View style={styles.hardCriteriaHeaderText}>
              <Text style={styles.hardCriteriaModalTitle}>{t("filters.hardCriteria.title")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="hard-criteria-close-button">
              <Ionicons name="close-outline" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.hardCriteriaOptions} showsVerticalScrollIndicator={false}>
            {HARD_CRITERIA_OPTIONS.map((option) => {
              const active = selected.includes(option.key);
              return (
                <Pressable key={option.key} style={[styles.hardCriteriaOption, active && styles.hardCriteriaOptionActive]} onPress={() => onToggle(option.key)} testID={`hard-criteria-option-${option.key}`}>
                  <Text style={[styles.hardCriteriaOptionText, active && styles.hardCriteriaOptionTextActive]}>{t(option.label)}</Text>
                  <Ionicons name={active ? "checkbox" : "square-outline"} size={22} color={active ? colors.brand : colors.onSurfaceTertiary} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.hardCriteriaDoneButton} onPress={onClose} testID="hard-criteria-done-button">
            <Text style={styles.hardCriteriaDoneText}>{t("common.actions.done")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface ValuePickerModalProps {
  picker: PickerTarget | null;
  value: number;
  currency: string;
  onClose: () => void;
  onSelect: (value: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
}

function ValuePickerModal({ picker, value, currency, onClose, onSelect, scrollRef }: ValuePickerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const values = picker?.range === "age" ? AGE_VALUES : BUDGET_VALUES;

  return (
    <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <View style={styles.pickerCard} testID="filter-value-picker">
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{picker?.range === "age" ? t("filters.ageRange") : t("filters.budget")}</Text>
            <Pressable onPress={onClose} hitSlop={8} testID="filter-value-picker-close">
              <Ionicons name="close-outline" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.pickerViewport}
            contentContainerStyle={styles.pickerContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {values.map((option) => {
              const selected = option === value;
              const label = picker?.range === "budget" ? `${currency}${option}${option === 2000 ? "+" : ""}` : `${option}`;
              return (
                <Pressable
                  key={option}
                  style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                  onPress={() => onSelect(option)}
                  testID={`filter-value-picker-option-${picker?.range}-${option}`}
                >
                  <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetBackground: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    handleIndicator: {
      width: 48,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.borderStrong,
    },
    sheetBody: { flex: 1 },
    sheetHandleArea: { paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.xl },
    headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
    title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
    subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
    closeText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.brand, paddingTop: 4 },
    content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm, flexGrow: 1 },
    label: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface, marginTop: spacing.md },
    subLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    sliderValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrandTertiary },
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
    chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
    chipTextActive: { color: colors.onBrand },
    inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    rangeDash: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
    inputCard: {
      flex: 1,
      minHeight: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    inputLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    inputValueRow: { flex: 1, flexDirection: "row", alignItems: "center" },
    inputPrefix: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    numericInput: { flex: 1, padding: 0, paddingRight: 24, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    pickerTrigger: { position: "absolute", right: spacing.sm, bottom: spacing.md },
    hardCriteriaSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.xs },
    hardCriteriaTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    hardCriteriaHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    hardCriteriaPills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
    hardCriteriaPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
    hardCriteriaPillText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
    hardCriteriaEditButton: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
    hardCriteriaEditText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
    hardCriteriaBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: "rgba(0,0,0,0.45)" },
    hardCriteriaModal: { width: "100%", maxWidth: 420, maxHeight: "82%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    hardCriteriaHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    hardCriteriaHeaderText: { flex: 1, gap: 2 },
    hardCriteriaModalTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    hardCriteriaOptions: { gap: spacing.xs, paddingVertical: spacing.xs },
    hardCriteriaOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    hardCriteriaOptionActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    hardCriteriaOptionText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
    hardCriteriaOptionTextActive: { fontFamily: fonts.bold, color: colors.brand },
    hardCriteriaDoneButton: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
    hardCriteriaDoneText: { fontFamily: fonts.bold, color: colors.onBrand },
    pickerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: "rgba(0,0,0,0.45)" },
    pickerCard: { width: "100%", maxWidth: 360, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pickerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    pickerViewport: { height: PICKER_VIEWPORT_HEIGHT },
    pickerContent: { paddingVertical: PICKER_ITEM_HEIGHT * 2 },
    pickerOption: { height: PICKER_ITEM_HEIGHT, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
    pickerOptionActive: { backgroundColor: colors.brandTertiary },
    pickerOptionText: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
    pickerOptionTextActive: { fontFamily: fonts.bold, color: colors.onBrandTertiary },
    actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
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
      paddingVertical: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    applyText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand, textAlign: "center" },
  });
}
