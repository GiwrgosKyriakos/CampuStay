import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import Dropdown from "@/src/components/Dropdown";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { uploadListingImageAsync } from "@/src/api/imageUpload";
import { upsertListing } from "@/src/api/listings";
import { t } from "@/src/locales";

type AmenityKey = "petFriendly" | "nearMetro" | "furnished" | "balcony" | "parking";
type AmenitySlug = "pet_friendly" | "near_metro" | "furnished" | "balcony" | "parking";

type Amenity = {
  key: AmenityKey;
  slug: AmenitySlug;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

interface FirestoreApartmentDoc {
  title?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  size?: number;
  sqft?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  hostId?: string;
  ownerId?: string;
}

const AMENITIES: Amenity[] = [
  { key: "petFriendly", slug: "pet_friendly", label: "createListing.amenities.petFriendly", icon: "paw-outline" },
  { key: "nearMetro", slug: "near_metro", label: "createListing.amenities.nearMetro", icon: "train-outline" },
  { key: "furnished", slug: "furnished", label: "createListing.amenities.furnished", icon: "bed-outline" },
  { key: "balcony", slug: "balcony", label: "createListing.amenities.balcony", icon: "sunny-outline" },
  { key: "parking", slug: "parking", label: "createListing.amenities.parking", icon: "car-sport-outline" },
];

const PHOTO_SLOTS = 6;
const IMAGE_QUALITY = 0.7;

export default function CreateListingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; listingId?: string }>();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const listingId = typeof params.listingId === "string" ? params.listingId : "";
  const isEditMode = params.mode === "edit" && listingId.length > 0;

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
  const [photoSourceModalVisible, setPhotoSourceModalVisible] = useState(false);
  const [formFeedbackModal, setFormFeedbackModal] = useState<{
    title: string;
    description: string;
    onAcknowledge?: () => void;
  } | null>(null);
  const [loadingEditData, setLoadingEditData] = useState(false);
  const cityOptions = t("createListing.options.cities") as unknown as string[];

  const selectedAmenities = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => t(item.label)),
    [amenities],
  );

  const selectedAmenitySlugs = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => item.slug),
    [amenities],
  );

  const handleToggleAmenity = (key: AmenityKey) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const closeFeedbackModal = useCallback(() => {
    const afterClose = formFeedbackModal?.onAcknowledge;
    setFormFeedbackModal(null);
    if (afterClose) afterClose();
  }, [formFeedbackModal]);

  const showFeedbackModal = useCallback(
    (title: string, description: string, onAcknowledge?: () => void) => {
      setFormFeedbackModal({ title, description, onAcknowledge });
    },
    [],
  );

  useEffect(() => {
    if (!isEditMode || !listingId) return;

    let active = true;
    setLoadingEditData(true);

    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, "apartments", listingId));
        if (!snapshot.exists() || !active) return;

        const data = snapshot.data() as FirestoreApartmentDoc;
        const ownerId = data.ownerId || data.hostId;
        if (auth.userId && ownerId && ownerId !== auth.userId) {
          showFeedbackModal(
            t("createListing.alerts.publishFailedTitle"),
            t("createListing.alerts.publishFailedMessage"),
            () => router.back(),
          );
          return;
        }

        const mappedRent = typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0;
        const mappedSize = typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0;
        const mappedAmenitiesRaw = Array.isArray(data.amenities)
          ? data.amenities
          : Array.isArray(data.tags)
            ? data.tags
            : [];
        const mappedAmenities = mappedAmenitiesRaw.map((entry) => String(entry).trim().toLowerCase());

        setMonthlyRent(mappedRent > 0 ? String(mappedRent) : "");
        setCity(data.city ?? null);
        setArea(data.area ?? "");
        setSizeSqm(mappedSize > 0 ? String(mappedSize) : "");
        setAmenities({
          petFriendly: mappedAmenities.includes("pet_friendly"),
          nearMetro: mappedAmenities.includes("near_metro"),
          furnished: mappedAmenities.includes("furnished"),
          balcony: mappedAmenities.includes("balcony"),
          parking: mappedAmenities.includes("parking"),
        });

        const imageList = Array.isArray(data.images)
          ? data.images
          : [data.imageUrl || data.image || ""].filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);
        setPhotos(imageList.slice(0, PHOTO_SLOTS));
      } finally {
        if (active) setLoadingEditData(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, isEditMode, listingId, router, showFeedbackModal]);

  const pickPhoto = useCallback(
    async (source: "camera" | "library") => {
      if (photos.length >= PHOTO_SLOTS) return;

      setPermBlocked(false);

      try {
        if (Platform.OS !== "web") {
          if (source === "library") {
            const current = await ImagePicker.getMediaLibraryPermissionsAsync();
            if (current.status !== "granted") {
              const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (requested.status !== "granted") {
                setPermBlocked(requested.status === "denied");
                return;
              }
            }
          } else {
            const current = await ImagePicker.getCameraPermissionsAsync();
            if (current.status !== "granted") {
              const requested = await ImagePicker.requestCameraPermissionsAsync();
              if (requested.status !== "granted") {
                setPermBlocked(requested.status === "denied");
                return;
              }
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
          setError(t("createListing.errors.imageUnreadable"));
          return;
        }

        setPhotos((prev) => [...prev, ...pickedUris].slice(0, PHOTO_SLOTS));
        setError(null);
      } catch {
        setError(t("createListing.errors.imagePicker"));
      }
    },
    [photos.length],
  );

  const openImagePicker = useCallback(() => {
    setPhotoSourceModalVisible(true);
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, photoIndex) => photoIndex !== index));
  }, []);

  const validateAndSubmit = async () => {
    if (submitting) return;

    if (!monthlyRent || !city || !area.trim() || !sizeSqm) {
      showFeedbackModal(t("createListing.alerts.missingDetailsTitle"), t("createListing.alerts.missingDetailsMessage"));
      return;
    }

    const hostId = auth.userId;
    if (!hostId || auth.isGuest) {
      showFeedbackModal(
        t("createListing.alerts.signInRequiredTitle"),
        t("createListing.alerts.signInRequiredMessage"),
        () => router.push("/auth-landing"),
      );
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
        title: t("createListing.listingTitle", { area: area.trim() }),
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
        tags: selectedAmenitySlugs.length ? selectedAmenitySlugs : ["new_listing"],
        amenities: selectedAmenitySlugs,
        hostId,
        ownerId: hostId,
      };

      await upsertListing({
        apartmentId: isEditMode ? listingId : undefined,
        payload: data,
      });

      if (uploadedImages.length) {
        setPhotos(uploadedImages);
      }
    } catch {
      setError(t("createListing.errors.uploadPhotos"));
      showFeedbackModal(t("createListing.alerts.publishFailedTitle"), t("createListing.alerts.publishFailedMessage"));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    showFeedbackModal(
      isEditMode ? t("createListing.alerts.updatedTitle") : t("createListing.alerts.publishedTitle"),
      t("createListing.alerts.publishedMessage", { size: sizeSqm, area, city }),
      () => router.back(),
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
              <Text style={styles.title}>{isEditMode ? t("createListing.editTitle") : t("createListing.title")}</Text>
              <Text style={styles.subtitle}>{isEditMode ? t("createListing.editSubtitle") : t("createListing.subtitle")}</Text>
            </View>
          </View>

          {loadingEditData ? (
            <View style={styles.editLoadingRow}>
              <ActivityIndicator size="small" color={colors.brandSecondary} />
              <Text style={styles.fieldHint}>{t("createListing.loadingExisting")}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("createListing.monthlyRent")}</Text>
            <TextInput
              value={monthlyRent}
              onChangeText={(t) => setMonthlyRent(t.replace(/[^0-9]/g, ""))}
              placeholder={t("createListing.rentPlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
              testID="create-listing-rent-input"
            />
            <Text style={styles.fieldHint}>{t("createListing.rentHint")}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("createListing.location")}</Text>
            <Dropdown
              value={city}
              options={cityOptions}
              placeholder={t("createListing.cityPlaceholder")}
              onSelect={setCity}
              testID="create-listing-city-dropdown"
            />
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder={t("createListing.areaPlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.input, styles.mtSm]}
              testID="create-listing-area-input"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("createListing.size")}</Text>
            <TextInput
              value={sizeSqm}
              onChangeText={(t) => setSizeSqm(t.replace(/[^0-9]/g, ""))}
              placeholder={t("createListing.sizePlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="number-pad"
              maxLength={4}
              style={styles.input}
              testID="create-listing-size-input"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("createListing.amenitiesTitle")}</Text>
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
                      <Text style={[styles.amenityLabel, active && styles.amenityLabelActive]}>{t(amenity.label)}</Text>
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
              {t("createListing.selectedAmenities", { value: selectedAmenities.length ? selectedAmenities.join(", ") : t("createListing.selectedAmenitiesEmpty") })}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("common.labels.photos")}</Text>
            <Text style={styles.fieldHint}>{t("createListing.photosHint")}</Text>
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
                        <Text style={[styles.photoTileText, styles.photoTileTextMuted]}>{t("common.actions.add")}</Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {permBlocked && (
              <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
                <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
                <Text style={styles.settingsButtonText}>{`${t("common.media.photoAccessOff")} ${t("common.actions.openSettings")}.`}</Text>
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
                <Text style={styles.publishButtonText}>{t("createListing.uploading")}</Text>
              </View>
            ) : (
              <Text style={styles.publishButtonText}>{isEditMode ? t("createListing.saveChanges") : t("common.cta.publishListing")}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <CenteredActionModal
        visible={!!formFeedbackModal}
        title={formFeedbackModal?.title ?? ""}
        description={formFeedbackModal?.description}
        onDismiss={closeFeedbackModal}
        actions={[
          {
            label: t("common.actions.gotIt"),
            onPress: closeFeedbackModal,
            iconName: "checkmark-circle-outline",
            testID: "create-listing-feedback-ok",
          },
        ]}
        testID="create-listing-feedback-modal"
      />

      <CenteredActionModal
        visible={photoSourceModalVisible}
        title={t("createListing.alerts.addPhotoTitle")}
        description={t("createListing.alerts.addPhotoMessage")}
        onDismiss={() => setPhotoSourceModalVisible(false)}
        actions={[
          {
            label: t("createListing.alerts.takePhoto"),
            iconName: "camera-outline",
            onPress: () => {
              setPhotoSourceModalVisible(false);
              void pickPhoto("camera");
            },
            testID: "create-listing-photo-source-camera",
          },
          {
            label: t("createListing.alerts.chooseLibrary"),
            iconName: "images-outline",
            onPress: () => {
              setPhotoSourceModalVisible(false);
              void pickPhoto("library");
            },
            testID: "create-listing-photo-source-library",
          },
          {
            label: t("common.actions.cancel"),
            iconName: "close-outline",
            variant: "outline",
            onPress: () => setPhotoSourceModalVisible(false),
            testID: "create-listing-photo-source-cancel",
          },
        ]}
        testID="create-listing-photo-source-modal"
      />
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
  editLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: -spacing.xs,
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
