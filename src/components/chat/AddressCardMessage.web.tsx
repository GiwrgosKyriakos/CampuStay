import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function AddressCardMessage({ exactAddress, isMine }: { exactAddress: string; latitude?: number; longitude?: number; isMine: boolean }) {
  const { colors } = useTheme();
  const openNavigation = () => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactAddress)}`);
  return (
    <View style={[styles.wrap, isMine ? styles.mine : styles.theirs, { borderColor: colors.border }]}>
      <View style={[styles.mapPlaceholder, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="map-outline" size={34} color={colors.brand} /></View>
      <View style={[styles.content, { backgroundColor: colors.surface }]}>
        <View style={styles.titleRow}><Ionicons name="location-sharp" size={19} color={colors.brand} /><Text style={[styles.title, { color: colors.onSurface }]}>Exact location</Text></View>
        <Text style={[styles.address, { color: colors.onSurface }]}>{exactAddress}</Text>
        <Pressable style={[styles.navigationButton, { backgroundColor: colors.brand }]} onPress={openNavigation}><Ionicons name="navigate-outline" size={17} color={colors.onBrand} /><Text style={[styles.navigationText, { color: colors.onBrand }]}>Open navigation</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "88%", maxWidth: 360, marginVertical: spacing.xs, borderRadius: radius.md, overflow: "hidden", borderWidth: 1 },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  mapPlaceholder: { width: "100%", height: 120, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  address: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  navigationButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  navigationText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
});