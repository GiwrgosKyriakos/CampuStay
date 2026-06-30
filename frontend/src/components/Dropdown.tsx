import React, { useState } from "react";
import { Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

interface Props {
  value: string | null;
  options: string[];
  placeholder: string;
  onSelect: (v: string) => void;
  testID?: string;
}

export default function Dropdown({ value, options, placeholder, onSelect, testID }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)} testID={testID}>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.onSurfaceTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{placeholder}</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const active = opt === value;
                return (
                  <Pressable
                    key={opt}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                    onPress={() => {
                      onSelect(opt);
                      setOpen(false);
                    }}
                    testID={`${testID}-option-${opt}`}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt}</Text>
                    {active && <Ionicons name="checkmark" size={20} color={colors.onBrandTertiary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  value: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  placeholder: { fontFamily: fonts.regular, color: colors.onSurfaceTertiary },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  optionRowActive: { backgroundColor: colors.brandTertiary },
  optionText: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurface },
  optionTextActive: { fontFamily: fonts.bold, color: colors.onBrandTertiary },
});
