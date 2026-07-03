import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { getUserProfile } from "@/src/api/userProfile";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";

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
  const router = useRouter();
  const auth = useAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [rentMin, setRentMin] = useState("");
  const [rentMax, setRentMax] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [nearMetro, setNearMetro] = useState(false);
  const [hideCreateFab, setHideCreateFab] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      if (auth.isGuest) {
        setHideCreateFab(false);
        return () => {
          mounted = false;
        };
      }
      (async () => {
        try {
          const uid = await getUserId();
          const profile = await getUserProfile(uid);
          if (mounted) setHideCreateFab(!!profile?.looking_for_apartment);
        } catch {
          if (mounted) setHideCreateFab(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [auth.isGuest]),
  );

  const filteredApartments = useMemo(() => {
    const minRent = rentMin ? Number(rentMin) : null;
    const maxRent = rentMax ? Number(rentMax) : null;
    const minSize = sizeMin ? Number(sizeMin) : null;
    const maxSize = sizeMax ? Number(sizeMax) : null;
    const query = cityQuery.trim().toLowerCase();

    return APARTMENTS.filter((apt) => {
      const cityMatch =
        query.length === 0 ||
        apt.city.toLowerCase().includes(query) ||
        apt.area.toLowerCase().includes(query);
      const rentMatch =
        (minRent == null || apt.rent >= minRent) &&
        (maxRent == null || apt.rent <= maxRent);
      const sizeMatch =
        (minSize == null || apt.size >= minSize) &&
        (maxSize == null || apt.size <= maxSize);
      const petMatch = !petFriendly || apt.tags.includes("Pet-friendly");
      const metroMatch = !nearMetro || apt.tags.includes("Near metro");

      return cityMatch && rentMatch && sizeMatch && petMatch && metroMatch;
    });
  }, [cityQuery, nearMetro, petFriendly, rentMax, rentMin, sizeMax, sizeMin]);

  return (
    <View style={styles.container} testID="apartments-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Apartments</Text>
        <Text style={styles.subtitle}>Available homes in your study city</Text>
        <Pressable
          style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          onPress={() => setShowFilters((v) => !v)}
          testID="apartments-filter-toggle"
        >
          <Ionicons name="options-outline" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.filterToggleText}>{showFilters ? "Hide Filters" : "Show Filters"}</Text>
        </Pressable>
        {showFilters && (
          <View style={styles.filterPanel} testID="apartments-filter-panel">
            <Text style={styles.filterLabel}>Monthly Rent ({CURRENCY})</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={rentMin}
                onChangeText={(t) => setRentMin(t.replace(/[^0-9]/g, ""))}
                placeholder="Min"
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={rentMax}
                onChangeText={(t) => setRentMax(t.replace(/[^0-9]/g, ""))}
                placeholder="Max"
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-max"
              />
            </View>

            <Text style={styles.filterLabel}>Area / City</Text>
            <TextInput
              style={styles.singleInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder="e.g. Berlin or Kreuzberg"
              placeholderTextColor={colors.onSurfaceTertiary}
              testID="apartments-city-filter"
            />

            <Text style={styles.filterLabel}>Square Meters (m²)</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={sizeMin}
                onChangeText={(t) => setSizeMin(t.replace(/[^0-9]/g, ""))}
                placeholder="Min"
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={sizeMax}
                onChangeText={(t) => setSizeMax(t.replace(/[^0-9]/g, ""))}
                placeholder="Max"
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-max"
              />
            </View>

            <Text style={styles.filterLabel}>Preferences</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Pet-friendly</Text>
              <Switch value={petFriendly} onValueChange={setPetFriendly} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Near Metro</Text>
              <Switch value={nearMetro} onValueChange={setNearMetro} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredApartments.map((apt) => (
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
        {filteredApartments.length === 0 && (
          <View style={styles.emptyState} testID="apartments-empty-state">
            <Text style={styles.emptyTitle}>No apartments match these filters</Text>
            <Text style={styles.emptySub}>Adjust your rent, area, size, or preference filters.</Text>
          </View>
        )}
      </ScrollView>
      {!hideCreateFab && (
        <Pressable
          style={[styles.fab, { bottom: TAB_BAR_SPACE + insets.bottom + spacing.md }]}
          onPress={() => router.push("/create-listing" as any)}
          testID="apartments-create-fab"
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  filterToggle: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  filterToggleActive: { backgroundColor: "#C8E9FF" },
  filterToggleText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrandTertiary },
  filterPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterLabel: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, marginTop: spacing.xs },
  rangeRow: { flexDirection: "row", gap: spacing.sm },
  rangeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
  },
  singleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  switchText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
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
  emptyState: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FF8A1E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onBrand },
});
