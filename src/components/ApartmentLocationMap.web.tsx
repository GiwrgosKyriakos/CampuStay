import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius } from "@/src/theme";

interface ApartmentLocationMapProps {
  latitude?: number;
  longitude?: number;
  cityCoordinates: { latitude: number; longitude: number };
  hasExactLocation: boolean;
  transactionType?: "sale" | "rent";
  height?: number;
}

export default function ApartmentLocationMap({ height = 280, hasExactLocation }: ApartmentLocationMapProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { height, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Ionicons name="map-outline" size={42} color={colors.brand} />
      <Text style={[styles.title, { color: colors.onSurface }]}>Map preview</Text>
      <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{hasExactLocation ? "Exact location" : t("map.approximateArea")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.base },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
});