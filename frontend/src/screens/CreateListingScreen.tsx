import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import Dropdown from "@/src/components/Dropdown";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { uploadListingImageAsync } from "@/src/api/imageUpload";

type AmenityKey = "petFriendly" | "nearMetro" | "furnished" | "balcony" | "parking";

type Amenity = {
  key: AmenityKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const CITY_OPTIONS = ["Athens", "Thessaloniki", "Patras", "Heraklion", "Ioannina", "Larissa"];

const AMENITIES: Amenity[] = [
  { key: "petFriendly", label: "Pet-friendly", icon: "paw-outline" },
  { key: "nearMetro", label: "Near Metro", icon: "train-outline" },
  { key: "furnished", label: "Furnished", icon: "bed-outline" },
  { key: "balcony", label: "Balcony", icon: "sunny-outline" },
  { key: "parking", label: "Parking", icon: "car-sport-outline" },
];

const PHOTO_SLOTS = 6;
const IMAGE_QUALITY = 0.7;

export default function CreateListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [monthlyRent, setMonthlyRent] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permBlocked, setPermBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amenities, setAmenities] = useState<Record<AmenityKey, boolean>>({
    petFriendly: false,
    nearMetro: false,
    furnished: false,
    balcony: false,
    parking: false,
  });
  const [photos, setPhotos] = useState<string[]>([]);

  const selectedAmenities = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => item.label),
    [amenities],
  );

  const handleToggleAmenity = (key: AmenityKey) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const pickPhoto = useCallback(
    async (source: "camera" | "library") => {
      if (photos.length >= PHOTO_SLOTS) return;

      setPermBlocked(false);

      try {
        if (Platform.OS !== "web") {
          if (source === "library") {
            const current = await ImagePicker.getMediaLibraryPermissionsAsync();
            let status = current.status;
            if (status !== "granted" && current.canAskAgain) {
              const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
              status = requested.status;
            }
            if (status !== "granted") {
              setPermBlocked(true);
              return;
            }
          } else {
            const current = await ImagePicker.getCameraPermissionsAsync();
            let status = current.status;
            if (status !== "granted" && current.canAskAgain) {
              const requested = await ImagePicker.requestCameraPermissionsAsync();
              status = requested.status;
            }
            if (status !== "granted") {
              setPermBlocked(true);
              return;
            }
          }
        }

        const result = source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [4, 3],
              quality: IMAGE_QUALITY,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsMultipleSelection: true,
              selectionLimit: PHOTO_SLOTS - photos.length,
              quality: IMAGE_QUALITY,
            });

        if (result.canceled) return;

        const pickedUris = result.assets
          .map((asset) => asset.uri)
          .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);

        if (!pickedUris.length) {
          setError("We could not read that image. Please try another photo.");
          return;
        }

        setPhotos((prev) => [...prev, ...pickedUris].slice(0, PHOTO_SLOTS));
        setError(null);
      } catch {
        setError("Could not open your camera or photo library. Please try again.");
      }
    },
    [photos.length],
  );

  const openImagePicker = useCallback(() => {
    Alert.alert("Add listing photo", "Choose where to get your listing image.", [
      { text: "Take Photo", onPress: () => void pickPhoto("camera") },
      { text: "Choose from Library", onPress: () => void pickPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickPhoto]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, photoIndex) => photoIndex !== index));
  }, []);

  const validateAndSubmit = async () => {
    if (submitting) return;

    if (!monthlyRent || !city || !area.trim() || !sizeSqm) {
      Alert.alert("Missing details", "Please complete Monthly Rent, City, Area, and Size before publishing.");
      return;
    }

    const hostId = auth.userId;
    if (!hostId || auth.isGuest) {
      Alert.alert("Sign in required", "Please sign up or log in to publish a listing.");
      router.push("/auth-landing");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const uploadedImages = await Promise.all(
        photos.map((uri, index) => uploadListingImageAsync(uri, hostId, index)),
      );
      const firstImage = uploadedImages[0] ?? "";

      const data = {
        title: `${area.trim()} apartment`,
        area: area.trim(),
        city,
        rent: Number(monthlyRent),
        price: Number(monthlyRent),
        rooms: 1,
        size: Number(sizeSqm),
        sqft: Number(sizeSqm),
        image: firstImage,
        imageUrl: firstImage,
        images: uploadedImages,
        tags: selectedAmenities.length ? selectedAmenities : ["New listing"],
        amenities: selectedAmenities,
        hostId,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "apartments"), data);

      if (uploadedImages.length) {
        setPhotos(uploadedImages);
      }
    } catch {
      setError("We could not upload your listing photos right now. Please try again.");
      Alert.alert("Publish failed", "We could not publish your listing right now. Please try again.");
      setSubmitting(false);
      return;
    }

    Alert.alert(
      "Listing published",
      `Your ${sizeSqm} sq.m. listing in ${area}, ${city} is now live.`,
    );
    router.back();
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
            <Text style={styles.fieldHint}>Choose listing photos from your gallery or camera. Tap a photo to remove it.</Text>
            <View style={styles.photoGrid}>
              {Array.from({ length: PHOTO_SLOTS }, (_, index) => index).map((index) => {
                const uri = photos[index];
                const filled = !!uri;
                return (
                  <Pressable
                    key={`photo-slot-${index}`}
                    onPress={() => {
                      if (filled) {
                        removePhoto(index);
                        return;
                      }
                      openImagePicker();
                    }}
                    style={[
                      styles.photoTile,
                      filled ? styles.photoTileFilled : styles.photoTileEmpty,
                    ]}
                    testID={`create-listing-photo-slot-${index}`}
                  >
                    {filled ? (
                      <>
                        <Image source={{ uri }} style={styles.photoImage} contentFit="cover" />
                        <View style={styles.photoOverlay}>
                          <Ionicons name="close-circle" size={20} color={colors.onSurface} />
                        </View>
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

            {permBlocked && (
              <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
                <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
                <Text style={styles.settingsButtonText}>Photo access is off. Open Settings.</Text>
              </Pressable>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
          <Pressable
            style={[styles.publishButton, submitting && styles.publishButtonDisabled]}
            onPress={validateAndSubmit}
            disabled={submitting}
            testID="create-listing-publish-button"
          >
            {submitting ? (
              <View style={styles.publishButtonLoadingRow}>
                <ActivityIndicator size="small" color={colors.onBrand} />
                <Text style={styles.publishButtonText}>Uploading Photos...</Text>
              </View>
            ) : (
              <Text style={styles.publishButtonText}>Publish Listing</Text>
            )}
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
  photoTileFilled: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
    position: "relative",
  },
  photoImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
  },
  photoOverlay: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: "rgba(8, 61, 74, 0.78)",
    borderRadius: radius.pill,
  },
  photoTileText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
  photoTileTextMuted: {
    color: colors.onSurfaceTertiary,
  },
  settingsButton: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
  },
  settingsButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  errorText: {
    marginTop: spacing.xs,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.error,
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
  publishButtonDisabled: {
    opacity: 0.88,
  },
  publishButtonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  publishButtonText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },
});
