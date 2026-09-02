import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize } from "@/src/theme";

export type CommonLikedListing = { id: string; title: string; area: string; city: string; rent: number; image?: string };

export default function CommonLikedListingsModal({ visible, loading, listings, onClose, onListingPress }: { visible: boolean; loading: boolean; listings: CommonLikedListing[]; onClose: () => void; onListingPress: (listing: CommonLikedListing) => void }) {
  const { colors } = useTheme();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Κοινά αγαπημένα</Text><Pressable onPress={onClose}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>
      {loading ? <ActivityIndicator color={colors.brand} /> : listings.length === 0 ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχει ακίνητο που να έχει αρέσει σε όλους.</Text> : <ScrollView contentContainerStyle={styles.list} bounces={false}>{listings.map((listing) => <Pressable key={listing.id} style={[styles.row, { backgroundColor: colors.surfaceSecondary }]} onPress={() => onListingPress(listing)}><Image source={listing.image ? { uri: listing.image } : undefined} style={styles.image} /><View style={styles.copy}><Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{listing.title}</Text><Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>{listing.area}, {listing.city}</Text><Text style={[styles.price, { color: colors.brand }]}>€{listing.rent}/μήνα</Text></View><Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} /></Pressable>)}</ScrollView>}
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  list: { gap: spacing.sm },
  row: { minHeight: 72, borderRadius: radius.md, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md },
  image: { width: 60, height: 56, borderRadius: radius.sm, backgroundColor: "#D7D9DD" },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  price: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  empty: { paddingVertical: spacing.xl, textAlign: "center", fontFamily: fonts.regular },
});