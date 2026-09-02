import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function AddressCardMessage({
  exactAddress,
  latitude,
  longitude,
  isMine,
}: {
  exactAddress: string;
  latitude?: number;
  longitude?: number;
  isMine: boolean;
}) {
  const { colors } = useTheme();
  const openNavigation = () => {
    const encodedAddress = encodeURIComponent(exactAddress);
    const url = Platform.OS === "ios" ? `maps://?daddr=${encodedAddress}` : `google.navigation:q=${encodedAddress}`;
    void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`));
  };
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  return (
    <View style={[styles.wrap, isMine ? styles.mine : styles.theirs]} testID="address-card-message">
      {hasCoordinates ? <MapView style={styles.map} scrollEnabled={false} zoomEnabled={false} initialRegion={{ latitude: latitude as number, longitude: longitude as number, latitudeDelta: 0.012, longitudeDelta: 0.012 }}><Marker coordinate={{ latitude: latitude as number, longitude: longitude as number }} /></MapView> : null}
      <View style={styles.content}>
        <View style={styles.titleRow}><Ionicons name="location-sharp" size={19} color={colors.brand} /><Text style={[styles.title, { color: colors.onSurface }]}>Ακριβής τοποθεσία</Text></View>
        <Text style={[styles.address, { color: colors.onSurface }]}>{exactAddress}</Text>
        <Pressable style={[styles.navigationButton, { backgroundColor: colors.brand }]} onPress={openNavigation} testID="address-card-navigation"><Ionicons name="navigate-outline" size={17} color={colors.onBrand} /><Text style={[styles.navigationText, { color: colors.onBrand }]}>Οδήγηση / Πλοήγηση</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "88%", maxWidth: 360, marginVertical: spacing.xs, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: "#D7E1E5" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  map: { width: "100%", height: 120 },
  content: { padding: spacing.md, gap: spacing.sm, backgroundColor: "#FFFFFF" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  address: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  navigationButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  navigationText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
});
