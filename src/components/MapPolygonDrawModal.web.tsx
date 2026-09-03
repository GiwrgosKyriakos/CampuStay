import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { LatLng } from "@/src/utils/geometry";

interface MapPolygonDrawModalProps {
  visible: boolean;
  initialPolygon?: LatLng[];
  onClose: () => void;
  onSave: (polygon: LatLng[]) => void;
}

export default function MapPolygonDrawModal({ visible, initialPolygon = [], onClose, onSave }: MapPolygonDrawModalProps) {
  const { colors } = useTheme();
  const [coordinates, setCoordinates] = useState<LatLng[]>(initialPolygon);
  useEffect(() => {
    if (visible) setCoordinates(initialPolygon);
  }, [initialPolygon, visible]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
          <Text style={[styles.title, { color: colors.onSurface }]}>{t("mapPolygon.modalTitle")}</Text>
          <Pressable onPress={() => setCoordinates([])}><Text style={styles.clearText}>{t("mapPolygon.clearBtn")}</Text></Pressable>
        </View>
        <View style={[styles.mapPlaceholder, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="map-outline" size={48} color={colors.brand} />
          <Text style={[styles.placeholderText, { color: colors.onSurfaceTertiary }]}>Map drawing is available on iOS and Android.</Text>
        </View>
        <Pressable style={[styles.saveButton, { backgroundColor: colors.brand }]} onPress={() => { if (coordinates.length >= 3) onSave(coordinates); onClose(); }}>
          <Ionicons name="checkmark" size={22} color={colors.onBrand} />
          <Text style={[styles.saveText, { color: colors.onBrand }]}>Save</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, paddingTop: spacing.lg, borderBottomWidth: 1 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.base },
  clearText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: "#EF4444" },
  mapPlaceholder: { flex: 1, margin: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  placeholderText: { fontFamily: fonts.regular, fontSize: fontSize.sm, textAlign: "center", paddingHorizontal: spacing.lg },
  saveButton: { minHeight: 48, margin: spacing.md, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  saveText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
});