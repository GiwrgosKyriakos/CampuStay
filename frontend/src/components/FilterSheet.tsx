import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_CLOSE_THRESHOLD = 120;
const SHEET_CLOSE_VELOCITY = 1.1;

interface Props {
  current: Filters;
  currency: string;
  visible: boolean;
  onChange: (f: Filters) => void;
  onClose: () => void;
}

const FilterSheet = ({ current, currency, visible, onChange, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Filters>(current);
  const [mounted, setMounted] = useState(visible);
  const [sliderInteracting, setSliderInteracting] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);

  useEffect(() => {
    if (visible) {
      if (!mounted) {
        setMounted(true);
        translateY.setValue(SCREEN_HEIGHT);
        backdropOpacity.setValue(0);

        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 240,
            useNativeDriver: true,
          }),
        ]).start();
      }
      return;
    }

    if (!mounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [backdropOpacity, mounted, translateY, visible]);

  useEffect(() => {
    if (visible) {
      setDraft(current);
    }
  }, [current, visible]);

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const close = useCallback(() => {
    if (!visible) {
      return;
    }
    onChange(draft);
    onClose();
  }, [draft, onChange, onClose, visible]);

  const setAndCommit = useCallback(
    (patch: Partial<Filters>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (sliderInteracting) return false;
          return gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStart.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(dragStart.current + gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldClose = gestureState.dy > SHEET_CLOSE_THRESHOLD || gestureState.vy > SHEET_CLOSE_VELOCITY;
          if (shouldClose) {
            close();
            return;
          }

          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 14,
          }).start();
        },
      }),
    [close, sliderInteracting, translateY],
  );

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent visible={mounted} statusBarTranslucent animationType="none" onRequestClose={close}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={close}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.sheetHandleArea} {...sheetPanResponder.panHandlers}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title} testID="filter-sheet-title">
                  Preferences
                </Text>
                <Text style={styles.subtitle}>Adjust these in real time.</Text>
              </View>
              <Pressable onPress={close} hitSlop={12} testID="filter-close-button">
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => {
                const active = draft.gender === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setAndCommit({ gender: g })}
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
            <PreferenceSlider
              label="Minimum age"
              minimum={18}
              maximum={40}
              step={1}
              value={draft.ageMin}
              lowerBound={18}
              upperBound={draft.ageMax}
              onChange={(value) => set({ ageMin: value })}
              onCommit={(value) => setAndCommit({ ageMin: value })}
              onInteractionChange={setSliderInteracting}
              testID="filter-age-min-slider"
            />
            <PreferenceSlider
              label="Maximum age"
              minimum={18}
              maximum={40}
              step={1}
              value={draft.ageMax}
              lowerBound={draft.ageMin}
              upperBound={40}
              onChange={(value) => set({ ageMax: value })}
              onCommit={(value) => setAndCommit({ ageMax: value })}
              onInteractionChange={setSliderInteracting}
              testID="filter-age-max-slider"
            />

            <View style={styles.rowBetween}>
              <Text style={styles.label}>Max budget</Text>
              <Text style={styles.value}>
                {currency}
                {draft.budgetMax}/mo
              </Text>
            </View>
            <PreferenceSlider
              label="Budget"
              minimum={300}
              maximum={1500}
              step={50}
              value={draft.budgetMax}
              lowerBound={300}
              upperBound={1500}
              onChange={(value) => set({ budgetMax: value })}
              onCommit={(value) => setAndCommit({ budgetMax: value })}
              onInteractionChange={setSliderInteracting}
              valueFormatter={(value) => `${currency}${value}/mo`}
              testID="filter-budget-slider"
            />

            <View style={styles.actions}>
              <Pressable
                style={styles.resetBtn}
                onPress={() => {
                  setDraft(DEFAULT_FILTERS);
                  onChange(DEFAULT_FILTERS);
                }}
                testID="filter-reset-button"
              >
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={close} testID="filter-apply-button">
                <Text style={styles.applyText}>Show roommates</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default FilterSheet;

interface PreferenceSliderProps {
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  value: number;
  lowerBound?: number;
  upperBound?: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  onInteractionChange?: (active: boolean) => void;
  valueFormatter?: (value: number) => string;
  testID?: string;
}

function PreferenceSlider({
  label,
  minimum,
  maximum,
  step,
  value,
  lowerBound = minimum,
  upperBound = maximum,
  onChange,
  onCommit,
  onInteractionChange,
  valueFormatter,
  testID,
}: PreferenceSliderProps) {
  const [liveValue, setLiveValue] = useState(value);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      setLiveValue(value);
    }
  }, [value]);

  const clampValue = useCallback(
    (next: number) => {
      const snapped = Math.round(next / step) * step;
      return Math.min(upperBound, Math.max(lowerBound, snapped));
    },
    [lowerBound, step, upperBound],
  );

  const labelText = valueFormatter ? valueFormatter(liveValue) : `${liveValue}`;

  return (
    <View style={styles.sliderBlock} testID={testID}>
      <View style={styles.rowBetween}>
        <Text style={styles.subLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{labelText}</Text>
      </View>
      <Slider
        style={styles.sliderControl}
        minimumValue={minimum}
        maximumValue={maximum}
        step={step}
        minimumTrackTintColor={colors.brand}
        maximumTrackTintColor={colors.surfaceTertiary}
        thumbTintColor={colors.onBrand}
        value={liveValue}
        onSlidingStart={() => {
          draggingRef.current = true;
          onInteractionChange?.(true);
        }}
        onValueChange={(next) => {
          const clamped = clampValue(next);
          setLiveValue(clamped);
          onChange(clamped);
        }}
        onSlidingComplete={(next) => {
          const clamped = clampValue(next);
          draggingRef.current = false;
          setLiveValue(clamped);
          onChange(clamped);
          onCommit(clamped);
          onInteractionChange?.(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16, 16, 20, 0.58)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  sheetHandleArea: { paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.xl },
  handle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  closeText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.brand, paddingTop: 4 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm },
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
  sliderBlock: { gap: spacing.sm, marginTop: spacing.sm },
  sliderControl: {
    height: 34,
    marginHorizontal: -8,
  },
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
