import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import Dropdown from "@/src/components/Dropdown";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";

type AmenityKey = "petFriendly" | "nearMetro" | "furnished" | "balcony" | "parking";

type Amenity = {
  key: AmenityKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type PhotoSlot = {
  id: string;
  color: string;
};

const CITY_OPTIONS = ["Athens", "Thessaloniki", "Patras", "Heraklion", "Ioannina", "Larissa"];

const AMENITIES: Amenity[] = [
  { key: "petFriendly", label: "Pet-friendly", icon: "paw-outline" },
  { key: "nearMetro", label: "Near Metro", icon: "train-outline" },
  { key: "furnished", label: "Furnished", icon: "bed-outline" },
  { key: "balcony", label: "Balcony", icon: "sunny-outline" },
  { key: "parking", label: "Parking", icon: "car-sport-outline" },
];

const PHOTO_COLORS = ["#7EC8E3", "#F6B26B", "#93C47D", "#B4A7D6", "#76A5AF", "#F9CB9C"];
const PHOTO_SLOTS = 6;

export default function CreateListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [monthlyRent, setMonthlyRent] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [amenities, setAmenities] = useState<Record<AmenityKey, boolean>>({
    petFriendly: false,
    nearMetro: false,
    furnished: false,
    balcony: false,
    parking: false,
  });
  const [photos, setPhotos] = useState<Array<PhotoSlot | null>>(Array.from({ length: PHOTO_SLOTS }, () => null));

  const selectedAmenities = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => item.label),
    [amenities],
  );

  const handleToggleAmenity = (key: AmenityKey) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePhotoSlotPress = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const hasPhoto = !!next[index];

      if (hasPhoto) {
        next[index] = null;
        return next;
      }

      const color = PHOTO_COLORS[index % PHOTO_COLORS.length];
      next[index] = {
        id: `mock-photo-${index}-${Date.now()}`,
        color,
      };
      return next;
    });
  };

  const validateAndSubmit = () => {
    if (!monthlyRent || !city || !area.trim() || !sizeSqm) {
      Alert.alert("Missing details", "Please complete Monthly Rent, City, Area, and Size before publishing.");
      return;
    }

    Alert.alert(
      "Listing published",
      `Your ${sizeSqm} sq.m. listing in ${area}, ${city} is now live.`,
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flexOne}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing["2xl"] + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          testID="create-listing-screen"
        >
          <View style={styles.headerRow}>
            <Pressable style={styles.backButton} onPress={() => router.back()} testID="create-listing-back">
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </Pressable>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Create Listing</Text>
              <Text style={styles.subtitle}>Publish your apartment details in a few steps.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Monthly Rent</Text>
            <TextInput
              value={monthlyRent}
              onChangeText={(t) => setMonthlyRent(t.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 650"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
              testID="create-listing-rent-input"
            />
            <Text style={styles.fieldHint}>Set a fair monthly rent in EUR.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Location</Text>
            <Dropdown
              value={city}
              options={CITY_OPTIONS}
              placeholder="Select city"
              onSelect={setCity}
              testID="create-listing-city-dropdown"
            />
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder="Area / Neighborhood"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.input, styles.mtSm]}
              testID="create-listing-area-input"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Size</Text>
            <TextInput
              value={sizeSqm}
              onChangeText={(t) => setSizeSqm(t.replace(/[^0-9]/g, ""))}
              placeholder="Square meters (sq.m.)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              maxLength={4}
              style={styles.input}
              testID="create-listing-size-input"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Amenities & Preferences</Text>
            <View style={styles.amenityList}>
              {AMENITIES.map((amenity) => {
                const active = amenities[amenity.key];
                return (
                  <View key={amenity.key} style={[styles.amenityRow, active && styles.amenityRowActive]}>
                    <View style={styles.amenityInfo}>
                      <Ionicons
                        name={amenity.icon}
                        size={18}
                        color={active ? colors.onBrandTertiary : colors.onSurfaceTertiary}
                      />
                      <Text style={[styles.amenityLabel, active && styles.amenityLabelActive]}>{amenity.label}</Text>
                    </View>
                    <Switch
                      value={active}
                      onValueChange={() => handleToggleAmenity(amenity.key)}
                      trackColor={{ false: colors.border, true: colors.brandSecondary }}
                      thumbColor={active ? colors.brand : colors.onSurface}
                      testID={`create-listing-amenity-${amenity.key}`}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={styles.fieldHint} numberOfLines={2}>
              Selected: {selectedAmenities.length ? selectedAmenities.join(", ") : "No amenities selected yet"}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <Text style={styles.fieldHint}>Tap an empty tile to add a mock photo, or tap again to remove it.</Text>
            <View style={styles.photoGrid}>
              {photos.map((slot, index) => {
                const filled = !!slot;
                return (
                  <Pressable
                    key={`photo-slot-${index}`}
                    onPress={() => handlePhotoSlotPress(index)}
                    style={[
                      styles.photoTile,
                      filled ? { backgroundColor: slot.color, borderColor: slot.color } : styles.photoTileEmpty,
                    ]}
                    testID={`create-listing-photo-slot-${index}`}
                  >
                    {filled ? (
                      <>
                        <Ionicons name="image" size={24} color={colors.onBrand} />
                        <Text style={styles.photoTileText}>Photo {index + 1}</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="add" size={26} color={colors.onSurfaceTertiary} />
                        <Text style={[styles.photoTileText, styles.photoTileTextMuted]}>Add</Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
          <Pressable style={styles.publishButton} onPress={validateAndSubmit} testID="create-listing-publish-button">
            <Text style={styles.publishButtonText}>Publish Listing</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  flexOne: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  headerTextWrap: { flex: 1 },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["2xl"],
    color: colors.onSurface,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    marginBottom: 2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  mtSm: { marginTop: spacing.sm },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    lineHeight: 18,
  },
  amenityList: { gap: spacing.sm },
  amenityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  amenityRowActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  amenityInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  amenityLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  amenityLabelActive: {
    color: colors.onBrandTertiary,
  },
  photoGrid: {
    marginTop: spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  photoTile: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  photoTileEmpty: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photoTileText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
  photoTileTextMuted: {
    color: colors.onSurfaceTertiary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  publishButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  publishButtonText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },
});
