import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as NativeImage,
  Modal,
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
import Slider from "@react-native-community/slider";
import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { addDoc, arrayUnion, collection, deleteField, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";

import Dropdown from "@/src/components/Dropdown";
import AddressAutocompleteInput from "@/src/components/AddressAutocompleteInput";
// import ApartmentLocationMap from "@/src/components/ApartmentLocationMap";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { WatermarkBadge } from "@/src/components/WatermarkBadge";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
// import { useLocationCoordinates } from "@/src/hooks/useLocationCoordinates";
import { deleteStorageFileAsync, uploadBrokerPrivateImageAsync, uploadImageAsync, uploadListingDocumentAsync, uploadListingImageAsync, uploadListingReelAsync } from "@/src/api/imageUpload";
import { upsertListing } from "@/src/api/listings";
import { publishListingAssignment } from "@/src/api/agencyCollaboration";
import { syncBrokerClientProfile, upsertBrokerClientProfile } from "@/src/api/brokerClientProfiles";
import { getUserProfile, type UserProfile } from "@/src/api/userProfile";
import { t } from "@/src/locales";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import { useVoiceInputPreview } from "@/src/hooks/useVoiceInputPreview";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import AiCopywriterModal from "@/src/components/AiCopywriterModal";
import type { CopywriterResult } from "@/src/services/aiFeatureService";
import { calculateTenantCompatibilityScore } from "@/src/utils/compatibilityScore";
import type { FilterSetPayload } from "@/src/types/filters";
import type { RealEstateAgency } from "@/src/types/agency";
import type { LogoWatermarkStyle, WatermarkConfig, WatermarkType } from "@/src/types/listing";
import type { ApartmentReelMedia, TourScene, VirtualTourData, VirtualTourHotspot } from "@/src/types/apartment";
import { buildTourSceneStoragePath, isValidEquirectangularDimensions } from "@/src/utils/virtualTour";

type AmenityKey = "petFriendly" | "nearMetro" | "furnished" | "balcony" | "parking";
type AmenitySlug = "pet_friendly" | "near_metro" | "furnished" | "balcony" | "parking";

export type PropertyStatusKey =
  | "available"
  | "available_after_call"
  | "under_negotiation"
  | "closed_deposit"
  | "sold_rented"
  | "on_hold_owner_request";

export const PROPERTY_STATUS_OPTIONS: { key: PropertyStatusKey; label: string }[] = [
  { key: "available", label: "Διαθέσιμο" },
  { key: "available_after_call", label: "Διαθέσιμο μετά από τηλέφωνο στον παρών ενοικιαστή" },
  { key: "under_negotiation", label: "Υπό διαπραγμάτευση" },
  { key: "closed_deposit", label: "Κεκλεισμένο (προκαταβολή)" },
  { key: "sold_rented", label: "Πωλήθηκε / Ενοικιάστηκε" },
  { key: "on_hold_owner_request", label: "Σε αναμονή / Ανενεργό (μετά από έκκληση ιδιοκτήτη)" },
];

const ORIENTATION_OPTIONS = [
  "Ανατολικός",
  "Δυτικός",
  "Βόρειος",
  "Νότιος",
  "Βορειοανατολικός",
  "Βορειοδυτικός",
  "Νοτιοανατολικός",
  "Νοτιοδυτικός",
];

export const OWNER_MOTIVATION_OPTIONS = [
  "Επείγουσα ανάγκη",
  "Κληρονομιά",
  "Επένδυση",
  "Άλλο",
] as const;

export type PriceHistoryEntry = {
  price: number;
  expectedPrice?: number | null;
  timestamp: number;
  dateLabel: string;
  brokerName?: string;
  brokerId?: string;
};

type Amenity = {
  key: AmenityKey;
  slug: AmenitySlug;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type MatchedClient = {
  chatRoomId: string;
  clientAvatar?: string;
  clientName: string;
  clientUserId: string;
  compatibilityScore: number;
};
type BrokerClientWithFilters = {
  clientUserId: string;
  clientName: string;
  clientAvatar?: string;
  chatRoomId: string;
  filterSet: FilterSetPayload | null;
};

type ClientFilterVersion = FilterSetPayload;

function latestClientFilter(data: Record<string, unknown>): ClientFilterVersion | null {
  const versions = Array.isArray(data.versions) ? data.versions.filter((entry): entry is ClientFilterVersion => !!entry && typeof entry === "object") : [];
  if (versions.length) {
    const currentVersion = Number(data.currentVersion);
    return versions.find((version) => version.version === currentVersion) ?? versions[versions.length - 1];
  }
  return data as ClientFilterVersion;
}

function filterMatchesListing(filter: ClientFilterVersion, rent: number, size: number, city: string, area: string, amenities: Record<AmenityKey, boolean>) {
  const minRent = filter.rentMin?.trim() ? Number(filter.rentMin) : null;
  const maxRent = filter.rentMax?.trim() ? Number(filter.rentMax) : null;
  const minSize = filter.sizeMin?.trim() ? Number(filter.sizeMin) : null;
  const maxSize = filter.sizeMax?.trim() ? Number(filter.sizeMax) : null;
  const minSqmPrice = filter.minSqmPrice?.trim() ? Number(filter.minSqmPrice) : null;
  const maxSqmPrice = filter.maxSqmPrice?.trim() ? Number(filter.maxSqmPrice) : null;
  const currentSqmPrice = size > 0 && rent > 0 ? rent / size : 0;
  const cityQuery = filter.cityQuery?.trim().toLocaleLowerCase() ?? "";
  const normalizedCity = city.trim().toLocaleLowerCase();
  const normalizedArea = area.trim().toLocaleLowerCase();
  const hasLocation = normalizedCity.length > 0 || normalizedArea.length > 0;
  const matchesLocation = Boolean(cityQuery && hasLocation && (
    normalizedCity.includes(cityQuery) || cityQuery.includes(normalizedCity) ||
    normalizedArea.includes(cityQuery) || cityQuery.includes(normalizedArea)
  ));
  let matchedCriteriaCount = 0;
  let hasConflict = false;

  if (rent > 0 && (minRent !== null || maxRent !== null)) {
    hasConflict = (minRent !== null && Number.isFinite(minRent) && rent < minRent) ||
      (maxRent !== null && Number.isFinite(maxRent) && rent > maxRent);
    if (!hasConflict) matchedCriteriaCount++;
  }
  if (size > 0 && (minSize !== null || maxSize !== null)) {
    const sizeConflict = (minSize !== null && Number.isFinite(minSize) && size < minSize) ||
      (maxSize !== null && Number.isFinite(maxSize) && size > maxSize);
    hasConflict ||= sizeConflict;
    if (!sizeConflict) matchedCriteriaCount++;
  }
  if (currentSqmPrice > 0 && (minSqmPrice !== null || maxSqmPrice !== null)) {
    const sqmConflict = (minSqmPrice !== null && Number.isFinite(minSqmPrice) && currentSqmPrice < minSqmPrice) ||
      (maxSqmPrice !== null && Number.isFinite(maxSqmPrice) && currentSqmPrice > maxSqmPrice);
    hasConflict ||= sqmConflict;
    if (!sqmConflict) matchedCriteriaCount++;
  }
  if (cityQuery && hasLocation) {
    if (matchesLocation) matchedCriteriaCount++;
    else hasConflict = true;
  }
  if (filter.petFriendly === true && amenities.petFriendly) matchedCriteriaCount++;
  if (filter.nearMetro === true && amenities.nearMetro) matchedCriteriaCount++;

  return !hasConflict && matchedCriteriaCount >= 1;
}

const MAX_TOUR_IMAGE_BYTES = 20 * 1024 * 1024;
type TourImageMimeType = "image/jpeg" | "image/png";

async function validateTourPanorama(uri: string, mimeType: string | null | undefined): Promise<void> {
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
    throw new Error("tour_invalid_format");
  }

  const fileSize = new File(uri).size;
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("tour_unreadable");
  if (fileSize > MAX_TOUR_IMAGE_BYTES) throw new Error("tour_file_too_large");

  const { width, height } = await NativeImage.getSize(uri);
  if (!isValidEquirectangularDimensions(width, height)) {
    throw new Error("tour_invalid_aspect");
  }
}

function getTourValidationMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "tour_unreadable";
  if (code === "tour_invalid_format") return t("createListing.alerts.tourInvalidFormat");
  if (code === "tour_file_too_large") return t("createListing.alerts.tourFileTooLarge");
  if (code === "tour_invalid_aspect") return t("createListing.alerts.tourInvalidAspect");
  return t("createListing.alerts.tourUnreadable");
}

interface FirestoreApartmentDoc {
  title?: string;
  description?: string; // Νέο πεδίο
  about?: string;       // Νέο πεδίο
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  rooms?: number;
  area?: string;
  city?: string;
  address?: string;
  exactAddress?: string;
  showExactAddress?: boolean;
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
  files2d3d?: string[];
  watermarkConfig?: WatermarkConfig;
  virtualTour?: VirtualTourData;
  reelMedia?: ApartmentReelMedia | null;
  brokerPrivatePhotos?: string[];
  documents?: Partial<Record<DocumentCategoryKey, ListingDocument[]>>;
  tags?: string[];
  amenities?: string[];
  extraDetails?: Record<string, boolean>;
  extraInformation?: Partial<ListingExtraInformation>;
  technicalSpecifications?: TechnicalSpecificationPayload[];
  orientation?: string;
  propertyStatus?: PropertyStatusKey;
  closedDealPrice?: number | null;
  priceHistory?: PriceHistoryEntry[];
  ownerDetails?: {
    name?: string;
    phone?: string;
    motivation?: string;
    motivationType?: string | null;
    customMotivation?: string;
    priceExpectation?: number | null;
  };
  hostId?: string;
  ownerId?: string;
  assignedBrokerIds?: string[];
  agencyId?: string;
  assignmentStatus?: "unassigned_pool" | "claim_pending" | "assigned";
  showPhoneNumber?: boolean;
  hidePhoneFromBrokers?: boolean;
  publishedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  isOffMarket?: boolean;
  visibility?: "client_only" | "public";
  offMarketAccessUserIds?: string[];
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
  renovationYear?: number;
  commonExpenses?: number;
  levels: number;
  heatingSystem?: string;
  energyClass?: string;
  windowFrames?: string;
  availableFromDate?: string;
  isImmediatelyAvailable?: boolean;
};

type RoomCountField = "rooms" | "livingRooms" | "bathrooms" | "kitchens";

type DocumentCategoryKey =
  | "topographicPlans"
  | "ownershipContracts"
  | "buildingPermits"
  | "engineerCertificates"
  | "unauthorizedConstructionsSettlement"
  | "energyCertificates"
  | "signedBrokerageAgreement"
  | "gdprConsent";

type ListingDocument = {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
};

type DocumentsState = Record<DocumentCategoryKey, ListingDocument[]>;

type TechnicalSpecConfig = {
  type: string;
  label: string;
  countField?: RoomCountField;
};

type TechnicalSpecEntry = {
  id: string;
  type: string;
  label: string;
  sqft: number;
  index: number;
};

type TechnicalSpecificationPayload = {
  type: string;
  index: number;
  sizeSqm: number;
  label: string;
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
      "Διαχωριστικό ντους",
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
      "Θέση στάθμευσης: στεγασμένη/πυλωτή",
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
const BROKER_PRIVATE_PHOTO_SLOTS = 12;
const IMAGE_QUALITY = 0.7;
const CURRENT_BUILD_YEAR = 2026;
const HEATING_SYSTEM_OPTIONS = ["Αυτόνομη", "Κεντρική", "Ρεύμα", "Φυσικό Αέριο", "Αντλία Θερμότητας", "Πετρέλαιο", "Χωρίς Θέρμανση", "Άλλο"];
const ENERGY_CLASS_OPTIONS = ["A++", "A+", "A", "B+", "B", "C", "D", "E", "F", "G"];

const TECHNICAL_SPEC_ITEMS: TechnicalSpecConfig[] = [
  { type: "bathroom", label: "Μπάνιο", countField: "bathrooms" },
  { type: "openPlanMain", label: "Ενιαίος χώρος" },
  { type: "bedroom", label: "Κρεβατοκάμαρα", countField: "rooms" },
  { type: "livingRoom", label: "Σαλόνι", countField: "livingRooms" },
  { type: "kitchen", label: "Κουζίνα", countField: "kitchens" },
  { type: "balcony", label: "Μπαλκόνι" },
  { type: "elevator", label: "Ασανσέρ" },
  { type: "windows", label: "Παράθυρα" },
  { type: "hall", label: "Χωλ" },
  { type: "storageRoom", label: "Αποθήκη" },
  { type: "pool", label: "Πισίνα" },
  { type: "shower", label: "Ντουζιέρα" },
  { type: "bathtub", label: "Μπανιέρα" },
  { type: "garden", label: "Κήπος" },
];

const ROOM_COUNT_FIELD_NOUNS: Record<RoomCountField, string> = {
  rooms: "δωμάτια",
  livingRooms: "σαλόνια",
  bathrooms: "μπάνια",
  kitchens: "κουζίνες",
};

const DOCUMENT_CATEGORIES: { key: DocumentCategoryKey; title: string }[] = [
  { key: "topographicPlans", title: "Τοπογραφικά διαγράμματα και έγγραφα" },
  { key: "ownershipContracts", title: "Συμβόλαια ιδιοκτησίας" },
  { key: "buildingPermits", title: "Οικοδομικές άδειες" },
  { key: "engineerCertificates", title: "Βεβαιώσεις μηχανικού" },
  { key: "unauthorizedConstructionsSettlement", title: "Τακτοποίηση αυθαιρέτων" },
  { key: "energyCertificates", title: "Πιστοποιητικά ενεργειακής απόδοσης" },
  { key: "signedBrokerageAgreement", title: "Υπογεγραμμένη σύμβαση ανάθεσης με τον ιδιοκτήτη" },
  { key: "gdprConsent", title: "Έγγραφη συγκατάθεση επεξεργασίας προσωπικών δεδομένων" },
];

function createEmptyDocumentsState(): DocumentsState {
  return DOCUMENT_CATEGORIES.reduce((acc, category) => {
    acc[category.key] = [];
    return acc;
  }, {} as DocumentsState);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

/** Επιτρέπει ελεύθερη πληκτρολόγηση· η τιμή διορθώνεται μόνο όταν φύγει η εστίαση. */
function normalizeIntegerOnBlur(value: string, min: number, max: number, fallback: number): string {
  return clampRequiredIntegerInput(value, min, max, fallback);
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

function formatPriceHistoryDate(date: Date): string {
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function CompletionBadge({ colors, styles }: CompletionBadgeProps) {
  return (
    <View style={styles.sectionCompleteBadge}>
      <Ionicons name="checkmark" size={13} color={colors.onBrand} />
    </View>
  );
}

type PriceHistoryChartProps = {
  history: PriceHistoryEntry[];
  selectedHistoryNode: PriceHistoryEntry | null;
  onSelectNode: (entry: PriceHistoryEntry) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

function PriceHistoryChart({ history, selectedHistoryNode, onSelectNode, colors, styles }: PriceHistoryChartProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const sortedHistory = useMemo(
    () => [...history].sort((left, right) => left.timestamp - right.timestamp),
    [history],
  );
  const chartHeight = 220;
  const plotLeft = 52;
  const plotRight = 16;
  const plotTop = 20;
  const plotBottom = 42;
  const plotWidth = Math.max(1, chartWidth - plotLeft - plotRight);
  const plotHeight = chartHeight - plotTop - plotBottom;
  const prices = sortedHistory.flatMap((entry) =>
    entry.expectedPrice !== null && entry.expectedPrice !== undefined
      ? [entry.price, entry.expectedPrice]
      : [entry.price],
  );
  const lowestPrice = prices.length ? Math.min(...prices) : 0;
  const highestPrice = prices.length ? Math.max(...prices) : 1;
  const pricePadding = Math.max((highestPrice - lowestPrice) * 0.12, 1);
  const minPrice = Math.max(0, lowestPrice - pricePadding);
  const maxPrice = highestPrice + pricePadding;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const getPointPosition = (entry: PriceHistoryEntry, index: number) => {
    const x = sortedHistory.length <= 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (plotWidth * index) / (sortedHistory.length - 1);
    const y = plotTop + plotHeight - ((entry.price - minPrice) / priceRange) * plotHeight;
    return { x, y };
  };
  const getExpectedPointPosition = (entry: PriceHistoryEntry, index: number) => {
    const position = getPointPosition(entry, index);
    if (entry.expectedPrice === null || entry.expectedPrice === undefined) return position;
    return {
      ...position,
      y: plotTop + plotHeight - ((entry.expectedPrice - minPrice) / priceRange) * plotHeight,
    };
  };
  const selectedIndex = selectedHistoryNode
    ? sortedHistory.findIndex((entry) => entry.timestamp === selectedHistoryNode.timestamp)
    : -1;
  const selectedPosition = selectedIndex >= 0 ? getPointPosition(sortedHistory[selectedIndex], selectedIndex) : null;
  const tooltipWidth = 190;
  const tooltipLeft = selectedPosition
    ? Math.min(Math.max(selectedPosition.x - tooltipWidth / 2, plotLeft), Math.max(plotLeft, chartWidth - plotRight - tooltipWidth))
    : 0;
  const tooltipTop = selectedPosition ? Math.max(2, selectedPosition.y - 76) : 2;

  return (
    <View
      style={styles.priceHistoryChart}
      onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
      testID="create-listing-history-chart"
    >
      {chartWidth > 0 ? (
        <>
          {[0, 1, 2, 3].map((step) => {
            const ratio = step / 3;
            const y = plotTop + plotHeight * ratio;
            const value = Math.round(maxPrice - priceRange * ratio);
            return (
              <View key={`history-grid-${step}`}>
                <View style={[styles.priceHistoryGridLine, { left: plotLeft, right: plotRight, top: y }]} />
                <Text style={[styles.priceHistoryAxisLabel, { left: 0, top: y - 8 }]}>{`${value}€`}</Text>
              </View>
            );
          })}

          {sortedHistory.slice(1).map((entry, index) => {
            const start = getPointPosition(sortedHistory[index], index);
            const end = getPointPosition(entry, index + 1);
            const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            const angle = `${Math.atan2(end.y - start.y, end.x - start.x)}rad`;
            return (
              <View
                key={`history-line-${entry.timestamp}`}
                style={[
                  styles.priceHistoryLine,
                  {
                    left: (start.x + end.x - length) / 2,
                    top: (start.y + end.y) / 2 - 1,
                    width: length,
                    transform: [{ rotate: angle }],
                  },
                ]}
              />
            );
          })}

          {sortedHistory
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.expectedPrice !== null && entry.expectedPrice !== undefined)
            .slice(1)
            .map(({ entry, index }, expectationIndex) => {
              const previous = sortedHistory
                .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(({ candidate }) => candidate.expectedPrice !== null && candidate.expectedPrice !== undefined)[expectationIndex];
              if (!previous) return null;
              const start = getExpectedPointPosition(previous.candidate, previous.candidateIndex);
              const end = getExpectedPointPosition(entry, index);
              const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
              const angle = `${Math.atan2(end.y - start.y, end.x - start.x)}rad`;
              return (
                <View
                  key={`history-expectation-line-${entry.timestamp}`}
                  style={[
                    styles.priceHistoryExpectationLine,
                    {
                      left: (start.x + end.x - length) / 2,
                      top: (start.y + end.y) / 2 - 1,
                      width: length,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })}

          {sortedHistory.map((entry, index) => {
            const position = getPointPosition(entry, index);
            const isSelected = selectedHistoryNode?.timestamp === entry.timestamp;
            return (
              <Pressable
                key={`history-node-${entry.timestamp}`}
                style={[
                  styles.priceHistoryNode,
                  isSelected && styles.priceHistoryNodeSelected,
                  { left: position.x - 7, top: position.y - 7 },
                ]}
                onPress={() => onSelectNode(entry)}
                testID={`create-listing-history-node-${index}`}
                hitSlop={6}
              />
            );
          })}

          {sortedHistory.map((entry, index) => {
            if (entry.expectedPrice === null || entry.expectedPrice === undefined) return null;
            const position = getExpectedPointPosition(entry, index);
            return (
              <Pressable
                key={`history-expectation-node-${entry.timestamp}`}
                style={[styles.priceHistoryExpectationNode, { left: position.x - 5, top: position.y - 5 }]}
                onPress={() => onSelectNode(entry)}
                hitSlop={6}
              />
            );
          })}

          {sortedHistory.map((entry, index) => {
            const position = getPointPosition(entry, index);
            return (
              <Text
                key={`history-date-${entry.timestamp}`}
                style={[styles.priceHistoryDateLabel, { left: position.x - 28, top: plotTop + plotHeight + 12 }]}
                numberOfLines={1}
              >
                {new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(
                  new Date(entry.timestamp),
                )}
              </Text>
            );
          })}

          {selectedHistoryNode && selectedPosition ? (
            <View style={[styles.priceHistoryTooltip, { left: tooltipLeft, top: tooltipTop, width: tooltipWidth }]}>
              <Text style={styles.priceHistoryTooltipText}>{`Τιμή Αγγελίας: €${selectedHistoryNode.price}`}</Text>
              {selectedHistoryNode.expectedPrice !== null && selectedHistoryNode.expectedPrice !== undefined ? (
                <Text style={styles.priceHistoryTooltipText}>{`Προσδοκία Ιδιοκτήτη: €${selectedHistoryNode.expectedPrice}`}</Text>
              ) : null}
              <Text style={styles.priceHistoryTooltipText}>{`Ημερομηνία: ${selectedHistoryNode.dateLabel}`}</Text>
              <Text style={styles.priceHistoryTooltipText}>{`Μεσίτης: ${selectedHistoryNode.brokerName || "Μεσίτης"}`}</Text>
              <View style={styles.priceHistoryTooltipPointer} />
            </View>
          ) : null}
          <View style={styles.priceHistoryLegend}>
            <View style={styles.priceHistoryLegendItem}>
              <View style={styles.priceHistoryLegendBrandIndicator} />
              <Text style={styles.priceHistoryLegendText}>Ιστορικό τιμών αγγελίας</Text>
            </View>
            <View style={styles.priceHistoryLegendItem}>
              <View style={styles.priceHistoryLegendExpectationIndicator} />
              <Text style={styles.priceHistoryLegendText}>Ιστορικό τιμών προσδοκιών ιδιοκτήτη</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function CreateListingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // 2. Προσθήκη των States μέσα στο CreateListingScreen component
  const [title, setTitle] = useState("");             
  const [description, setDescription] = useState(""); 
  const titleVoice = useVoiceInputPreview(title, setTitle);
  const descriptionVoice = useVoiceInputPreview(description, setDescription);
  const [isExtraInfoExpanded, setIsExtraInfoExpanded] = useState(false);
  const [isExtraDetailsExpanded, setIsExtraDetailsExpanded] = useState(false);
  const [isExtraInformationExpanded, setIsExtraInformationExpanded] = useState(false);
  const [isTechnicalSpecsExpanded, setIsTechnicalSpecsExpanded] = useState(false);
  const [isPropertyStatusExpanded, setIsPropertyStatusExpanded] = useState(false);
  const [propertyStatus, setPropertyStatus] = useState<PropertyStatusKey>("available");
  const [closedDealPrice, setClosedDealPrice] = useState("");
  const [isOwnerDetailsExpanded, setIsOwnerDetailsExpanded] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerMotivationType, setOwnerMotivationType] = useState<string | null>(null);
  const [customOwnerMotivation, setCustomOwnerMotivation] = useState("");
  const [ownerPriceExpectation, setOwnerPriceExpectation] = useState("");
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [selectedHistoryNode, setSelectedHistoryNode] = useState<PriceHistoryEntry | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [originalLoadedRent, setOriginalLoadedRent] = useState<number | null>(null);
  const [originalLoadedPriceExpectation, setOriginalLoadedPriceExpectation] = useState<number | null>(null);
  const [technicalSpecEntries, setTechnicalSpecEntries] = useState<TechnicalSpecEntry[]>([]);
  const [technicalSpecInputs, setTechnicalSpecInputs] = useState<Record<string, string>>({});
  const [technicalSpecEditingIds, setTechnicalSpecEditingIds] = useState<Record<string, string | null>>({});
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
  const [showExactAddress, setShowExactAddress] = useState(true);
  const [addressLatitude, setAddressLatitude] = useState<number | null>(null);
  const [addressLongitude, setAddressLongitude] = useState<number | null>(null);
  const [hasExactLocation, setHasExactLocation] = useState(false);
  const [sizeSqm, setSizeSqm] = useState("");
  const [propertyCategory, setPropertyCategory] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<string | null>(null);
  const [rooms, setRooms] = useState("1");
  const [livingRooms, setLivingRooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [kitchens, setKitchens] = useState("1");
  const [buildYear, setBuildYear] = useState("");
  const [renovationYear, setRenovationYear] = useState("");
  const [commonExpenses, setCommonExpenses] = useState("");
  const [levels, setLevels] = useState("1");
  const [heatingSystem, setHeatingSystem] = useState<string | null>(null);
  const [energyClass, setEnergyClass] = useState<string | null>(null);
  const [windowFrames, setWindowFrames] = useState("");
  const [availableFromDate, setAvailableFromDate] = useState<string | null>(null);
  const [isImmediatelyAvailable, setIsImmediatelyAvailable] = useState(false);
  const [publishedAtMillis, setPublishedAtMillis] = useState<number | null>(null);
  const [updatedAtMillis, setUpdatedAtMillis] = useState<number | null>(null);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPhoneNumber, setShowPhoneNumber] = useState(true);
  const [hidePhoneFromBrokers, setHidePhoneFromBrokers] = useState(false);
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
  const [reelVideoUri, setReelVideoUri] = useState<string | null>(null);
  const [virtualStagingEnabled, setVirtualStagingEnabled] = useState(false);
  const [virtualStagingPhotoIndexes, setVirtualStagingPhotoIndexes] = useState<number[]>([]);
  const [files2d3d, setFiles2d3d] = useState<string[]>([]);
  const [enableVirtualTour, setEnableVirtualTour] = useState(false);
  const [tourScenes, setTourScenes] = useState<TourScene[]>([]);
  const [persistedTourScenes, setPersistedTourScenes] = useState<TourScene[]>([]);
  const [defaultTourSceneId, setDefaultTourSceneId] = useState("");
  const [tourUploadLoading, setTourUploadLoading] = useState(false);
  const [files2d3dLoading, setFiles2d3dLoading] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>("default_text");
  const [logoStyle, setLogoStyle] = useState<LogoWatermarkStyle>("no_bg_transparent");
  const [agencyData, setAgencyData] = useState<RealEstateAgency | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [brokerPrivatePhotos, setBrokerPrivatePhotos] = useState<string[]>([]);
  const [isBrokerPrivatePhotosExpanded, setIsBrokerPrivatePhotosExpanded] = useState(false);
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(false);
  const [expandedDocumentCategory, setExpandedDocumentCategory] = useState<DocumentCategoryKey | null>(null);
  const [documents, setDocuments] = useState<DocumentsState>(() => createEmptyDocumentsState());
  const [uploadingDocumentCategory, setUploadingDocumentCategory] = useState<DocumentCategoryKey | null>(null);
  const [photoPickerTarget, setPhotoPickerTarget] = useState<"listing" | "brokerPrivate">("listing");
  const [photoSourceModalVisible, setPhotoSourceModalVisible] = useState(false);
  const [aiCopywriterVisible, setAiCopywriterVisible] = useState(false);
  const [aiCopywriterValidation, setAiCopywriterValidation] = useState<string | null>(null);
  const [formFeedbackModal, setFormFeedbackModal] = useState<{
    title: string;
    description: string;
    onAcknowledge?: () => void;
  } | null>(null);
  const [loadingEditData, setLoadingEditData] = useState(false);
  const [brokerShareModalVisible, setBrokerShareModalVisible] = useState(false);
  const [availableBrokers, setAvailableBrokers] = useState<{ id: string; avatar: string; name: string }[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);
  const [assigningBrokerId, setAssigningBrokerId] = useState<string | null>(null);
  const [userHasListings, setUserHasListings] = useState(false);
  const [isAssignedBrokerListing, setIsAssignedBrokerListing] = useState(false);
  const [listingOwnerId, setListingOwnerId] = useState<string | null>(null);
  const [existingAssignedBrokerIds, setExistingAssignedBrokerIds] = useState<string[]>([]);
  const [existingAssignmentStatus, setExistingAssignmentStatus] = useState<"unassigned_pool" | "claim_pending" | "assigned" | null>(null);
  const [currentListingId, setCurrentListingId] = useState(listingId);
  const [isOffMarket, setIsOffMarket] = useState(false);
  const [offMarketAccessUserIds, setOffMarketAccessUserIds] = useState<string[]>([]);
  const [sendingOffMarketClientId, setSendingOffMarketClientId] = useState<string | null>(null);
  const scrollViewRef = useRef<React.ElementRef<typeof KeyboardAwareScrollView> | null>(null);
  const matchingSectionY = useRef(0);
  const [clientPool, setClientPool] = useState<BrokerClientWithFilters[]>([]);
  const [loadingClientPool, setLoadingClientPool] = useState(false);
  const [publishModeModalVisible, setPublishModeModalVisible] = useState(false);

  const handlePick2D3DFiles = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("createListing.alerts.permissionTitle"), t("createListing.alerts.permissionMessage"));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.85,
      });
      if (result.canceled) return;

      const pickedUris = result.assets
        .filter((asset) => {
          const mimeType = asset.mimeType?.toLowerCase();
          return (!mimeType || mimeType === "image/png" || mimeType === "image/jpeg") && /\.(png|jpe?g)$/i.test(asset.uri.split("?")[0]);
        })
        .map((asset) => asset.uri);
      if (pickedUris.length) setFiles2d3d((previous) => [...previous, ...pickedUris]);
    } catch (pickError) {
      console.error("[CreateListing] Error picking 2D/3D files:", pickError);
    }
  }, []);

  const handleRemove2D3DFile = useCallback((index: number) => {
    setFiles2d3d((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const handlePickTourScenes = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setError("Χρειάζεται πρόσβαση στη συλλογή φωτογραφιών για την προσθήκη 360° εικόνων.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 1 });
    if (result.canceled) return;
    const validatedAssets: Array<{ uri: string; mimeType: TourImageMimeType }> = [];
    for (const asset of result.assets) {
      try {
        const mimeType = asset.mimeType?.toLowerCase();
        await validateTourPanorama(asset.uri, mimeType);
        validatedAssets.push({ uri: asset.uri, mimeType: mimeType as TourImageMimeType });
      } catch (validationError) {
        Alert.alert(t("createListing.alerts.tourValidationTitle"), getTourValidationMessage(validationError));
        return;
      }
    }
    const nextScenes = validatedAssets.map((asset, index) => ({
      id: `scene-${Date.now()}-${tourScenes.length + index}`,
      title: `Χώρος ${tourScenes.length + index + 1}`,
      imageUrl: asset.uri,
      mimeType: asset.mimeType,
      hotspots: [],
    } satisfies TourScene));
    setTourScenes((previous) => [...previous, ...nextScenes]);
    if (!defaultTourSceneId && nextScenes[0]) setDefaultTourSceneId(nextScenes[0].id);
    setEnableVirtualTour(true);
  }, [defaultTourSceneId, tourScenes.length]);

  const handleReplaceTourScene = useCallback(async (sceneId: string) => {
    const scene = tourScenes.find((item) => item.id === sceneId);
    if (!scene) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1 });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    try {
      const mimeType = asset.mimeType?.toLowerCase();
      await validateTourPanorama(asset.uri, mimeType);
      await deleteStorageFileAsync(scene.imageUrl);
      setTourScenes((previous) => previous.map((item) => item.id === sceneId ? { ...item, imageUrl: asset.uri, mimeType: mimeType as TourImageMimeType } : item));
    } catch (replaceError) {
      Alert.alert(t("createListing.alerts.tourValidationTitle"), getTourValidationMessage(replaceError));
    }
  }, [tourScenes]);

  const handleRemoveTourScene = useCallback(async (sceneId: string) => {
    const scene = tourScenes.find((item) => item.id === sceneId);
    if (!scene) return;

    try {
      await deleteStorageFileAsync(scene.imageUrl);
      setTourScenes((previous) => previous
        .filter((item) => item.id !== sceneId)
        .map((item) => ({
          ...item,
          hotspots: (item.hotspots ?? []).filter((hotspot) => hotspot.targetSceneId !== sceneId),
        })));
      if (defaultTourSceneId === sceneId) {
        setDefaultTourSceneId(tourScenes.find((item) => item.id !== sceneId)?.id ?? "");
      }
    } catch {
      setError("Δεν ήταν δυνατή η διαγραφή του πανοράματος από το Storage.");
    }
  }, [defaultTourSceneId, tourScenes]);

  const addTourHotspot = useCallback((sceneId: string) => {
    setTourScenes((previous) => previous.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const target = previous.find((item) => item.id !== sceneId);
      if (!target) return scene;
      const hotspot: VirtualTourHotspot = { pitch: 0, yaw: 0, type: "scene", text: target.title, targetSceneId: target.id };
      return { ...scene, hotspots: [...(scene.hotspots ?? []), hotspot] };
    }));
  }, []);

  const updateTourHotspot = useCallback((sceneId: string, hotspotIndex: number, patch: Partial<VirtualTourHotspot>) => {
    setTourScenes((previous) => previous.map((scene) => scene.id !== sceneId ? scene : {
      ...scene,
      hotspots: (scene.hotspots ?? []).map((hotspot, index) => index === hotspotIndex ? { ...hotspot, ...patch } : hotspot),
    }));
  }, []);

  const removeTourHotspot = useCallback((sceneId: string, hotspotIndex: number) => {
    setTourScenes((previous) => previous.map((scene) => scene.id !== sceneId ? scene : {
      ...scene,
      hotspots: (scene.hotspots ?? []).filter((_, index) => index !== hotspotIndex),
    }));
  }, []);

  const currentPriceHistory = useMemo(() => {
    if (priceHistory.length > 0) return priceHistory;
    const currentPrice = Number(monthlyRent);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];
    return [
      {
        price: currentPrice,
        expectedPrice: ownerPriceExpectation.trim().length > 0 ? Number(ownerPriceExpectation) : null,
        timestamp: Date.now(),
        dateLabel: formatPriceHistoryDate(new Date()),
        brokerId: auth.userId || "",
        brokerName: auth.user?.name || "Μεσίτης",
      },
    ];
  }, [auth.user?.name, auth.userId, monthlyRent, ownerPriceExpectation, priceHistory]);
  const isBrokerMode = auth.isBroker === true;
  const canAssignBroker = !isBrokerMode && userProfile?.looking_for_roommate === false;

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setAgencyData(null);
      return;
    }

    let active = true;
    void getUserProfile(auth.userId)
      .then(async (profile) => {
        if (active) setUserProfile(profile);
        if (!profile?.agencyId) return null;
        const agencySnapshot = await getDoc(doc(db, "agencies", profile.agencyId));
        return agencySnapshot.exists()
          ? ({ id: agencySnapshot.id, ...agencySnapshot.data() } as RealEstateAgency)
          : null;
      })
      .then((agency) => {
        if (active) setAgencyData(agency);
      })
      .catch(() => {
        if (active) setAgencyData(null);
      });

    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!isBrokerMode || !auth.userId) {
      setClientPool([]);
      setLoadingClientPool(false);
      return;
    }

    let active = true;
    setLoadingClientPool(true);
    void (async () => {
      try {
        const chatsSnap = await getDocs(query(collection(db, "chats"), where("users", "array-contains", auth.userId)));
        const loaded = await Promise.all(chatsSnap.docs.map(async (chatDoc): Promise<BrokerClientWithFilters | null> => {
          const chatData = chatDoc.data() as {
            users?: unknown;
            brokerChatRole?: string;
            status?: string;
            apartmentId?: string;
          };
          if (chatData.brokerChatRole && chatData.brokerChatRole !== "client") return null;
          if (chatData.status === "closed") return null;
          const users = Array.isArray(chatData.users) ? chatData.users.filter((uid): uid is string => typeof uid === "string") : [];
          const clientUserId = users.find((uid) => uid !== auth.userId);
          if (!clientUserId) return null;

          const profileSnap = await getDoc(doc(db, "users", clientUserId));
          const profile = profileSnap.exists() ? profileSnap.data() as { name?: string; photoUrl?: string; avatar?: string; photos?: string[] } : {};
          const clientName = profile.name?.trim() || "";
          if (!clientName) return null;
          const clientAvatar = profile.photoUrl || profile.avatar || profile.photos?.[0] || "";
          void upsertBrokerClientProfile({
            brokerId: auth.userId!,
            clientId: clientUserId,
            clientName,
            clientAvatar,
            role: "client",
            chatRoomId: chatDoc.id,
            apartmentId: typeof chatData.apartmentId === "string" ? chatData.apartmentId : undefined,
          }).catch(() => undefined);
          let filterSet: FilterSetPayload | null = null;

          try {
            const messagesSnap = await getDocs(query(
              collection(db, "chats", chatDoc.id, "messages"),
              where("type", "==", "filter_set_share"),
              orderBy("createdAt", "desc"),
              limit(1),
            ));
            if (!messagesSnap.empty) {
              const sharedData = messagesSnap.docs[0].data().filterSetData;
              if (sharedData && typeof sharedData === "object") filterSet = latestClientFilter(sharedData as Record<string, unknown>);
            }
          } catch {
            // The saved-filter fallback also handles missing composite indexes.
          }

          if (!filterSet) {
            try {
              const savedSnap = await getDocs(query(collection(db, "users", clientUserId, "savedFilterSets"), orderBy("updatedAt", "desc"), limit(1)));
              if (!savedSnap.empty) filterSet = latestClientFilter(savedSnap.docs[0].data());
            } catch {
              // A client may not have a saved-filter collection or permission for it.
            }
          }

          return { clientUserId, clientName, clientAvatar, chatRoomId: chatDoc.id, filterSet };
        }));
        if (active) setClientPool(loaded.filter((client): client is BrokerClientWithFilters => client !== null));
      } catch (error) {
        console.warn("[CreateListing] Error loading client pool:", error);
        if (active) setClientPool([]);
      } finally {
        if (active) setLoadingClientPool(false);
      }
    })();

    return () => { active = false; };
  }, [auth.userId, isBrokerMode]);

  useEffect(() => {
    if (isBrokerMode || !auth.userId) {
      setUserHasListings(false);
      return;
    }

    let active = true;
    void getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))).then((snapshot) => {
      if (active) setUserHasListings(!snapshot.empty);
    }).catch(() => {
      if (active) setUserHasListings(false);
    });
    return () => { active = false; };
  }, [auth.userId, isBrokerMode]);

  useEffect(() => {
    if (!brokerShareModalVisible || !auth.userId) return;

    let active = true;
    setLoadingBrokers(true);
    void getDocs(query(collection(db, "users"), where("is_broker", "==", true))).then((snapshot) => {
      if (!active) return;
      setAvailableBrokers(snapshot.docs.flatMap((brokerDoc) => {
        if (brokerDoc.id === auth.userId) return [];
        const data = brokerDoc.data() as { name?: string; photoUrl?: string; avatar?: string; photos?: string[]; is_visible?: boolean; isVisible?: boolean; agencyId?: string };
        if (data.is_visible === false || data.isVisible === false) return [];
        if (agencyData?.id && data.agencyId !== agencyData.id) return [];
        return [{ id: brokerDoc.id, name: data.name?.trim() || "Μεσίτης", avatar: data.photoUrl || data.avatar || data.photos?.[0] || "" }];
      }));
    }).catch(() => {
      if (active) setAvailableBrokers([]);
    }).finally(() => {
      if (active) setLoadingBrokers(false);
    });
    return () => { active = false; };
  }, [agencyData?.id, auth.userId, brokerShareModalVisible]);
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
  // const cityCoordinates = useLocationCoordinates(city, area);
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

  const hasAnyListingData = numericRent > 0 || numericSize > 0 || cityValue.length > 0 || area.trim().length > 0 || amenities.petFriendly || amenities.nearMetro;
  const matchedClients = useMemo<MatchedClient[]>(() => {
    if (!hasAnyListingData) return [];
    const currentListingFormData = {
      city: cityValue,
      area,
      latitude: addressLatitude ?? undefined,
      longitude: addressLongitude ?? undefined,
      rent: monthlyRent,
      size: sizeSqm,
      floor: floor ?? undefined,
      petFriendly: amenities.petFriendly,
      nearMetro: amenities.nearMetro,
      tags: selectedAmenitySlugs,
      amenities: selectedAmenitySlugs,
      propertyType: propertyType ?? undefined,
      propertyCategory: propertyCategory ?? undefined,
    };
    return clientPool
      .filter((client) => client.filterSet !== null && filterMatchesListing(client.filterSet, numericRent, numericSize, cityValue, area, amenities))
      .map((client) => ({
        ...client,
        compatibilityScore: calculateTenantCompatibilityScore(currentListingFormData, client.filterSet),
      }));
  }, [addressLatitude, addressLongitude, amenities, area, cityValue, clientPool, floor, hasAnyListingData, monthlyRent, numericRent, numericSize, propertyCategory, propertyType, selectedAmenitySlugs, sizeSqm]);

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

  const roomCountValues = useMemo<Record<RoomCountField, number>>(
    () => ({
      rooms: Math.max(0, Math.trunc(Number(rooms) || 0)),
      livingRooms: Math.max(0, Math.trunc(Number(livingRooms) || 0)),
      bathrooms: Math.max(0, Math.trunc(Number(bathrooms) || 0)),
      kitchens: Math.max(0, Math.trunc(Number(kitchens) || 0)),
    }),
    [bathrooms, kitchens, livingRooms, rooms],
  );

  const technicalSpecsByType = useMemo(() => {
    const grouped: Record<string, TechnicalSpecEntry[]> = {};
    for (const entry of technicalSpecEntries) {
      if (!grouped[entry.type]) grouped[entry.type] = [];
      grouped[entry.type].push(entry);
    }
    return grouped;
  }, [technicalSpecEntries]);

  const technicalSpecificationsPayload = useMemo<TechnicalSpecificationPayload[]>(
    () =>
      technicalSpecEntries
        .filter((entry) => Number.isFinite(entry.sqft) && entry.sqft > 0)
        .map((entry) => ({
          type: entry.type,
          index: entry.index,
          sizeSqm: entry.sqft,
          label: entry.label,
        })),
    [technicalSpecEntries],
  );

  const handleTechnicalSpecInputChange = useCallback(
    (type: string, rawValue: string) => {
      const value = digitsOnlyInput(rawValue);
      setTechnicalSpecInputs((prev) => ({ ...prev, [type]: value }));

      const editingId = technicalSpecEditingIds[type];
      if (!editingId) return;

      const parsed = Number(value);
      setTechnicalSpecEntries((prev) =>
        prev.map((entry) =>
          entry.id === editingId ? { ...entry, sqft: Number.isFinite(parsed) ? parsed : 0 } : entry,
        ),
      );
    },
    [technicalSpecEditingIds],
  );

  const handleCommitTechnicalSpec = useCallback(
    (config: TechnicalSpecConfig) => {
      const rawValue = (technicalSpecInputs[config.type] ?? "").trim();
      const parsed = Number(rawValue);
      if (!rawValue.length || !Number.isFinite(parsed) || parsed <= 0) return;

      const editingId = technicalSpecEditingIds[config.type];

      if (editingId) {
        setTechnicalSpecEntries((prev) =>
          prev.map((entry) => (entry.id === editingId ? { ...entry, sqft: parsed } : entry)),
        );
      } else {
        const nextIndex = technicalSpecEntries.filter((entry) => entry.type === config.type).length + 1;
        setTechnicalSpecEntries((prev) => [
          ...prev,
          {
            id: `${config.type}-${nextIndex}-${Date.now()}`,
            type: config.type,
            label: `${config.label} ${nextIndex}`,
            sqft: parsed,
            index: nextIndex,
          },
        ]);
      }

      setTechnicalSpecEditingIds((prev) => ({ ...prev, [config.type]: null }));
      setTechnicalSpecInputs((prev) => ({ ...prev, [config.type]: "" }));
    },
    [technicalSpecEditingIds, technicalSpecEntries, technicalSpecInputs],
  );

  const handleEditTechnicalSpec = useCallback((entry: TechnicalSpecEntry) => {
    setTechnicalSpecEditingIds((prev) => ({ ...prev, [entry.type]: entry.id }));
    setTechnicalSpecInputs((prev) => ({ ...prev, [entry.type]: String(entry.sqft) }));
  }, []);

  const closeFeedbackModal = useCallback(() => {    const afterClose = formFeedbackModal?.onAcknowledge;
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

        const data = snapshot.data() as FirestoreApartmentDoc & { assignedBrokerIds?: string[] };
        setCurrentListingId(listingId);
        setIsOffMarket(data.isOffMarket === true);
        setOffMarketAccessUserIds(Array.isArray(data.offMarketAccessUserIds) ? data.offMarketAccessUserIds : []);
        const ownerId = data.ownerId || data.hostId;
        const assignedBrokers = Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds : [];
        setExistingAssignmentStatus(data.assignmentStatus === "unassigned_pool" || data.assignmentStatus === "claim_pending" || data.assignmentStatus === "assigned" ? data.assignmentStatus : null);
        setListingOwnerId(ownerId ?? null);
        const hasAccess = Boolean(auth.userId && (ownerId === auth.userId || (isBrokerMode && assignedBrokers.includes(auth.userId))));
        if (!hasAccess) {
          showFeedbackModal(
            t("createListing.alerts.publishFailedTitle"),
            "Δεν έχετε δικαίωμα επεξεργασίας αυτής της αγγελίας.",
            () => router.back(),
          );
          return;
        }
        const assignedToCurrentBroker = Boolean(isBrokerMode && ownerId !== auth.userId && assignedBrokers.includes(auth.userId ?? ""));
        setIsAssignedBrokerListing(assignedToCurrentBroker);
        setExistingAssignedBrokerIds(assignedBrokers);

        const mappedRent = typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0;
        setOriginalLoadedRent(mappedRent > 0 ? mappedRent : null);
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
        setShowExactAddress(data.showExactAddress !== false);
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
        setHidePhoneFromBrokers(data.hidePhoneFromBrokers === true);
        setPropertyCategory(data.propertyCategory ?? null);
        setPropertyType(data.propertyType ?? null);
        setFloor(data.floor ?? null);
        setOrientation(data.orientation ?? null);
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
        setRenovationYear(
          typeof mappedExtraInformation?.renovationYear === "number" && Number.isFinite(mappedExtraInformation.renovationYear)
            ? clampOptionalIntegerInput(String(mappedExtraInformation.renovationYear), 1900, CURRENT_BUILD_YEAR)
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
        setWindowFrames(
          typeof mappedExtraInformation?.windowFrames === "string" && mappedExtraInformation.windowFrames.trim().length > 0
            ? mappedExtraInformation.windowFrames.trim()
            : "",
        );
        setAvailableFromDate(
          typeof mappedExtraInformation?.availableFromDate === "string" && mappedExtraInformation.availableFromDate.trim().length > 0
            ? mappedExtraInformation.availableFromDate.trim()
            : null,
        );
        setIsImmediatelyAvailable(mappedExtraInformation?.isImmediatelyAvailable === true);
        setPropertyStatus(
          PROPERTY_STATUS_OPTIONS.some((option) => option.key === data.propertyStatus)
            ? data.propertyStatus!
            : "available",
        );
        setClosedDealPrice(
          typeof data.closedDealPrice === "number" && Number.isFinite(data.closedDealPrice)
            ? String(data.closedDealPrice)
            : "",
        );
        setOwnerName(data.ownerDetails?.name ?? "");
        setOwnerPhone(data.ownerDetails?.phone ?? "");
        const savedMotivation = data.ownerDetails?.motivation ?? "";
        const savedMotivationType = data.ownerDetails?.motivationType;
        if (OWNER_MOTIVATION_OPTIONS.includes(savedMotivationType as (typeof OWNER_MOTIVATION_OPTIONS)[number])) {
          setOwnerMotivationType(savedMotivationType ?? null);
          setCustomOwnerMotivation(data.ownerDetails?.customMotivation ?? "");
        } else if (OWNER_MOTIVATION_OPTIONS.includes(savedMotivation as (typeof OWNER_MOTIVATION_OPTIONS)[number])) {
          setOwnerMotivationType(savedMotivation as (typeof OWNER_MOTIVATION_OPTIONS)[number]);
          setCustomOwnerMotivation("");
        } else {
          setOwnerMotivationType(savedMotivation ? "Άλλο" : null);
          setCustomOwnerMotivation(savedMotivation);
        }
        setOwnerPriceExpectation(
          typeof data.ownerDetails?.priceExpectation === "number" && Number.isFinite(data.ownerDetails.priceExpectation)
            ? String(data.ownerDetails.priceExpectation)
            : "",
        );
        setOriginalLoadedPriceExpectation(
          typeof data.ownerDetails?.priceExpectation === "number" && Number.isFinite(data.ownerDetails.priceExpectation)
            ? data.ownerDetails.priceExpectation
            : null,
        );
        const mappedPriceHistory = Array.isArray(data.priceHistory)
          ? data.priceHistory
              .filter(
                (entry): entry is PriceHistoryEntry =>
                  !!entry && typeof entry.price === "number" && Number.isFinite(entry.price) &&
                  typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp),
              )
              .map((entry) => ({
                ...entry,
                dateLabel:
                  typeof entry.dateLabel === "string" && entry.dateLabel.trim().length > 0
                    ? entry.dateLabel
                    : formatPriceHistoryDate(new Date(entry.timestamp)),
              }))
          : [];
        setPriceHistory(mappedPriceHistory);
        setSelectedHistoryNode(null);
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

        const mappedTechnicalSpecs = Array.isArray(data.technicalSpecifications)
          ? data.technicalSpecifications
              .filter(
                (entry): entry is TechnicalSpecificationPayload =>
                  !!entry && typeof entry.type === "string" && Number.isFinite(Number(entry.sizeSqm)),
              )
              .map((entry, position) => {
                const config = TECHNICAL_SPEC_ITEMS.find((item) => item.type === entry.type);
                const index = Number.isFinite(Number(entry.index)) ? Math.trunc(Number(entry.index)) : position + 1;
                return {
                  id: `${entry.type}-${index}-${position}`,
                  type: entry.type,
                  label: entry.label?.trim() || `${config?.label ?? entry.type} ${index}`,
                  sqft: Math.trunc(Number(entry.sizeSqm)),
                  index,
                } satisfies TechnicalSpecEntry;
              })
          : [];
        setTechnicalSpecEntries(mappedTechnicalSpecs);

        const imageList = Array.isArray(data.images)
          ? data.images
          : [data.imageUrl || data.image || ""].filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);
        setPhotos(imageList.slice(0, PHOTO_SLOTS));
        setReelVideoUri(data.reelMedia?.videoUrl ?? null);
        setFiles2d3d(Array.isArray(data.files2d3d) ? data.files2d3d.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0) : []);
        const savedTour = data.virtualTour;
        const savedScenes = savedTour && Array.isArray(savedTour.scenes)
          ? savedTour.scenes.filter((scene): scene is TourScene => !!scene && typeof scene.id === "string" && typeof scene.title === "string" && typeof scene.imageUrl === "string")
          : [];
        setEnableVirtualTour(savedTour?.enabled === true && savedScenes.length > 0);
        const normalizedSavedScenes = savedScenes.map((scene) => ({
          ...scene,
          hotspots: (scene.hotspots ?? []).map((hotspot) => ({ ...hotspot, type: hotspot.type ?? "scene" })),
        }));
        setTourScenes(normalizedSavedScenes);
        setPersistedTourScenes(normalizedSavedScenes);
        setDefaultTourSceneId(savedTour?.defaultSceneId || savedScenes[0]?.id || "");
        const savedWatermark = data.watermarkConfig;
        setWatermarkEnabled(savedWatermark?.enabled === true);
        setWatermarkType(savedWatermark?.type === "agency_logo" ? "agency_logo" : "default_text");
        setLogoStyle(
          savedWatermark?.logoStyle === "with_bg" || savedWatermark?.logoStyle === "no_bg"
            ? savedWatermark.logoStyle
            : "no_bg_transparent",
        );

        const privateImageList = Array.isArray(data.brokerPrivatePhotos)
          ? data.brokerPrivatePhotos.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
          : [];
        setBrokerPrivatePhotos(privateImageList.slice(0, BROKER_PRIVATE_PHOTO_SLOTS));

        const mappedDocuments = createEmptyDocumentsState();
        if (data.documents && typeof data.documents === "object") {
          for (const category of DOCUMENT_CATEGORIES) {
            const rawEntries = data.documents[category.key];
            if (!Array.isArray(rawEntries)) continue;

            mappedDocuments[category.key] = rawEntries
              .filter((entry) => !!entry && typeof entry.url === "string" && entry.url.trim().length > 0)
              .map((entry, position) => ({
                id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `${category.key}-${position}`,
                name: typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name : `Έγγραφο ${position + 1}`,
                url: entry.url,
                size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : 0,
                uploadedAt: typeof entry.uploadedAt === "string" ? entry.uploadedAt : "",
              }));
          }
        }
        setDocuments(mappedDocuments);
      } finally {
        if (active) setLoadingEditData(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, isBrokerMode, isEditMode, listingId, router, showFeedbackModal]);

  const assignListingToBroker = async (selectedBrokerId: string) => {
    if (!auth.userId || !listingId || assigningBrokerId) return;

    setAssigningBrokerId(selectedBrokerId);
    try {
      const apartmentRef = doc(db, "apartments", listingId);
      const finalTitle = title.trim() || "Ακίνητο";
      const firstImage = photos[0] || "";
      const finalOwnerName = ownerName.trim() || auth.user?.name || "Ιδιοκτήτης";
      const chatRoomId = [auth.userId, selectedBrokerId].sort().join("_");
      const messageText = `[Ανάθεση Ακινήτου: ${finalTitle}]`;

      await updateDoc(apartmentRef, {
        assignedBrokerIds: arrayUnion(selectedBrokerId),
        assignmentStatus: "assigned",
        pendingClaimBrokerId: deleteField(),
        "ownerDetails.name": finalOwnerName,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "chats", chatRoomId), {
        users: [auth.userId, selectedBrokerId],
        type: "host",
        brokerChatRole: "owner",
        status: "active",
        apartmentId: listingId,
        apartmentTitle: finalTitle,
        apartmentImage: firstImage,
        lastMessageText: messageText,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await syncBrokerClientProfile({
        brokerId: selectedBrokerId,
        clientId: auth.userId,
        role: "owner",
        chatRoomId,
        apartmentId: listingId,
      });
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "listing_assignment",
        text: messageText,
        apartmentId: listingId,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      setBrokerShareModalVisible(false);
      showFeedbackModal("Η αγγελία ανατέθηκε επιτυχώς στον μεσίτη!", "");
    } catch {
      showFeedbackModal("Η ανάθεση απέτυχε", "Δεν ήταν δυνατή η ανάθεση της αγγελίας. Δοκιμάστε ξανά.");
    } finally {
      setAssigningBrokerId(null);
    }
  };

  const pickPhoto = useCallback(
    async (source: "camera" | "library") => {
      const isPrivateTarget = photoPickerTarget === "brokerPrivate";
      const slotLimit = isPrivateTarget ? BROKER_PRIVATE_PHOTO_SLOTS : PHOTO_SLOTS;
      const currentCount = isPrivateTarget ? brokerPrivatePhotos.length : photos.length;
      if (currentCount >= slotLimit) return;

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
              selectionLimit: slotLimit - currentCount,
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

        if (isPrivateTarget) {
          setBrokerPrivatePhotos((prev) => [...prev, ...pickedUris].slice(0, BROKER_PRIVATE_PHOTO_SLOTS));
        } else {
          setPhotos((prev) => [...prev, ...pickedUris].slice(0, PHOTO_SLOTS));
        }
        setError(null);
      } catch {
        setError(t("createListing.errors.imagePicker"));
      }
    },
    [brokerPrivatePhotos.length, photoPickerTarget, photos.length],
  );

  const openImagePicker = useCallback((target: "listing" | "brokerPrivate" = "listing") => {
    setPhotoPickerTarget(target);
    setPhotoSourceModalVisible(true);
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, photoIndex) => photoIndex !== index));
  }, []);

  const pickReelVideo = useCallback(async () => {
    setPermBlocked(false);
    try {
      if (Platform.OS !== "web") {
        const current = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (current.status !== "granted") {
          const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (requested.status !== "granted") {
            setPermBlocked(requested.status === "denied");
            return;
          }
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        videoMaxDuration: 60,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri?.trim();
      if (!uri) {
        setError(t("createListing.errors.imageUnreadable"));
        return;
      }
      setReelVideoUri(uri);
      setError(null);
    } catch {
      setError(t("createListing.errors.imagePicker"));
    }
  }, []);

  const removeBrokerPrivatePhoto = useCallback((index: number) => {
    setBrokerPrivatePhotos((prev) => prev.filter((_, photoIndex) => photoIndex !== index));
  }, []);

  const isDocumentRepositoryReady = useMemo(
    () => DOCUMENT_CATEGORIES.every((category) => (documents[category.key]?.length ?? 0) > 0),
    [documents],
  );

  const handleAttachDocument = useCallback(
    async (categoryKey: DocumentCategoryKey) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
          multiple: true,
        });

        if (result.canceled) return;

        const picked = (result.assets ?? [])
          .filter((asset) => typeof asset.uri === "string" && asset.uri.trim().length > 0)
          .map((asset, index) => ({
            mimeType: asset.mimeType,
            document: {
              id: `${categoryKey}-${Date.now()}-${index}`,
              name: asset.name?.trim() || `document-${index + 1}`,
              url: asset.uri,
              size: Number.isFinite(Number(asset.size)) ? Number(asset.size) : 0,
              uploadedAt: new Date().toISOString(),
            } satisfies ListingDocument,
          }));

        if (!picked.length) return;

        setDocuments((prev) => ({
          ...prev,
          [categoryKey]: [...(prev[categoryKey] ?? []), ...picked.map((item) => item.document)],
        }));
        setExpandedDocumentCategory(categoryKey);
        setError(null);

        // Χωρίς αποθηκευμένη αγγελία δεν υπάρχει storage path· η μεταφόρτωση γίνεται στην υποβολή.
        if (!isEditMode || !listingId) return;

        setUploadingDocumentCategory(categoryKey);

        const uploaded = await Promise.all(
          picked.map(async (item) => ({
            ...item.document,
            url: await uploadListingDocumentAsync({
              uri: item.document.url,
              apartmentId: listingId,
              categoryKey,
              fileName: item.document.name,
              mimeType: item.mimeType,
            }),
          })),
        );

        setDocuments((prev) => ({
          ...prev,
          [categoryKey]: (prev[categoryKey] ?? []).map(
            (entry) => uploaded.find((uploadedEntry) => uploadedEntry.id === entry.id) ?? entry,
          ),
        }));
      } catch {
        setError("Η μεταφόρτωση του εγγράφου απέτυχε. Δοκιμάστε ξανά.");
      } finally {
        setUploadingDocumentCategory(null);
      }
    },
    [isEditMode, listingId],
  );

  const handleRemoveDocument = useCallback((categoryKey: DocumentCategoryKey, documentId: string) => {
    setDocuments((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] ?? []).filter((entry) => entry.id !== documentId),
    }));
  }, []);

  const handleOpenDocument = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => setError("Δεν ήταν δυνατό το άνοιγμα του εγγράφου."));
  }, []);

  const buildCurrentListingPayload = useCallback((options?: {
    imageList?: string[];
    isOffMarket?: boolean;
    visibility?: "client_only" | "public";
    offMarketAccessUserIds?: string[];
  }): Record<string, unknown> => {
    const parsedMaxDiscount = maxDiscountPercent.trim().length > 0 ? Number(maxDiscountPercent) : null;
    const normalizedRooms = Number.isFinite(Number(rooms)) && Number(rooms) > 0 ? Math.trunc(Number(rooms)) : 1;
    const imageList = options?.imageList ?? photos;
    const hostId = listingOwnerId || auth.userId || "";
    const watermarkConfig: WatermarkConfig | { enabled: false } = watermarkEnabled
      ? {
          enabled: true,
          type: watermarkType,
          text: agencyData?.name || "CampuStay",
          logoUrl: watermarkType === "agency_logo" ? agencyData?.logoUrl : null,
          logoStyle: watermarkType === "agency_logo" ? logoStyle : undefined,
        }
      : { enabled: false };
    return {
      title: title.trim() || "Αποκλειστικό Ακίνητο (Off-Market)",
      description: description.trim(),
      about: description.trim(),
      propertyCategory: propertyCategory ?? undefined,
      propertyType: propertyType ?? undefined,
      floor: floor ?? undefined,
      orientation: orientation ?? undefined,
      area: area.trim(),
      city,
      address: address.trim() || undefined,
      exactAddress: address.trim() || undefined,
      showExactAddress,
      latitude: hasExactLocation ? addressLatitude : undefined,
      longitude: hasExactLocation ? addressLongitude : undefined,
      hasExactLocation,
      rent: Number(monthlyRent) || 0,
      price: Number(monthlyRent) || 0,
      transactionType: "rent",
      maxDiscountPercent: parsedMaxDiscount,
      rooms: normalizedRooms,
      size: Number(sizeSqm) || 0,
      sqft: Number(sizeSqm) || 0,
      image: imageList[0] || "",
      imageUrl: imageList[0] || "",
      images: imageList,
      files2d3d,
      watermarkConfig,
      tags: selectedAmenitySlugs.length ? selectedAmenitySlugs : ["new_listing"],
      amenities: selectedAmenitySlugs,
      extraDetails: Object.keys(extraDetailsState).length > 0 ? extraDetailsState : undefined,
      extraInformation: {
        livingRooms: Number(livingRooms),
        bathrooms: Number(bathrooms),
        kitchens: Number(kitchens),
        levels: Number(levels),
        isImmediatelyAvailable,
        buildYear: buildYear.trim() ? Number(buildYear) : undefined,
        renovationYear: renovationYear.trim() ? Number(renovationYear) : undefined,
        commonExpenses: commonExpenses.trim() ? Number(commonExpenses) : undefined,
        heatingSystem: heatingSystem ?? undefined,
        energyClass: energyClass ?? undefined,
        windowFrames: windowFrames.trim() || undefined,
        availableFromDate: availableFromDate ?? undefined,
      },
      technicalSpecifications: technicalSpecificationsPayload.length ? technicalSpecificationsPayload : undefined,
      propertyStatus,
      closedDealPrice: propertyStatus === "sold_rented" && closedDealPrice.trim() ? Number(closedDealPrice) : null,
      ownerDetails: {
        name: ownerName.trim(),
        phone: ownerPhone.trim() || undefined,
        motivationType: ownerMotivationType,
        customMotivation: ownerMotivationType === "Άλλο" ? customOwnerMotivation.trim() : undefined,
        motivation: ownerMotivationType === "Άλλο" ? customOwnerMotivation.trim() : (ownerMotivationType ?? ""),
        priceExpectation: ownerPriceExpectation.trim() ? Number(ownerPriceExpectation) : null,
      },
      priceHistory: currentPriceHistory,
      showPhoneNumber,
      hidePhoneFromBrokers: showPhoneNumber && hidePhoneFromBrokers,
      hostId,
      ownerId: hostId,
      assignedBrokerIds: existingAssignedBrokerIds,
      isOffMarket: options?.isOffMarket ?? isOffMarket,
      visibility: options?.visibility ?? (isOffMarket ? "client_only" : "public"),
      offMarketAccessUserIds: options?.offMarketAccessUserIds ?? offMarketAccessUserIds,
    };
  }, [address, addressLatitude, addressLongitude, agencyData, area, availableFromDate, buildYear, city, closedDealPrice, commonExpenses, currentPriceHistory, customOwnerMotivation, description, energyClass, existingAssignedBrokerIds, extraDetailsState, files2d3d, floor, hasExactLocation, heatingSystem, hidePhoneFromBrokers, isImmediatelyAvailable, isOffMarket, kitchens, levels, livingRooms, listingOwnerId, logoStyle, maxDiscountPercent, monthlyRent, offMarketAccessUserIds, orientation, ownerMotivationType, ownerName, ownerPhone, ownerPriceExpectation, photos, propertyCategory, propertyStatus, propertyType, rooms, selectedAmenitySlugs, showExactAddress, showPhoneNumber, sizeSqm, technicalSpecificationsPayload, title, watermarkEnabled, watermarkType, windowFrames, renovationYear, bathrooms, auth.userId]);

  const ensureOwnerForListing = useCallback(async (apartmentId: string, options: { addToBroker?: boolean } = {}): Promise<string | null> => {
    if (!isBrokerMode || !auth.userId || !ownerName.trim()) return null;
    const cleanName = ownerName.trim();
    const cleanPhone = ownerPhone.trim();
    let ownerUserId = listingOwnerId && listingOwnerId !== auth.userId ? listingOwnerId : null;

    if (!ownerUserId) {
      const profileSnapshot = await getDocs(query(collection(db, "brokerClientProfiles"), where("brokerId", "==", auth.userId), where("role", "==", "owner")));
      for (const profileDoc of profileSnapshot.docs) {
        const profileData = profileDoc.data() as { clientId?: unknown; clientUserId?: unknown };
        const candidateId = typeof profileData.clientId === "string" ? profileData.clientId : typeof profileData.clientUserId === "string" ? profileData.clientUserId : "";
        if (!candidateId) continue;
        const userSnapshot = await getDoc(doc(db, "users", candidateId));
        if (!userSnapshot.exists()) continue;
        const userData = userSnapshot.data() as { name?: unknown; phone?: unknown };
        const sameName = typeof userData.name === "string" && userData.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase();
        const samePhone = !cleanPhone || (typeof userData.phone === "string" && userData.phone.trim() === cleanPhone);
        if (sameName && samePhone) {
          ownerUserId = candidateId;
          break;
        }
      }
    }

    if (!ownerUserId) {
      ownerUserId = `manual_owner_${Date.now()}`;
      await setDoc(doc(db, "users", ownerUserId), {
        name: cleanName,
        phone: cleanPhone,
        is_manual_owner: true,
        createdByBrokerId: auth.userId,
        createdAt: serverTimestamp(),
      });
    }

    if (options.addToBroker !== false) {
      await upsertBrokerClientProfile({
        brokerId: auth.userId,
        clientId: ownerUserId,
        clientName: cleanName,
        role: "owner",
        apartmentId,
        apartmentTitle: title.trim() || "Ακίνητο",
        rent: Number(monthlyRent) || 0,
        ownerId: ownerUserId,
      });
    }
    await updateDoc(doc(db, "apartments", apartmentId), {
      ownerId: ownerUserId,
      "ownerDetails.name": cleanName,
      ...(cleanPhone ? { "ownerDetails.phone": cleanPhone } : {}),
      updatedAt: serverTimestamp(),
    });
    return ownerUserId;
  }, [auth.userId, isBrokerMode, listingOwnerId, monthlyRent, ownerName, ownerPhone, title]);

  const handleSendOffMarketListing = useCallback(async (client: MatchedClient) => {
    if (!auth.userId || auth.isGuest || sendingOffMarketClientId) return;
    if (!monthlyRent || !city || !area.trim() || !sizeSqm) {
      showFeedbackModal("Συμπληρώστε τα βασικά στοιχεία", "Το ενοίκιο, η πόλη, η περιοχή και το εμβαδόν είναι απαραίτητα για την κοινοποίηση.");
      return;
    }

    setSendingOffMarketClientId(client.clientUserId);
    try {
      const nextAccessUserIds = Array.from(new Set([...offMarketAccessUserIds, client.clientUserId]));
      const existingId = currentListingId || (isEditMode ? listingId : "");
      const payload = buildCurrentListingPayload({
        isOffMarket: true,
        visibility: "client_only",
        offMarketAccessUserIds: nextAccessUserIds,
      });
      const finalListingId = existingId || await upsertListing({
        payload: {
          ...payload,
          hostId: auth.userId,
          ownerId: auth.userId,
          status: "active",
          offMarketAccessUserIds: nextAccessUserIds,
        },
      });
      await ensureOwnerForListing(finalListingId);
      if (existingId) {
        await updateDoc(doc(db, "apartments", finalListingId), {
          isOffMarket: true,
          visibility: "client_only",
          offMarketAccessUserIds: arrayUnion(client.clientUserId),
          updatedAt: serverTimestamp(),
        });
      }
      const finalTitle = title.trim() || "Αποκλειστικό Ακίνητο (Off-Market)";
      await addDoc(collection(db, "chats", client.chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "off_market_listing",
        apartmentId: finalListingId,
        apartmentTitle: finalTitle,
        apartmentPrice: Number(monthlyRent) || 0,
        apartmentImage: photos[0] || "",
        text: `[Αποκλειστική Πρόταση Ακινήτου (Off-market): ${finalTitle}]`,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      setCurrentListingId(finalListingId);
      setIsOffMarket(true);
      setOffMarketAccessUserIds(nextAccessUserIds);
      showFeedbackModal("Το ακίνητο κοινοποιήθηκε αποκλειστικά στον πελάτη!", "");
    } catch {
      showFeedbackModal("Η κοινοποίηση απέτυχε", "Δεν ήταν δυνατή η αποστολή της αποκλειστικής πρότασης. Δοκιμάστε ξανά.");
    } finally {
      setSendingOffMarketClientId(null);
    }
  }, [area, auth.isGuest, auth.userId, buildCurrentListingPayload, city, currentListingId, ensureOwnerForListing, isEditMode, listingId, monthlyRent, offMarketAccessUserIds, photos, sendingOffMarketClientId, showFeedbackModal, sizeSqm, title]);

  useEffect(() => {
    if (!isOffMarket || !currentListingId || !auth.isBroker) return;
    const timer = setTimeout(() => {
      void upsertListing({
        apartmentId: currentListingId,
        payload: buildCurrentListingPayload({ isOffMarket: true, visibility: "client_only" }),
      }).catch((saveError) => {
        console.warn("[CreateListing] Auto-save failed:", saveError);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [address, amenities, area, auth.isBroker, buildCurrentListingPayload, city, currentListingId, description, floor, isOffMarket, monthlyRent, photos, rooms, sizeSqm, title]);

  const validateAndSubmit = async (publishMode?: "direct" | "pool") => {
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

    const currentUserId = auth.userId;
    const hostId = isEditMode && listingOwnerId ? listingOwnerId : currentUserId;
    if (!currentUserId || !hostId || auth.isGuest) {
      showFeedbackModal(
        t("createListing.alerts.signInRequiredTitle"),
        t("createListing.alerts.signInRequiredMessage"),
        () => router.push("/auth-landing"),
      );
      return;
    }

    if (isOffMarket && currentListingId) {
      if (!title.trim() || !monthlyRent || !city || !area.trim() || !photos.some((photo) => photo.trim().length > 0)) {
        showFeedbackModal("Συμπληρώστε τα στοιχεία δημοσίευσης", "Ο τίτλος, η τιμή, η τοποθεσία και τουλάχιστον μία φωτογραφία είναι απαραίτητα.");
        return;
      }

      setSubmitting(true);
      try {
        await updateDoc(doc(db, "apartments", currentListingId), {
          isOffMarket: false,
          visibility: "public",
          publishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setIsOffMarket(false);
        showFeedbackModal(
          "Η αγγελία δημοσιεύτηκε επίσημα και είναι πλέον ορατή σε όλους!",
          "",
          () => router.replace("/apartments"),
        );
      } catch {
        showFeedbackModal("Η δημοσίευση απέτυχε", "Δεν ήταν δυνατή η επίσημη δημοσίευση της αγγελίας. Δοκιμάστε ξανά.");
      } finally {
        setSubmitting(false);
      }
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
        renovationYear: renovationYear.trim().length > 0 ? Number(renovationYear) : undefined,
        commonExpenses: commonExpenses.trim().length > 0 ? Number(commonExpenses) : undefined,
        heatingSystem: heatingSystem ?? undefined,
        energyClass: energyClass ?? undefined,
        windowFrames: windowFrames.trim().length > 0 ? windowFrames.trim() : undefined,
        availableFromDate: availableFromDate ?? undefined,
      };
      const currentPrice = Number(monthlyRent);
      const currentPriceHistoryEntry: PriceHistoryEntry = {
        price: currentPrice,
        expectedPrice: ownerPriceExpectation.trim().length > 0 ? Number(ownerPriceExpectation) : null,
        timestamp: Date.now(),
        dateLabel: formatPriceHistoryDate(new Date()),
        brokerId: auth.userId || "",
        brokerName: auth.user?.name || "Μεσίτης",
      };
      let nextPriceHistory = priceHistory.filter(
        (entry) => Number.isFinite(entry.price) && Number.isFinite(entry.timestamp),
      );
      if (!isEditMode || nextPriceHistory.length === 0) {
        nextPriceHistory = [currentPriceHistoryEntry];
      } else if (
        (originalLoadedRent !== null && currentPrice !== originalLoadedRent) ||
        (ownerPriceExpectation.trim().length > 0 ? Number(ownerPriceExpectation) : null) !== originalLoadedPriceExpectation
      ) {
        nextPriceHistory = [...nextPriceHistory, currentPriceHistoryEntry];
      }

      const publishToPool = isBrokerMode && publishMode === "pool";
      const assignedBrokerIds = isBrokerMode && publishMode === "direct"
        ? [currentUserId]
        : publishToPool
          ? []
          : existingAssignedBrokerIds;
      const assignmentStatus = isBrokerMode
        ? publishMode === "pool"
          ? "unassigned_pool"
          : publishMode === "direct"
            ? "assigned"
            : existingAssignmentStatus ?? (assignedBrokerIds.length > 0 ? "assigned" : "unassigned_pool")
        : undefined;
      const data: Record<string, unknown> = {
        title: finalTitle,
        description: finalDescription,
        about: finalDescription, // Για backward compatibility
        propertyCategory: propertyCategory ?? undefined,
        propertyType: propertyType ?? undefined,
        floor: floor ?? undefined,
        orientation: orientation ?? undefined,
        area: area.trim(),
        city,
        address: finalAddress.length > 0 ? finalAddress : undefined,
        exactAddress: finalAddress.length > 0 ? finalAddress : undefined,
        showExactAddress,
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
        virtualStaging: {
          enabled: virtualStagingEnabled,
          photoIndexes: virtualStagingPhotoIndexes.filter((index) => index < uploadedImages.length),
        },
        watermarkConfig: watermarkEnabled
          ? {
              enabled: true,
              type: watermarkType,
              text: agencyData?.name || "CampuStay",
              logoUrl: watermarkType === "agency_logo" ? agencyData?.logoUrl : null,
              logoStyle: watermarkType === "agency_logo" ? logoStyle : undefined,
            }
          : { enabled: false },
        tags: selectedAmenitySlugs.length ? selectedAmenitySlugs : ["new_listing"],
        amenities: selectedAmenitySlugs,
        extraDetails: Object.keys(extraDetailsState).length > 0 ? extraDetailsState : undefined,
        extraInformation,
        technicalSpecifications:
          isBrokerMode && technicalSpecificationsPayload.length > 0 ? technicalSpecificationsPayload : undefined,
        propertyStatus: isBrokerMode ? propertyStatus : undefined,
        closedDealPrice:
          isBrokerMode && propertyStatus === "sold_rented" && closedDealPrice.trim().length > 0
            ? Number(closedDealPrice)
            : null,
        ownerDetails: isBrokerMode
          ? {
              name: ownerName.trim(),
              phone: ownerPhone.trim() || undefined,
              motivationType: ownerMotivationType,
              customMotivation: ownerMotivationType === "Άλλο" ? customOwnerMotivation.trim() : undefined,
              motivation: ownerMotivationType === "Άλλο" ? customOwnerMotivation.trim() : (ownerMotivationType ?? ""),
              priceExpectation: ownerPriceExpectation.trim().length > 0 ? Number(ownerPriceExpectation) : null,
            }
          : undefined,
        priceHistory: isBrokerMode ? nextPriceHistory : undefined,
        showPhoneNumber,
        hidePhoneFromBrokers: showPhoneNumber && hidePhoneFromBrokers,
        hostId,
        ownerId: hostId,
        ...(isBrokerMode && (agencyData?.id || auth.agencyId) ? { agencyId: agencyData?.id || auth.agencyId } : {}),
        assignedBrokerIds,
        ...(assignmentStatus ? { assignmentStatus } : {}),
        isOffMarket: false,
        visibility: "public",
        offMarketAccessUserIds,
      };

      const savedApartmentId = await upsertListing({
        apartmentId: currentListingId || (isEditMode ? listingId : undefined),
        payload: data,
      });
      setCurrentListingId(savedApartmentId);
      setIsOffMarket(false);
      if (isBrokerMode) {
        await ensureOwnerForListing(savedApartmentId, { addToBroker: !publishToPool });
        if (publishMode) await publishListingAssignment({ apartmentId: savedApartmentId, brokerId: currentUserId, mode: publishMode });
      }
      if (isBrokerMode) {
        setPriceHistory(nextPriceHistory);
        setSelectedHistoryNode(null);
        setOriginalLoadedRent(currentPrice);
        setOriginalLoadedPriceExpectation(
          ownerPriceExpectation.trim().length > 0 ? Number(ownerPriceExpectation) : null,
        );
      }

      if (isBrokerMode) {
        // Το storage path των ιδιωτικών φωτογραφιών απαιτεί το id της αγγελίας.
        const uploadedPrivatePhotos = await Promise.all(
          brokerPrivatePhotos.map((uri, index) => uploadBrokerPrivateImageAsync(uri, savedApartmentId, index)),
        );

        const uploadedDocumentEntries = await Promise.all(
          DOCUMENT_CATEGORIES.map(async (category) => {
            const categoryFiles = documents[category.key] ?? [];
            const uploadedFiles = await Promise.all(
              categoryFiles.map(async (file) => ({
                ...file,
                url: await uploadListingDocumentAsync({
                  uri: file.url,
                  apartmentId: savedApartmentId,
                  categoryKey: category.key,
                  fileName: file.name,
                }),
              })),
            );
            return [category.key, uploadedFiles] as const;
          }),
        );
        const uploadedDocuments = Object.fromEntries(uploadedDocumentEntries) as DocumentsState;

        await upsertListing({
          apartmentId: savedApartmentId,
          payload: {
            brokerPrivatePhotos: uploadedPrivatePhotos,
            documents: uploadedDocuments,
          },
        });

        setBrokerPrivatePhotos(uploadedPrivatePhotos);
        setDocuments(uploadedDocuments);
      }

      const uploadedReelUrl = reelVideoUri
        ? await uploadListingReelAsync(reelVideoUri, savedApartmentId)
        : null;
      const reelMedia: ApartmentReelMedia | null = uploadedReelUrl
        ? { videoUrl: uploadedReelUrl, aspectRatio: "9:16" }
        : null;
      await upsertListing({
        apartmentId: savedApartmentId,
        payload: { reelMedia },
      });
      setReelVideoUri(uploadedReelUrl);

      setFiles2d3dLoading(true);
      const existingFiles2d3d = files2d3d.filter((uri) => /^https?:\/\//i.test(uri));
      const localFiles2d3d = files2d3d.filter((uri) => !/^https?:\/\//i.test(uri));
      const uploadedFiles2d3d = await Promise.all(
        localFiles2d3d.map((uri, index) => uploadImageAsync(uri, `apartments/${savedApartmentId}/files2d3d/file_${index}_${Date.now()}.png`)),
      );
      const finalFiles2d3d = [...existingFiles2d3d, ...uploadedFiles2d3d];
      await upsertListing({
        apartmentId: savedApartmentId,
        payload: { files2d3d: finalFiles2d3d },
      });
      setFiles2d3d(finalFiles2d3d);
      setFiles2d3dLoading(false);

      setTourUploadLoading(true);
      const uploadedTourScenes = enableVirtualTour
        ? await Promise.all(tourScenes.map(async (scene) => {
          if (!/^https?:\/\//i.test(scene.imageUrl)) await validateTourPanorama(scene.imageUrl, scene.mimeType);
          return {
            ...scene,
            imageUrl: await uploadImageAsync(scene.imageUrl, buildTourSceneStoragePath(savedApartmentId, scene.id), scene.mimeType),
          };
        }))
        : [];
      const virtualTour: VirtualTourData = {
        enabled: enableVirtualTour && uploadedTourScenes.length > 0,
        defaultSceneId: uploadedTourScenes.some((scene) => scene.id === defaultTourSceneId) ? defaultTourSceneId : uploadedTourScenes[0]?.id ?? "",
        scenes: uploadedTourScenes,
      };
      await upsertListing({ apartmentId: savedApartmentId, payload: { virtualTour } });
      const nextTourUrls = new Set(uploadedTourScenes.map((scene) => scene.imageUrl));
      await Promise.all(
        persistedTourScenes
          .map((scene) => scene.imageUrl)
          .filter((imageUrl) => /^https?:\/\//i.test(imageUrl) && !nextTourUrls.has(imageUrl))
          .map((imageUrl) => deleteStorageFileAsync(imageUrl)),
      );
      setTourScenes(uploadedTourScenes);
      setPersistedTourScenes(uploadedTourScenes);
      setDefaultTourSceneId(virtualTour.defaultSceneId);
      setEnableVirtualTour(virtualTour.enabled);
      setTourUploadLoading(false);

      if (uploadedImages.length) {
        setPhotos(uploadedImages);
      }

    } catch {
      setFiles2d3dLoading(false);
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

  const handlePublishPress = () => {
    if (isBrokerMode && !isEditMode && !currentListingId) {
      setPublishModeModalVisible(true);
      return;
    }
    void validateAndSubmit();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${listingProgress.percent}%` }]} />
      </View>

      <KeyboardAwareScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: spacing["3xl"] + 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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

          {/* 1. ΚΑΡΤΑ ΤΙΤΛΟΥ ΑΓΓΕΛΙΑΣ */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Τίτλος Αγγελίας (Προαιρετικό)</Text>
            <View style={styles.voiceInputWrap}>
              <TextInput
                value={titleVoice.value}
                onChangeText={titleVoice.onChangeText}
                placeholder={`π.χ. ${t("createListing.listingTitle", { area: area || "Περιοχή" })}`}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.input, styles.voiceInput]}
                maxLength={60}
                testID="create-listing-title-input"
              />
              <View style={styles.voiceButtonWrap}>
                <VoiceInputButton onTextAppend={titleVoice.onFinalResult} onPartialResult={titleVoice.onPartialResult} onAbort={titleVoice.onAbort} color={colors.onSurfaceTertiary} disabled={submitting} />
              </View>
            </View>
            <Text style={styles.fieldHint}>
              Αν το αφήσεις κενό, θα δημιουργηθεί αυτόματος τίτλος βάσει περιοχής.
            </Text>
          </View>

          {/* 2. ΚΑΡΤΑ ΠΕΡΙΓΡΑΦΗΣ / ABOUT */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Περιγραφή / Σχετικά με το σπίτι (Προαιρετικό)</Text>
              <Pressable
                style={[styles.aiHelperButton, { backgroundColor: colors.brandTertiary, borderColor: colors.border }]}
                onPress={() => {
                  const parsedSqm = Number(sizeSqm);
                  if (!area.trim() || !Number.isFinite(parsedSqm) || parsedSqm <= 0) {
                    setAiCopywriterValidation("Συμπλήρωσε πρώτα περιοχή και έγκυρα τετραγωνικά μέτρα για τη δημιουργία κειμένου.");
                    return;
                  }
                  setAiCopywriterValidation(null);
                  setAiCopywriterVisible(true);
                }}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
                <Text style={[styles.aiHelperButtonText, { color: colors.brand }]}>{t("feed.aiCopywriterButton")}</Text>
              </Pressable>
            </View>
            {aiCopywriterValidation ? <Text style={[styles.fieldHint, { color: colors.error }]}>{aiCopywriterValidation}</Text> : null}
            <View style={styles.voiceInputWrap}>
              <TextInput
                value={descriptionVoice.value}
                onChangeText={descriptionVoice.onChangeText}
                placeholder={t("createListing.detailsPlaceholder")}
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[styles.input, styles.voiceInput, { minHeight: 90, paddingTop: spacing.md }]}
                testID="create-listing-description-input"
              />
              <View style={styles.voiceButtonWrap}>
                <VoiceInputButton onTextAppend={descriptionVoice.onFinalResult} onPartialResult={descriptionVoice.onPartialResult} onAbort={descriptionVoice.onAbort} color={colors.onSurfaceTertiary} disabled={submitting} />
              </View>
            </View>
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
                    placeholder={t("createListing.maxOfferDiscountPlaceholder")}
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
            <View style={[styles.contactToggleRow, styles.mtSm]}>
              <View style={styles.contactToggleTextWrap}>
                <Text style={styles.contactToggleLabel}>Εμφάνιση ακριβούς διεύθυνσης στην αγγελία</Text>
                <Text style={styles.fieldHint}>Εάν απενεργοποιηθεί, οι ενδιαφερόμενοι θα βλέπουν μόνο την περιοχή μέχρι να τους κοινοποιήσετε τη διεύθυνση.</Text>
              </View>
              <Switch
                value={showExactAddress}
                onValueChange={setShowExactAddress}
                trackColor={{ false: colors.border, true: colors.brandSecondary }}
                thumbColor={showExactAddress ? colors.brand : colors.onSurface}
                testID="create-listing-show-exact-address-toggle"
              />
            </View>
            <AddressAutocompleteInput
              value={address}
              city={city}
              area={area}
              placeholder={t("createListing.addressPlaceholder")}
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
            {/* <ApartmentLocationMap
              latitude={addressLatitude ?? undefined}
              longitude={addressLongitude ?? undefined}
              cityCoordinates={cityCoordinates}
              hasExactLocation={hasExactLocation}
              height={240}
            />
            <Text style={styles.fieldHint}>
              Η ακριβής τοποθεσία αποθηκεύεται μόνο όταν επιλέξεις πρόταση από τη λίστα.
            </Text> */}
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
                  placeholder={t("createListing.categoryPlaceholder")}
                  onSelect={setPropertyCategory}
                  testID="create-listing-property-category-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Είδος ακινήτου</Text>
                <Dropdown
                  value={propertyType}
                  options={propertyTypeOptions}
                  placeholder={t("createListing.propertyTypePlaceholder")}
                  onSelect={setPropertyType}
                  testID="create-listing-property-type-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Όροφος</Text>
                <Dropdown
                  value={floor}
                  options={floorOptions}
                  placeholder={t("createListing.floorPlaceholder")}
                  onSelect={setFloor}
                  testID="create-listing-floor-dropdown"
                />

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Δωμάτια</Text>
                <TextInput
                  value={rooms}
                  onChangeText={(value) => setRooms(digitsOnlyInput(value))}
                  onBlur={() => setRooms(normalizeIntegerOnBlur(rooms, 1, 99, 1))}
                    placeholder={t("createListing.roomsPlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.input}
                  testID="create-listing-rooms-input"
                />
                <Text style={styles.fieldHint}>Ο αριθμός δωματίων αποθηκεύεται δυναμικά στην αγγελία.</Text>

                <Text style={[styles.sectionSubtitle, styles.mtSm]}>Προσανατολισμός</Text>
                <Dropdown
                  value={orientation}
                  options={ORIENTATION_OPTIONS}
                  placeholder={t("createListing.orientationPlaceholder")}
                  onSelect={setOrientation}
                  testID="create-listing-orientation-dropdown"
                />
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
                        if (virtualStagingEnabled) {
                          setVirtualStagingPhotoIndexes((previous) => previous.includes(index) ? previous.filter((item) => item !== index) : [...previous, index]);
                          return;
                        }
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

            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons name="sparkles-outline" size={19} color={colors.onSurface} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>AI Virtual Staging / Βελτίωση Φωτογραφιών</Text>
                  <Text style={styles.fieldHint}>{virtualStagingEnabled ? "Πατήστε μια φωτογραφία για να την επισημάνετε για μελλοντικό staging." : "Ενεργοποιήστε το για να επιλέξετε άδειους χώρους."}</Text>
                </View>
              </View>
              <Switch value={virtualStagingEnabled} onValueChange={setVirtualStagingEnabled} trackColor={{ false: colors.border, true: colors.brandSecondary }} thumbColor={virtualStagingEnabled ? colors.brand : colors.onSurface} testID="create-listing-virtual-staging-toggle" />
            </View>
            {virtualStagingEnabled && virtualStagingPhotoIndexes.length > 0 ? <Text style={styles.fieldHint}>{virtualStagingPhotoIndexes.length} φωτογραφία/ες επισημάνθηκαν για AI επεξεργασία.</Text> : null}

            {permBlocked && (
              <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
                <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
                <Text style={styles.settingsButtonText}>{`${t("common.media.photoAccessOff")} ${t("common.actions.openSettings")}.`}</Text>
              </Pressable>
            )}

            <View style={styles.reelUploadHeader}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons name="videocam-outline" size={19} color={colors.onSurface} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{t("feed.uploadReel")}</Text>
                  <Text style={styles.fieldHint}>Προσθέστε ένα κάθετο video έως 60 δευτερόλεπτα για το Reels Feed.</Text>
                </View>
              </View>
              {reelVideoUri ? <Pressable onPress={() => setReelVideoUri(null)} hitSlop={8} accessibilityLabel="Remove reel video" testID="create-listing-remove-reel"><Ionicons name="trash-outline" size={19} color={colors.error} /></Pressable> : null}
            </View>
            <Pressable style={styles.reelUploadButton} onPress={() => void pickReelVideo()} testID="create-listing-upload-reel">
              <Ionicons name={reelVideoUri ? "refresh-outline" : "videocam-outline"} size={19} color={colors.onBrand} />
              <Text style={styles.reelUploadButtonText}>{reelVideoUri ? "Αντικατάσταση Video Reel" : t("feed.uploadReel")}</Text>
            </Pressable>
            {reelVideoUri ? <Text style={styles.fieldHint}>{reelVideoUri.startsWith("http") ? "Το video reel είναι αποθηκευμένο στην αγγελία." : "Το video reel θα ανέβει με τη δημοσίευση."}</Text> : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.card} testID="virtual-tour-controls-section">
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons color={colors.onSurface} name="cube-outline" size={20} />
                <View>
                  <Text style={styles.sectionTitle}>Προσθήκη 360° Virtual Tour</Text>
                  <Text style={styles.fieldHint}>Προσθέστε πανοραμικές εικόνες για περιήγηση στους χώρους.</Text>
                </View>
              </View>
              <Switch value={enableVirtualTour} onValueChange={setEnableVirtualTour} trackColor={{ false: colors.border, true: colors.brandSecondary }} thumbColor={enableVirtualTour ? colors.brand : colors.onSurface} testID="create-listing-virtual-tour-toggle" />
            </View>
            {enableVirtualTour ? (
              <>
                <Pressable style={styles.tourAddButton} onPress={() => void handlePickTourScenes()} disabled={tourUploadLoading} testID="create-listing-add-tour-scene">
                  {tourUploadLoading ? <ActivityIndicator color={colors.onBrand} /> : <Ionicons name="add-circle-outline" size={19} color={colors.onBrand} />}
                  <Text style={styles.tourAddButtonText}>Προσθήκη πανοράματος</Text>
                </Pressable>
                {tourScenes.map((scene) => (
                  <View key={scene.id} style={styles.tourSceneRow}>
                    <Image source={{ uri: scene.imageUrl }} style={styles.tourSceneThumb} contentFit="cover" />
                    <View style={styles.tourSceneDetails}>
                      <TextInput value={scene.title} onChangeText={(title) => setTourScenes((previous) => previous.map((item) => item.id === scene.id ? { ...item, title } : item))} style={styles.tourSceneTitleInput} placeholder={t("createListing.sceneTitlePlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID={`tour-scene-title-${scene.id}`} />
                      <Pressable style={styles.tourDefaultRow} onPress={() => setDefaultTourSceneId(scene.id)} testID={`tour-scene-default-${scene.id}`}>
                        <Ionicons name={defaultTourSceneId === scene.id ? "radio-button-on" : "radio-button-off"} size={18} color={defaultTourSceneId === scene.id ? colors.brand : colors.onSurfaceTertiary} />
                        <Text style={styles.tourDefaultText}>Προεπιλεγμένος χώρος</Text>
                      </Pressable>
                      <Pressable style={styles.tourSecondaryButton} onPress={() => void handleReplaceTourScene(scene.id)} disabled={tourUploadLoading} testID={`tour-scene-replace-${scene.id}`}>
                        <Ionicons name="sync-outline" size={16} color={colors.brand} />
                        <Text style={styles.tourSecondaryButtonText}>Αντικατάσταση πανοράματος</Text>
                      </Pressable>
                      {tourScenes.length > 1 ? (
                        <View style={styles.hotspotEditor}>
                          <View style={styles.hotspotHeader}>
                            <Text style={styles.hotspotTitle}>Συνδέσεις χώρων</Text>
                            <Pressable style={styles.hotspotAddButton} onPress={() => addTourHotspot(scene.id)} testID={`tour-scene-add-hotspot-${scene.id}`}>
                              <Ionicons name="add" size={16} color={colors.onBrand} />
                              <Text style={styles.hotspotAddButtonText}>Προσθήκη hotspot</Text>
                            </Pressable>
                          </View>
                          {(scene.hotspots ?? []).map((hotspot, hotspotIndex) => {
                            const target = tourScenes.find((item) => item.id === hotspot.targetSceneId);
                            const targetOptions = tourScenes.filter((item) => item.id !== scene.id).map((item) => item.title);
                            return (
                              <View key={`${scene.id}-hotspot-${hotspotIndex}`} style={styles.hotspotCard}>
                                <View style={styles.hotspotCardHeader}>
                                  <Text style={styles.hotspotLabel}>Μετάβαση σε χώρο</Text>
                                  <Pressable onPress={() => removeTourHotspot(scene.id, hotspotIndex)} hitSlop={8} testID={`tour-hotspot-remove-${scene.id}-${hotspotIndex}`}>
                                    <Ionicons name="trash-outline" size={17} color={colors.error} />
                                  </Pressable>
                                </View>
                                <Dropdown
                                  value={target?.title ?? null}
                                  options={targetOptions}
                                  placeholder="Επιλογή χώρου"
                                  onSelect={(title) => {
                                    const nextTarget = tourScenes.find((item) => item.id !== scene.id && item.title === title);
                                    if (nextTarget) updateTourHotspot(scene.id, hotspotIndex, { targetSceneId: nextTarget.id, text: nextTarget.title });
                                  }}
                                  testID={`tour-hotspot-target-${scene.id}-${hotspotIndex}`}
                                />
                                <TextInput value={hotspot.text} onChangeText={(text) => updateTourHotspot(scene.id, hotspotIndex, { text })} style={styles.hotspotTextInput} placeholder="Ετικέτα (προαιρετικό)" placeholderTextColor={colors.onSurfaceTertiary} testID={`tour-hotspot-label-${scene.id}-${hotspotIndex}`} />
                                <View style={styles.sliderHeader}><Text style={styles.hotspotSliderLabel}>Pitch</Text><Text style={styles.hotspotSliderValue}>{Math.round(hotspot.pitch)}°</Text></View>
                                <Slider minimumValue={-90} maximumValue={90} step={1} value={hotspot.pitch} onValueChange={(pitch) => updateTourHotspot(scene.id, hotspotIndex, { pitch })} minimumTrackTintColor={colors.brand} maximumTrackTintColor={colors.border} thumbTintColor={colors.brand} testID={`tour-hotspot-pitch-${scene.id}-${hotspotIndex}`} />
                                <View style={styles.sliderHeader}><Text style={styles.hotspotSliderLabel}>Yaw</Text><Text style={styles.hotspotSliderValue}>{Math.round(hotspot.yaw)}°</Text></View>
                                <Slider minimumValue={-180} maximumValue={180} step={1} value={hotspot.yaw} onValueChange={(yaw) => updateTourHotspot(scene.id, hotspotIndex, { yaw })} minimumTrackTintColor={colors.brand} maximumTrackTintColor={colors.border} thumbTintColor={colors.brand} testID={`tour-hotspot-yaw-${scene.id}-${hotspotIndex}`} />
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                    <Pressable onPress={() => void handleRemoveTourScene(scene.id)} hitSlop={8} testID={`tour-scene-remove-${scene.id}`}><Ionicons name="trash-outline" size={19} color={colors.error} /></Pressable>
                  </View>
                ))}
                {tourScenes.length === 0 ? <Text style={styles.fieldHint}>Δεν έχουν προστεθεί ακόμη πανοράματα.</Text> : null}
              </>
            ) : null}
          </View>

          <View style={styles.sectionCard} testID="section-2d-3d-files">
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons color={colors.onSurface} name="cube-outline" size={20} />
                <Text style={styles.sectionTitle}>Αρχεία 2D / 3D</Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => void handlePick2D3DFiles()}
                style={styles.attachIconButton}
                testID="attach-2d-3d-files-button"
              >
                {files2d3dLoading ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons color={colors.brand} name="attach" size={22} />}
              </Pressable>
            </View>
            <Text style={styles.attachmentSubtitle}>
              Επισυνάψτε κατόψεις, σχέδια 2D ή φωτορεαλιστικά 3D σε μορφή εικόνας (PNG, JPG).
            </Text>
            {files2d3d.length > 0 ? (
              <View style={styles.attachedFilesList}>
                {files2d3d.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.attachedFileRow}>
                    <View style={styles.attachedFileLeft}>
                      <Ionicons color={colors.brand} name="image-outline" size={18} />
                      <Text numberOfLines={1} style={styles.attachedFileName}>{`Αρχείο ${index + 1}`}</Text>
                    </View>
                    <Pressable onPress={() => handleRemove2D3DFile(index)} hitSlop={8} testID={`remove-2d-3d-file-${index}`}>
                      <Ionicons color={colors.error} name="trash-outline" size={18} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyFilesBox}>
                <Text style={styles.emptyFilesText}>Δεν έχουν επισυναφθεί αρχεία 2D / 3D.</Text>
              </View>
            )}
          </View>

          <View style={styles.watermarkCard} testID="watermark-controls-section">
            <View style={styles.watermarkHeaderRow}>
              <View style={styles.watermarkTitleCol}>
                <Text style={styles.watermarkTitle}>Προσθήκη default watermark</Text>
                <Text style={styles.watermarkSubtitle}>
                  Εμφάνιση ημιδιάφανου υδατογραφήματος κάτω δεξιά στις φωτογραφίες
                </Text>
              </View>
              <Switch
                value={watermarkEnabled}
                onValueChange={setWatermarkEnabled}
                trackColor={{ false: colors.border, true: colors.brandSecondary }}
                thumbColor={watermarkEnabled ? colors.onBrand : colors.onSurface}
                testID="watermark-toggle"
              />
            </View>

            {watermarkEnabled ? (
              <View style={styles.watermarkOptionsWrap}>
                {agencyData?.logoUrl ? (
                  <View style={styles.segmentedRow}>
                    <Pressable
                      style={[styles.segmentBtn, watermarkType === "default_text" && styles.segmentBtnActive]}
                      onPress={() => setWatermarkType("default_text")}
                    >
                      <Text style={[styles.segmentBtnText, watermarkType === "default_text" && styles.segmentBtnTextActive]}>
                        Κείμενο ({agencyData.name || "CampuStay"})
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.segmentBtn, watermarkType === "agency_logo" && styles.segmentBtnActive]}
                      onPress={() => setWatermarkType("agency_logo")}
                    >
                      <Text style={[styles.segmentBtnText, watermarkType === "agency_logo" && styles.segmentBtnTextActive]}>
                        Logo Γραφείου
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {watermarkType === "agency_logo" && agencyData?.logoUrl ? (
                  <View style={styles.logoStyleOptions}>
                    <Text style={styles.styleOptionLabel}>Στυλ εμφάνισης Logo:</Text>
                    <View style={styles.radioOptionsList}>
                      {[
                        { id: "with_bg", label: "Με φόντο" },
                        { id: "no_bg", label: "Χωρίς φόντο" },
                        { id: "no_bg_transparent", label: "Χωρίς φόντο & Ημιδιάφανο" },
                      ].map((option) => (
                        <Pressable
                          key={option.id}
                          style={[styles.radioRow, logoStyle === option.id && styles.radioRowActive]}
                          onPress={() => setLogoStyle(option.id as LogoWatermarkStyle)}
                        >
                          <View style={[styles.radioDot, logoStyle === option.id && styles.radioDotActive]}>
                            {logoStyle === option.id ? <View style={styles.radioDotInner} /> : null}
                          </View>
                          <Text style={[styles.radioText, logoStyle === option.id && styles.radioTextActive]}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.watermarkPreviewBox}>
                  <Text style={styles.previewLabel}>Προεπισκόπηση Watermark:</Text>
                  <View style={styles.previewThumbSample}>
                    <Text style={styles.previewPlaceholderText}>Δείγμα Εικόνας</Text>
                    <WatermarkBadge
                      config={{
                        enabled: true,
                        type: watermarkType,
                        text: agencyData?.name || "CampuStay",
                        logoUrl: agencyData?.logoUrl,
                        logoStyle,
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsBrokerPrivatePhotosExpanded((prev) => !prev)}
                testID="create-listing-broker-private-photos-toggle"
              >
                <Text style={styles.sectionTitle}>Επιπλέον φωτογραφίες (Μόνο για το γραφείο)</Text>
                <Ionicons
                  name={isBrokerPrivatePhotosExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isBrokerPrivatePhotosExpanded ? (
                <View style={styles.brokerPrivatePhotosContent}>
                  <Text style={styles.fieldHint}>
                    Οι φωτογραφίες αυτές είναι αυστηρά εμπιστευτικές, δεν εμφανίζονται στην αγγελία και είναι
                    προσβάσιμες μόνο από το γραφείο που τη διαχειρίζεται.
                  </Text>
                  <Text style={styles.fieldHint}>
                    {`${brokerPrivatePhotos.length}/${BROKER_PRIVATE_PHOTO_SLOTS} φωτογραφίες`}
                  </Text>

                  <View style={styles.photoGrid}>
                    {Array.from({ length: BROKER_PRIVATE_PHOTO_SLOTS }, (_, index) => index).map((index) => {
                      const uri = brokerPrivatePhotos[index];
                      const filled = !!uri;
                      return (
                        <Pressable
                          key={`broker-private-photo-slot-${index}`}
                          onPress={() => {
                            if (filled) {
                              removeBrokerPrivatePhoto(index);
                              return;
                            }
                            openImagePicker("brokerPrivate");
                          }}
                          style={[styles.photoTile, filled ? styles.photoTileFilled : styles.photoTileEmpty]}
                          testID={`create-listing-broker-private-photo-slot-${index}`}
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
                              <Text style={[styles.photoTileText, styles.photoTileTextMuted]}>
                                {t("common.actions.add")}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {isBrokerMode ? (
            <View
              style={styles.card}
              onLayout={(event) => {
                matchingSectionY.current = event.nativeEvent.layout.y;
              }}
              testID="create-listing-client-matching"
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.matchingHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Ταίριασμα με Υπάρχοντες Πελάτες (Off-market Exclusive)</Text>
                  <Text style={styles.fieldHint}>Προτείνετε το ακίνητο σε συμβατούς πελάτες πριν την επίσημη δημοσίευση.</Text>
                </View>
                {loadingClientPool ? <ActivityIndicator size="small" color={colors.brandSecondary} /> : null}
              </View>

              {!loadingClientPool && !hasAnyListingData ? (
                <Text style={styles.fieldHint}>Συμπληρώστε τουλάχιστον ένα στοιχείο του ακινήτου για να δείτε συμβατούς πελάτες.</Text>
              ) : !loadingClientPool && matchedClients.length === 0 ? (
                <Text style={styles.fieldHint}>Δεν βρέθηκαν πελάτες των οποίων τα φίλτρα να ταιριάζουν με τα τρέχοντα στοιχεία.</Text>
              ) : (
                <View style={styles.matchedClientList}>
                  {matchedClients.map((client) => (
                    <View key={client.chatRoomId} style={styles.matchedClientRow}>
                      {client.clientAvatar ? (
                        <Image source={{ uri: client.clientAvatar }} style={styles.matchedClientAvatar} contentFit="cover" />
                      ) : (
                        <DefaultProfileAvatar size={42} iconSize={19} />
                      )}
                      <View style={styles.matchedClientInfo}>
                        <Text style={styles.matchedClientName} numberOfLines={1}>{client.clientName}</Text>
                        <View style={styles.compatibilityBadge}>
                          <Text style={styles.compatibilityBadgeText}>{`${client.compatibilityScore}% Match`}</Text>
                        </View>
                      </View>
                      <View style={styles.matchedClientActions}>
                        <Pressable
                          style={styles.matchedClientSendButton}
                          onPress={() => void handleSendOffMarketListing(client)}
                          disabled={sendingOffMarketClientId !== null}
                          accessibilityLabel={`Αποστολή μηνύματος στον ${client.clientName}`}
                          testID={`create-listing-match-send-${client.clientUserId}`}
                        >
                          {sendingOffMarketClientId === client.clientUserId ? (
                            <ActivityIndicator size="small" color={colors.onBrand} />
                          ) : (
                            <Ionicons name="paper-plane-outline" size={18} color={colors.onBrand} />
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.matchedClientAddButton}
                          onPress={() => undefined}
                          accessibilityLabel={`Προσθήκη ${client.clientName}`}
                          testID={`create-listing-match-add-${client.clientUserId}`}
                        >
                          <Ionicons name="add-outline" size={18} color={colors.onSurfaceTertiary} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsDocumentsExpanded((prev) => !prev)}
                testID="create-listing-documents-toggle"
              >
                <View style={styles.documentsHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Αρχειοθήκη Εγγράφων</Text>
                  {isDocumentRepositoryReady ? (
                    <View style={styles.documentsReadyBadge} testID="create-listing-documents-ready-badge">
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={styles.documentsReadyBadgeText}>Έτοιμο για μεταβίβαση</Text>
                    </View>
                  ) : (
                    <Text style={styles.fieldHint}>
                      Συμπληρώστε και τις 8 κατηγορίες για να χαρακτηριστεί έτοιμη προς μεταβίβαση.
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={isDocumentsExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isDocumentsExpanded ? (
                <View style={styles.documentsContent}>
                  {DOCUMENT_CATEGORIES.map((category) => {
                    const files = documents[category.key] ?? [];
                    const hasFiles = files.length > 0;
                    const isCategoryExpanded = expandedDocumentCategory === category.key;
                    const isUploading = uploadingDocumentCategory === category.key;

                    return (
                      <View key={category.key} style={styles.documentCategoryBlock}>
                        <Pressable
                          style={styles.documentCategoryRow}
                          onPress={() =>
                            setExpandedDocumentCategory((prev) => (prev === category.key ? null : category.key))
                          }
                          testID={`create-listing-document-category-${category.key}`}
                        >
                          <Text style={styles.documentCategoryTitle}>{category.title}</Text>
                          <View style={styles.documentCategoryActions}>
                            {hasFiles ? (
                              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            ) : null}
                            <View style={[styles.documentCountBadge, hasFiles && styles.documentCountBadgeFilled]}>
                              <Text
                                style={[styles.documentCountBadgeText, hasFiles && styles.documentCountBadgeTextFilled]}
                              >
                                {files.length}
                              </Text>
                            </View>
                            {isUploading ? (
                              <ActivityIndicator size="small" color={colors.brandSecondary} />
                            ) : (
                              <Pressable
                                onPress={() => void handleAttachDocument(category.key)}
                                hitSlop={8}
                                testID={`create-listing-document-attach-${category.key}`}
                              >
                                <Ionicons name="attach-outline" size={20} color={colors.brandSecondary} />
                              </Pressable>
                            )}
                          </View>
                        </Pressable>

                        {isCategoryExpanded ? (
                          <View style={styles.documentFileList}>
                            {hasFiles ? (
                              files.map((file) => (
                                <View key={file.id} style={styles.documentFileRow}>
                                  <View style={styles.documentFileTextWrap}>
                                    <Text style={styles.documentFileName} numberOfLines={1}>
                                      {file.name}
                                    </Text>
                                    <Text style={styles.documentFileMeta}>{formatFileSize(file.size)}</Text>
                                  </View>
                                  <Pressable
                                    onPress={() => handleOpenDocument(file.url)}
                                    hitSlop={8}
                                    testID={`create-listing-document-open-${file.id}`}
                                  >
                                    <Ionicons name="download-outline" size={18} color={colors.onSurface} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleRemoveDocument(category.key, file.id)}
                                    hitSlop={8}
                                    testID={`create-listing-document-remove-${file.id}`}
                                  >
                                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                                  </Pressable>
                                </View>
                              ))
                            ) : (
                              <Text style={styles.fieldHint}>Δεν έχουν επισυναφθεί έγγραφα σε αυτή την κατηγορία.</Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

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
            {showPhoneNumber ? (
              <View style={styles.contactToggleRow}>
                <View style={styles.contactToggleTextWrap}>
                  <Text style={styles.contactToggleLabel}>Απόκρυψη από μεσίτες</Text>
                  <Text style={styles.fieldHint}>Ο αριθμός τηλεφώνου δεν θα εμφανίζεται σε χρήστες με μεσιτικό λογαριασμό.</Text>
                </View>
                <Switch
                  value={hidePhoneFromBrokers}
                  onValueChange={setHidePhoneFromBrokers}
                  trackColor={{ false: colors.border, true: colors.brandSecondary }}
                  thumbColor={hidePhoneFromBrokers ? colors.brand : colors.onSurface}
                  testID="create-listing-hide-phone-from-brokers-toggle"
                />
              </View>
            ) : null}
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
                      onChangeText={(value) => setLivingRooms(digitsOnlyInput(value))}
                      onBlur={() => setLivingRooms(normalizeIntegerOnBlur(livingRooms, 1, 9, 1))}
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
                      onChangeText={(value) => setBathrooms(digitsOnlyInput(value))}
                      onBlur={() => setBathrooms(normalizeIntegerOnBlur(bathrooms, 1, 9, 1))}
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
                      onChangeText={(value) => setKitchens(digitsOnlyInput(value))}
                      onBlur={() => setKitchens(normalizeIntegerOnBlur(kitchens, 1, 9, 1))}
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
                      onChangeText={(value) => setLevels(digitsOnlyInput(value))}
                      onBlur={() => setLevels(normalizeIntegerOnBlur(levels, 1, 9, 1))}
                      keyboardType="number-pad"
                      maxLength={1}
                      placeholder="1"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-levels"
                    />
                  </View>
                </View>
                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>Έτος ανακαίνισης</Text>
                    <TextInput
                      value={renovationYear}
                      onChangeText={(value) => setRenovationYear(clampOptionalIntegerInput(value, 1900, CURRENT_BUILD_YEAR))}
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholder="π.χ. 2021"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={styles.input}
                      testID="create-listing-extra-info-renovation-year"
                    />
                  </View>
                </View>

                <Text style={styles.sectionSubtitle}>Θέρμανση και ενεργειακή κλάση</Text>
                <Text style={styles.fieldLabel}>Σύστημα θέρμανσης</Text>
                <Dropdown
                  value={heatingSystem}
                  options={HEATING_SYSTEM_OPTIONS}
                  placeholder={t("createListing.heatingPlaceholder")}
                  onSelect={setHeatingSystem}
                  testID="create-listing-extra-info-heating-system"
                />

                <Text style={[styles.fieldLabel, styles.mtSm]}>Ενεργειακή κλάση</Text>
                <Dropdown
                  value={energyClass}
                  options={ENERGY_CLASS_OPTIONS}
                  placeholder={t("createListing.energyClassPlaceholder")}
                  onSelect={setEnergyClass}
                  testID="create-listing-extra-info-energy-class"
                />

                <Text style={[styles.fieldLabel, styles.mtSm]}>Τύπος κουφωμάτων</Text>
                <TextInput
                  value={windowFrames}
                  onChangeText={setWindowFrames}
                  placeholder={t("createListing.windowFramesPlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.input}
                  testID="create-listing-extra-info-window-frames"
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
                  placeholder={t("createListing.datePlaceholder")}
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

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsTechnicalSpecsExpanded((prev) => !prev)}
                testID="create-listing-technical-specs-toggle"
              >
                <Text style={styles.sectionTitle}>Τεχνικά Χαρακτηριστικά</Text>
                <Ionicons
                  name={isTechnicalSpecsExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isTechnicalSpecsExpanded ? (
                <View style={styles.technicalSpecsContent}>
                  {technicalSpecEntries.length > 0 ? (
                    <View style={styles.technicalSpecSavedList}>
                      {technicalSpecEntries.map((entry) => (
                        <View key={entry.id} style={styles.technicalSpecSavedCard}>
                          <View style={styles.technicalSpecSavedTextWrap}>
                            <Text style={styles.technicalSpecSavedLabel}>{entry.label}</Text>
                            <Text style={styles.technicalSpecSavedValue}>{`${entry.sqft} τ.μ.`}</Text>
                          </View>
                          <Pressable
                            style={styles.technicalSpecEditButton}
                            onPress={() => handleEditTechnicalSpec(entry)}
                            hitSlop={6}
                            testID={`create-listing-technical-spec-edit-${entry.type}-${entry.index}`}
                          >
                            <Ionicons name="pencil-outline" size={16} color={colors.onSurface} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {TECHNICAL_SPEC_ITEMS.map((config) => {
                    const entriesForType = technicalSpecsByType[config.type] ?? [];
                    const editingId = technicalSpecEditingIds[config.type] ?? null;
                    const editingEntry = editingId
                      ? entriesForType.find((entry) => entry.id === editingId) ?? null
                      : null;
                    const activeIndex = editingEntry ? editingEntry.index : entriesForType.length + 1;
                    const inputValue = technicalSpecInputs[config.type] ?? "";
                    const declaredCount = config.countField ? roomCountValues[config.countField] : null;
                    const exceedsDeclaredCount = declaredCount !== null && activeIndex > declaredCount;
                    const showAddButton = inputValue.trim().length > 0;

                    return (
                      <View key={config.type} style={styles.technicalSpecItemBlock}>
                        <Text style={styles.fieldLabel}>{`${config.label} ${activeIndex}`}</Text>
                        <View style={styles.technicalSpecInputRow}>
                          <TextInput
                            value={inputValue}
                            onChangeText={(value) => handleTechnicalSpecInputChange(config.type, value)}
                            placeholder={t("createListing.squareMetersPlaceholder")}
                            placeholderTextColor={colors.onSurfaceTertiary}
                            keyboardType="number-pad"
                            maxLength={4}
                            style={[styles.input, styles.technicalSpecInput]}
                            testID={`create-listing-technical-spec-input-${config.type}`}
                          />
                          {showAddButton ? (
                            <Pressable
                              style={[
                                styles.technicalSpecAddButton,
                                exceedsDeclaredCount && styles.technicalSpecAddButtonDisabled,
                              ]}
                              onPress={() => handleCommitTechnicalSpec(config)}
                              disabled={exceedsDeclaredCount}
                              hitSlop={6}
                              testID={`create-listing-technical-spec-add-${config.type}`}
                            >
                              <Ionicons
                                name="add"
                                size={20}
                                color={exceedsDeclaredCount ? colors.onSurfaceTertiary : colors.onBrand}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                        {exceedsDeclaredCount && config.countField ? (
                          <Text
                            style={styles.technicalSpecWarningText}
                            testID={`create-listing-technical-spec-warning-${config.type}`}
                          >
                            {`Έχουν δηλωθεί λιγότερα ${ROOM_COUNT_FIELD_NOUNS[config.countField]} στα βασικά χαρακτηριστικά. Ενημερώστε πρώτα το αντίστοιχο πεδίο.`}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsPropertyStatusExpanded((prev) => !prev)}
                testID="create-listing-property-status-toggle"
              >
                <View style={styles.brokerSectionHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Κατάσταση ακινήτου</Text>
                  <View style={styles.propertyStatusBadge}>
                    <Text style={styles.propertyStatusBadgeText}>
                      {PROPERTY_STATUS_OPTIONS.find((option) => option.key === propertyStatus)?.label}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={isPropertyStatusExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isPropertyStatusExpanded ? (
                <View style={styles.brokerDetailsContent}>
                  <View style={styles.propertyStatusOptions}>
                    {PROPERTY_STATUS_OPTIONS.map((option) => {
                      const isSelected = propertyStatus === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          style={[styles.propertyStatusOptionRow, isSelected && styles.propertyStatusOptionRowSelected]}
                          onPress={() => setPropertyStatus(option.key)}
                          testID={`create-listing-status-option-${option.key}`}
                        >
                          <Text style={styles.propertyStatusOptionLabel}>{option.label}</Text>
                          <Ionicons
                            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                            size={22}
                            color={isSelected ? colors.brand : colors.onSurfaceTertiary}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  {propertyStatus === "sold_rented" ? (
                    <View>
                      <TextInput
                        value={closedDealPrice}
                        onChangeText={(value) => setClosedDealPrice(digitsOnlyInput(value))}
                        keyboardType="number-pad"
                        placeholder={t("createListing.finalPricePlaceholder")}
                        placeholderTextColor={colors.onSurfaceTertiary}
                        style={styles.input}
                        testID="create-listing-closed-deal-price"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsOwnerDetailsExpanded((prev) => !prev)}
                testID="create-listing-owner-details-toggle"
              >
                <Text style={styles.sectionTitle}>Στοιχεία ιδιοκτήτη</Text>
                <Ionicons
                  name={isOwnerDetailsExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isOwnerDetailsExpanded ? (
                <View style={styles.brokerDetailsContent}>
                  <View>
                    <Text style={styles.fieldLabel}>Όνομα ιδιοκτήτη</Text>
                    <TextInput
                      value={ownerName}
                      onChangeText={setOwnerName}
                      editable={!isAssignedBrokerListing}
                      placeholder={t("createListing.ownerNamePlaceholder")}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={[styles.input, isAssignedBrokerListing && styles.readOnlyInput]}
                      testID="create-listing-owner-name-input"
                    />
                    {isAssignedBrokerListing ? (
                      <Text style={styles.readOnlyHelper}>Το όνομα του ιδιοκτήτη έχει οριστεί από τον δημιουργό της αγγελίας και είναι κλειδωμένο.</Text>
                    ) : null}
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>Κίνητρο ιδιοκτήτη</Text>
                    <Dropdown
                      onSelect={setOwnerMotivationType}
                      options={[...OWNER_MOTIVATION_OPTIONS]}
                      placeholder={t("createListing.ownerMotivationPlaceholder")}
                      value={ownerMotivationType}
                      testID="create-listing-owner-motivation-dropdown"
                    />
                  </View>
                  <View>
                    <Text style={styles.fieldLabel}>Τηλέφωνο ιδιοκτήτη</Text>
                    <TextInput
                      value={ownerPhone}
                      onChangeText={setOwnerPhone}
                      editable={!isAssignedBrokerListing}
                      placeholder={t("createListing.ownerPhonePlaceholder")}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      keyboardType="phone-pad"
                      style={[styles.input, isAssignedBrokerListing && styles.readOnlyInput]}
                      testID="create-listing-owner-phone-input"
                    />
                  </View>
                  {ownerMotivationType === "Άλλο" ? (
                    <TextInput
                      onChangeText={setCustomOwnerMotivation}
                      placeholder={t("createListing.ownerMotivationDetailsPlaceholder")}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={[styles.input, styles.mtSm]}
                      testID="create-listing-owner-custom-motivation-input"
                      value={customOwnerMotivation}
                    />
                  ) : null}
                  <View>
                    <Text style={[styles.fieldLabel, styles.mtSm]}>Προσδοκία ιδιοκτήτη για την τιμή (€)</Text>
                    <TextInput
                      onChangeText={(value) => setOwnerPriceExpectation(digitsOnlyInput(value))}
                      value={ownerPriceExpectation}
                      placeholder={t("createListing.ownerExpectedPricePlaceholder")}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      keyboardType="number-pad"
                      style={styles.input}
                      testID="create-listing-owner-price-expectation-input"
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {isBrokerMode ? (
            <View style={styles.card}>
              <Pressable
                style={styles.expandHeaderRow}
                onPress={() => setIsHistoryExpanded((prev) => !prev)}
                testID="create-listing-price-history-toggle"
              >
                <Text style={styles.sectionTitle}>Ιστορικό Τιμών</Text>
                <Ionicons
                  name={isHistoryExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={colors.onSurface}
                />
              </Pressable>

              {isHistoryExpanded ? (
                <View style={styles.priceHistoryContent}>
                  <Text style={styles.fieldHint}>
                    Διάγραμμα μεταβολής τιμής από την αρχική καταχώριση έως την τελευταία τροποποίηση.
                  </Text>
                  <PriceHistoryChart
                    history={currentPriceHistory}
                    selectedHistoryNode={selectedHistoryNode}
                    onSelectNode={setSelectedHistoryNode}
                    colors={colors}
                    styles={styles}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </KeyboardAwareScrollView>

        {isBrokerMode ? (
          <Pressable
            style={[styles.floatingMatchingButton, { top: spacing.md + insets.top }]}
            onPress={() => scrollViewRef.current?.scrollTo({ y: matchingSectionY.current, animated: true })}
            accessibilityLabel={t("createListing.searchCompatibleClientsLabel")}
            testID="create-listing-matching-scroll-button"
          >
            <Ionicons name="search-outline" size={20} color={colors.onSurface} />
          </Pressable>
        ) : null}

        <View style={[styles.footer, isOffMarket && styles.offMarketFooter, { paddingBottom: spacing.lg + insets.bottom }]}>
          {isOffMarket ? (
            <Pressable style={styles.offMarketBackButton} onPress={() => router.back()} testID="create-listing-off-market-back">
              <Text style={styles.offMarketBackButtonText}>Πίσω</Text>
            </Pressable>
          ) : null}
          {canAssignBroker && propertyCategory !== "roommate" && (isEditMode || userHasListings) ? (
            <Pressable
              style={styles.assignBrokerButton}
              onPress={() => {
                if (!listingId) {
                  showFeedbackModal("Αποθηκεύστε πρώτα την αγγελία", "Η ανάθεση σε μεσίτη είναι διαθέσιμη αφού αποθηκεύσετε την αγγελία.");
                  return;
                }
                setBrokerShareModalVisible(true);
              }}
              testID="create-listing-assign-broker-btn"
            >
              <Ionicons name="business-outline" size={20} color={colors.onBrand} />
              <Text style={styles.assignBrokerButtonText}>Αποστολή σε μεσίτη</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.publishButton, isOffMarket && styles.offMarketPublishButton, submitting && styles.publishButtonDisabled]}
            onPress={handlePublishPress}
            disabled={submitting}
            testID="create-listing-publish-button"
          >
            {submitting ? (
              <View style={styles.publishButtonLoadingRow}>
                <ActivityIndicator size="small" color={colors.onBrand} />
                <Text style={styles.publishButtonText}>{t("createListing.uploading")}</Text>
              </View>
            ) : (
              <Text style={styles.publishButtonText}>{isOffMarket ? "Δημοσίευση αγγελίας" : isEditMode ? t("createListing.saveChanges") : t("common.cta.publishListing")}</Text>
            )}
          </Pressable>
        </View>

      <AiCopywriterModal
        visible={aiCopywriterVisible}
        onClose={() => setAiCopywriterVisible(false)}
        onApply={(copy: CopywriterResult) => {
          if (!title.trim()) setTitle(copy.portalTitle);
          const highlights = copy.bulletHighlights.length > 0 ? `\n\n${copy.bulletHighlights.map((highlight) => `• ${highlight}`).join("\n")}` : "";
          const nextDescription = `${copy.portalDescription}${highlights}`;
          setDescription((previous) => (previous && previous.trim().length > 0 ? `${previous}\n\n${nextDescription}` : nextDescription));
        }}
        specs={{
          apartmentId: currentListingId || undefined,
          title: title.trim() || `Διαμέρισμα στην ${area.trim()}`,
          rooms: Number(rooms) || 0,
          sqm: Number(sizeSqm),
          area,
          amenities: AMENITIES.filter((amenity) => amenities[amenity.key])
            .map((amenity) => t(amenity.label)),
          price: Number(monthlyRent) || 0,
        }}
      />

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

      <Modal visible={publishModeModalVisible} transparent animationType="fade" onRequestClose={() => setPublishModeModalVisible(false)}>
        <Pressable style={styles.publishModeBackdrop} onPress={() => setPublishModeModalVisible(false)}>
          <Pressable style={styles.publishModeCard} onPress={(event) => event.stopPropagation()} testID="create-listing-publish-mode-modal">
            <View style={styles.publishModeHeader}><Text style={styles.publishModeTitle}>Πώς θέλεις να δημοσιεύσεις;</Text><Pressable onPress={() => setPublishModeModalVisible(false)} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>
            <Pressable style={styles.publishModeOption} onPress={() => { setPublishModeModalVisible(false); void validateAndSubmit("direct"); }} testID="create-listing-direct-manage-option">
              <Ionicons name="person-circle-outline" size={24} color={colors.brand} /><View style={styles.publishModeOptionCopy}><Text style={styles.publishModeOptionTitle}>Αναλαμβάνω τη διαχείριση</Text><Text style={styles.publishModeOptionSubtitle}>Απευθείας ανάθεση σε εσάς και προσθήκη ιδιοκτήτη στους πελάτες σας.</Text></View><Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
            <Pressable style={styles.publishModeOption} onPress={() => { setPublishModeModalVisible(false); void validateAndSubmit("pool"); }} testID="create-listing-pool-option">
              <Ionicons name="business-outline" size={24} color={colors.brand} /><View style={styles.publishModeOptionCopy}><Text style={styles.publishModeOptionTitle}>Προσθήκη στο Apartment Pool</Text><Text style={styles.publishModeOptionSubtitle}>Διάθεση στο κοινό pool του γραφείου χωρίς ανάθεση.</Text></View><Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={brokerShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBrokerShareModalVisible(false)}
      >
        <View style={styles.brokerModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBrokerShareModalVisible(false)} />
          <View style={styles.brokerModalCard} testID="create-listing-broker-share-modal">
            <View style={styles.brokerModalHeader}>
              <Text style={styles.brokerModalTitle}>Αποστολή σε μεσίτη</Text>
              <Pressable onPress={() => setBrokerShareModalVisible(false)} hitSlop={8} testID="create-listing-broker-share-close">
                <Ionicons name="close-outline" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {loadingBrokers ? <View style={styles.brokerModalState}><ActivityIndicator color={colors.brand} /></View> : availableBrokers.length === 0 ? (
              <View style={styles.brokerModalState}><Text style={styles.brokerModalMuted}>Δεν βρέθηκαν διαθέσιμοι μεσίτες.</Text></View>
            ) : (
              <ScrollView contentContainerStyle={styles.brokerModalList}>
                {availableBrokers.map((broker) => (
                  <View key={broker.id} style={styles.brokerRow}>
                    {broker.avatar ? <Image source={{ uri: broker.avatar }} style={styles.brokerAvatar} contentFit="cover" /> : <View style={styles.brokerAvatarFallback}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /></View>}
                    <Text style={styles.brokerName} numberOfLines={1}>{broker.name}</Text>
                    <Pressable
                      style={styles.brokerSendButton}
                      onPress={() => void assignListingToBroker(broker.id)}
                      disabled={assigningBrokerId !== null}
                      testID={`create-listing-send-to-broker-${broker.id}`}
                    >
                      {assigningBrokerId === broker.id ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="paper-plane-outline" size={18} color={colors.onBrand} />}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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
    watermarkCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    sectionCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    sectionTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    reelUploadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.md },
    reelUploadButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.brand, marginTop: spacing.sm },
    reelUploadButtonText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
    tourAddButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.brand },
    tourAddButtonText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
    tourSceneRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    tourSceneThumb: { width: 72, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
    tourSceneDetails: { flex: 1, gap: spacing.xs },
    tourSceneTitleInput: { minHeight: 34, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
    tourDefaultRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    tourDefaultText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    tourSecondaryButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
    tourSecondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
    hotspotEditor: { marginTop: spacing.xs, gap: spacing.sm },
    hotspotHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    hotspotTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
    hotspotAddButton: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.brand },
    hotspotAddButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
    hotspotCard: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    hotspotCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    hotspotLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    hotspotTextInput: { minHeight: 42, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontFamily: fonts.regular, fontSize: fontSize.sm },
    sliderHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    hotspotSliderLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurface },
    hotspotSliderValue: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
    attachmentSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    attachIconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    attachedFilesList: { gap: spacing.xs, marginTop: spacing.xs },
    attachedFileRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    attachedFileLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
    attachedFileName: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    emptyFilesBox: { paddingVertical: spacing.sm },
    emptyFilesText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary, fontStyle: "italic" },
    watermarkHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    watermarkTitleCol: { flex: 1 },
    watermarkTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    watermarkSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      marginTop: 2,
    },
    watermarkOptionsWrap: {
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    segmentedRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      padding: 3,
      gap: 4,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: spacing.xs + 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
    },
    segmentBtnActive: { backgroundColor: colors.brand },
    segmentBtnText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
      textAlign: "center",
    },
    segmentBtnTextActive: { color: colors.onBrand },
    logoStyleOptions: { gap: spacing.xs, marginTop: 4 },
    styleOptionLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    radioOptionsList: { gap: 6 },
    radioRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    radioRowActive: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm },
    radioDot: {
      width: 18,
      height: 18,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioDotActive: { borderColor: colors.brand },
    radioDotInner: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
    radioText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
    radioTextActive: { fontFamily: fonts.semibold, color: colors.onSurface },
    watermarkPreviewBox: { gap: 4, marginTop: 4 },
    previewLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    previewThumbSample: {
      height: 90,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTertiary,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    previewPlaceholderText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
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
    aiHelperButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: "flex-start",
    },
    aiHelperButtonText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
    },
    sectionHeaderRowInline: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 1,
    },
    matchingHeaderTextWrap: {
      flex: 1,
      gap: spacing.xs,
    },
    matchedClientList: {
      gap: spacing.sm,
    },
    matchedClientRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    matchedClientAvatar: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    matchedClientInfo: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    matchedClientName: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    compatibilityBadge: {
      alignSelf: "flex-start",
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    compatibilityBadgeText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.brand,
    },
    matchedClientActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    matchedClientSendButton: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    matchedClientAddButton: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    floatingMatchingButton: {
      position: "absolute",
      right: spacing.lg,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 2,
      elevation: 3,
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
    technicalSpecsContent: {
      gap: spacing.md,
    },
    brokerDetailsContent: {
      gap: spacing.md,
    },
    priceHistoryContent: {
      gap: spacing.sm,
    },
    brokerSectionHeaderTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    propertyStatusBadge: {
      alignSelf: "flex-start",
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    propertyStatusBadgeText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onBrandTertiary,
    },
    propertyStatusOptions: {
      gap: spacing.xs,
    },
    propertyStatusOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    propertyStatusOptionRowSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brandTertiary,
    },
    propertyStatusOptionLabel: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    ownerMotivationInput: {
      minHeight: 80,
    },
    priceHistoryChart: {
      height: 292,
      width: "100%",
      position: "relative",
      overflow: "hidden",
    },
    priceHistoryGridLine: {
      position: "absolute",
      height: 1,
      backgroundColor: colors.divider,
    },
    priceHistoryAxisLabel: {
      position: "absolute",
      width: 48,
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textAlign: "right",
    },
    priceHistoryLine: {
      position: "absolute",
      height: 2,
      backgroundColor: colors.brand,
    },
    priceHistoryExpectationLine: {
      position: "absolute",
      height: 2,
      backgroundColor: colors.onSurfaceTertiary,
    },
    priceHistoryNode: {
      position: "absolute",
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.brand,
      borderWidth: 2,
      borderColor: colors.surfaceSecondary,
    },
    priceHistoryNodeSelected: {
      backgroundColor: colors.brandSecondary,
      borderColor: colors.onBrand,
      transform: [{ scale: 1.2 }],
    },
    priceHistoryExpectationNode: {
      position: "absolute",
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.onSurfaceTertiary,
      borderWidth: 2,
      borderColor: colors.surfaceSecondary,
    },
    priceHistoryDateLabel: {
      position: "absolute",
      width: 56,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    priceHistoryTooltip: {
      position: "absolute",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.sm,
      gap: 2,
      elevation: 4,
      shadowColor: colors.onSurface,
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      zIndex: 5,
    },
    priceHistoryTooltipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    priceHistoryTooltipPointer: {
      position: "absolute",
      bottom: -5,
      left: "50%",
      width: 10,
      height: 10,
      backgroundColor: colors.surfaceSecondary,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      transform: [{ rotate: "45deg" }],
    },
    priceHistoryLegend: {
      position: "absolute",
      left: 52,
      right: 16,
      top: 238,
      gap: spacing.xs,
    },
    priceHistoryLegendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    priceHistoryLegendBrandIndicator: {
      width: 10,
      height: 10,
      backgroundColor: colors.brand,
    },
    priceHistoryLegendExpectationIndicator: {
      width: 10,
      height: 10,
      backgroundColor: colors.onSurfaceTertiary,
    },
    priceHistoryLegendText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    technicalSpecSavedList: {
      gap: spacing.sm,
    },
    technicalSpecSavedCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
      borderRadius: radius.md,
      backgroundColor: colors.brandTertiary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    technicalSpecSavedTextWrap: {
      flexShrink: 1,
      gap: 2,
    },
    technicalSpecSavedLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onBrandTertiary,
    },
    technicalSpecSavedValue: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onBrandTertiary,
    },
    technicalSpecEditButton: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    technicalSpecItemBlock: {
      gap: spacing.xs,
    },
    technicalSpecInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    technicalSpecInput: {
      flex: 1,
      minWidth: 0,
    },
    technicalSpecAddButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    technicalSpecAddButtonDisabled: {
      backgroundColor: colors.surfaceTertiary,
    },
    technicalSpecWarningText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.error,
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
    voiceInputWrap: { position: "relative" },
    voiceInput: { paddingRight: 58 },
    voiceButtonWrap: { position: "absolute", top: 4, right: 4 },
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
    brokerPrivatePhotosContent: {
      gap: spacing.xs,
    },
    documentsHeaderTextWrap: {
      flexShrink: 1,
      gap: 2,
    },
    documentsReadyBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.surface,
    },
    documentsReadyBadgeText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.success,
    },
    documentsContent: {
      gap: spacing.sm,
    },
    documentCategoryBlock: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    documentCategoryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    documentCategoryTitle: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    documentCategoryActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 0,
    },
    documentCountBadge: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceTertiary,
    },
    documentCountBadgeFilled: {
      backgroundColor: colors.brand,
    },
    documentCountBadgeText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    documentCountBadgeTextFilled: {
      color: colors.onBrand,
    },
    documentFileList: {
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    documentFileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: spacing.sm,
    },
    documentFileTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    documentFileName: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    documentFileMeta: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
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
    offMarketFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    offMarketBackButton: {
      flex: 1,
      minHeight: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    offMarketBackButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    assignBrokerButton: {
      minHeight: 48,
      marginBottom: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.onSurface,
    },
    assignBrokerButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onBrand,
    },
    readOnlyInput: {
      backgroundColor: colors.surfaceTertiary,
      color: colors.onSurfaceTertiary,
    },
    readOnlyHelper: {
      marginTop: spacing.xs,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    brokerModalBackdrop: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
    },
    brokerModalCard: {
      maxHeight: "75%",
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      padding: spacing.lg,
    },
    publishModeBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
    },
    publishModeCard: {
      width: "100%",
      maxWidth: 480,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    publishModeHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    publishModeTitle: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    publishModeOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
    },
    publishModeOptionCopy: { flex: 1, gap: 3 },
    publishModeOptionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    publishModeOptionSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 19 },
    brokerModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    brokerModalTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    brokerModalState: {
      minHeight: 100,
      alignItems: "center",
      justifyContent: "center",
    },
    brokerModalMuted: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onSurfaceTertiary,
    },
    brokerModalList: {
      gap: spacing.sm,
    },
    brokerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    brokerAvatar: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
    },
    brokerAvatarFallback: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    brokerName: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    brokerSendButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
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
    offMarketPublishButton: {
      flex: 3,
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
