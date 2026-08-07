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
import AddressAutocompleteInput from "@/src/components/AddressAutocompleteInput";
import ApartmentLocationMap from "@/src/components/ApartmentLocationMap";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { useLocationCoordinates } from "@/src/hooks/useLocationCoordinates";
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
  description?: string; // 🟢 Νέο πεδίο
  about?: string;       // 🟢 Νέο πεδίο
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  rooms?: number;
  area?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent?: number;
  price?: number;
  maxDiscountPercent?: number;
  size?: number;
  sqft?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  extraDetails?: Record<string, boolean>;
  extraInformation?: Partial<ListingExtraInformation>;
  hostId?: string;
  ownerId?: string;
  showPhoneNumber?: boolean;
  publishedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

const AMENITIES: Amenity[] = [
  { key: "petFriendly", slug: "pet_friendly", label: "createListing.amenities.petFriendly", icon: "paw-outline" },
  { key: "nearMetro", slug: "near_metro", label: "createListing.amenities.nearMetro", icon: "train-outline" },
  { key: "furnished", slug: "furnished", label: "createListing.amenities.furnished", icon: "bed-outline" },
  { key: "balcony", slug: "balcony", label: "createListing.amenities.balcony", icon: "sunny-outline" },
  { key: "parking", slug: "parking", label: "createListing.amenities.parking", icon: "car-sport-outline" },
];

type ExtraDetailCategory = {
  title: string;
  items: string[];
};

type ListingExtraInformation = {
  livingRooms: number;
  bathrooms: number;
  kitchens: number;
  buildYear?: number;
  commonExpenses?: number;
  levels: number;
  heatingSystem?: string;
  energyClass?: string;
  availableFromDate?: string;
  isImmediatelyAvailable?: boolean;
};

type CompletionBadgeProps = {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

const EXTRA_DETAIL_CATEGORIES: ExtraDetailCategory[] = [
  {
    title: "Εσωτερικό",
    items: [
      "Ασανσέρ",
      "Κλιματισμός",
      "Πόρτα ασφαλείας",
      "Διπλός υαλοπίνακας",
      "Φωτεινό",
      "Βαμμένο",
      "Επιπλωμένο",
      "Τζάκι",
      "Ενδοδαπέδια Θέρμανση",
      "Ηλιακός Θερμοσίφωνας",
      "Νυχτερινό ρεύμα",
      "Αποθήκη",
      "Σοφίτα",
      "Playroom",
      "Δορυφορική κεραία",
      "Συναγερμός",
      "Σίτες",
      "Υποδοχή με Θυρωρό",
      "Εγκαταστάσεις φόρτισης ηλεκτρικού αυτοκινήτου",
      "Πολυτελές",
      "Διαμπερές",
      "Εσωτερική σκάλα",
    ],
  },
  {
    title: "Εξωτερικά χαρακτηριστικά",
    items: [
      "Βεράντα",
      "Θέα",
      "Πρόσβαση από Άσφαλτο",
      "Οικιστική Ζώνη",
      "Parking",
      "Τέντες",
      "Κήπος",
      "Εντοιχισμένο BBQ",
      "Πρόσβαση για ΑμεΑ",
      "Πισίνα",
      "Προσόψεως",
      "Γωνιακό",
    ],
  },
  {
    title: "Κατασκευή",
    items: ["Οροφοδιαμέρισμα", "Ανακαινισμένο", "Χρήζει ανακαίνισης", "Νεοκλασικό", "Ρετιρέ", "Διατηρητέο", "Ημιτελές", "Υπόσκαφο"],
  },
  {
    title: "Κατάλληλο για",
    items: ["Φοιτητικό", "Εξοχικό", "Επαγγελματική χρήση", "Ιατρείο", "Επενδυτικό"],
  },
];

const PHOTO_SLOTS = 6;
const IMAGE_QUALITY = 0.7;
const CURRENT_BUILD_YEAR = 2026;
const HEATING_SYSTEM_OPTIONS = ["Αυτόνομη", "Κεντρική", "Ρεύμα", "Φυσικό Αέριο", "Αντλία Θερμότητας", "Πετρέλαιο", "Χωρίς Θέρμανση", "Άλλο"];
const ENERGY_CLASS_OPTIONS = ["A++", "A+", "A", "B+", "B", "C", "D", "E", "F", "G"];

function parseTimestampToMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (value && typeof value === "object") {
    const maybeToMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof maybeToMillis === "function") {
      try {
        const millis = maybeToMillis();
        return Number.isFinite(millis) ? millis : null;
      } catch {
        return null;
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const safeNanos = typeof nanoseconds === "number" && Number.isFinite(nanoseconds) ? nanoseconds : 0;
      return Math.trunc(seconds * 1000 + safeNanos / 1_000_000);
    }
  }

  return null;
}

function clampRequiredIntegerInput(rawValue: string, min: number, max: number, fallback: number): string {
  const digitsOnly = rawValue.replace(/[^0-9]/g, "");
  if (!digitsOnly.length) return String(fallback);
  const parsed = Number(digitsOnly);
  if (!Number.isFinite(parsed)) return String(fallback);
  return String(Math.min(max, Math.max(min, Math.trunc(parsed))));
}

function clampOptionalIntegerInput(rawValue: string, min: number, max: number): string {
  const digitsOnly = rawValue.replace(/[^0-9]/g, "");
  if (!digitsOnly.length) return "";
  const parsed = Number(digitsOnly);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.min(max, Math.max(min, Math.trunc(parsed))));
}

function digitsOnlyInput(rawValue: string): string {
  return rawValue.replace(/[^0-9]/g, "");
}

function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toDateTimeLabel(millis: number | null): string | null {
  if (!millis || !Number.isFinite(millis)) return null;
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

function CompletionBadge({ colors, styles }: CompletionBadgeProps) {
  return (
    <View style={styles.sectionCompleteBadge}>
      <Ionicons name="checkmark" size={13} color={colors.onBrand} />
    </View>
  );
}

export default function CreateListingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // 2. Προσθήκη των States μέσα στο CreateListingScreen component
  const [title, setTitle] = useState("");             
  const [description, setDescription] = useState(""); 
  const [isExtraInfoExpanded, setIsExtraInfoExpanded] = useState(false);
  const [isExtraDetailsExpanded, setIsExtraDetailsExpanded] = useState(false);
  const [isExtraInformationExpanded, setIsExtraInformationExpanded] = useState(false);
  const [extraDetailsState, setExtraDetailsState] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; listingId?: string }>();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const listingId = typeof params.listingId === "string" ? params.listingId : "";
  const isEditMode = params.mode === "edit" && listingId.length > 0;

  const [monthlyRent, setMonthlyRent] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [addressLatitude, setAddressLatitude] = useState<number | null>(null);
  const [addressLongitude, setAddressLongitude] = useState<number | null>(null);
  const [hasExactLocation, setHasExactLocation] = useState(false);
  const [sizeSqm, setSizeSqm] = useState("");
  const [propertyCategory, setPropertyCategory] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [rooms, setRooms] = useState("1");
  const [livingRooms, setLivingRooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [kitchens, setKitchens] = useState("1");
  const [buildYear, setBuildYear] = useState("");
  const [commonExpenses, setCommonExpenses] = useState("");
  const [levels, setLevels] = useState("1");
  const [heatingSystem, setHeatingSystem] = useState<string | null>(null);
  const [energyClass, setEnergyClass] = useState<string | null>(null);
  const [availableFromDate, setAvailableFromDate] = useState<string | null>(null);
  const [isImmediatelyAvailable, setIsImmediatelyAvailable] = useState(false);
  const [publishedAtMillis, setPublishedAtMillis] = useState<number | null>(null);
  const [updatedAtMillis, setUpdatedAtMillis] = useState<number | null>(null);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPhoneNumber, setShowPhoneNumber] = useState(true);
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
  const propertyCategoryOptions = ["Κατοικία", "Επαγγελματική στέγη", "Γη", "Λοιπά ακίνητα"];
  const propertyTypeOptions = [
    "Διαμέρισμα",
    "Studio",
    "Γκαρσονιέρα",
    "Μεζονέτα",
    "Μονοκατοικία",
    "Βίλλα",
    "Loft",
    "Bungalow",
    "Κτίριο",
    "Συγκρότημα διαμερισμάτων",
    "Φάρμα/Ράντσο",
    "Πλωτό σπίτι",
    "Άλλες κατηγορίες",
  ];
  const floorOptions = ["Υπόγειο", "Ημιώροφος", "Ισόγειο", "1ος", "2ος", "3ος", "4ος", "5ος+"];
  const cityCoordinates = useLocationCoordinates(city, area);
  const availableFromDateOptions = useMemo(() => {
    const startDate = new Date();
    startDate.setHours(12, 0, 0, 0);

    return Array.from({ length: 366 }, (_, index) => {
      const nextDate = new Date(startDate);
      nextDate.setDate(startDate.getDate() + index);
      const value = toIsoDateString(nextDate);
      return {
        label: toDateLabel(value),
        value,
      };
    });
  }, []);

  const availableFromDateLabel = useMemo(
    () => availableFromDateOptions.find((item) => item.value === availableFromDate)?.label ?? null,
    [availableFromDate, availableFromDateOptions],
  );

  const publishedAtLabel = useMemo(
    () => toDateTimeLabel(publishedAtMillis) ?? "Θα δημιουργηθεί με τη δημοσίευση",
    [publishedAtMillis],
  );

  const updatedAtLabel = useMemo(
    () => toDateTimeLabel(updatedAtMillis) ?? "Θα ενημερωθεί με την αποθήκευση",
    [updatedAtMillis],
  );

  const selectedAmenities = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => t(item.label)),
    [amenities],
  );

  const selectedAmenitySlugs = useMemo(
    () => AMENITIES.filter((item) => amenities[item.key]).map((item) => item.slug),
    [amenities],
  );

  const hasValidPhoto = useMemo(
    () => photos.some((uri) => typeof uri === "string" && uri.trim().length > 0),
    [photos],
  );

  const extraDetailsAnswersCount = useMemo(
    () => Object.keys(extraDetailsState).length,
    [extraDetailsState],
  );

  const numericRent = useMemo(() => Number(monthlyRent), [monthlyRent]);
  const numericSize = useMemo(() => Number(sizeSqm), [sizeSqm]);
  const numericRooms = useMemo(() => Number(rooms), [rooms]);
  const cityValue = city?.trim() ?? "";

  const isLocationSectionComplete = useMemo(
    () => cityValue.length > 0 && area.trim().length > 0,
    [area, cityValue],
  );

  const isSpecsSectionComplete = useMemo(
    () => numericRent > 0 && numericSize > 0 && numericRooms > 0,
    [numericRent, numericRooms, numericSize],
  );

  const isPhotosSectionComplete = useMemo(() => hasValidPhoto, [hasValidPhoto]);

  const isAmenitiesSectionComplete = useMemo(
    () => selectedAmenitySlugs.length > 0,
    [selectedAmenitySlugs],
  );

  const isExtraDetailsSectionComplete = useMemo(
    () => extraDetailsAnswersCount > 0,
    [extraDetailsAnswersCount],
  );

  const hasAmenitiesDetailsOrContactInput = useMemo(
    () => isAmenitiesSectionComplete || isExtraDetailsSectionComplete || showPhoneNumber === false,
    [isAmenitiesSectionComplete, isExtraDetailsSectionComplete, showPhoneNumber],
  );

  const progressChecks = useMemo(
    () => [
      title.trim().length > 0,
      description.trim().length > 0,
      cityValue.length > 0,
      area.trim().length > 0,
      numericRent > 0,
      numericSize > 0,
      numericRooms > 0,
      hasValidPhoto,
      hasAmenitiesDetailsOrContactInput,
    ],
    [
      area,
      cityValue,
      description,
      hasAmenitiesDetailsOrContactInput,
      hasValidPhoto,
      numericRent,
      numericRooms,
      numericSize,
      title,
    ],
  );

  const listingProgress = useMemo(() => {
    const completed = progressChecks.filter(Boolean).length;
    const total = progressChecks.length;
    const ratio = total > 0 ? completed / total : 0;
    return {
      completed,
      total,
      ratio,
      percent: Math.round(ratio * 100),
    };
  }, [progressChecks]);

  const handleToggleAmenity = (key: AmenityKey) => {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetExtraDetailAnswer = useCallback((itemKey: string, answer: boolean) => {
    setExtraDetailsState((prev) => {
      if (prev[itemKey] === answer) {
        const next = { ...prev };
        delete next[itemKey];
        return next;
      }

      return {
        ...prev,
        [itemKey]: answer,
      };
    });
  }, []);

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
        setAddress(data.address ?? "");
        setAddressLatitude(typeof data.latitude === "number" ? data.latitude : null);
        setAddressLongitude(typeof data.longitude === "number" ? data.longitude : null);
        setHasExactLocation(data.hasExactLocation === true);
        setSizeSqm(mappedSize > 0 ? String(mappedSize) : "");
        const mappedMaxDiscount =
          typeof data.maxDiscountPercent === "number" && Number.isFinite(data.maxDiscountPercent)
            ? Math.min(100, Math.max(0, Math.trunc(data.maxDiscountPercent)))
            : null;
        setMaxDiscountPercent(mappedMaxDiscount !== null ? String(mappedMaxDiscount) : "");
        setTitle(data.title ?? "");
        setDescription(data.description ?? data.about ?? "");
        setShowPhoneNumber(data.showPhoneNumber !== false);
        setPropertyCategory(data.propertyCategory ?? null);
        setPropertyType(data.propertyType ?? null);
        setFloor(data.floor ?? null);
        setRooms(typeof data.rooms === "number" && Number.isFinite(data.rooms) ? String(Math.max(1, Math.trunc(data.rooms))) : "1");
        const mappedExtraInformation =
          data.extraInformation && typeof data.extraInformation === "object"
            ? data.extraInformation
            : null;
        setLivingRooms(
          typeof mappedExtraInformation?.livingRooms === "number" && Number.isFinite(mappedExtraInformation.livingRooms)
            ? clampRequiredIntegerInput(String(mappedExtraInformation.livingRooms), 1, 9, 1)
            : "1",
        );
        setBathrooms(
          typeof mappedExtraInformation?.bathrooms === "number" && Number.isFinite(mappedExtraInformation.bathrooms)
            ? clampRequiredIntegerInput(String(mappedExtraInformation.bathrooms), 1, 9, 1)
            : "1",
        );
        setKitchens(
          typeof mappedExtraInformation?.kitchens === "number" && Number.isFinite(mappedExtraInformation.kitchens)
            ? clampRequiredIntegerInput(String(mappedExtraInformation.kitchens), 1, 9, 1)
            : "1",
        );
        setBuildYear(
          typeof mappedExtraInformation?.buildYear === "number" && Number.isFinite(mappedExtraInformation.buildYear)
            ? clampOptionalIntegerInput(String(mappedExtraInformation.buildYear), 1000, CURRENT_BUILD_YEAR)
            : "",
        );
        setCommonExpenses(
          typeof mappedExtraInformation?.commonExpenses === "number" && Number.isFinite(mappedExtraInformation.commonExpenses)
            ? digitsOnlyInput(String(Math.max(0, Math.trunc(mappedExtraInformation.commonExpenses))))
            : "",
        );
        setLevels(
          typeof mappedExtraInformation?.levels === "number" && Number.isFinite(mappedExtraInformation.levels)
            ? clampRequiredIntegerInput(String(mappedExtraInformation.levels), 1, 9, 1)
            : "1",
        );
        setHeatingSystem(
          typeof mappedExtraInformation?.heatingSystem === "string" && mappedExtraInformation.heatingSystem.trim().length > 0
            ? mappedExtraInformation.heatingSystem.trim()
            : null,
        );
        setEnergyClass(
          typeof mappedExtraInformation?.energyClass === "string" && mappedExtraInformation.energyClass.trim().length > 0
            ? mappedExtraInformation.energyClass.trim()
            : null,
        );
        setAvailableFromDate(
          typeof mappedExtraInformation?.availableFromDate === "string" && mappedExtraInformation.availableFromDate.trim().length > 0
            ? mappedExtraInformation.availableFromDate.trim()
            : null,
        );
        setIsImmediatelyAvailable(mappedExtraInformation?.isImmediatelyAvailable === true);
        setPublishedAtMillis(parseTimestampToMillis(data.publishedAt) ?? parseTimestampToMillis(data.createdAt));
        setUpdatedAtMillis(parseTimestampToMillis(data.updatedAt));
        setAmenities({
          petFriendly: mappedAmenities.includes("pet_friendly"),
          nearMetro: mappedAmenities.includes("near_metro"),
          furnished: mappedAmenities.includes("furnished"),
          balcony: mappedAmenities.includes("balcony"),
          parking: mappedAmenities.includes("parking"),
        });

        const mappedExtraDetails =
          data.extraDetails && typeof data.extraDetails === "object"
            ? Object.entries(data.extraDetails).reduce((acc, [key, value]) => {
                if (value === true || value === false) {
                  acc[key] = value;
                }
                return acc;
              }, {} as Record<string, boolean>)
            : {};
        setExtraDetailsState(mappedExtraDetails);

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
        const parsedMaxDiscount = maxDiscountPercent.trim().length > 0 ? Number(maxDiscountPercent) : null;
        if (parsedMaxDiscount !== null && (!Number.isInteger(parsedMaxDiscount) || parsedMaxDiscount < 0 || parsedMaxDiscount > 100)) {
          showFeedbackModal(
            t("createListing.alerts.publishFailedTitle"),
            "Το όριο αποδεκτών προσφορών πρέπει να είναι ακέραιος αριθμός από 0 έως 100.",
          );
          return;
        }

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
      const defaultTitle = t("createListing.listingTitle", { area: area.trim() });
      const finalTitle = title.trim() || defaultTitle;
      const finalDescription = description.trim();
      const finalAddress = address.trim();
      const exactAddressSelected = hasExactLocation && finalAddress.length > 0 && addressLatitude !== null && addressLongitude !== null;
      const parsedRooms = Number(rooms);
      const normalizedRooms = Number.isFinite(parsedRooms) && parsedRooms > 0 ? Math.trunc(parsedRooms) : 1;
      const extraInformation: ListingExtraInformation = {
        livingRooms: Number(livingRooms),
        bathrooms: Number(bathrooms),
        kitchens: Number(kitchens),
        levels: Number(levels),
        isImmediatelyAvailable,
        buildYear: buildYear.trim().length > 0 ? Number(buildYear) : undefined,
        commonExpenses: commonExpenses.trim().length > 0 ? Number(commonExpenses) : undefined,
        heatingSystem: heatingSystem ?? undefined,
        energyClass: energyClass ?? undefined,
        availableFromDate: availableFromDate ?? undefined,
      };

      const data: Record<string, unknown> = {
        title: finalTitle,
        description: finalDescription,
        about: finalDescription, // Για backward compatibility
        propertyCategory: propertyCategory ?? undefined,
        propertyType: propertyType ?? undefined,
        floor: floor ?? undefined,
        area: area.trim(),
        city,
        address: finalAddress.length > 0 ? finalAddress : undefined,
        latitude: exactAddressSelected ? addressLatitude : undefined,
        longitude: exactAddressSelected ? addressLongitude : undefined,
        hasExactLocation: exactAddressSelected,
        rent: Number(monthlyRent),
        price: Number(monthlyRent),
        maxDiscountPercent: parsedMaxDiscount,
        rooms: normalizedRooms,
        size: Number(sizeSqm),
        sqft: Number(sizeSqm),
        image: firstImage,
        imageUrl: firstImage,
        images: uploadedImages,
        tags: selectedAmenitySlugs.length ? selectedAmenitySlugs : ["new_listing"],
        amenities: selectedAmenitySlugs,
        extraDetails: Object.keys(extraDetailsState).length > 0 ? extraDetailsState : undefined,
        extraInformation,
        showPhoneNumber,
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
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${listingProgress.percent}%` }]} />
      </View>

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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("createListing.monthlyRent")}</Text>
              {isSpecsSectionComplete ? <CompletionBadge colors={colors} styles={styles} /> : null}
            </View>
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

          {/* 🟢 1. ΚΑΡΤΑ ΤΙΤΛΟΥ ΑΓΓΕΛΙΑΣ */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Τίτλος Αγγελίας (Προαιρετικό)</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={`π.χ. ${t("createListing.listingTitle", { area: area || "Περιοχή" })}`}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              maxLength={60}
              testID="create-listing-title-input"
            />
            <Text style={styles.fieldHint}>
              Αν το αφήσεις κενό, θα δημιουργηθεί αυτόματος τίτλος βάσει περιοχής.
            </Text>
          </View>

          {/* 🟢 2. ΚΑΡΤΑ ΠΕΡΙΓΡΑΦΗΣ / ABOUT */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Περιγραφή / Σχετικά με το σπίτι (Προαιρετικό)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Γράψε λεπτομέρειες για το σπίτι, τους κανόνες ή τι αναζητάς..."
              placeholderTextColor={colors.onSurfaceTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={[styles.input, { minHeight: 90, paddingTop: spacing.md }]}
              testID="create-listing-description-input"
            />
            <Text style={styles.fieldHint}>
              Γράψε επιπλέον πληροφορίες αν θέλεις να αντικαταστήσεις την προεπιλεγμένη περιγραφή.
            </Text>
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
            <View style={styles.discountRow}>
              <View style={styles.discountInputWrap}>
                <Text style={styles.sectionTitle}>Όριο αποδεκτών προσφορών</Text>
                <Text style={styles.fieldHint}>Max Offer Discount</Text>
                <View style={styles.percentInputRow}>
                  <TextInput
                    value={maxDiscountPercent}
                    onChangeText={(value) => {
                      const digitsOnly = value.replace(/[^0-9]/g, "");
                      if (!digitsOnly.length) {
                        setMaxDiscountPercent("");
                        return;
                      }

                      const parsed = Number(digitsOnly);
                      if (Number.isNaN(parsed)) return;
                      setMaxDiscountPercent(String(Math.min(100, parsed)));
                    }}
                    placeholder="π.χ. 10"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={[styles.input, styles.percentInput]}
                    testID="create-listing-max-discount-input"
                  />
                  <Text style={styles.percentSuffix}>%</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("createListing.location")}</Text>
              {isLocationSectionComplete ? <CompletionBadge colors={colors} styles={styles} /> : null}
            </View>
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
            <AddressAutocompleteInput
              value={address}
              city={city}
              area={area}
              placeholder="Οδός, αριθμός, περιοχή (προαιρετικό)"
              onChangeAddressText={(text) => {
                setAddress(text);
                setAddressLatitude(null);
                setAddressLongitude(null);
                setHasExactLocation(false);
              }}
              onAddressSelect={({ address: selectedAddress, latitude, longitude, hasExactLocation: exact }) => {
                setAddress(selectedAddress);
                setAddressLatitude(latitude);
                setAddressLongitude(longitude);
                setHasExactLocation(exact);
              }}
              testID="create-listing-address-input"
            />
            <ApartmentLocationMap
              latitude={addressLatitude ?? undefined}
              longitude={addressLongitude ?? undefined}
              cityCoordinates={cityCoordinates}
              hasExactLocation={hasExactLocation}
              height={240}
            />
            <Text style={styles.fieldHint}>
              Η ακριβής τοποθεσία αποθηκεύεται μόνο όταν επιλέξεις πρόταση από τη λίστα.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("createListing.amenitiesTitle")}</Text>
              {isAmenitiesSectionComplete ? <CompletionBadge colors={colors} styles={styles} /> : null}
            </View>
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
            <Pressable
              style={styles.expandHeaderRow}
              onPress={() => setIsExtraInfoExpanded((prev) => !prev)}
              testID="create-listing-extra-info-toggle"
            >
              <Text style={styles.sectionTitle}>Χαρακτηριστικά Ακινήτου</Text>
              <Ionicons
                name={isExtraInfoExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.onSurface}
              />
            </Pressable>

            {isExtraInfoExpanded && (
              <>
                <Text style={styles.sectionSubtitle}>Κατηγορία ακινήτου</Text>
                <Dropdown
                  value={propertyCategory}
                  options={propertyCategoryOptions}
                  placeholder="Επιλέξτε κατηγορία"
                  onSelect={setPropertyCategory}
                  testID="create-listing-property-category-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Είδος ακινήτου</Text>
                <Dropdown
                  value={propertyType}
                  options={propertyTypeOptions}
                  placeholder="Επιλέξτε είδος"
                  onSelect={setPropertyType}
                  testID="create-listing-property-type-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Όροφος</Text>
                <Dropdown
                  value={floor}
                  options={floorOptions}
                  placeholder="Επιλέξτε όροφο"
                  onSelect={setFloor}
                  testID="create-listing-floor-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Δωμάτια</Text>
                <TextInput
                  value={rooms}
                  onChangeText={(value) => setRooms(value.replace(/[^0-9]/g, ""))}
                  placeholder="π.χ. 2"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.input}
                  testID="create-listing-rooms-input"
                />
                <Text style={styles.fieldHint}>Ο αριθμός δωματίων αποθηκεύεται δυναμικά στην αγγελία.</Text>
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("common.labels.photos")}</Text>
              {isPhotosSectionComplete ? <CompletionBadge colors={colors} styles={styles} /> : null}
            </View>
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
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Στοιχεία Επικοινωνίας</Text>
            <View style={styles.contactToggleRow}>
              <View style={styles.contactToggleTextWrap}>
                <Text style={styles.contactToggleLabel}>Εμφάνιση τηλεφώνου επικοινωνίας στην αγγελία</Text>
                <Text style={styles.fieldHint}>Η επιλογή αυτή εμφανίζει το τηλέφωνο του προφίλ του host στη σελίδα της αγγελίας.</Text>
              </View>
              <Switch
                value={showPhoneNumber}
                onValueChange={setShowPhoneNumber}
                trackColor={{ false: colors.border, true: colors.brandSecondary }}
                thumbColor={showPhoneNumber ? colors.brand : colors.onSurface}
                testID="create-listing-show-phone-toggle"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Pressable
              style={styles.extraDetailsHeaderRow}
              onPress={() => setIsExtraDetailsExpanded((prev) => !prev)}
              testID="create-listing-extra-details-toggle"
            >
              <View style={styles.sectionHeaderRowInline}>
                <Text style={styles.sectionTitle}>Παραπάνω λεπτομέρειες</Text>
                {isExtraDetailsSectionComplete ? <CompletionBadge colors={colors} styles={styles} /> : null}
              </View>
              <Ionicons name={isExtraDetailsExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurface} />
            </Pressable>

            {isExtraDetailsExpanded ? (
              <View style={styles.extraDetailsContent}>
                {EXTRA_DETAIL_CATEGORIES.map((category) => {
                  return (
                    <View key={category.title} style={styles.extraDetailsCategoryBlock}>
                      <Text style={styles.extraDetailsCategoryTitle}>{category.title}</Text>
                      <View style={styles.extraDetailsItemList}>
                        {category.items.map((itemKey) => {
                          const value = extraDetailsState[itemKey];
                          const isChecked = value === true;
                          const isRejected = value === false;

                          return (
                            <View key={itemKey} style={styles.extraDetailsItemRow}>
                              <Text style={styles.extraDetailsItemLabel}>{itemKey}</Text>
                              <View style={styles.extraDetailsActionGroup}>
                                <Pressable
                                  style={[
                                    styles.extraDetailsActionButton,
                                    isChecked && styles.extraDetailsActionButtonChecked,
                                  ]}
                                  onPress={() => handleSetExtraDetailAnswer(itemKey, true)}
                                  hitSlop={6}
                                  testID={`create-listing-extra-detail-yes-${itemKey}`}
                                >
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={20}
                                    color={isChecked ? colors.onBrandTertiary : colors.onSurfaceTertiary}
                                  />
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.extraDetailsActionButton,
                                    isRejected && styles.extraDetailsActionButtonRejected,
                                  ]}
                                  onPress={() => handleSetExtraDetailAnswer(itemKey, false)}
                                  hitSlop={6}
                                  testID={`create-listing-extra-detail-no-${itemKey}`}
                                >
                                  <Ionicons
                                    name="close-circle"
                                    size={20}
                                    color={isRejected ? colors.onError : colors.onSurfaceTertiary}
                                  />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Pressable
              style={styles.expandHeaderRow}
              onPress={() => setIsExtraInformationExpanded((prev) => !prev)}
              testID="create-listing-extra-information-toggle"
            >
              <Text style={styles.sectionTitle}>Επιπλέον Πληροφορίες</Text>
              <Ionicons
                name={isExtraInformationExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.onSurface}
              />
            </Pressable>

            {isExtraInformationExpanded ? (
              <View style={styles.extraInformationContent}>
                <Text style={styles.sectionSubtitle}>Χώροι</Text>
                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Σαλόνι</Text>
                    <TextInput
                      value={livingRooms}
                      onChangeText={(value) => setLivingRooms(clampRequiredIntegerInput(value, 1, 9, 1))}
                      keyboardType="number-pad"
                      maxLength={1}
                      placeholder="1"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-living-rooms"
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Μπάνιο</Text>
                    <TextInput
                      value={bathrooms}
                      onChangeText={(value) => setBathrooms(clampRequiredIntegerInput(value, 1, 9, 1))}
                      keyboardType="number-pad"
                      maxLength={1}
                      placeholder="1"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-bathrooms"
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Κουζίνα</Text>
                    <TextInput
                      value={kitchens}
                      onChangeText={(value) => setKitchens(clampRequiredIntegerInput(value, 1, 9, 1))}
                      keyboardType="number-pad"
                      maxLength={1}
                      placeholder="1"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-kitchens"
                    />
                  </View>
                </View>

                <Text style={styles.sectionSubtitle}>Κατασκευή και κόστος</Text>
                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Έτος κατασκευής</Text>
                    <TextInput
                      value={buildYear}
                      onChangeText={(value) => setBuildYear(clampOptionalIntegerInput(value, 1000, CURRENT_BUILD_YEAR))}
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholder="π.χ. 2008"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-build-year"
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Μηνιαία κοινόχρηστα (€)</Text>
                    <TextInput
                      value={commonExpenses}
                      onChangeText={(value) => setCommonExpenses(digitsOnlyInput(value))}
                      keyboardType="number-pad"
                      maxLength={5}
                      placeholder="π.χ. 35"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-common-expenses"
                    />
                  </View>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Επίπεδα</Text>
                    <TextInput
                      value={levels}
                      onChangeText={(value) => setLevels(clampRequiredIntegerInput(value, 1, 9, 1))}
                      keyboardType="number-pad"
                      maxLength={1}
                      placeholder="1"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-levels"
                    />
                  </View>
                </View>

                <Text style={styles.sectionSubtitle}>Θέρμανση και ενεργειακή κλάση</Text>
                <Text style={styles.fieldLabel}>Σύστημα θέρμανσης</Text>
                <Dropdown
                  value={heatingSystem}
                  options={HEATING_SYSTEM_OPTIONS}
                  placeholder="Επιλέξτε σύστημα θέρμανσης"
                  onSelect={setHeatingSystem}
                  testID="create-listing-extra-info-heating-system"
                />

                <Text style={[styles.fieldLabel, styles.mtSm]}>Ενεργειακή κλάση</Text>
                <Dropdown
                  value={energyClass}
                  options={ENERGY_CLASS_OPTIONS}
                  placeholder="Επιλέξτε ενεργειακή κλάση"
                  onSelect={setEnergyClass}
                  testID="create-listing-extra-info-energy-class"
                />

                <Text style={styles.sectionSubtitle}>Διαθεσιμότητα</Text>
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setIsImmediatelyAvailable((prev) => !prev)}
                  testID="create-listing-extra-info-immediately-available"
                >
                  <View style={[styles.checkboxIconWrap, isImmediatelyAvailable && styles.checkboxIconWrapActive]}>
                    <Ionicons
                      name={isImmediatelyAvailable ? "checkmark" : "square-outline"}
                      size={18}
                      color={isImmediatelyAvailable ? colors.onBrand : colors.onSurfaceTertiary}
                    />
                  </View>
                  <Text style={styles.checkboxLabel}>Άμεσα διαθέσιμο</Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Available From</Text>
                <Dropdown
                  value={availableFromDateLabel}
                  options={availableFromDateOptions.map((item) => item.label)}
                  placeholder="Επιλέξτε ημερομηνία"
                  onSelect={(selectedLabel) => {
                    const selectedOption = availableFromDateOptions.find((item) => item.label === selectedLabel);
                    setAvailableFromDate(selectedOption?.value ?? null);
                  }}
                  disabled={isImmediatelyAvailable}
                  testID="create-listing-extra-info-available-from"
                />
                <Text style={styles.fieldHint}>Η επιλογή ημερομηνίας επιτρέπει μόνο σημερινές ή μελλοντικές ημερομηνίες.</Text>

                <Text style={styles.sectionSubtitle}>Χρονικές σημάνσεις</Text>
                <View style={styles.readOnlyMetaCard}>
                  <View style={styles.readOnlyMetaRow}>
                    <Text style={styles.readOnlyMetaLabel}>Ημερομηνία δημοσίευσης</Text>
                    <Text style={styles.readOnlyMetaValue}>{publishedAtLabel}</Text>
                  </View>
                  <View style={styles.readOnlyMetaRow}>
                    <Text style={styles.readOnlyMetaLabel}>Τελευταία τροποποίηση</Text>
                    <Text style={styles.readOnlyMetaValue}>{updatedAtLabel}</Text>
                  </View>
                </View>
              </View>
            ) : null}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    flexOne: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    progressTrack: {
      width: "100%",
      height: 4,
      backgroundColor: colors.border,
      paddingHorizontal: 0,
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.brand,
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
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    sectionHeaderRowInline: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 1,
    },
    sectionCompleteBadge: {
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    sectionSubtitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
      marginBottom: 2,
    },
    fieldLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      marginBottom: spacing.xs,
    },
    expandHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    extraInformationContent: {
      gap: spacing.md,
    },
    formRow: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "flex-start",
    },
    formColumn: {
      flex: 1,
      minWidth: 0,
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    checkboxIconWrap: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    checkboxIconWrapActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    checkboxLabel: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    readOnlyMetaCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    readOnlyMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    readOnlyMetaLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      flexShrink: 1,
    },
    readOnlyMetaValue: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "right",
      flexShrink: 1,
    },
    extraDetailsHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    extraDetailsContent: {
      gap: spacing.md,
    },
    extraDetailsCategoryBlock: {
      gap: spacing.sm,
    },
    extraDetailsCategoryTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    extraDetailsItemList: {
      gap: spacing.sm,
    },
    extraDetailsItemRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    extraDetailsItemLabel: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    extraDetailsActionGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    extraDetailsActionButton: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    extraDetailsActionButtonChecked: {
      borderColor: colors.brand,
      backgroundColor: colors.brandTertiary,
    },
    extraDetailsActionButtonRejected: {
      borderColor: colors.error,
      backgroundColor: colors.surfaceSecondary,
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
    discountRow: {
      marginTop: spacing.sm,
    },
    discountInputWrap: {
      gap: spacing.xs,
    },
    percentInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    percentInput: {
      flex: 1,
    },
    percentSuffix: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
      minWidth: 16,
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
    contactToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    contactToggleTextWrap: {
      flex: 1,
      gap: spacing.xs,
    },
    contactToggleLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
      lineHeight: 20,
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
}
