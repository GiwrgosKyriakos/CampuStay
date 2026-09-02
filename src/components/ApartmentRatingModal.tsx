import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

interface ApartmentRatingModalProps {
  visible: boolean;
  score: number;
  saving: boolean;
  onClose: () => void;
  onScoreChange: (score: number) => void;
  onSave: () => void;
}

function getDescriptor(score: number): string {
  if (score >= 9) return t("apartmentRating.descriptors.excellent");
  if (score >= 7) return t("apartmentRating.descriptors.good");
  if (score >= 5) return t("apartmentRating.descriptors.average");
  return t("apartmentRating.descriptors.needsImprovement");
}

export default function ApartmentRatingModal({ visible, score, saving, onClose, onScoreChange, onSave }: ApartmentRatingModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="apartment-rating-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{t("apartmentRating.title")}</Text>
            <Pressable onPress={onClose} disabled={saving} hitSlop={8} testID="apartment-rating-close"><Ionicons name="close-outline" size={24} color={colors.onSurfaceTertiary} /></Pressable>
          </View>
          <Text style={styles.score}>{`${score} / 10`}</Text>
          <Text style={styles.descriptor}>{getDescriptor(score)}</Text>
          <View style={styles.starGrid}>
            {Array.from({ length: 10 }, (_, index) => {
              const value = index + 1;
              return <Pressable key={value} style={styles.starButton} onPress={() => onScoreChange(value)} disabled={saving} testID={`apartment-rating-${value}`}><Ionicons name={value <= score ? "star" : "star-outline"} size={28} color="#F59E0B" /></Pressable>;
            })}
          </View>
          <Pressable style={styles.saveButton} onPress={onSave} disabled={saving} testID="apartment-rating-save"><Text style={styles.saveText}>{saving ? t("common.actions.saving") : t("apartmentRating.save")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    card: { width: "100%", maxWidth: 380, padding: spacing.lg, alignItems: "center", borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    header: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    score: { marginTop: spacing.md, fontFamily: fonts.displayExtra, fontSize: 34, color: colors.onSurface },
    descriptor: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: "#F59E0B" },
    starGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xs, marginVertical: spacing.md },
    starButton: { width: 48, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
    saveButton: { width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
    saveText: { fontFamily: fonts.bold, color: colors.onBrand },
  });
}
