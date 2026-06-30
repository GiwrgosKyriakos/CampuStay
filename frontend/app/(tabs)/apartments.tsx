import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;

interface Apartment {
  id: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  rooms: number;
  size: number;
  image: string;
  tags: string[];
}

const APARTMENTS: Apartment[] = [
  {
    id: "a1",
    title: "Sunny loft near campus",
    area: "Kreuzberg",
    city: "Berlin",
    rent: 720,
    rooms: 3,
    size: 78,
    image:
      "https://images.unsplash.com/photo-1564078516393-cf04bd966897?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGFwYXJ0bWVudCUyMGxpdmluZyUyMHJvb20lMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzgyNzc4MzA0fDA&ixlib=rb-4.1.0&q=85",
    tags: ["Furnished", "Balcony", "WiFi"],
  },
  {
    id: "a2",
    title: "Cozy shared flat",
    area: "Schwabing",
    city: "Munich",
    rent: 590,
    rooms: 2,
    size: 54,
    image:
      "https://images.unsplash.com/photo-1541194577687-8c63bf9e7ee3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxlbXB0eSUyMGFwYXJ0bWVudCUyMGxpdmluZyUyMHJvb20lMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzgyNzc4MzA0fDA&ixlib=rb-4.1.0&q=85",
    tags: ["Pet-friendly", "Near metro"],
  },
  {
    id: "a3",
    title: "Modern studio with view",
    area: "Altstadt",
    city: "Heidelberg",
    rent: 850,
    rooms: 1,
    size: 42,
    image:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
    tags: ["Furnished", "Bills incl."],
  },
  {
    id: "a4",
    title: "Bright room in WG",
    area: "Eimsbüttel",
    city: "Hamburg",
    rent: 480,
    rooms: 4,
    size: 95,
    image:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
    tags: ["Shared kitchen", "Garden"],
  },
];

export default function ApartmentsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container} testID="apartments-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Apartments</Text>
        <Text style={styles.subtitle}>Available homes in your study city</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {APARTMENTS.map((apt) => (
          <View key={apt.id} style={styles.card} testID={`apartment-card-${apt.id}`}>
            <Image source={{ uri: apt.image }} style={styles.photo} contentFit="cover" transition={150} />
            <LinearGradient
              colors={["transparent", "rgba(26,26,26,0.95)"]}
              locations={[0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.rentBadge}>
              <Text style={styles.rentText}>
                {CURRENCY}
                {apt.rent}
              </Text>
              <Text style={styles.rentMo}>/mo</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.aptTitle}>{apt.title}</Text>
              <View style={styles.locRow}>
                <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.loc}>
                  {apt.area}, {apt.city}
                </Text>
              </View>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{apt.rooms} rooms</Text>
                <View style={styles.dot} />
                <Text style={styles.stat}>{apt.size} m²</Text>
              </View>
              <View style={styles.tagRow}>
                {apt.tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  card: {
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  rentBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  rentText: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onBrand },
  rentMo: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand, paddingBottom: 2 },
  cardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.xs },
  aptTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurfaceInverse },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  loc: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  stat: { fontFamily: fonts.regular, fontSize: fontSize.base, color: "rgba(255,255,255,0.9)" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  tag: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceInverse },
});
