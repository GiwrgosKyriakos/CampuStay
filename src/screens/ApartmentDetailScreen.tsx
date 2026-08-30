import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  type FieldValue,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { getOrCreateHostChat } from "@/src/api/chat";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import { getUserSettings } from "@/src/api/accountSettings";
import { deleteListingPermanently } from "@/src/api/listings";
import { getUserProfile } from "@/src/api/userProfile";
import { getBrokerDeals, upsertBrokerClientProfile } from "@/src/api/brokerClientProfiles";
import {
  addPropertyInteraction,
  subscribePropertyInteractions,
  type InteractionType,
  type PropertyInteraction,
} from "@/src/api/propertyInteractions";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { WatermarkBadge } from "@/src/components/WatermarkBadge";
import ApartmentLocationMap from "@/src/components/ApartmentLocationMap";
import InquiryCandidatesSkeleton from "@/src/components/skeletons/InquiryCandidatesSkeleton";
import ApartmentDetailSkeleton from "@/src/components/skeletons/ApartmentDetailSkeleton";
import { t } from "@/src/locales";
import { db } from "@/src/config/firebase";
import { useLocationCoordinates } from "@/src/hooks/useLocationCoordinates";
import { getExcludedUserIds } from "@/src/api/blocking";
import { calculateMatchScore } from "@/src/utils/matchAlgorithm";
import type { CompatibilityQuizAnswers, UserProfile as MatchUserProfile } from "@/src/utils/matchAlgorithm";
import { calculatePricePerSqm } from "@/src/utils/pricing";
import { calculateTenantCompatibilityScore } from "@/src/utils/compatibilityScore";
import type { FilterSetPayload } from "@/src/types/filters";
import type { WatermarkConfig } from "@/src/types/listing";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CURRENCY = "€";
const CONTACT_EMAIL = "landlord@example.com";

type TimestampLike = {
  toMillis?: () => number;
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

type BrokerPropertyDealStage = "liked" | "lead" | "showing_scheduled" | "offer_made" | "deal_closed" | "lost";

type BrokerPropertyDealLead = {
  id: string;
  name: string;
  avatar: string;
  pipelineStage: BrokerPropertyDealStage;
  chatRoomId: string;
  messageCount: number;
  lastMessageText: string;
};

type HostInquiringClient = {
  id: string;
  name: string;
  avatar: string;
  chatRoomId: string;
  compatibilityScore: number | null;
};

type InteractionTypeMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
};

function getTypeMeta(type: InteractionType, colors: ThemeColors): InteractionTypeMeta {
  switch (type) {
    case "call":
      return { icon: "call-outline", color: "#10B981", bg: "rgba(16,185,129,0.12)", label: "Κλήση" };
    case "showing":
      return { icon: "key-outline", color: colors.brand, bg: colors.brandTertiary, label: "Υπόδειξη" };
    case "email":
      return { icon: "mail-outline", color: "#38BDF8", bg: "rgba(56,189,248,0.12)", label: "Email" };
    case "comment":
    default:
      return {
        icon: "chatbubble-ellipses-outline",
        color: "#F59E0B",
        bg: "rgba(245,158,11,0.12)",
        label: "Σχόλιο",
      };
  }
}

const INTERACTION_TYPES: InteractionType[] = ["call", "showing", "comment", "email"];

interface BrokerClientWithFilters {
  clientUserId: string;
  clientName: string;
  clientAvatar?: string;
  chatRoomId: string;
  filterSet: FilterSetPayload | null;
}

interface Apartment {
  id: string;
  title: string;
  about?: string;
  description?: string;
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  area: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent: number;
  maxDiscountPercent?: number;
  rooms: number;
  size: number;
  image: string;
  tags: string[];
  amenities?: string[];
  extraDetails?: Record<string, boolean>;
  extraInformation?: ListingExtraInformation;
  hostId?: string;
  ownerId?: string;
  assignedBrokerIds?: string[];
  status?: "active" | "closed_deal";
  rentedToUserId?: string | null;
  rentedAt?: number | null;
  isOffMarket?: boolean;
  offMarketAccessUserIds?: string[];
  watermarkConfig?: WatermarkConfig;
  files2d3d?: string[];
}

interface FirestoreApartmentDoc {
  title?: string;
  description?: string;
  about?: string;
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  maxDiscountPercent?: number;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  extraDetails?: Record<string, boolean>;
  extraInformation?: Partial<ListingExtraInformation>;
  orientation?: string;
  showPhoneNumber?: boolean;
  hostId?: string;
  assignedBrokerIds?: string[];
  ownerId?: string;
  status?: "active" | "closed_deal";
  rentedToUserId?: string | null;
  rentedAt?: FieldValue | null;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  publishedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  isOffMarket?: boolean;
  offMarketAccessUserIds?: string[];
  watermarkConfig?: WatermarkConfig;
  files2d3d?: string[];
}

interface FirestoreInquiryChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  clearedAt?: Record<string, unknown>;
  apartmentId?: string;
  lastMessageTimestamp?: TimestampLike;
  updatedAt?: TimestampLike;
  createdAt?: TimestampLike;
  status?: "pending" | "active" | "rejected" | string;
  initiatedBy?: string | null;
  rejectedBy?: string | null;
  rejections?: string[];
}

interface FirestoreUserDoc {
  name?: string;
  photoUrl?: string;
  avatar?: string;
  photos?: string[];
  age?: number | null;
  budget?: number | null;
  maxBudget?: number | null;
  gender?: string | null;
  city?: string | null;
  is_broker?: boolean;
  notLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
  is_visible?: boolean;
  phone_number?: string;
  phone?: string;
}

interface FirestoreLikedApartmentDoc {
  userId?: string;
  apartmentId?: string;
  timestamp?: TimestampLike;
}

interface FirestoreQuizDoc {
  answers?: Record<string, string>;
}

interface FirestoreApprovedOfferDoc {
  clientUserId?: string;
  apartmentId?: string;
  approvedPrice?: number;
}

type LikedUserItem = {
  id: string;
  name: string;
  avatar: string;
  age: number | null;
  gender: string;
  compatibilityScore: number | null;
  chatRoomId: string | null;
  hasExistingChat: boolean;
  sortKey: number;
  isHostCandidate?: boolean;
};

type ShareMatchItem = {
  chatRoomId: string;
  counterpartId: string;
  name: string;
  avatar: string;
};

type ClosedDealClientOption = {
  id: string;
  name: string;
  avatar: string;
};

type SharedApartmentPayload = {
  id: string;
  title: string;
  rent: number;
  city: string;
  area: string;
  image: string;
  rooms: number;
  size: number;
  tags: string[];
};

type AmenityDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tagMatch?: string[];
};

function normalizeGreek(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function filterMatchesApartment(filters: FilterSetPayload, apartment: Apartment): boolean {
  const numRent = Number(apartment.rent) || 0;
  const numSize = Number(apartment.size) || 0;
  const sqmPrice = numSize > 0 && numRent > 0 ? numRent / numSize : 0;
  const normCity = normalizeGreek(apartment.city || "");
  const normArea = normalizeGreek(apartment.area || "");
  let matchedCount = 0;
  let hasConflict = false;

  const filterCity = normalizeGreek(filters.cityQuery || "");
  if (filterCity && (normCity || normArea)) {
    const matchesLocation = Boolean(
      (normCity && (normCity.includes(filterCity) || filterCity.includes(normCity))) ||
      (normArea && (normArea.includes(filterCity) || filterCity.includes(normArea))),
    );
    if (matchesLocation) matchedCount++;
    else hasConflict = true;
  }

  const minRent = filters.rentMin ? Number(filters.rentMin) : null;
  const maxRent = filters.rentMax ? Number(filters.rentMax) : null;
  if (numRent > 0 && (minRent !== null || maxRent !== null)) {
    const rentConflict = (minRent !== null && numRent < minRent) || (maxRent !== null && numRent > maxRent);
    hasConflict ||= rentConflict;
    if (!rentConflict) matchedCount++;
  }

  const minSize = filters.sizeMin ? Number(filters.sizeMin) : null;
  const maxSize = filters.sizeMax ? Number(filters.sizeMax) : null;
  if (numSize > 0 && (minSize !== null || maxSize !== null)) {
    const sizeConflict = (minSize !== null && numSize < minSize) || (maxSize !== null && numSize > maxSize);
    hasConflict ||= sizeConflict;
    if (!sizeConflict) matchedCount++;
  }

  const minSqm = filters.minSqmPrice ? Number(filters.minSqmPrice) : null;
  const maxSqm = filters.maxSqmPrice ? Number(filters.maxSqmPrice) : null;
  if (sqmPrice > 0 && (minSqm !== null || maxSqm !== null)) {
    const sqmConflict = (minSqm !== null && sqmPrice < minSqm) || (maxSqm !== null && sqmPrice > maxSqm);
    hasConflict ||= sqmConflict;
    if (!sqmConflict) matchedCount++;
  }

  const petFriendly = apartment.tags.includes("pet_friendly");
  const nearMetro = apartment.tags.includes("near_metro");
  if (filters.petFriendly === true && petFriendly) matchedCount++;
  if (filters.nearMetro === true && nearMetro) matchedCount++;

  return !hasConflict && matchedCount >= 1;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof (value as TimestampLike).toMillis === "function") {
    return (value as TimestampLike).toMillis!();
  }
  return 0;
}

function getBrokerPropertyStageLabel(stage: BrokerPropertyDealStage): string {
  if (stage === "showing_scheduled") return "Επίσκεψη";
  if (stage === "offer_made") return "Προσφορά";
  if (stage === "deal_closed") return "Ολοκληρώθηκε";
  if (stage === "lost") return "Χάθηκε";
  return "Lead";
}

function getBrokerPropertyStageTone(stage: BrokerPropertyDealStage, colors: ThemeColors): { backgroundColor: string } {
  if (stage === "lost" || stage === "showing_scheduled") return { backgroundColor: colors.surfaceTertiary };
  return { backgroundColor: colors.brandTertiary };
}

function normalizeGenderForMatch(gender: string | null | undefined): MatchUserProfile["gender"] {
  if (gender === "Male" || gender === "Female" || gender === "Prefer Not To Say") return gender;
  return "Prefer Not To Say";
}

function buildCompatibilityQuiz(answers: Record<string, string>): CompatibilityQuizAnswers {
  const quiz: Record<string, string> = {};

  Object.keys(answers).forEach((key) => {
    const value = answers[key];
    if (typeof value === "string" && value.trim().length > 0) {
      quiz[key] = value;
    }
  });

  return quiz as CompatibilityQuizAnswers;
}

function toMatchProfile(
  userId: string,
  profile: { city?: string | null; budget?: number | null; maxBudget?: number | null; gender?: string | null },
  answers: Record<string, string>,
): MatchUserProfile {
  return {
    uid: userId,
    city: profile.city?.trim() || "",
    gender: normalizeGenderForMatch(profile.gender),
    monthlyBudget: typeof profile.budget === "number" ? profile.budget : typeof profile.maxBudget === "number" ? profile.maxBudget : 0,
    quiz: buildCompatibilityQuiz(answers),
  };
}

function translateApartmentTag(tag: string): string {
  const translated = t(`apartments.tags.${tag}`);
  return translated === `apartments.tags.${tag}` ? tag : translated;
}

function normalizeExtraDetailsMap(extraDetails: unknown): Record<string, boolean> | null {
  if (!extraDetails || typeof extraDetails !== "object") return null;

  const entries = Object.entries(extraDetails as Record<string, unknown>).filter(([, value]) => value === true || value === false);
  if (!entries.length) return null;

  return Object.fromEntries(entries) as Record<string, boolean>;
}

function normalizeExtraInformation(extraInformation: unknown): ListingExtraInformation | null {
  if (!extraInformation || typeof extraInformation !== "object") return null;

  const raw = extraInformation as Partial<ListingExtraInformation>;
  const livingRooms = typeof raw.livingRooms === "number" && Number.isFinite(raw.livingRooms) ? Math.min(9, Math.max(1, Math.trunc(raw.livingRooms))) : null;
  const bathrooms = typeof raw.bathrooms === "number" && Number.isFinite(raw.bathrooms) ? Math.min(9, Math.max(1, Math.trunc(raw.bathrooms))) : null;
  const kitchens = typeof raw.kitchens === "number" && Number.isFinite(raw.kitchens) ? Math.min(9, Math.max(1, Math.trunc(raw.kitchens))) : null;
  const levels = typeof raw.levels === "number" && Number.isFinite(raw.levels) ? Math.min(9, Math.max(1, Math.trunc(raw.levels))) : null;

  if (livingRooms === null || bathrooms === null || kitchens === null || levels === null) {
    return null;
  }

  return {
    livingRooms,
    bathrooms,
    kitchens,
    levels,
    buildYear: typeof raw.buildYear === "number" && Number.isFinite(raw.buildYear) ? Math.trunc(raw.buildYear) : undefined,
    renovationYear: typeof raw.renovationYear === "number" && Number.isFinite(raw.renovationYear) ? Math.trunc(raw.renovationYear) : undefined,
    commonExpenses: typeof raw.commonExpenses === "number" && Number.isFinite(raw.commonExpenses) ? Math.max(0, Math.trunc(raw.commonExpenses)) : undefined,
    heatingSystem: typeof raw.heatingSystem === "string" && raw.heatingSystem.trim().length > 0 ? raw.heatingSystem.trim() : undefined,
    energyClass: typeof raw.energyClass === "string" && raw.energyClass.trim().length > 0 ? raw.energyClass.trim() : undefined,
    windowFrames: typeof raw.windowFrames === "string" && raw.windowFrames.trim().length > 0 ? raw.windowFrames.trim() : undefined,
    availableFromDate: typeof raw.availableFromDate === "string" && raw.availableFromDate.trim().length > 0 ? raw.availableFromDate.trim() : undefined,
    isImmediatelyAvailable: raw.isImmediatelyAvailable === true,
  };
}

function formatIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(millis: number): string {
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

const AMENITIES: AmenityDef[] = [
  { key: "wifi", label: "apartmentDetail.amenities.wifi", icon: "wifi-outline", tagMatch: ["wifi"] },
  { key: "ac", label: "apartmentDetail.amenities.ac", icon: "snow-outline", tagMatch: ["ac", "air_conditioning"] },
  { key: "washer", label: "apartmentDetail.amenities.washer", icon: "water-outline", tagMatch: ["washer", "washing_machine"] },
  { key: "pet", label: "apartmentDetail.amenities.pet", icon: "paw-outline", tagMatch: ["pet_friendly", "pet"] },
  { key: "furn", label: "apartmentDetail.amenities.furn", icon: "bed-outline", tagMatch: ["furnished", "furn"] },
  { key: "balcony", label: "createListing.amenities.balcony", icon: "sunny-outline", tagMatch: ["balcony"] },
  { key: "parking", label: "createListing.amenities.parking", icon: "car-sport-outline", tagMatch: ["parking"] },
  { key: "metro", label: "createListing.amenities.nearMetro", icon: "train-outline", tagMatch: ["near_metro", "metro"] },
];

type ExtraDetailCategory = {
  title: string;
  items: string[];
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

export default function ApartmentDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { data } = useLocalSearchParams<{ data: string }>();

  let apt: Apartment | null = null;
  try {
    apt = JSON.parse(data) as Apartment;
  } catch {
    apt = null;
  }

  const carouselRef = useRef<ScrollView>(null);
  const pageScrollRef = useRef<ScrollView>(null);

  const [activePage, setActivePage] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDeletingListing, setIsDeletingListing] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [actionModal, setActionModal] = useState<{ title: string; description: string } | null>(null);
  const [showLikedUsersSection, setShowLikedUsersSection] = useState(false);
  const [isExtraDetailsOpen, setIsExtraDetailsOpen] = useState(false);
  const [isExtraInformationOpen, setIsExtraInformationOpen] = useState(false);
  const [likedUsers, setLikedUsers] = useState<LikedUserItem[]>([]);
  const [loadingLikedUsers, setLoadingLikedUsers] = useState(false);
  const [chatActionUserId, setChatActionUserId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [activeShareMatches, setActiveShareMatches] = useState<ShareMatchItem[]>([]);
  const [loadingShareMatches, setLoadingShareMatches] = useState(false);
  const [sendingShareChatId, setSendingShareChatId] = useState<string | null>(null);
  const [closeDealModalVisible, setCloseDealModalVisible] = useState(false);
  const [closeDealClientOptions, setCloseDealClientOptions] = useState<ClosedDealClientOption[]>([]);
  const [loadingCloseDealClients, setLoadingCloseDealClients] = useState(false);
  const [selectedDealClientId, setSelectedDealClientId] = useState<string | null>(null);
  const [isSubmittingCloseDeal, setIsSubmittingCloseDeal] = useState(false);
  const [showReopenDealConfirm, setShowReopenDealConfirm] = useState(false);
  const [apartmentStatus, setApartmentStatus] = useState<"active" | "closed_deal">("active");
  const [rentedToUserId, setRentedToUserId] = useState<string | null>(null);

  const [dbImages, setDbImages] = useState<string[]>([]);
  const [files2d3d, setFiles2d3d] = useState<string[]>([]);
  const [selectedFileModal, setSelectedFileModal] = useState<{ title: string; uri: string } | null>(null);
  const [realDescription, setRealDescription] = useState<string | null>(null);
  const [realTags, setRealTags] = useState<string[]>([]);
  const [resolvedExtraDetails, setResolvedExtraDetails] = useState<Record<string, boolean> | null>(null);
  const [resolvedExtraInformation, setResolvedExtraInformation] = useState<ListingExtraInformation | null>(null);
  const [resolvedRooms, setResolvedRooms] = useState<number | null>(null);
  const [resolvedFloor, setResolvedFloor] = useState<string | null>(null);
  const [resolvedPropertyCategory, setResolvedPropertyCategory] = useState<string | null>(null);
  const [resolvedPropertyType, setResolvedPropertyType] = useState<string | null>(null);
  const [resolvedOrientation, setResolvedOrientation] = useState<string | null>(null);
  const [publishedAtMillis, setPublishedAtMillis] = useState<number | null>(null);
  const [updatedAtMillis, setUpdatedAtMillis] = useState<number | null>(null);
  const [checkingVisibility, setCheckingVisibility] = useState(() => Boolean(apt?.id && auth.userId && !auth.isGuest));
  const [isListingExcluded, setIsListingExcluded] = useState(false);
  const [showPhoneNumber, setShowPhoneNumber] = useState(false);
  const [hostPhoneNumber, setHostPhoneNumber] = useState("");
  const [resolvedHostId, setResolvedHostId] = useState<string | null>(apt?.hostId || apt?.ownerId || null);
  const [hostUserData, setHostUserData] = useState<FirestoreUserDoc | null>(null);
  const [hostProfileLoaded, setHostProfileLoaded] = useState(false);
  const [resolvedAssignedBrokerIds, setResolvedAssignedBrokerIds] = useState<string[]>(apt?.assignedBrokerIds || []);
  const [approvedClientPrice, setApprovedClientPrice] = useState<number | null>(null);
  const [isOffMarketListing, setIsOffMarketListing] = useState(apt?.isOffMarket === true);
  const [offMarketAccessUserIds, setOffMarketAccessUserIds] = useState<string[]>(apt?.offMarketAccessUserIds || []);
  const [resolvedWatermarkConfig, setResolvedWatermarkConfig] = useState<WatermarkConfig | undefined>(apt?.watermarkConfig);
  const offMarketGuardShown = useRef(false);

  const [clientPool, setClientPool] = useState<BrokerClientWithFilters[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [brokerPropertyDealLeads, setBrokerPropertyDealLeads] = useState<BrokerPropertyDealLead[]>([]);
  const [loadingBrokerPropertyDealLeads, setLoadingBrokerPropertyDealLeads] = useState(false);
  const [hostInquiringClients, setHostInquiringClients] = useState<HostInquiringClient[]>([]);
  const [loadingHostInquiringClients, setLoadingHostInquiringClients] = useState(false);
  const [isClientsSectionOpen, setIsClientsSectionOpen] = useState(false);
  const [clientsSectionY, setClientsSectionY] = useState<number | null>(null);
  const [viewerLookingForRoommate, setViewerLookingForRoommate] = useState(false);
  const [viewerProfileLoaded, setViewerProfileLoaded] = useState(false);
  const [interactions, setInteractions] = useState<PropertyInteraction[]>([]);
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<InteractionType | "all">("all");
  const [addInteractionModalVisible, setAddInteractionModalVisible] = useState(false);
  const [newInteractionType, setNewInteractionType] = useState<InteractionType>("call");
  const [newInteractionClientId, setNewInteractionClientId] = useState("");
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [isSavingInteraction, setIsSavingInteraction] = useState(false);

  const isListingOwner = useMemo(() => {
    if (!apt || !auth.userId) return false;
    const isDirectOwner = (!!apt.ownerId && apt.ownerId === auth.userId) || (!!apt.hostId && apt.hostId === auth.userId);
    const isAssigned = resolvedAssignedBrokerIds.includes(auth.userId);
    return isDirectOwner || (auth.isBroker && isAssigned);
  }, [apt, auth.isBroker, auth.userId, resolvedAssignedBrokerIds]);
  const isStrictHostOwner = !!apt?.hostId && !!auth.userId && auth.userId === apt.hostId;
  const isBrokerListing = hostUserData?.is_broker === true;
  const hostNotLookingForRoommate = hostUserData?.notLookingForRoommate === true || hostUserData?.not_looking_for_roommate === true;
  const hostLookingForRoommate = hostUserData ? !hostNotLookingForRoommate : false;
  const hasAssignedBrokers = resolvedAssignedBrokerIds.length > 0;
  const isListingEligible = hostProfileLoaded && (isBrokerListing || hostNotLookingForRoommate || hasAssignedBrokers);
  const canViewerSeeSection = viewerProfileLoaded && !isListingOwner && !auth.isBroker && !auth.notLookingForRoommate && viewerLookingForRoommate && isListingEligible;
  const canViewLikedUsers = canViewerSeeSection;
  const currentApartmentId = apt?.id;
  const listingOwnerIds = useMemo(
    () => new Set([apt?.ownerId, apt?.hostId].filter((id): id is string => typeof id === "string" && id.length > 0)),
    [apt?.hostId, apt?.ownerId],
  );
  const availableClientOptions = useMemo(() => {
    const clients = new Map<string, string>();
    brokerPropertyDealLeads.forEach((client) => clients.set(client.id, client.name));
    hostInquiringClients.forEach((client) => clients.set(client.id, client.name));
    interactions.forEach((interaction) => {
      if (interaction.clientId) clients.set(interaction.clientId, interaction.clientName);
    });
    return Array.from(clients.entries()).map(([id, name]) => ({ id, name }));
  }, [brokerPropertyDealLeads, hostInquiringClients, interactions]);

  const interactionMetrics = useMemo(() => {
    const filteredByClient = selectedClientFilter === "all"
      ? interactions
      : interactions.filter((interaction) => interaction.clientId === selectedClientFilter);

    return {
      calls: filteredByClient.filter((interaction) => interaction.type === "call").length,
      showings: filteredByClient.filter((interaction) => interaction.type === "showing").length,
      comments: filteredByClient.filter((interaction) => interaction.type === "comment").length,
      emails: filteredByClient.filter((interaction) => interaction.type === "email").length,
    };
  }, [interactions, selectedClientFilter]);

  const visibleInteractions = useMemo(
    () => interactions.filter((interaction) => {
      const matchesClient = selectedClientFilter === "all" || interaction.clientId === selectedClientFilter;
      const matchesType = selectedTypeFilter === "all" || interaction.type === selectedTypeFilter;
      return matchesClient && matchesType;
    }),
    [interactions, selectedClientFilter, selectedTypeFilter],
  );

  useEffect(() => {
    if (!auth.userId || !auth.isBroker || !isListingOwner) {
      setClientPool([]);
      setLoadingClients(false);
      return;
    }

    let mounted = true;
    setLoadingClients(true);
    void (async () => {
      try {
        const chatsSnap = await getDocs(
          query(collection(db, "chats"), where("users", "array-contains", auth.userId)),
        );
        const clientsMap = new Map<string, BrokerClientWithFilters>();

        for (const chatDoc of chatsSnap.docs) {
          const chatData = chatDoc.data() as {
            users?: unknown;
            brokerChatRole?: string;
            status?: string;
            apartmentId?: string;
          };
          if (chatData.brokerChatRole && chatData.brokerChatRole !== "client") continue;
          if (chatData.status === "closed") continue;
          const users = Array.isArray(chatData.users)
            ? chatData.users.filter((uid): uid is string => typeof uid === "string")
            : [];
          const clientUserId = users.find((uid) => uid !== auth.userId);
          if (!clientUserId || clientsMap.has(clientUserId)) continue;

          const profileSnap = await getDoc(doc(db, "users", clientUserId));
          const profile = profileSnap.exists() ? profileSnap.data() as FirestoreUserDoc : {};
          const clientName = profile.name?.trim() || "";
          if (!clientName) continue;
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
            const filterSnap = await getDocs(
              query(
                collection(db, "users", clientUserId, "savedFilterSets"),
                orderBy("updatedAt", "desc"),
                limit(1),
              ),
            );
            if (!filterSnap.empty) filterSet = filterSnap.docs[0].data() as FilterSetPayload;
          } catch {
            // A missing collection or index should not prevent other clients from loading.
          }

          clientsMap.set(clientUserId, {
            clientUserId,
            clientName,
            clientAvatar,
            chatRoomId: chatDoc.id,
            filterSet,
          });
        }

        if (mounted) setClientPool(Array.from(clientsMap.values()));
      } catch (error) {
        console.warn("[ApartmentDetail] Error loading client pool:", error);
        if (mounted) setClientPool([]);
      } finally {
        if (mounted) setLoadingClients(false);
      }
    })();

    return () => { mounted = false; };
  }, [auth.isBroker, auth.userId, isListingOwner]);

  useEffect(() => {
    if (!auth.isBroker || !isListingOwner || !auth.userId || !currentApartmentId) {
      setBrokerPropertyDealLeads([]);
      setLoadingBrokerPropertyDealLeads(false);
      return;
    }

    let mounted = true;
    const currentUserId = auth.userId;
    const apartmentId = currentApartmentId;
    setLoadingBrokerPropertyDealLeads(true);

    void (async () => {
      try {
        const [deals, chatsSnap] = await Promise.all([
          getBrokerDeals(currentUserId),
          getDocs(
            query(
              collection(db, "chats"),
              where("apartmentId", "==", apartmentId),
              where("users", "array-contains", currentUserId),
            ),
          ),
        ]);
        const propertyDeals = Array.from(
          new Map(
            deals
              .filter((deal) => {
                const isListingOwner = listingOwnerIds.has(deal.clientId);
                return deal.role !== "owner" && deal.apartmentId === apartmentId && !isListingOwner;
              })
              .map((deal) => [deal.clientId, deal]),
          ).values(),
        );
        const chatCandidates = await Promise.all(chatsSnap.docs.map(async (chatDoc) => {
          const chatData = chatDoc.data() as FirestoreInquiryChatDoc & { brokerChatRole?: string; lastMessageText?: string };
          if (chatData.status === "closed" || chatData.brokerChatRole === "owner") return null;
          const users = Array.isArray(chatData.users) ? chatData.users : [];
          const clientId = users.find((userId) => userId !== currentUserId);
          if (typeof clientId !== "string" || !clientId) return null;

          let messageCount = 0;
          try {
            const messagesSnap = await getDocs(collection(db, "chats", chatDoc.id, "messages"));
            messageCount = messagesSnap.size;
          } catch {
            messageCount = 0;
          }

          return {
            clientId,
            chatRoomId: chatDoc.id,
            messageCount,
            lastMessageText: chatData.lastMessageText?.trim() || "",
          };
        }));
        const chatByClient = new Map<string, { chatRoomId: string; messageCount: number; lastMessageText: string }>();
        chatCandidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null).forEach((candidate) => {
          const previous = chatByClient.get(candidate.clientId);
          if (!previous || candidate.messageCount > previous.messageCount) {
            chatByClient.set(candidate.clientId, candidate);
          }
        });

        const rows = await Promise.all(propertyDeals.map(async (deal) => {
          const [profileSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "brokerClientProfiles", `${currentUserId}_${deal.clientId}`)),
            getDoc(doc(db, "users", deal.clientId)),
          ]);
          const profile = profileSnap.exists() ? profileSnap.data() as { clientName?: string; clientAvatar?: string; chatRoomId?: string } : {};
          const user = userSnap.exists() ? userSnap.data() as FirestoreUserDoc : {};
          const photos = Array.isArray(user.photos) ? user.photos : [];
          const chat = chatByClient.get(deal.clientId);
          return {
            id: deal.clientId,
            name: profile.clientName?.trim() || user.name?.trim() || t("common.values.unknown"),
            avatar: profile.clientAvatar?.trim() || user.photoUrl || user.avatar || photos[0] || "",
            pipelineStage: deal.pipelineStage,
            chatRoomId: chat?.chatRoomId || profile.chatRoomId || "",
            messageCount: chat?.messageCount || 0,
            lastMessageText: chat?.lastMessageText || "",
          } satisfies BrokerPropertyDealLead;
        }));

        if (mounted) setBrokerPropertyDealLeads(rows);
      } catch (error) {
        console.error("[ApartmentDetail] Failed to load broker property deal leads:", error);
        if (mounted) setBrokerPropertyDealLeads([]);
      } finally {
        if (mounted) setLoadingBrokerPropertyDealLeads(false);
      }
    })();

    return () => { mounted = false; };
  }, [auth.isBroker, auth.userId, currentApartmentId, isListingOwner, listingOwnerIds]);

  useEffect(() => {
    if (auth.isBroker || !isListingOwner || !auth.userId || !currentApartmentId) {
      setHostInquiringClients([]);
      setLoadingHostInquiringClients(false);
      return;
    }

    let active = true;
    const currentUserId = auth.userId;
    const apartmentId = currentApartmentId;
    setLoadingHostInquiringClients(true);

    void (async () => {
      try {
        const [chatsSnap, hostProfile, hostQuizSnap, excludedUserIds] = await Promise.all([
          getDocs(
            query(
              collection(db, "chats"),
              where("apartmentId", "==", apartmentId),
              where("users", "array-contains", currentUserId),
            ),
          ),
          getUserProfile(currentUserId),
          getDoc(doc(db, "quiz_answers", currentUserId)).catch(() => null),
          getExcludedUserIds(currentUserId),
        ]);

        const hostDataSnap = await getDoc(doc(db, "users", currentUserId));
        const hostData = hostDataSnap.exists() ? hostDataSnap.data() as FirestoreUserDoc : null;
        const isHostSeekingRoommate = hostData
          ? hostData.notLookingForRoommate !== true && hostData.not_looking_for_roommate !== true
          : false;
        const hostMatchProfile = hostProfile && isHostSeekingRoommate
          ? toMatchProfile(currentUserId, hostProfile, (hostQuizSnap?.data() as FirestoreQuizDoc | undefined)?.answers ?? {})
          : null;
        const clients = await Promise.all(
          chatsSnap.docs.map(async (chatDoc) => {
            const chatData = chatDoc.data() as FirestoreInquiryChatDoc;
            if (chatData.status === "rejected" || chatData.status === "closed") return null;

            const users = Array.isArray(chatData.users) ? chatData.users : [];
            const clientId = users.find((uid) => uid !== currentUserId);
            if (!clientId || excludedUserIds.has(clientId)) return null;

            const messagesSnap = await getDocs(
              query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1)),
            );
            if (messagesSnap.empty) return null;

            const [clientUserSnap, clientQuizSnap] = await Promise.all([
              getDoc(doc(db, "users", clientId)),
              getDoc(doc(db, "quiz_answers", clientId)).catch(() => null),
            ]);
            if (!clientUserSnap.exists()) return null;

            const clientData = clientUserSnap.data() as FirestoreUserDoc;
            if (clientData.is_broker === true) return null;

            let compatibilityScore: number | null = null;
            if (hostMatchProfile) {
              const clientMatchProfile = toMatchProfile(
                clientId,
                clientData,
                (clientQuizSnap?.data() as FirestoreQuizDoc | undefined)?.answers ?? {},
              );
              compatibilityScore = calculateMatchScore(hostMatchProfile, clientMatchProfile);
            }

            return {
              id: clientId,
              name: clientData.name?.trim() || t("common.values.unknown"),
              avatar: clientData.photoUrl || clientData.avatar || clientData.photos?.[0] || "",
              chatRoomId: chatDoc.id,
              compatibilityScore,
            } satisfies HostInquiringClient;
          }),
        );

        if (active) {
          const uniqueClients = new Map<string, HostInquiringClient>();
          clients.forEach((client) => {
            if (client) uniqueClients.set(client.id, client);
          });
          setHostInquiringClients(Array.from(uniqueClients.values()));
        }
      } catch (error) {
        console.warn("[ApartmentDetail] Failed to load host clients:", error);
        if (active) setHostInquiringClients([]);
      } finally {
        if (active) setLoadingHostInquiringClients(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.isBroker, auth.userId, currentApartmentId, isListingOwner]);

  useEffect(() => {
    if (!currentApartmentId || !isListingOwner) {
      setInteractions([]);
      setSelectedClientFilter("all");
      setSelectedTypeFilter("all");
      return;
    }

    return subscribePropertyInteractions(currentApartmentId, setInteractions);
  }, [currentApartmentId, isListingOwner]);

  const matchedClients = useMemo(() => {
    if (!apt || clientPool.length === 0) return [];

    const listing = {
      city: apt.city,
      area: apt.area,
      latitude: apt.latitude,
      longitude: apt.longitude,
      rent: apt.rent,
      size: apt.size,
      floor: apt.floor,
      petFriendly: apt.tags.includes("pet_friendly"),
      nearMetro: apt.tags.includes("near_metro"),
      tags: apt.tags,
      amenities: apt.amenities,
      propertyType: apt.propertyType,
      propertyCategory: apt.propertyCategory,
    };

    return clientPool
      .filter((client) => client.filterSet !== null && filterMatchesApartment(client.filterSet, apt))
      .map((client) => ({
        ...client,
        compatibilityScore: calculateTenantCompatibilityScore(listing, client.filterSet),
      }))
      .sort((first, second) => second.compatibilityScore - first.compatibilityScore);
  }, [apt, clientPool]);

  const cityCoordinates = useLocationCoordinates(apt?.city, apt?.area);

  useEffect(() => {
    if (auth.isLoading || !apt || !isOffMarketListing || offMarketGuardShown.current) return;
    const currentUid = auth.userId;
    const isBrokerOwner = !!currentUid && (
      apt.hostId === currentUid ||
      apt.ownerId === currentUid ||
      (Array.isArray(apt.assignedBrokerIds) && apt.assignedBrokerIds.includes(currentUid))
    );
    const isPrivilegedClient = !!currentUid && offMarketAccessUserIds.includes(currentUid);
    if (isBrokerOwner || isPrivilegedClient) return;

    offMarketGuardShown.current = true;
    Alert.alert(
      "Η προεπισκόπηση δεν είναι διαθέσιμη",
      "Αυτό το ακίνητο είναι αποκλειστικά διαθέσιμο σε εξουσιοδοτημένους πελάτες.",
      [{ text: "OK", onPress: () => router.back() }],
      { cancelable: false },
    );
  }, [apt, auth.isLoading, auth.userId, isOffMarketListing, offMarketAccessUserIds, router]);

  useEffect(() => {
    if (auth.isGuest || !auth.userId || !apt?.id) {
      setIsLiked(false);
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(auth.userId, (ids) => {
      setIsLiked(ids.has(apt!.id));
    });

    return () => unsubscribe();
  }, [apt?.id, auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!apt?.id) return;

    let mounted = true;
    setResolvedHostId(apt.hostId || apt.ownerId || null);
    setResolvedAssignedBrokerIds(Array.isArray(apt.assignedBrokerIds) ? apt.assignedBrokerIds : []);
    setHostUserData(null);
    setHostProfileLoaded(false);

    void (async () => {
      try {
        const docSnap = await getDoc(doc(db, "apartments", apt!.id));
        if (!docSnap.exists() || !mounted) {
          if (mounted) setDbImages([]);
          return;
        }

        const docData = docSnap.data() as FirestoreApartmentDoc;
        setIsOffMarketListing(docData.isOffMarket === true);
        setOffMarketAccessUserIds(Array.isArray(docData.offMarketAccessUserIds) ? docData.offMarketAccessUserIds : []);
        setResolvedWatermarkConfig(docData.watermarkConfig);
        setResolvedAssignedBrokerIds(Array.isArray(docData.assignedBrokerIds) ? docData.assignedBrokerIds : []);
        setFiles2d3d(Array.isArray(docData.files2d3d) ? docData.files2d3d.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0) : []);
        const imgs = Array.isArray(docData.images)
          ? docData.images.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
          : [docData.image || docData.imageUrl].filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);

        setDbImages(imgs);
        setShowPhoneNumber(docData.showPhoneNumber === true);
        setResolvedHostId(docData.hostId || docData.ownerId || apt?.hostId || apt?.ownerId || null);
        setResolvedExtraDetails(normalizeExtraDetailsMap(docData.extraDetails));
        setResolvedExtraInformation(normalizeExtraInformation(docData.extraInformation));
        setPublishedAtMillis(toMillis(docData.publishedAt) || toMillis(docData.createdAt) || null);
        setUpdatedAtMillis(toMillis(docData.updatedAt) || null);
        setApartmentStatus(docData.status === "closed_deal" ? "closed_deal" : "active");
        setRentedToUserId(typeof docData.rentedToUserId === "string" ? docData.rentedToUserId : null);

        if (docData.description || docData.about) {
          setRealDescription((docData.description || docData.about || "").trim());
        }

        setResolvedRooms(typeof docData.rooms === "number" && Number.isFinite(docData.rooms) ? Math.max(1, Math.trunc(docData.rooms)) : null);
        setResolvedFloor(typeof docData.floor === "string" && docData.floor.trim().length > 0 ? docData.floor.trim() : null);
        setResolvedPropertyCategory(
          typeof docData.propertyCategory === "string" && docData.propertyCategory.trim().length > 0
            ? docData.propertyCategory.trim()
            : null,
        );
        setResolvedPropertyType(
          typeof docData.propertyType === "string" && docData.propertyType.trim().length > 0
            ? docData.propertyType.trim()
            : null,
        );
        setResolvedOrientation(
          typeof docData.orientation === "string" && docData.orientation.trim().length > 0
            ? docData.orientation.trim()
            : null,
        );

        const mergedTags = Array.from(
          new Set([
            ...(Array.isArray(docData.tags) ? docData.tags : []),
            ...(Array.isArray(docData.amenities) ? docData.amenities : []),
          ]),
        );
        if (mergedTags.length > 0) {
          setRealTags(mergedTags.map((tag) => String(tag)));
        }
      } catch (error) {
        console.error("[ApartmentDetail] Error fetching listing details:", error);
        if (mounted) setDbImages([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [apt?.id]);

  useEffect(() => {
    setApartmentStatus(apt?.status === "closed_deal" ? "closed_deal" : "active");
    setRentedToUserId(typeof apt?.rentedToUserId === "string" ? apt.rentedToUserId : null);
  }, [apt?.rentedToUserId, apt?.status]);

  useEffect(() => {
    if (!resolvedHostId) {
      setHostPhoneNumber("");
      setHostUserData(null);
      setHostProfileLoaded(true);
      return;
    }

    let active = true;
    setHostProfileLoaded(false);

    void (async () => {
      try {
        const hostSnap = await getDoc(doc(db, "users", resolvedHostId));
        if (!hostSnap.exists() || !active) {
          if (active) {
            setHostPhoneNumber("");
            setHostUserData(null);
            setHostProfileLoaded(true);
          }
          return;
        }

        const hostData = hostSnap.data() as FirestoreUserDoc;
        setHostUserData(hostData);
        setHostProfileLoaded(true);
        const rawPhone = typeof hostData.phone_number === "string" ? hostData.phone_number : typeof hostData.phone === "string" ? hostData.phone : "";
        if (!active) return;
        setHostPhoneNumber(rawPhone.replace(/[^0-9]/g, "").slice(0, 10));
      } catch (error) {
        if (active) {
          setHostPhoneNumber("");
          setHostUserData(null);
          setHostProfileLoaded(true);
        }
        console.error("[ApartmentDetail] Failed to load host phone number:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [resolvedHostId]);

  useEffect(() => {
    if (!auth.userId || auth.isGuest) {
      setViewerLookingForRoommate(false);
      setViewerProfileLoaded(true);
      return;
    }

    let active = true;
    setViewerProfileLoaded(false);
    void getDoc(doc(db, "users", auth.userId))
      .then((snapshot) => {
        if (!active) return;
        const viewerData = snapshot.exists() ? snapshot.data() as FirestoreUserDoc : null;
        const isNotLooking =
          auth.notLookingForRoommate === true ||
          viewerData?.notLookingForRoommate === true ||
          viewerData?.not_looking_for_roommate === true;
        setViewerLookingForRoommate(!isNotLooking);
        setViewerProfileLoaded(true);
      })
      .catch(() => {
        if (active) {
          setViewerLookingForRoommate(false);
          setViewerProfileLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.notLookingForRoommate, auth.userId]);

  useEffect(() => {
    if (!apt?.id || !auth.userId || auth.isGuest || isListingOwner) {
      setApprovedClientPrice(null);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const offersSnap = await getDocs(
          query(
            collectionGroup(db, "approvedOffers"),
            where("clientUserId", "==", auth.userId),
            where("apartmentId", "==", apt.id),
            limit(1),
          ),
        );

        if (!active) return;

        if (offersSnap.empty) {
          setApprovedClientPrice(null);
          return;
        }

        const approvedOffer = offersSnap.docs[0].data() as FirestoreApprovedOfferDoc;
        const parsedPrice = typeof approvedOffer.approvedPrice === "number" ? approvedOffer.approvedPrice : null;
        setApprovedClientPrice(parsedPrice && parsedPrice > 0 ? parsedPrice : null);
      } catch {
        if (!active) return;
        setApprovedClientPrice(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [apt?.id, auth.isGuest, auth.userId, isListingOwner]);

  useEffect(() => {
    const currentUserId = auth.userId;
    if (!apt?.id || !currentUserId || auth.isGuest) {
      setCheckingVisibility(false);
      setIsListingExcluded(false);
      return;
    }

    let active = true;
    setCheckingVisibility(true);

    void (async () => {
      try {
        const excludedUserIds = await getExcludedUserIds(currentUserId);
        let ownerId = apt?.hostId || apt?.ownerId || null;

        if (!ownerId && apt?.id) {
          const apartmentSnap = await getDoc(doc(db, "apartments", apt.id));
          if (apartmentSnap.exists()) {
            const apartmentData = apartmentSnap.data() as FirestoreApartmentDoc;
            ownerId = apartmentData.hostId || apartmentData.ownerId || null;
          }
        }

        if (!active) return;
        setIsListingExcluded(typeof ownerId === "string" && excludedUserIds.has(ownerId));
      } catch {
        if (!active) return;
        setIsListingExcluded(false);
      } finally {
        if (active) setCheckingVisibility(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [apt?.hostId, apt?.id, apt?.ownerId, auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!shareModalVisible || !auth.userId) {
      setLoadingShareMatches(false);
      setActiveShareMatches([]);
      return;
    }

    let active = true;
    setLoadingShareMatches(true);

    void (async () => {
      try {
        const currentUserId = auth.userId!;
        const chatsSnap = await getDocs(
          query(collection(db, "chats"), where("users", "array-contains", currentUserId)),
        );

        const rows = await Promise.all(
          chatsSnap.docs.map(async (chatDoc) => {
            const chatData = chatDoc.data() as FirestoreInquiryChatDoc;
            const users = Array.isArray(chatData.users) ? chatData.users : [];
            const counterpartId = users.find((uid) => uid !== currentUserId) || "";
            if (!counterpartId) return null;

            const isRoommateChat = chatData.type !== "host";
            if (!isRoommateChat || chatData.status !== "active") {
              return null;
            }

            const counterpartSnap = await getDoc(doc(db, "users", counterpartId));
            const counterpartData = counterpartSnap.exists() ? (counterpartSnap.data() as FirestoreUserDoc) : null;
            const photos = Array.isArray(counterpartData?.photos) ? counterpartData.photos : [];

            return {
              chatRoomId: chatDoc.id,
              counterpartId,
              name: counterpartData?.name?.trim() || t("common.values.unknown"),
              avatar: counterpartData?.photoUrl || counterpartData?.avatar || photos[0] || "",
            } satisfies ShareMatchItem;
          }),
        );

        if (!active) return;
        setActiveShareMatches(rows.filter((row): row is ShareMatchItem => !!row));
      } catch (error) {
        console.error("[ApartmentDetail] Failed to load active share matches:", error);
        if (active) {
          setActiveShareMatches([]);
        }
      } finally {
        if (active) {
          setLoadingShareMatches(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, shareModalVisible]);

  useEffect(() => {
    if (!closeDealModalVisible || !isStrictHostOwner || !auth.userId || !apt?.id) {
      setLoadingCloseDealClients(false);
      setCloseDealClientOptions([]);
      return;
    }

    let active = true;
    setLoadingCloseDealClients(true);

    void (async () => {
      try {
        const chatsSnap = await getDocs(
          query(
            collection(db, "chats"),
            where("apartmentId", "==", apt.id),
            where("type", "==", "host"),
            where("users", "array-contains", auth.userId),
          ),
        );

        const counterpartIds = new Set<string>();
        chatsSnap.docs.forEach((chatDoc) => {
          const data = chatDoc.data() as FirestoreInquiryChatDoc;
          const users = Array.isArray(data.users) ? data.users : [];
          const counterpartId = users.find((uid) => uid !== auth.userId);
          if (counterpartId) counterpartIds.add(counterpartId);
        });

        const options = await Promise.all(
          Array.from(counterpartIds).map(async (uid) => {
            const userSnap = await getDoc(doc(db, "users", uid));
            const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;
            const photos = Array.isArray(userData?.photos) ? userData.photos : [];

            return {
              id: uid,
              name: userData?.name?.trim() || t("common.values.unknown"),
              avatar: userData?.photoUrl || userData?.avatar || photos[0] || "",
            } satisfies ClosedDealClientOption;
          }),
        );

        if (!active) return;
        setCloseDealClientOptions(options);
      } catch (error) {
        console.error("[ApartmentDetail] Failed to load close deal clients:", error);
        if (!active) return;
        setCloseDealClientOptions([]);
      } finally {
        if (active) setLoadingCloseDealClients(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [apt?.id, auth.userId, closeDealModalVisible, isStrictHostOwner]);

  useEffect(() => {
    if (!showLikedUsersSection || !canViewerSeeSection || !apt?.id || !auth.userId || auth.isGuest) {
      setLikedUsers([]);
      setLoadingLikedUsers(false);
      return;
    }

    let active = true;
    setLoadingLikedUsers(true);

    void (async () => {
      try {
        const currentUserId = auth.userId!;
        const [likesSnap, chatsForApartmentSnap, viewerChatsSnap, excludedUserIds, currentProfile, currentQuizSnap] = await Promise.all([
          getDocs(query(collection(db, "liked_apartments"), where("apartmentId", "==", apt.id))),
          getDocs(query(collection(db, "chats"), where("apartmentId", "==", apt.id))),
          getDocs(query(collection(db, "chats"), where("users", "array-contains", currentUserId))),
          getExcludedUserIds(currentUserId),
          getUserProfile(currentUserId),
          getDoc(doc(db, "quiz_answers", currentUserId)).catch(() => null),
        ]);

        if (!active) return;

        const rawCurrentQuiz = (currentQuizSnap?.exists() ? (currentQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {};
        const currentMatchProfile = currentProfile
          ? toMatchProfile(currentUserId, currentProfile, rawCurrentQuiz)
          : null;

        const existingChatByUser = new Map<string, { chatRoomId: string; status: string }>();
        const rejectedUserIds = new Set<string>();

        viewerChatsSnap.docs.forEach((chatDoc) => {
          const chatData = chatDoc.data() as FirestoreInquiryChatDoc;
          const users = Array.isArray(chatData.users) ? chatData.users : [];
          const counterpartId = users.find((uid) => uid !== currentUserId);
          if (!counterpartId) return;

          const hasRejectedState =
            chatData.status === "rejected" ||
            typeof chatData.rejectedBy === "string" ||
            (Array.isArray(chatData.rejections) && chatData.rejections.length > 0);

          if (hasRejectedState) {
            rejectedUserIds.add(counterpartId);
            return;
          }

          if (chatData.status === "pending" || chatData.status === "active") {
            existingChatByUser.set(counterpartId, {
              chatRoomId: chatDoc.id,
              status: chatData.status,
            });
          }
        });

        if (hostLookingForRoommate && hasAssignedBrokers && resolvedHostId && hostUserData) {
          const hostQuizSnap = await getDoc(doc(db, "quiz_answers", resolvedHostId)).catch(() => null);
          const hostMatchProfile = toMatchProfile(
            resolvedHostId,
            hostUserData,
            (hostQuizSnap?.exists() ? (hostQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {},
          );
          const compatibilityScore = currentMatchProfile
            ? calculateMatchScore(currentMatchProfile, hostMatchProfile)
            : null;
          const existingHostChat = existingChatByUser.get(resolvedHostId);
          const hostPhotos = Array.isArray(hostUserData.photos) ? hostUserData.photos : [];
          if (!active) return;
          setLikedUsers([{
            id: resolvedHostId,
            name: hostUserData.name?.trim() || t("common.values.unknown"),
            avatar: hostUserData.photoUrl || hostUserData.avatar || hostPhotos[0] || "",
            age: typeof hostUserData.age === "number" ? hostUserData.age : null,
            gender: hostUserData.gender?.trim() || t("common.values.nonBinary"),
            compatibilityScore,
            chatRoomId: existingHostChat?.chatRoomId ?? null,
            hasExistingChat: !!existingHostChat,
            sortKey: compatibilityScore ?? 0,
            isHostCandidate: true,
          }]);
          return;
        }

        const candidateTimestampByUser = new Map<string, number>();
        likesSnap.docs.forEach((likeDoc) => {
          const likeData = likeDoc.data() as FirestoreLikedApartmentDoc;
          const targetUserId = typeof likeData.userId === "string" ? likeData.userId : "";
          if (targetUserId) candidateTimestampByUser.set(targetUserId, toMillis(likeData.timestamp));
        });

        chatsForApartmentSnap.docs.forEach((chatDoc) => {
          const chatData = chatDoc.data() as FirestoreInquiryChatDoc;
          const users = Array.isArray(chatData.users) ? chatData.users : [];
          users.forEach((userId) => {
            if (!listingOwnerIds.has(userId)) {
              candidateTimestampByUser.set(userId, Math.max(candidateTimestampByUser.get(userId) ?? 0, toMillis(chatData.lastMessageTimestamp)));
            }
          });
        });

        const rows = await Promise.all(
          Array.from(candidateTimestampByUser.entries()).map(async ([targetUserId, interactionTimestamp]) => {
            if (targetUserId === currentUserId) return null;
            if (excludedUserIds.has(targetUserId) || rejectedUserIds.has(targetUserId)) return null;

            const [userSnap, settings, counterpartQuizSnap] = await Promise.all([
              getDoc(doc(db, "users", targetUserId)),
              getUserSettings(targetUserId).catch(() => null),
              getDoc(doc(db, "quiz_answers", targetUserId)).catch(() => null),
            ]);

            if (!userSnap.exists()) return null;

            const userData = userSnap.data() as FirestoreUserDoc;
            if (userData.is_broker === true) return null;
            const isCandidateNotLooking = userData.notLookingForRoommate === true || userData.not_looking_for_roommate === true;
            if (isCandidateNotLooking) return null;

            const isVisibleInUsers = userData.is_visible !== false;
            const isVisibleInSettings = settings?.privacy?.is_visible ?? true;
            if (!isVisibleInUsers || !isVisibleInSettings) return null;

            const rawCounterpartQuiz = (counterpartQuizSnap?.exists()
              ? (counterpartQuizSnap.data() as FirestoreQuizDoc).answers
              : {}) ?? {};
            const counterpartMatchProfile = toMatchProfile(targetUserId, userData, rawCounterpartQuiz);
            const compatibilityScore = currentMatchProfile
              ? calculateMatchScore(currentMatchProfile, counterpartMatchProfile)
              : null;
            const photos = Array.isArray(userData.photos) ? userData.photos : [];
            const existingChat = existingChatByUser.get(targetUserId);

            return {
              id: targetUserId,
              name: userData.name?.trim() || t("common.values.unknown"),
              avatar: userData.photoUrl || photos[0] || "",
              age: typeof userData.age === "number" ? userData.age : null,
              gender: userData.gender?.trim() || t("common.values.nonBinary"),
              compatibilityScore,
              chatRoomId: existingChat?.chatRoomId ?? null,
              hasExistingChat: !!existingChat,
              sortKey: compatibilityScore ?? interactionTimestamp,
            } satisfies LikedUserItem;
          }),
        );

        if (!active) return;
        setLikedUsers(
          rows
            .filter((row): row is LikedUserItem => !!row)
            .sort((left, right) => right.sortKey - left.sortKey),
        );
      } catch (error) {
        console.error("[ApartmentDetail] Failed to load liked users:", error);
        if (active) setLikedUsers([]);
      } finally {
        if (active) setLoadingLikedUsers(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [apt?.id, auth.isBroker, auth.isGuest, auth.userId, canViewerSeeSection, hasAssignedBrokers, hostLookingForRoommate, hostUserData, listingOwnerIds, resolvedHostId, showLikedUsersSection]);

  const allGalleryPhotos = useMemo(
    () => [...(dbImages.length > 0 ? dbImages : [apt?.image]), ...files2d3d].filter(
      (uri) => typeof uri === "string" && uri.trim().length > 0,
    ),
    [apt?.image, dbImages, files2d3d],
  );

  if (!apt) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{t("apartmentDetail.dataUnavailable")}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>{t("common.actions.back")}</Text>
        </Pressable>
      </View>
    );
  }

  if (checkingVisibility) {
    return <ApartmentDetailSkeleton />;
  }

  if (isListingExcluded) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{t("apartmentDetail.listingUnavailable")}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>{t("common.actions.back")}</Text>
        </Pressable>
      </View>
    );
  }

  const activeTags = (realTags.length > 0 ? realTags : [...(apt.tags || []), ...((apt as unknown as { amenities?: string[] }).amenities || [])]).map((entry) =>
    String(entry).toLowerCase().trim(),
  );
  const displayRooms = resolvedRooms ?? apt.rooms;
  const displayFloor = resolvedFloor ?? (apt.floor?.trim() || "");
  const displayPropertyCategory = resolvedPropertyCategory ?? (apt.propertyCategory?.trim() || "");
  const displayPropertyType = resolvedPropertyType ?? (apt.propertyType?.trim() || "");
  const displayOrientation = resolvedOrientation ?? "";
  const displayExtraDetails = resolvedExtraDetails ?? normalizeExtraDetailsMap(apt.extraDetails);
  const displayExtraInformation = resolvedExtraInformation ?? normalizeExtraInformation(apt.extraInformation);
  const shouldShowAdditionalInformation = !!(displayPropertyCategory || displayPropertyType || displayFloor || displayOrientation);
  const shouldShowExtraDetailsSection = !!displayExtraDetails && Object.keys(displayExtraDetails).length > 0;
  const shouldShowExtraInformationSection = !!displayExtraInformation;
  const hasApprovedClientPrice = typeof approvedClientPrice === "number" && approvedClientPrice > 0;
  const displayRentPrice = hasApprovedClientPrice ? approvedClientPrice : apt.rent;
  const sqmPrice = calculatePricePerSqm(displayRentPrice, apt.size);
  const extraInformationAvailabilityText = (() => {
    if (!displayExtraInformation) return null;
    if (displayExtraInformation.isImmediatelyAvailable) return "Άμεσα διαθέσιμο";
    if (!displayExtraInformation.availableFromDate) return null;

    const availableFromMillis = new Date(`${displayExtraInformation.availableFromDate}T00:00:00`).getTime();
    if (!Number.isNaN(availableFromMillis) && Date.now() >= availableFromMillis) {
      return "Άμεσα διαθέσιμο";
    }

    return `Διαθέσιμο από: ${formatIsoDate(displayExtraInformation.availableFromDate)}`;
  })();

  const images = allGalleryPhotos;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActivePage(page);
  };

  const contactHost = () => {
    const subject = encodeURIComponent(t("apartmentDetail.emailSubject", { title: apt!.title }));
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`);
  };

  const callHostPhone = () => {
    if (!hostPhoneNumber) return;

    const fullPhoneNumber = `+30${hostPhoneNumber.replace(/[^0-9]/g, "")}`;
    Linking.openURL(`tel:${fullPhoneNumber}`).catch((err) => {
      console.error("Failed to open phone dialer:", err);
    });
  };

  const startHostChat = async () => {
    const currentUid = auth.userId;
    let hostId = apt?.hostId || apt?.ownerId || null;

    if (!currentUid) {
      router.push("/auth-landing");
      return;
    }

    if (!hostId && apt?.id) {
      try {
        const apartmentSnap = await getDoc(doc(db, "apartments", apt.id));
        if (apartmentSnap.exists()) {
          const apartmentData = apartmentSnap.data() as FirestoreApartmentDoc;
          hostId = apartmentData.hostId || apartmentData.ownerId || null;
        }
      } catch (error) {
        console.error("[ApartmentDetail] Failed to resolve host from apartment document", {
          apartmentId: apt.id,
          error,
        });
      }
    }

    if (!hostId) {
      contactHost();
      return;
    }

    if (hostId === currentUid) {
      setActionModal({
        title: t("apartmentDetail.hostListingTitle"),
        description: t("apartmentDetail.hostListingMessage"),
      });
      return;
    }

    try {
      const chatRoomId = await getOrCreateHostChat({
        currentUserId: currentUid,
        hostId,
        apartmentId: apt.id,
        apartmentTitle: apt.title,
      });

      router.push({ pathname: "/chat/[id]", params: { id: hostId, chatRoomId } });
    } catch {
      setActionModal({
        title: t("apartmentDetail.chatUnavailableTitle"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    }
  };

  const handleToggleLike = async () => {
    if (auth.isGuest || !auth.userId) {
      router.push("/auth-landing");
      return;
    }

    if (!apt?.id) return;

    const previous = isLiked;
    setIsLiked(!previous);

    try {
      const next = await toggleApartmentLike(auth.userId, apt.id);
      setIsLiked(next);
    } catch {
      setIsLiked(previous);
      setActionModal({
        title: t("apartments.likeUpdateTitle"),
        description: t("apartments.likeUpdateMessage"),
      });
    }
  };

  const handleToggleLikedUsersSection = () => {
    if (auth.isGuest || !auth.userId) {
      router.push("/auth-landing");
      return;
    }
    setShowLikedUsersSection((current) => !current);
  };

  const handleEditListing = () => {
    if (!isListingOwner) return;

    router.push({
      pathname: "/create-listing",
      params: { mode: "edit", listingId: apt.id },
    } as never);
  };

  const handleDeleteListing = async () => {
    if (!isListingOwner || isDeletingListing) return;

    setIsDeletingListing(true);
    try {
      await deleteListingPermanently(apt.id);
      setDeleteModalVisible(false);
      router.replace("/apartments");
    } catch {
      setDeleteModalVisible(false);
      setActionModal({
        title: t("apartmentDetail.deleteFailedTitle"),
        description: t("apartmentDetail.deleteFailedMessage"),
      });
    } finally {
      setIsDeletingListing(false);
    }
  };

  const handleSaveInteraction = async () => {
    if (!auth.userId || !apt?.id || !newInteractionClientId || !newInteractionNote.trim() || isSavingInteraction) return;

    const client = availableClientOptions.find((option) => option.id === newInteractionClientId);
    if (!client) return;

    setIsSavingInteraction(true);
    try {
      await addPropertyInteraction({
        apartmentId: apt.id,
        clientId: client.id,
        clientName: client.name,
        type: newInteractionType,
        note: newInteractionNote.trim(),
        loggedByUserId: auth.userId,
      });
      setNewInteractionType("call");
      setNewInteractionClientId("");
      setNewInteractionNote("");
      setAddInteractionModalVisible(false);
    } catch (error) {
      console.error("[ApartmentDetail] Failed to save property interaction:", error);
      setActionModal({
        title: t("common.messages.tryAgain"),
        description: "Δεν ήταν δυνατή η αποθήκευση της αλληλεπίδρασης.",
      });
    } finally {
      setIsSavingInteraction(false);
    }
  };

  const handleToggleAndScrollToClients = () => {
    setIsClientsSectionOpen(true);
    if (clientsSectionY != null) {
      pageScrollRef.current?.scrollTo({ y: Math.max(0, clientsSectionY - spacing.lg), animated: true });
    }
  };

  const handleOpenLikedUserChat = async (item: LikedUserItem) => {
    if (!auth.userId || !apt?.id) {
      router.push("/auth-landing");
      return;
    }

    if (item.chatRoomId) {
      router.push({ pathname: "/chat/[id]", params: { id: item.id, chatRoomId: item.chatRoomId } });
      return;
    }

    setChatActionUserId(item.id);

    try {
      if (item.isHostCandidate) {
        const chatRoomId = await getOrCreateHostChat({
          currentUserId: auth.userId,
          hostId: item.id,
          apartmentId: apt.id,
          apartmentTitle: apt.title,
        });
        setLikedUsers((current) => current.map((entry) => entry.id === item.id ? { ...entry, chatRoomId, hasExistingChat: true } : entry));
        router.push({ pathname: "/chat/[id]", params: { id: item.id, chatRoomId } });
        return;
      }

      const chatRoomId = [auth.userId, item.id].sort().join("_");
      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          type: "roommate",
          status: "pending",
          users: [auth.userId, item.id],
          initiatedBy: auth.userId,
          apartmentId: apt.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setLikedUsers((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, chatRoomId, hasExistingChat: true }
            : entry,
        ),
      );

      router.push({ pathname: "/chat/[id]", params: { id: item.id, chatRoomId } });
    } catch (error) {
      console.error("[ApartmentDetail] Failed to create roommate chat:", error);
      setActionModal({
        title: t("apartmentDetail.chatUnavailableTitle"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    } finally {
      setChatActionUserId(null);
    }
  };

  const handleShareApartmentToMatch = async (item: ShareMatchItem) => {
    if (!auth.userId || !apt?.id || sendingShareChatId) return;

    setSendingShareChatId(item.chatRoomId);
    const apartmentData: SharedApartmentPayload = {
      id: apt.id,
      title: apt.title,
      rent: apt.rent,
      city: apt.city,
      area: apt.area,
      image: apt.image,
      rooms: apt.rooms,
      size: apt.size,
      tags: Array.isArray(apt.tags) ? apt.tags : [],
    };

    try {
      await addDoc(collection(db, "chats", item.chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "apartment_share",
        text: `[Αγγελία: ${apt.title}]`,
        apartmentData,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      await updateDoc(doc(db, "chats", item.chatRoomId), {
        lastMessageText: `[Αγγελία: ${apt.title}]`,
        lastMessage: `[Αγγελία: ${apt.title}]`,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShareModalVisible(false);
      setActionModal({
        title: "Το διαμέρισμα κοινοποιήθηκε!",
        description: "Η αγγελία στάλθηκε επιτυχώς στη συνομιλία.",
      });
    } catch (error) {
      console.error("[ApartmentDetail] Failed to share apartment:", error);
      setActionModal({
        title: t("common.messages.tryAgain"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    } finally {
      setSendingShareChatId(null);
    }
  };

  const handleOpenCloseDeal = () => {
    if (!isStrictHostOwner || !apt?.id) return;
    setSelectedDealClientId(rentedToUserId ?? null);
    setCloseDealModalVisible(true);
  };

  const handleConfirmCloseDeal = async () => {
    if (!isStrictHostOwner || !auth.userId || !apt?.id || !selectedDealClientId || isSubmittingCloseDeal) return;

    setIsSubmittingCloseDeal(true);
    try {
      await updateDoc(doc(db, "apartments", apt.id), {
        status: "closed_deal",
        rentedToUserId: selectedDealClientId,
        rentedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "apartments", apt.id, "closedDeals"), {
        apartmentId: apt.id,
        hostUserId: auth.userId,
        rentedToUserId: selectedDealClientId,
        closedAt: serverTimestamp(),
        source: "apartment_detail",
      });

      setApartmentStatus("closed_deal");
      setRentedToUserId(selectedDealClientId);
      setCloseDealModalVisible(false);
      setActionModal({
        title: "Η συμφωνία κατοχυρώθηκε!",
        description: "Η αγγελία αποκρύφθηκε.",
      });
    } catch (error) {
      console.error("[ApartmentDetail] Failed to close deal:", error);
      setActionModal({
        title: t("common.messages.tryAgain"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    } finally {
      setIsSubmittingCloseDeal(false);
    }
  };

  const handleReopenListing = async () => {
    if (!isStrictHostOwner || !apt?.id || isSubmittingCloseDeal) return;

    setIsSubmittingCloseDeal(true);
    try {
      await updateDoc(doc(db, "apartments", apt.id), {
        status: "active",
        rentedToUserId: null,
        rentedAt: null,
        updatedAt: serverTimestamp(),
      });

      setApartmentStatus("active");
      setRentedToUserId(null);
      setActionModal({
        title: "Η αγγελία ενεργοποιήθηκε ξανά",
        description: "Η αγγελία εμφανίζεται ξανά στην αναζήτηση.",
      });
    } catch (error) {
      console.error("[ApartmentDetail] Failed to re-activate listing:", error);
      setActionModal({
        title: t("common.messages.tryAgain"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    } finally {
      setIsSubmittingCloseDeal(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.backOverlay, { top: insets.top + spacing.sm }]}
        onPress={() => router.back()}
        hitSlop={10}
        testID="apartment-detail-back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>

      {!auth.isGuest ? (
        <Pressable
          style={[styles.noteOverlay, { top: insets.top + spacing.sm }]}
          onPress={() =>
            router.push({
              pathname: "/apartment-note",
              params: {
                data: JSON.stringify(apt),
                fromList: "false",
                isOwner: String(isListingOwner),
              },
            } as never)
          }
          hitSlop={10}
          testID="apartment-detail-note"
        >
          <Ionicons name="journal-outline" size={20} color={colors.onSurface} />
        </Pressable>
      ) : null}

      <ScrollView
        ref={pageScrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {isOffMarketListing ? (
          <View style={styles.clientOnlyBanner} testID="apartment-detail-client-only-banner">
            <Ionicons name="lock-closed-outline" size={16} color={colors.onBrand} />
            <Text style={styles.clientOnlyBannerText}>Αποκλειστική Προεπισκόπηση (Client-only view)</Text>
          </View>
        ) : null}
        <View style={[styles.carouselWrap, images.length === 0 && styles.carouselWrapPlaceholder]}>
          {images.length > 0 ? (
            <>
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                testID="apartment-detail-carousel"
              >
                {images.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.carouselSlide}>
                    <Image source={{ uri }} style={styles.carouselImage} contentFit="cover" transition={200} />
                  </View>
                ))}
              </ScrollView>

              {images.length > 1 && (
                <View style={styles.dotRow}>
                  {images.map((_, index) => (
                    <View key={`dot-${index}`} style={[styles.dot, index === activePage && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderContainer} testID="apartment-detail-placeholder">
              <View style={styles.placeholderIconContainer}>
                <Ionicons name="images-outline" size={44} color={colors.brand} style={styles.placeholderSubIcon} />
              </View>
              <Text style={styles.placeholderText}>CampuStay</Text>
              <Text style={styles.placeholderSubText}>{t("apartmentDetail.noPhotosAvailable")}</Text>
            </View>
          )}

          <WatermarkBadge
            config={resolvedWatermarkConfig ?? apt.watermarkConfig}
            position="bottom-left"
          />

          <View style={[styles.rentBadge, hasApprovedClientPrice && styles.rentBadgeApproved]}>
            {hasApprovedClientPrice ? (
              <>
                <Text style={styles.approvedRentLabel}>Εγκεκριμένη τιμή για εσένα</Text>
                <View style={styles.approvedRentValueRow}>
                  <Text style={[styles.rentValue, styles.rentValueApproved]}>{CURRENCY}{displayRentPrice}</Text>
                  <Text style={[styles.rentPer, styles.rentPerApproved]}>{t("common.format.perMonthShort")}</Text>
                </View>
                <Text style={styles.originalRentText}>{`Αρχική: ${CURRENCY}${apt.rent}${t("common.format.perMonthShort")}`}</Text>
              </>
            ) : (
              <>
                <Text style={styles.rentValue}>{CURRENCY}{displayRentPrice}</Text>
                <Text style={styles.rentPer}>{t("common.format.perMonthShort")}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.aptTitle}>{apt.title || t("createListing.listingTitle", { area: apt.area })}</Text>

            {isListingOwner ? (
              <View style={styles.titleActions}>
                {isStrictHostOwner ? (
                  <Pressable
                    style={[
                      styles.titleActionBtn,
                      apartmentStatus === "closed_deal" ? styles.dealActionBtnClosed : styles.dealActionBtnActive,
                    ]}
                    onPress={() => {
                      if (apartmentStatus === "closed_deal") {
                        setShowReopenDealConfirm(true);
                      } else {
                        handleOpenCloseDeal();
                      }
                    }}
                    testID={`apartment-detail-close-deal-btn-${apt.id}`}
                    hitSlop={8}
                  >
                    {apartmentStatus === "closed_deal" ? (
                      <Ionicons name="eye-outline" size={20} color={colors.onSurfaceTertiary} />
                    ) : (
                      <MaterialCommunityIcons name="handshake-outline" size={20} color={colors.onBrand} />
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.titleActionBtn, isClientsSectionOpen && styles.titleActionBtnActive]}
                  onPress={handleToggleAndScrollToClients}
                  testID={`apartment-detail-inquiries-btn-${apt.id}`}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.onSurface} />
                </Pressable>
                <Pressable
                  style={styles.titleActionBtn}
                  onPress={() => setDeleteModalVisible(true)}
                  testID={`apartment-detail-delete-${apt.id}`}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.onSurface} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.titleActions}>
                {canViewLikedUsers && (
                  <Pressable
                    style={[styles.titleActionBtn, showLikedUsersSection && styles.titleActionBtnActive]}
                    onPress={handleToggleLikedUsersSection}
                    testID={`apartment-detail-liked-users-toggle-${apt.id}`}
                  >
                    <Text style={styles.doubleHeartText}>💕</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.titleActionBtn}
                  onPress={() => setShareModalVisible(true)}
                  testID={`apartment-detail-share-${apt.id}`}
                >
                  <Ionicons name="share-social-outline" size={20} color={colors.onSurface} />
                </Pressable>
                <Pressable
                  style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
                  onPress={handleToggleLike}
                  testID={`apartment-detail-like-${apt.id}`}
                >
                  <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={16} color={colors.onSurfaceTertiary} />
            <Text style={styles.locText}>{apt.area}, {apt.city}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Ionicons name="home-outline" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.statText}>{t("common.format.roomCount", { count: displayRooms })}</Text>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="expand-outline" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.statText}>{`${apt.size} ${t("common.format.squareMetersShort")}`}</Text>
            </View>
            {displayFloor ? (
              <View style={styles.statPill}>
                <Ionicons color={colors.onBrandTertiary} name="layers-outline" size={14} />
                <Text style={styles.statText}>{displayFloor}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {files2d3d.length > 0 ? (
          <View style={styles.section} testID="apartment-detail-2d-3d-files-section">
            <View style={styles.sectionHeadingRow}>
              <Ionicons name="cube-outline" size={20} color={colors.onSurface} />
              <Text style={styles.sectionTitle}>Κατόψεις &amp; Αρχιτεκτονικά αρχεία</Text>
            </View>
            <View style={styles.detailFilesList}>
              {files2d3d.map((uri, index) => (
                <Pressable
                  key={`${uri}-${index}`}
                  style={styles.detailFileBar}
                  onPress={() => setSelectedFileModal({ title: `Αρχείο ${index + 1}`, uri })}
                  testID={`apartment-detail-2d-3d-file-${index}`}
                >
                  <View style={styles.detailFileLabel}>
                    <Ionicons name="image-outline" size={18} color={colors.brand} />
                    <Text style={styles.detailFileText}>{`Αρχείο ${index + 1}`}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {canViewerSeeSection && showLikedUsersSection ? (
          <View style={styles.section} testID="apartment-detail-liked-users-section">
            <Text style={styles.sectionTitle}>Ενδιαφερόμενοι Συγκάτοικοι</Text>

            <View style={styles.inquiriesList}>
              {loadingLikedUsers ? (
                <InquiryCandidatesSkeleton />
              ) : likedUsers.length ? (
                likedUsers.map((item) => (
                  <View key={item.id} style={styles.likedUserCard}>
                    <View style={styles.inquiryAvatarWrap}>
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.inquiryAvatarImage} contentFit="cover" />
                      ) : (
                        <DefaultProfileAvatar size={50} iconSize={22} />
                      )}
                    </View>

                    <View style={styles.likedUserContent}>
                      <Text style={styles.inquiryName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.likedUserPills}>
                        <View style={styles.statPill}>
                          <Text style={styles.statText}>{item.age != null ? `${item.age}` : "--"}</Text>
                        </View>
                        <View style={styles.statPill}>
                          <Text style={styles.statText}>{item.gender}</Text>
                        </View>
                        <View style={styles.statPill}>
                          <Text style={styles.statText}>{item.compatibilityScore != null ? `${item.compatibilityScore}% Match` : "-- Match"}</Text>
                        </View>
                      </View>
                    </View>

                    <Pressable
                      style={styles.likedUserActionBtn}
                      onPress={() => {
                        void handleOpenLikedUserChat(item);
                      }}
                      disabled={chatActionUserId === item.id}
                      testID={`apartment-detail-liked-user-action-${item.id}`}
                    >
                      {chatActionUserId === item.id ? (
                        <ActivityIndicator size="small" color={colors.onBrand} />
                      ) : (
                        <Ionicons
                          name={item.hasExistingChat ? "paper-plane-outline" : "add"}
                          size={20}
                          color={colors.onBrand}
                        />
                      )}
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={styles.inquiriesEmptyState}>
                  <Text style={styles.inquiriesEmptyText}>Δεν υπάρχουν άλλοι διαθέσιμοι ενδιαφερόμενοι χρήστες</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {isListingOwner && auth.isBroker ? (
          <View style={styles.section} testID="apartment-detail-client-matches-section">
            <Text style={styles.sectionTitle}>Clients</Text>
            {loadingClients ? (
              <InquiryCandidatesSkeleton />
            ) : matchedClients.length === 0 ? (
              <View style={styles.crmEmptyState}>
                <Text style={styles.clientMatchesEmptyText}>Δεν βρέθηκαν συμβατοί πελάτες για αυτό το ακίνητο.</Text>
              </View>
            ) : (
              <View style={styles.clientsList}>
                {matchedClients.map((client) => (
                  <View key={client.clientUserId} style={styles.clientMatchRow}>
                    {client.clientAvatar ? (
                      <Image source={{ uri: client.clientAvatar }} style={styles.clientAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.clientAvatarFallback}>
                        <Ionicons color={colors.onSurfaceTertiary} name="person" size={20} />
                      </View>
                    )}
                    <Text numberOfLines={1} style={styles.clientName}>{client.clientName}</Text>
                    <View style={styles.matchBadge}>
                      <Text style={styles.matchBadgeText}>{`${client.compatibilityScore}% Match`}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {isListingOwner ? (
          <View style={styles.propertyInteractionCard} testID="apartment-interaction-log">
            <View style={styles.interactionHeaderRow}>
              <View style={styles.interactionTitleWrap}>
                <Ionicons color={colors.brand} name="newspaper-outline" size={20} />
                <Text style={styles.interactionCardTitle}>Ιστορικό Αλληλεπιδράσεων</Text>
              </View>
              <Pressable
                style={styles.addInteractionBtn}
                onPress={() => {
                  if (availableClientOptions.length > 0 && !newInteractionClientId) {
                    setNewInteractionClientId(availableClientOptions[0].id);
                  }
                  setAddInteractionModalVisible(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Προσθήκη αλληλεπίδρασης"
                testID="apartment-detail-add-interaction-btn"
              >
                <Ionicons color={colors.onBrand} name="add" size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.clientFilterChipsWrap}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                style={[styles.clientFilterChip, selectedClientFilter === "all" && styles.clientFilterChipActive]}
                onPress={() => setSelectedClientFilter("all")}
                testID="apartment-detail-interaction-client-all"
              >
                <Text style={[styles.clientFilterChipText, selectedClientFilter === "all" && styles.clientFilterChipTextActive]}>
                  Όλοι οι πελάτες
                </Text>
              </Pressable>
              {availableClientOptions.map((client) => {
                const isSelected = selectedClientFilter === client.id;
                return (
                  <Pressable
                    key={client.id}
                    style={[styles.clientFilterChip, isSelected && styles.clientFilterChipActive]}
                    onPress={() => setSelectedClientFilter(isSelected ? "all" : client.id)}
                    testID={`apartment-detail-interaction-client-${client.id}`}
                  >
                    <Text style={[styles.clientFilterChipText, isSelected && styles.clientFilterChipTextActive]}>
                      {client.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.metricsSummaryBar}>
              <Pressable
                style={[styles.metricCounterItem, selectedTypeFilter === "call" && styles.metricCounterItemActive]}
                onPress={() => setSelectedTypeFilter(selectedTypeFilter === "call" ? "all" : "call")}
                testID="apartment-detail-interaction-filter-call"
              >
                <Ionicons color="#10B981" name="call-outline" size={16} />
                <Text style={styles.metricCounterNumber}>{interactionMetrics.calls}</Text>
                <Text style={styles.metricCounterLabel}>Κλήσεις</Text>
              </Pressable>
              <View style={styles.metricCounterDivider} />
              <Pressable
                style={[styles.metricCounterItem, selectedTypeFilter === "showing" && styles.metricCounterItemActive]}
                onPress={() => setSelectedTypeFilter(selectedTypeFilter === "showing" ? "all" : "showing")}
                testID="apartment-detail-interaction-filter-showing"
              >
                <Ionicons color={colors.brand} name="key-outline" size={16} />
                <Text style={styles.metricCounterNumber}>{interactionMetrics.showings}</Text>
                <Text style={styles.metricCounterLabel}>Υποδείξεις</Text>
              </Pressable>
              <View style={styles.metricCounterDivider} />
              <Pressable
                style={[styles.metricCounterItem, selectedTypeFilter === "comment" && styles.metricCounterItemActive]}
                onPress={() => setSelectedTypeFilter(selectedTypeFilter === "comment" ? "all" : "comment")}
                testID="apartment-detail-interaction-filter-comment"
              >
                <Ionicons color="#F59E0B" name="chatbubble-ellipses-outline" size={16} />
                <Text style={styles.metricCounterNumber}>{interactionMetrics.comments}</Text>
                <Text style={styles.metricCounterLabel}>Σχόλια</Text>
              </Pressable>
              <View style={styles.metricCounterDivider} />
              <Pressable
                style={[styles.metricCounterItem, selectedTypeFilter === "email" && styles.metricCounterItemActive]}
                onPress={() => setSelectedTypeFilter(selectedTypeFilter === "email" ? "all" : "email")}
                testID="apartment-detail-interaction-filter-email"
              >
                <Ionicons color="#38BDF8" name="mail-outline" size={16} />
                <Text style={styles.metricCounterNumber}>{interactionMetrics.emails}</Text>
                <Text style={styles.metricCounterLabel}>Emails</Text>
              </Pressable>
            </View>

            <View style={styles.itemLogList}>
              {visibleInteractions.length === 0 ? (
                <Text style={styles.emptyLogText}>Δεν υπάρχουν καταγεγραμμένες αλληλεπιδράσεις για τα επιλεγμένα κριτήρια.</Text>
              ) : (
                visibleInteractions.map((item) => {
                  const typeTone = getTypeMeta(item.type, colors);
                  return (
                    <View key={item.id} style={styles.logEntryRow}>
                      <View style={[styles.logTypeIconWrap, { backgroundColor: typeTone.bg }]}>
                        <Ionicons color={typeTone.color} name={typeTone.icon} size={15} />
                      </View>
                      <View style={styles.logEntryContent}>
                        <View style={styles.logEntryTopLine}>
                          <Text style={styles.logClientName} numberOfLines={1}>{item.clientName}</Text>
                          <Text style={styles.logDateText}>{formatDateTime(item.createdAtMillis)}</Text>
                        </View>
                        <Text style={styles.logNoteText}>{item.note || typeTone.label}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("apartmentDetail.amenitiesTitle")}</Text>
          <View style={styles.amenitiesGrid}>
            {AMENITIES.map((amenity) => {
              const active = amenity.tagMatch ? amenity.tagMatch.some((entry) => activeTags.includes(entry.toLowerCase())) : false;

              return (
                <View key={amenity.key} style={[styles.amenityCell, active && styles.amenityCellActive]} testID={`amenity-${amenity.key}`}>
                  <Ionicons name={amenity.icon} size={22} color={active ? colors.onBrandTertiary : colors.onSurfaceTertiary} />
                  <Text style={[styles.amenityLabel, active && styles.amenityLabelActive]}>{t(amenity.label)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {isListingOwner ? (
          <View
            style={styles.crmSectionContainer}
            onLayout={(event) => setClientsSectionY(event.nativeEvent.layout.y)}
            testID="apartment-detail-clients-section"
          >
            <Pressable
              style={styles.extraDetailsHeaderRow}
              onPress={() => setIsClientsSectionOpen((previous) => !previous)}
              testID="apartment-detail-clients-toggle"
            >
              <Text style={styles.sectionTitle}>{auth.isBroker ? "Ενδιαφερόμενοι Πελάτες (CRM)" : "Ενδιαφερόμενοι"}</Text>
              <Ionicons
                name={isClientsSectionOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.onSurface}
              />
            </Pressable>
            {isClientsSectionOpen ? (
              <View style={styles.clientsContentWrap}>
            {auth.isBroker ? (
              loadingBrokerPropertyDealLeads ? (
                <InquiryCandidatesSkeleton />
              ) : brokerPropertyDealLeads.length === 0 ? (
                <View style={styles.crmEmptyState}>
                  <Text style={styles.crmEmptyStateText}>Δεν υπάρχουν ακόμη ενδιαφερόμενοι πελάτες για αυτό το ακίνητο</Text>
                </View>
              ) : (
                brokerPropertyDealLeads.map((client) => {
                  const hasChat = Boolean(client.chatRoomId) && (client.messageCount > 0 || Boolean(client.lastMessageText.trim()));
                  const stageTone = getBrokerPropertyStageTone(client.pipelineStage, colors);
                  return (
                    <View key={client.id} style={styles.clientLeadRow} testID={`apartment-detail-crm-client-${client.id}`}>
                    <View style={styles.clientInfoWrap}>
                      {client.avatar ? (
                        <Image source={{ uri: client.avatar }} style={styles.clientAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.clientAvatar, styles.clientAvatarFallback]}>
                          <Ionicons color={colors.onSurfaceTertiary} name="person-outline" size={18} />
                          </View>
                        )}
                        <View style={styles.clientInlineMetaRow}>
                        <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
                        <View style={[styles.stagePill, { backgroundColor: stageTone.backgroundColor }]}>
                          <Text style={styles.stagePillText}>{getBrokerPropertyStageLabel(client.pipelineStage)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.crmActionButtonsRow}>
                      {hasChat ? (
                        <Pressable
                          style={[styles.crmActionBtn, styles.crmActionBtnActive]}
                          onPress={() => router.push({ pathname: "/chat/[id]", params: { id: client.id, chatRoomId: client.chatRoomId } })}
                          accessibilityRole="button"
                          accessibilityLabel={`Άνοιγμα συνομιλίας με ${client.name}`}
                          testID={`apartment-detail-crm-chat-${client.id}`}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.crmActionBtn}
                        onPress={() => router.push({ pathname: "/broker-client-detail", params: { clientUserId: client.id } })}
                        accessibilityRole="button"
                        accessibilityLabel={`Άνοιγμα προφίλ πελάτη ${client.name}`}
                        testID={`apartment-detail-crm-client-detail-${client.id}`}
                      >
                        <Ionicons name="open-outline" size={18} color={colors.onSurface} />
                      </Pressable>
                    </View>
                  </View>
                );
                })
              )
            ) : (
              loadingHostInquiringClients ? (
                <InquiryCandidatesSkeleton />
              ) : hostInquiringClients.length === 0 ? (
                <View style={styles.crmEmptyState}>
                  <Text style={styles.crmEmptyStateText}>Δεν υπάρχουν ακόμη ενδιαφερόμενοι πελάτες για αυτό το ακίνητο</Text>
                </View>
              ) : (
                hostInquiringClients.map((client) => (
                  <View key={client.id} style={styles.clientLeadRow} testID={`host-client-row-${client.id}`}>
                    <View style={styles.clientInfoWrap}>
                      {client.avatar ? (
                        <Image source={{ uri: client.avatar }} style={styles.clientAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.clientAvatar, styles.clientAvatarFallback]}>
                          <Ionicons color={colors.onSurfaceTertiary} name="person-outline" size={18} />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.clientName}>{client.name}</Text>
                    </View>
                    <View style={styles.crmActionButtonsRow}>
                      {client.compatibilityScore != null ? (
                        <View style={styles.matchBadge} testID={`host-client-match-${client.id}`}>
                          <Ionicons color={colors.brand} name="sparkles" size={12} />
                          <Text style={styles.matchBadgeText}>{`${client.compatibilityScore}%`}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={[styles.crmActionBtn, styles.crmActionBtnActive]}
                        onPress={() => router.push({ pathname: "/chat/[id]", params: { id: client.id, chatRoomId: client.chatRoomId } })}
                        accessibilityRole="button"
                        accessibilityLabel={`Άνοιγμα συνομιλίας με ${client.name}`}
                        testID={`host-client-chat-btn-${client.id}`}
                      >
                        <Ionicons color={colors.brand} name="chatbubble-ellipses-outline" size={18} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )
            )}
              </View>
            ) : null}
          </View>
        ) : null}

        {shouldShowExtraDetailsSection ? (
          <View style={styles.section}>
            <Pressable
              style={styles.extraDetailsHeaderRow}
              onPress={() => setIsExtraDetailsOpen((prev) => !prev)}
              testID="apartment-detail-extra-details-toggle"
            >
              <Text style={styles.sectionTitle}>Παραπάνω λεπτομέρειες</Text>
              <Ionicons
                name={isExtraDetailsOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.onSurface}
              />
            </Pressable>

            {isExtraDetailsOpen ? (
              <View style={styles.extraDetailsCard}>
                {EXTRA_DETAIL_CATEGORIES.map((category) => {
                  const items = category.items
                    .map((itemKey) => {
                      const value = displayExtraDetails?.[itemKey];
                      if (value !== true && value !== false) return null;

                      return { itemKey, value };
                    })
                    .filter((item): item is { itemKey: string; value: boolean } => item !== null);

                  if (!items.length) return null;

                  return (
                    <View key={category.title} style={styles.extraDetailsCategoryBlock}>
                      <Text style={styles.extraDetailsCategoryTitle}>{category.title}</Text>
                      <View style={styles.extraDetailsItemList}>
                        {items.map(({ itemKey, value }) => {
                          const isPositive = value === true;

                          return (
                            <View key={itemKey} style={styles.extraDetailsItemRow}>
                              <View style={styles.extraDetailsItemTextWrap}>
                                <Ionicons
                                  name={isPositive ? "checkmark-circle-outline" : "close-circle-outline"}
                                  size={18}
                                  color={isPositive ? colors.brand : colors.error}
                                />
                                <Text
                                  style={[
                                    styles.extraDetailsItemLabel,
                                    !isPositive && styles.extraDetailsItemLabelMuted,
                                  ]}
                                >
                                  {itemKey}
                                </Text>
                              </View>
                              {!isPositive ? <Text style={styles.extraDetailsItemNegativeMark}>—</Text> : null}
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
        ) : null}

        {shouldShowAdditionalInformation ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Χαρακτηριστικά ακινήτου</Text>
            <View style={styles.detailMetaCard}>
              {displayPropertyCategory ? (
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailMetaLabel}>Κατηγορία ακινήτου</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statText}>{displayPropertyCategory}</Text>
                  </View>
                </View>
              ) : null}

              {displayPropertyType ? (
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailMetaLabel}>Είδος ακινήτου</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statText}>{displayPropertyType}</Text>
                  </View>
                </View>
              ) : null}

              {displayFloor ? (
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailMetaLabel}>Όροφος</Text>
                  <View style={styles.statPill}>
                    <Ionicons color={colors.onBrandTertiary} name="layers-outline" size={14} />
                    <Text style={styles.statText}>{displayFloor}</Text>
                  </View>
                </View>
              ) : null}

              {displayOrientation ? (
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailMetaLabel}>Προσανατολισμός</Text>
                  <View style={styles.statPill}>
                    <Text style={styles.statText}>{displayOrientation}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("apartmentDetail.aboutTitle")}</Text>
          <View style={styles.descBox}>
            {apt.description || (apt as unknown as { about?: string }).about ? (
              <Text style={styles.descText}>{realDescription || apt.description || (apt as unknown as { about?: string }).about}</Text>
            ) : (
              <>
                <Text style={styles.descText}>
                  {t("apartmentDetail.descriptionSummary", {
                    size: apt.size,
                    area: apt.area,
                    city: apt.city,
                    roomText: apt.rooms > 1 ? t("common.format.roomCount", { count: apt.rooms }) : t("apartmentDetail.privateRoom"),
                    currency: CURRENCY,
                    rent: apt.rent,
                  })}
                </Text>
                <Text style={styles.descText}>
                  {t("apartmentDetail.descriptionRules", {
                    utilitiesText: apt.tags.includes("bills_included")
                      ? t("apartmentDetail.utilitiesIncluded")
                      : t("apartmentDetail.utilitiesSeparate"),
                  })}
                </Text>
              </>
            )}

            {apt.tags.length > 0 ? (
              <View style={styles.tagRow}>
                {apt.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{translateApartmentTag(tag)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("common.labels.location")}</Text>
          <ApartmentLocationMap
            latitude={apt.latitude}
            longitude={apt.longitude}
            cityCoordinates={cityCoordinates}
            hasExactLocation={apt.hasExactLocation === true}
            height={300}
          />
          <View style={styles.locationMetaRow}>
            <Ionicons
              name={apt.hasExactLocation ? "location-sharp" : "map-outline"}
              size={16}
              color={colors.onSurfaceTertiary}
            />
            <Text style={styles.locationMetaText} numberOfLines={2}>
              {apt.hasExactLocation && apt.address ? apt.address : `${apt.area}, ${apt.city}`}
            </Text>
          </View>
        </View>

        {showPhoneNumber && hostPhoneNumber.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Στοιχεία Επικοινωνίας</Text>
            <Pressable style={styles.phoneContactCard} onPress={callHostPhone} testID="apartment-detail-phone-contact">
              <View style={styles.phoneContactIconWrap}>
                <Ionicons name="call-outline" size={18} color={colors.onBrand} />
              </View>
              <View style={styles.phoneContactTextWrap}>
                <Text style={styles.phoneContactLabel}>Τηλέφωνο επικοινωνίας</Text>
                <Text style={styles.phoneContactValue}>{`+30 ${hostPhoneNumber}`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        ) : null}

        {shouldShowExtraInformationSection ? (
          <View style={styles.section}>
            <Pressable
              style={styles.extraDetailsHeaderRow}
              onPress={() => setIsExtraInformationOpen((prev) => !prev)}
              testID="apartment-detail-extra-information-toggle"
            >
              <Text style={styles.sectionTitle}>Επιπλέον πληροφορίες</Text>
              <Ionicons
                name={isExtraInformationOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.onSurface}
              />
            </Pressable>

            {isExtraInformationOpen ? (
              <View style={styles.extraInformationCard}>
                {sqmPrice > 0 ? (
                  <View style={styles.sqmPricePill}>
                    <Ionicons name="resize-outline" size={14} color={colors.onBrandTertiary} />
                    <Text style={styles.sqmPricePillText}>{`${sqmPrice.toFixed(1)} € / τ.μ.`}</Text>
                  </View>
                ) : null}

                <View style={styles.extraInformationRow}>
                  <Text style={styles.extraInformationLabel}>🛋️ Living Rooms</Text>
                  <Text style={styles.extraInformationValue}>{displayExtraInformation?.livingRooms}</Text>
                </View>
                <View style={styles.extraInformationRow}>
                  <Text style={styles.extraInformationLabel}>🚿 Bathrooms</Text>
                  <Text style={styles.extraInformationValue}>{displayExtraInformation?.bathrooms}</Text>
                </View>
                <View style={styles.extraInformationRow}>
                  <Text style={styles.extraInformationLabel}>🍳 Kitchens</Text>
                  <Text style={styles.extraInformationValue}>{displayExtraInformation?.kitchens}</Text>
                </View>
                {displayExtraInformation?.buildYear ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🏗️ Construction Year</Text>
                    <Text style={styles.extraInformationValue}>{displayExtraInformation.buildYear}</Text>
                  </View>
                ) : null}
                {displayExtraInformation?.renovationYear ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🔨 Renovation Year</Text>
                    <Text style={styles.extraInformationValue}>{displayExtraInformation.renovationYear}</Text>
                  </View>
                ) : null}
                {typeof displayExtraInformation?.commonExpenses === "number" ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>💶 Monthly Common Expenses</Text>
                    <Text style={styles.extraInformationValue}>{`${displayExtraInformation.commonExpenses}${CURRENCY}`}</Text>
                  </View>
                ) : null}
                <View style={styles.extraInformationRow}>
                  <Text style={styles.extraInformationLabel}>🪜 Levels</Text>
                  <Text style={styles.extraInformationValue}>{displayExtraInformation?.levels}</Text>
                </View>
                {displayExtraInformation?.heatingSystem ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🪟 Heating System</Text>
                    <Text style={styles.extraInformationValue}>{displayExtraInformation.heatingSystem}</Text>
                  </View>
                ) : null}
                {displayExtraInformation?.energyClass ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>⚡ Energy Class</Text>
                    <Text style={styles.extraInformationValue}>{displayExtraInformation.energyClass}</Text>
                  </View>
                ) : null}
                {displayExtraInformation?.windowFrames ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🪟 Window Frames</Text>
                    <Text style={styles.extraInformationValue}>{displayExtraInformation.windowFrames}</Text>
                  </View>
                ) : null}
                {extraInformationAvailabilityText ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>📅 Availability Status</Text>
                    <Text style={styles.extraInformationValue}>{extraInformationAvailabilityText}</Text>
                  </View>
                ) : null}
                {publishedAtMillis ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🕒 Ημερομηνία δημοσίευσης</Text>
                    <Text style={styles.extraInformationValue}>{formatDateTime(publishedAtMillis)}</Text>
                  </View>
                ) : null}
                {updatedAtMillis ? (
                  <View style={styles.extraInformationRow}>
                    <Text style={styles.extraInformationLabel}>🕒 Τελευταία τροποποίηση</Text>
                    <Text style={styles.extraInformationValue}>{formatDateTime(updatedAtMillis)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.contactBtn, pressed && styles.contactBtnPressed]}
          onPress={
            isListingOwner
              ? handleEditListing
              : auth.isGuest
                ? () => router.push("/auth-landing")
                : startHostChat
          }
          testID={isListingOwner ? "apartment-detail-edit" : "apartment-detail-contact"}
        >
          <Ionicons name={isListingOwner ? "create-outline" : "mail-outline"} size={20} color={colors.onBrand} />
          <Text style={styles.contactBtnText}>
            {isListingOwner
              ? t("apartmentDetail.editListing")
              : auth.isGuest
                ? t("apartmentDetail.signInToContact")
                : t("common.cta.contactHost")}
          </Text>
        </Pressable>
      </View>

      <CenteredActionModal
        visible={deleteModalVisible}
        title={t("apartmentDetail.deleteListingTitle")}
        description={t("apartmentDetail.deleteListingMessage")}
        onDismiss={() => {
          if (!isDeletingListing) setDeleteModalVisible(false);
        }}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.back"),
            variant: "muted",
            iconName: "arrow-back-outline",
            onPress: () => setDeleteModalVisible(false),
          },
          {
            label: t("common.actions.delete"),
            variant: "danger",
            iconName: "trash-outline",
            onPress: () => {
              void handleDeleteListing();
            },
          },
        ]}
        testID="apartment-detail-delete-modal"
      />

      <CenteredActionModal
        visible={showReopenDealConfirm}
        title="Επαναφορά αγγελίας"
        description="Θέλεις να ξαναενεργοποιήσεις την αγγελία ώστε να εμφανίζεται ξανά στην αναζήτηση;"
        onDismiss={() => {
          if (!isSubmittingCloseDeal) setShowReopenDealConfirm(false);
        }}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "muted",
            iconName: "close-outline",
            onPress: () => setShowReopenDealConfirm(false),
          },
          {
            label: "Ενεργοποίηση",
            iconName: "refresh-circle-outline",
            onPress: () => {
              setShowReopenDealConfirm(false);
              void handleReopenListing();
            },
          },
        ]}
        testID="apartment-detail-reopen-deal-modal"
      />

      <Modal
        transparent
        animationType="fade"
        visible={!!selectedFileModal}
        onRequestClose={() => setSelectedFileModal(null)}
      >
        <View style={styles.fileViewerBackdrop}>
          <View style={styles.fileViewerCard}>
            <View style={styles.fileViewerHeader}>
              <Text style={styles.fileViewerTitle}>{selectedFileModal?.title}</Text>
              <Pressable onPress={() => setSelectedFileModal(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {selectedFileModal ? <Image source={{ uri: selectedFileModal.uri }} style={styles.fileViewerImage} contentFit="contain" /> : null}
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={addInteractionModalVisible}
        onRequestClose={() => {
          if (!isSavingInteraction) setAddInteractionModalVisible(false);
        }}
      >
        <View style={styles.shareModalBackdrop}>
          <View style={styles.interactionModalCard}>
            <View style={styles.interactionModalTitleRow}>
              <Text style={styles.interactionModalTitle}>Νέα αλληλεπίδραση</Text>
              <Pressable
                onPress={() => setAddInteractionModalVisible(false)}
                disabled={isSavingInteraction}
                hitSlop={8}
                testID="apartment-detail-add-interaction-close"
              >
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.interactionModalScroll}
              contentContainerStyle={styles.interactionModalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.interactionModalSectionLabel}>Πελάτης</Text>
              {availableClientOptions.length === 0 ? (
                <View style={styles.interactionModalEmptyState}>
                  <Text style={styles.shareModalEmptyText}>Δεν υπάρχουν διαθέσιμοι πελάτες για καταγραφή.</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.clientFilterChipsWrap}
                >
                  {availableClientOptions.map((client) => {
                    const isSelected = newInteractionClientId === client.id;
                    return (
                      <Pressable
                        key={client.id}
                        style={[styles.clientFilterChip, isSelected && styles.clientFilterChipActive]}
                        onPress={() => setNewInteractionClientId(client.id)}
                        testID={`apartment-detail-add-interaction-client-${client.id}`}
                      >
                        <Text style={[styles.clientFilterChipText, isSelected && styles.clientFilterChipTextActive]}>
                          {client.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={styles.interactionModalSectionLabel}>Τύπος</Text>
              <View style={styles.interactionTypeChipsWrap}>
                {INTERACTION_TYPES.map((type) => {
                  const typeTone = getTypeMeta(type, colors);
                  const isSelected = newInteractionType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.interactionTypeChip, isSelected && styles.interactionTypeChipActive]}
                      onPress={() => setNewInteractionType(type)}
                      testID={`apartment-detail-add-interaction-type-${type}`}
                    >
                      <Ionicons name={typeTone.icon} size={16} color={isSelected ? colors.brand : typeTone.color} />
                      <Text style={[styles.interactionTypeChipText, isSelected && styles.interactionTypeChipTextActive]}>
                        {typeTone.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.interactionModalSectionLabel}>Σημείωση</Text>
              <TextInput
                value={newInteractionNote}
                onChangeText={setNewInteractionNote}
                style={styles.interactionNoteInput}
                placeholder="Προσθέστε λεπτομέρειες..."
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline
                textAlignVertical="top"
                maxLength={1000}
                testID="apartment-detail-add-interaction-note"
              />
            </ScrollView>

            <View style={styles.interactionModalActions}>
              <Pressable
                style={styles.shareModalCancelBtn}
                onPress={() => setAddInteractionModalVisible(false)}
                disabled={isSavingInteraction}
                testID="apartment-detail-add-interaction-cancel"
              >
                <Text style={styles.shareModalCancelText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.interactionSaveBtn,
                  (!newInteractionClientId || !newInteractionNote.trim() || isSavingInteraction) && styles.interactionSaveBtnDisabled,
                ]}
                onPress={() => {
                  void handleSaveInteraction();
                }}
                disabled={!newInteractionClientId || !newInteractionNote.trim() || isSavingInteraction}
                testID="apartment-detail-add-interaction-save"
              >
                {isSavingInteraction ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="checkmark" size={18} color={colors.onBrand} />}
                <Text style={styles.interactionSaveText}>Αποθήκευση</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={closeDealModalVisible}
        onRequestClose={() => {
          if (!isSubmittingCloseDeal) {
            setCloseDealModalVisible(false);
          }
        }}
      >
        <View style={styles.shareModalBackdrop}>
          <View style={styles.closeDealModalCard}>
            <Text style={styles.closeDealModalTitle}>Κλείσιμο Συμφωνίας</Text>
            <Text style={styles.closeDealWarningText}>
              Προσοχή: Η ενέργεια αυτή θα αποκρύψει την αγγελία από την κεντρική αναζήτηση για όλους τους υπόλοιπους χρήστες.
            </Text>
            <Text style={styles.closeDealSubtitle}>Επιλέξτε τον πελάτη που έκλεισε το σπίτι:</Text>

            {loadingCloseDealClients ? (
              <View style={styles.shareModalEmptyWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : (
              <ScrollView style={styles.closeDealClientList} contentContainerStyle={styles.closeDealClientListContent}>
                {closeDealClientOptions.map((option) => {
                  const selected = selectedDealClientId === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.closeDealClientRow, selected && styles.closeDealClientRowSelected]}
                      onPress={() => setSelectedDealClientId(option.id)}
                      testID={`apartment-detail-close-deal-client-${option.id}`}
                    >
                      <View style={styles.shareAvatarWrap}>
                        {option.avatar ? (
                          <Image source={{ uri: option.avatar }} style={styles.shareAvatarImage} contentFit="cover" />
                        ) : (
                          <DefaultProfileAvatar size={46} iconSize={20} />
                        )}
                      </View>
                      <View style={styles.shareNameWrap}>
                        <Text style={styles.shareNameText} numberOfLines={1}>{option.name}</Text>
                      </View>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                    </Pressable>
                  );
                })}

                <Pressable
                  style={[styles.closeDealClientRow, selectedDealClientId === "other" && styles.closeDealClientRowSelected]}
                  onPress={() => setSelectedDealClientId("other")}
                  testID="apartment-detail-close-deal-client-other"
                >
                  <View style={styles.closeDealOtherIconWrap}>
                    <Ionicons name="ellipsis-horizontal-circle-outline" size={20} color={colors.onSurfaceTertiary} />
                  </View>
                  <View style={styles.shareNameWrap}>
                    <Text style={styles.shareNameText}>Άλλο / Εκτός εφαρμογής</Text>
                  </View>
                  {selectedDealClientId === "other" ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                </Pressable>
              </ScrollView>
            )}

            <View style={styles.closeDealActionRow}>
              <Pressable
                style={styles.shareModalCancelBtn}
                onPress={() => setCloseDealModalVisible(false)}
                disabled={isSubmittingCloseDeal}
                testID="apartment-detail-close-deal-cancel"
              >
                <Text style={styles.shareModalCancelText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.closeDealConfirmBtn, (!selectedDealClientId || isSubmittingCloseDeal) && styles.closeDealConfirmBtnDisabled]}
                onPress={() => {
                  void handleConfirmCloseDeal();
                }}
                disabled={!selectedDealClientId || isSubmittingCloseDeal}
                testID="apartment-detail-close-deal-confirm"
              >
                <Ionicons name="checkmark-done-circle-outline" size={20} color={colors.onBrand} />
                <Text style={styles.closeDealConfirmText}>Κατοχύρωση</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={shareModalVisible}
        onRequestClose={() => {
          if (!sendingShareChatId) setShareModalVisible(false);
        }}
      >
        <View style={styles.shareModalBackdrop}>
          <View style={styles.shareModalCard}>
            <Text style={styles.shareModalTitle}>Κοινοποίηση Διαμερίσματος</Text>

            {loadingShareMatches ? (
              <View style={styles.shareModalEmptyWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : activeShareMatches.length === 0 ? (
              <View style={styles.shareModalEmptyWrap}>
                <Text style={styles.shareModalEmptyText}>Δεν έχετε ενεργές συνομιλίες με συγκατοίκους ακόμα</Text>
              </View>
            ) : (
              <ScrollView style={styles.shareModalList} contentContainerStyle={styles.shareModalListContent}>
                {activeShareMatches.map((item) => (
                  <View key={item.chatRoomId} style={styles.shareModalRow}>
                    <View style={styles.shareAvatarWrap}>
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.shareAvatarImage} contentFit="cover" />
                      ) : (
                        <DefaultProfileAvatar size={46} iconSize={20} />
                      )}
                    </View>

                    <View style={styles.shareNameWrap}>
                      <Text style={styles.shareNameText} numberOfLines={1}>{item.name}</Text>
                    </View>

                    <Pressable
                      style={styles.shareSendBtn}
                      onPress={() => {
                        void handleShareApartmentToMatch(item);
                      }}
                      disabled={!!sendingShareChatId}
                      testID={`apartment-detail-share-send-${item.chatRoomId}`}
                    >
                      {sendingShareChatId === item.chatRoomId ? (
                        <ActivityIndicator size="small" color={colors.onBrand} />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={18} color={colors.onBrand} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable
              style={styles.shareModalCancelBtn}
              onPress={() => setShareModalVisible(false)}
              disabled={!!sendingShareChatId}
              testID="apartment-detail-share-close"
            >
              <Text style={styles.shareModalCancelText}>{t("common.actions.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={[
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ]}
        testID="apartment-detail-action-modal"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
    scroll: { flex: 1 },
    sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
    detailFilesList: { gap: spacing.xs },
    detailFileBar: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    detailFileLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
    detailFileText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    fileViewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: spacing.lg },
    fileViewerCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: "hidden", maxHeight: "88%" },
    fileViewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
    fileViewerTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    fileViewerImage: { width: "100%", height: 520, backgroundColor: colors.surfaceSecondary },
    clientOnlyBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    clientOnlyBannerText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
      textAlign: "center",
    },

    backOverlay: {
      position: "absolute",
      left: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    noteOverlay: {
      position: "absolute",
      right: spacing.lg,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },

    carouselWrap: {
      position: "relative",
      borderBottomWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    carouselWrapPlaceholder: {
      height: 280,
      justifyContent: "center",
      alignItems: "center",
    },
    carouselSlide: { width: SCREEN_WIDTH, height: 280, position: "relative" },
    carouselImage: { width: SCREEN_WIDTH, height: 280 },
    placeholderContainer: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.xs,
    },
    placeholderIconContainer: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    placeholderSubIcon: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 2,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    placeholderText: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.xl,
      color: colors.brand,
      letterSpacing: 0.5,
    },
    placeholderSubText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      marginTop: 2,
      textAlign: "center",
    },
    dotRow: {
      position: "absolute",
      bottom: spacing.sm,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.xs,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "rgba(255,255,255,0.45)",
    },
    dotActive: { backgroundColor: colors.brand, width: 14 },
    rentBadge: {
      position: "absolute",
      bottom: spacing.md,
      right: spacing.md,
      flexDirection: "row",
      alignItems: "flex-end",
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    rentBadgeApproved: {
      flexDirection: "column",
      alignItems: "flex-start",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      gap: 2,
    },
    approvedRentLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textTransform: "uppercase",
    },
    approvedRentValueRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    rentValue: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onBrand,
    },
    rentValueApproved: {
      color: colors.brand,
      fontFamily: fonts.bold,
    },
    rentPer: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
      paddingBottom: 2,
      marginLeft: 2,
    },
    rentPerApproved: {
      color: colors.brand,
    },
    originalRentText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textDecorationLine: "line-through",
    },

    infoBlock: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    aptTitle: {
      flex: 1,
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      lineHeight: 30,
    },
    titleActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    titleActionBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    titleActionBtnActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    dealActionBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    dealActionBtnClosed: {
      backgroundColor: colors.surfaceTertiary,
      borderColor: colors.border,
    },
    doubleHeartText: {
      fontSize: 18,
      lineHeight: 20,
    },
    likeBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.9)",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    likeBtnActive: {
      backgroundColor: "#FF5A66",
      borderColor: "#FF5A66",
    },
    locRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    locText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
    statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    statPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.brandTertiary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
    },
    statText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },

    section: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    crmSectionContainer: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    crmSectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    clientsContentWrap: {
      gap: spacing.sm,
    },
    clientLeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      marginVertical: spacing.sm,
      gap: spacing.sm,
    },
    clientInfoWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    clientTextMeta: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      paddingTop: 3,
      gap: 3,
    },
    clientInlineMetaRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minWidth: 0,
    },
    stagePill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    stagePillText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.brand,
      includeFontPadding: false,
      textAlignVertical: "center",
    },
    crmActionButtonsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    crmActionBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    crmActionBtnActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    crmEmptyState: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    crmEmptyStateText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    propertyInteractionCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    interactionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    interactionTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    interactionCardTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    addInteractionBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    clientFilterChipsWrap: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingVertical: 2,
    },
    clientFilterChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clientFilterChipActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    clientFilterChipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    clientFilterChipTextActive: {
      color: colors.brand,
      fontFamily: fonts.bold,
    },
    metricsSummaryBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      backgroundColor: colors.surface,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricCounterItem: { alignItems: "center", gap: 2 },
    metricCounterItemActive: {
      backgroundColor: colors.brandTertiary,
      borderRadius: radius.sm,
      paddingHorizontal: 4,
    },
    metricCounterNumber: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    metricCounterLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    metricCounterDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
    itemLogList: { gap: 3, marginTop: 2 },
    logEntryRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    logTypeIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    logEntryContent: {
      flex: 1,
      gap: 2,
    },
    logEntryTopLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    logClientName: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    logDateText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    logNoteText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      lineHeight: 18,
    },
    emptyLogText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
      paddingVertical: spacing.md,
    },
    clientsList: { gap: spacing.sm, marginTop: spacing.sm },
    clientMatchesLoading: { marginTop: spacing.sm },
    clientMatchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clientAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surfaceTertiary },
    clientAvatarFallback: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    clientName: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, flexShrink: 1 },
    matchBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
    },
    matchBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
    clientMatchesEmptyText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onSurfaceTertiary,
      marginTop: spacing.sm,
    },

    inquiriesList: {
      gap: spacing.sm,
    },
    inquiriesEmptyState: {
    minHeight: 78,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
    inquiriesEmptyText: {
    color: colors.onSurfaceTertiary,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
    inquiryAvatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
  },
    inquiryAvatarImage: {
    width: "100%",
    height: "100%",
  },
    inquiryName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
    likedUserCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.sm,
    },
    likedUserContent: {
      flex: 1,
      gap: spacing.xs,
    },
    likedUserPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    likedUserActionBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
    },
    shareModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    interactionModalCard: {
      width: "100%",
      maxWidth: 460,
      maxHeight: "88%",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    interactionModalTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    interactionModalTitle: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    interactionModalScroll: {
      flexShrink: 1,
    },
    interactionModalContent: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
    },
    interactionModalSectionLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      marginTop: spacing.xs,
    },
    interactionModalEmptyState: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
    },
    interactionTypeChipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    interactionTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    interactionTypeChipActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    interactionTypeChipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    interactionTypeChipTextActive: {
      color: colors.brand,
      fontFamily: fonts.bold,
    },
    interactionNoteInput: {
      minHeight: 104,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      color: colors.onSurface,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    interactionModalActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    interactionSaveBtn: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
    },
    interactionSaveBtnDisabled: {
      opacity: 0.45,
    },
    interactionSaveText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
    },
    shareModalCard: {
      width: "100%",
      maxWidth: 440,
      maxHeight: "78%",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    shareModalTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    shareModalList: {
      maxHeight: 360,
    },
    shareModalListContent: {
      gap: spacing.sm,
    },
    shareModalRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    shareAvatarWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: "hidden",
    },
    shareAvatarImage: {
      width: "100%",
      height: "100%",
    },
    shareNameWrap: {
      flex: 1,
    },
    shareNameText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    shareSendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
    },
    shareModalEmptyWrap: {
      minHeight: 90,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    shareModalEmptyText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    shareModalCancelBtn: {
      alignSelf: "flex-end",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    shareModalCancelText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    closeDealModalCard: {
      width: "100%",
      maxWidth: 460,
      maxHeight: "82%",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    closeDealModalTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    closeDealWarningText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.error,
      lineHeight: 20,
    },
    closeDealSubtitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    closeDealClientList: {
      maxHeight: 320,
    },
    closeDealClientListContent: {
      gap: spacing.xs,
      paddingBottom: spacing.xs,
    },
    closeDealClientRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    closeDealClientRowSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.brandTertiary,
    },
    closeDealOtherIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    closeDealActionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      gap: spacing.sm,
    },
    closeDealConfirmBtn: {
      minHeight: 40,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.brand,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    closeDealConfirmBtnDisabled: {
      opacity: 0.45,
    },
    closeDealConfirmText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
    },

    amenitiesGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    amenityCell: {
      width: "30%",
      flexGrow: 1,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      gap: spacing.xs,
    },
    amenityCellActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    amenityLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    amenityLabelActive: {
      color: colors.onBrandTertiary,
    },

    extraDetailsHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    extraDetailsCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
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
    },
    extraDetailsItemTextWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    extraDetailsItemLabel: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    extraDetailsItemLabelMuted: {
      color: colors.onSurfaceTertiary,
      textDecorationLine: "line-through",
    },
    extraDetailsItemNegativeMark: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.error,
    },

    descBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    gap: spacing.sm,
  },
    detailMetaCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
      gap: spacing.sm,
    },
    detailMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    detailMetaLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
      flexShrink: 1,
    },
    extraInformationCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
      gap: spacing.sm,
    },
    extraInformationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      flexWrap: "wrap",
    },
    extraInformationLabel: {
      flex: 1,
      minWidth: 180,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    extraInformationValue: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onSurfaceTertiary,
      textAlign: "right",
      flexShrink: 1,
    },
    sqmPricePill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sqmPricePillText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onBrandTertiary,
    },
    descText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurface,
    lineHeight: 22,
  },
    tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
    tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
    tagText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
    phoneContactCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      padding: spacing.md,
    },
    phoneContactIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    phoneContactTextWrap: {
      flex: 1,
      gap: 2,
    },
    phoneContactLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    phoneContactValue: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },

    locationMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
    locationMetaText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },

    footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
    contactBtn: {
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
    contactBtnPressed: { opacity: 0.88 },
    contactBtnText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },

    errorText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.error,
  },
    backPill: {
    minHeight: 42,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
    backPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.brandSecondary,
  },
  });
}
