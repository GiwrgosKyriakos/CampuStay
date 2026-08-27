import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, TouchableOpacity, PanResponder, Modal, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, limit } from "firebase/firestore";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from "react-native-maps";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { getUserProfile } from "@/src/api/userProfile";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { toggleApartmentLike } from "@/src/api/apartmentLikes";
import { saveRecentSearch, subscribeRecentSearches } from "@/src/api/recentSearches";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { t } from "@/src/locales";
import { getExcludedUserIds } from "@/src/api/blocking";
import { getUserApartmentNotes, updateNotesOrder, type Apartment as ApartmentNoteData } from "@/src/api/apartmentNotes";
import { storage } from "@/src/utils/storage";
import { calculatePricePerSqm } from "@/src/utils/pricing";
import { isPointInPolygon, type LatLng } from "@/src/utils/geometry";
import MapPolygonDrawModal from "@/src/components/MapPolygonDrawModal";
import { WatermarkBadge } from "@/src/components/WatermarkBadge";
import type { FilterSetPayload as SharedFilterSetPayload } from "@/src/types/filters";
import type { FilterSetVersionData, SharedFilterSetRecord } from "@/src/components/FilterSetVersionModal";
import type { WatermarkConfig } from "@/src/types/listing";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;
const APARTMENTS_SORT_BY_STORAGE_KEY = "apartments.sortBy";

export type SortOption = "newest" | "oldest" | "price_asc" | "price_desc" | "size_asc" | "size_desc" | "price_sqm_asc" | "price_sqm_desc";

export interface FilterSetPayload extends SharedFilterSetPayload {
  title?: string;
  rentMin?: string;
  rentMax?: string;
  minSqmPrice?: string;
  maxSqmPrice?: string;
  cityQuery?: string;
  sizeMin?: string;
  sizeMax?: string;
  petFriendly: boolean;
  nearMetro: boolean;
  sortBy?: SortOption;
}

export interface FilterSetDoc extends FilterSetPayload {
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedFilterSet extends FilterSetPayload {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export function formatFilterSetSummary(filters: FilterSetPayload): string {
  const parts: string[] = [];
  if (filters.rentMin || filters.rentMax) {
    parts.push(`${filters.rentMin || "0"}€ - ${filters.rentMax || "∞"}€`);
  }
  if (filters.minSqmPrice || filters.maxSqmPrice) {
    parts.push(`${filters.minSqmPrice || "0"} - ${filters.maxSqmPrice || "∞"} €/m²`);
  }
  if (filters.sizeMin || filters.sizeMax) {
    parts.push(`${filters.sizeMin || "0"} - ${filters.sizeMax || "∞"} m²`);
  }
  if (filters.cityQuery?.trim()) {
    parts.push(filters.cityQuery.trim());
  }
  if (filters.petFriendly) parts.push("Pets");
  if (filters.nearMetro) parts.push("Metro");

  return parts.length > 0 ? parts.join(" · ") : "Όλα τα διαμερίσματα";
}

function sanitizeFirestorePayload<T extends Record<string, unknown>>(payload: T): T {
  const cleaned = { ...payload } as T;
  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });
  return cleaned;
}

interface BrokerDirectoryItem {
  id: string;
  name: string;
  avatar: string;
}

type ShowOnlyModalType = "agency" | "broker" | "list" | null;

const SORT_OPTION_LABELS: Record<SortOption, string> = {
  newest: "Πιο πρόσφατα",
  oldest: "Πιο παλιά",
  price_asc: "Αύξουσα τιμή (€ -> €€€)",
  price_desc: "Φθίνουσα τιμή (€€€ -> €)",
  size_asc: "Αύξον εμβαδόν (m² -> m³)",
  size_desc: "Φθίνουσα εμβαδόν (m³ -> m²)",
  price_sqm_asc: "Αύξουσα τιμή/τ.μ. (€/m² -> €€€/m²)",
  price_sqm_desc: "Φθίνουσα τιμή/τ.μ. (€€€/m² -> €/m²)",
};

const SORT_OPTIONS: SortOption[] = ["newest", "oldest", "price_asc", "price_desc", "size_asc", "size_desc", "price_sqm_asc", "price_sqm_desc"];

function sanitizeDecimalInput(value: string): string {
  const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [head, ...rest] = normalized.split(".");
  if (!rest.length) return head;
  return `${head}.${rest.join("")}`;
}

function parseTimestampToMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "object" && value !== null) {
    const maybeToMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof maybeToMillis === "function") {
      try {
        const millis = maybeToMillis();
        return Number.isFinite(millis) ? millis : 0;
      } catch {
        return 0;
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const safeNanos = typeof nanoseconds === "number" && Number.isFinite(nanoseconds) ? nanoseconds : 0;
      return Math.trunc(seconds * 1000 + safeNanos / 1_000_000);
    }
  }

  return 0;
}

function normalizeText(str: string): string {
  const greekAccentMap: Record<string, string> = {
    ά: "α",
    έ: "ε",
    ή: "η",
    ί: "ι",
    ΐ: "ι",
    ό: "ο",
    ύ: "υ",
    ΰ: "υ",
    ώ: "ω",
    ς: "σ",
  };

  const latinToGreekMap: Record<string, string> = {
    a: "α",
    b: "β",
    c: "κ",
    d: "δ",
    e: "ε",
    f: "φ",
    g: "γ",
    h: "η",
    i: "ι",
    j: "ζ",
    k: "κ",
    l: "λ",
    m: "μ",
    n: "ν",
    o: "ο",
    p: "π",
    q: "κ",
    r: "ρ",
    s: "σ",
    t: "τ",
    u: "υ",
    v: "β",
    w: "ω",
    x: "χ",
    y: "υ",
    z: "ζ",
  };

  const lower = str.toLowerCase().trim();
  const noDiacritics = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mapped = noDiacritics
    .split("")
    .map((char) => greekAccentMap[char] ?? latinToGreekMap[char] ?? char)
    .join("");

  return mapped
    .replace(/[^a-z0-9α-ω\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Apartment {
  id: string;
  title: string;
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
  createdAt?: number;
  image: string;
  images?: string[];
  tags: string[];
  amenities: string[];
  hostId?: string;
  ownerId?: string;
  assignedBrokerIds?: string[];
  isOffMarket?: boolean;
  offMarketAccessUserIds?: string[];
  status?: "active" | "closed_deal";
  rentedToUserId?: string | null;
  rentedAtMillis?: number | null;
  available: boolean;
  watermarkConfig?: WatermarkConfig;
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
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent?: number;
  price?: number;
  maxDiscountPercent?: number;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  hostId?: string;
  ownerId?: string;
  assignedBrokerIds?: string[];
  isOffMarket?: boolean;
  offMarketAccessUserIds?: string[];
  status?: "active" | "closed_deal";
  rentedToUserId?: string | null;
  rentedAt?: unknown;
  createdAt?: unknown;
  available?: boolean;
  isAvailable?: boolean;
  watermarkConfig?: WatermarkConfig;
}

interface FirestoreLikedApartmentDoc {
  apartmentId?: string;
  timestamp?: unknown;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  initiatedBy?: string | null;
  apartmentId?: string;
}

type ApartmentQuickChatMeta = {
  hasContactedHost: boolean;
  chatRoomId: string;
  hostId: string;
  initiatedByCurrentUser: boolean;
};

interface FirestoreHostInboxUserDoc {
  already_have_apartment_to_share?: boolean;
  has_place?: boolean;
}

const LEGACY_TAG_TO_SLUG: Record<string, string> = {
  "Pet-friendly": "pet_friendly",
  "Near metro": "near_metro",
  Furnished: "furnished",
  Balcony: "balcony",
  WiFi: "wifi",
  "Bills incl.": "bills_included",
  "Shared kitchen": "shared_kitchen",
  Garden: "garden",
  "New listing": "new_listing",
  "Κατάλληλο για κατοικίδια": "pet_friendly",
};

function normalizeTagSlug(tag: string): string {
  const trimmedTag = tag.trim();
  return LEGACY_TAG_TO_SLUG[trimmedTag] ?? trimmedTag.toLowerCase();
}

function translateApartmentTag(tag: string): string {
  const translated = t(`apartments.tags.${tag}`);
  return translated === `apartments.tags.${tag}` ? tag.replace(/_/g, " ") : translated;
}

type ApartmentGridCardProps = {
  apt: Apartment;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  isLiked: boolean;
  isOwnListing: boolean;
  isMyListingsView: boolean;
  quickChatMeta?: ApartmentQuickChatMeta;
  onOpen: () => void;
  onToggleLike: () => void;
};

type ApartmentNoteItem = {
  id: string;
  text: string;
  apartmentData: ApartmentNoteData;
  orderIndex: number;
};

function ApartmentGridCard({
  apt,
  styles,
  colors,
  isLiked,
  isOwnListing,
  isMyListingsView,
  quickChatMeta,
  onOpen,
  onToggleLike,
}: ApartmentGridCardProps) {
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const cardImages = useMemo(() => {
    const validImages = Array.isArray(apt.images)
      ? apt.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
      : [];

    if (validImages.length > 0) return validImages;
    return apt.image ? [apt.image] : [];
  }, [apt.image, apt.images]);

  useEffect(() => {
    if (activeImageIndex > cardImages.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, cardImages.length]);

  const activeImage = cardImages[activeImageIndex] || "";

  return (
    <View style={styles.cardWrap}>
      <Pressable
        style={({ pressed }) => [styles.card, apt.isOffMarket && styles.offMarketCard, pressed && styles.cardPressed]}
        onPress={onOpen}
        testID={`apartment-card-${apt.id}`}
      >
        {activeImage ? (
          <Image source={{ uri: activeImage }} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, styles.cardPlaceholder]}>
            <Ionicons name="home" size={44} color={colors.brand} />
            <Text style={styles.cardPlaceholderText}>CampuStay</Text>
          </View>
        )}
        <WatermarkBadge config={apt.watermarkConfig} position="top-left" />

        {apt.isOffMarket ? (
          <View style={styles.clientOnlyBadge}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.onBrand} />
            <Text style={styles.clientOnlyBadgeText}>client-only view</Text>
          </View>
        ) : null}

        {cardImages.length > 1 && activeImageIndex > 0 && (
          <Pressable
            style={[styles.carouselArrowButton, styles.carouselArrowLeft]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.max(0, prev - 1));
            }}
            hitSlop={8}
            testID={`apartment-card-prev-image-${apt.id}`}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        )}

        {cardImages.length > 1 && activeImageIndex < cardImages.length - 1 && (
          <Pressable
            style={[styles.carouselArrowButton, styles.carouselArrowRight]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.min(cardImages.length - 1, prev + 1));
            }}
            hitSlop={8}
            testID={`apartment-card-next-image-${apt.id}`}
          >
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        )}

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
          <Text style={styles.rentMo}>{t("apartments.perMonthShort")}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.loc}>
              {apt.area}, {apt.city}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.stat}>{`${apt.rooms} ${t("apartments.rooms")}`}</Text>
            <View style={styles.dot} />
            <Text style={styles.stat}>{apt.size} m²</Text>
          </View>
          <View style={styles.tagRow}>
            {apt.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{translateApartmentTag(tag)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>

      {!isMyListingsView && !isOwnListing ? (
        <>
          {quickChatMeta?.hasContactedHost ? (
            <Pressable
              style={[styles.likeBtn, styles.quickChatBtn]}
              onPress={(e) => {
                e.stopPropagation();
                router.push({
                  pathname: "/chat/[id]",
                  params: {
                    id: quickChatMeta.hostId,
                    chatRoomId: quickChatMeta.chatRoomId,
                  },
                });
              }}
              testID={`apartment-quick-chat-${apt.id}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.onBrand} />
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
            onPress={onToggleLike}
            testID={`apartment-like-${apt.id}`}
          >
            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export default function ApartmentsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { importedFilters } = useLocalSearchParams<{ importedFilters?: string }>();
  const [publishedApartments, setPublishedApartments] = useState<Apartment[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [rentMin, setRentMin] = useState("");
  const [rentMax, setRentMax] = useState("");
  const [minSqmPrice, setMinSqmPrice] = useState<string>("");
  const [maxSqmPrice, setMaxSqmPrice] = useState<string>("");
  const [cityQuery, setCityQuery] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [nearMetro, setNearMetro] = useState(false);
  const [polygonCoordinates, setPolygonCoordinates] = useState<LatLng[]>([]);
  const [isPolygonModalVisible, setIsPolygonModalVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [showOnlyModalType, setShowOnlyModalType] = useState<ShowOnlyModalType>(null);
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState<BrokerDirectoryItem | null>(null);
  const [brokerDirectory, setBrokerDirectory] = useState<BrokerDirectoryItem[]>([]);
  const [loadingBrokerDirectory, setLoadingBrokerDirectory] = useState(false);
  const [showOwnListingsInFeed, setShowOwnListingsInFeed] = useState(false);
  const [filterSetTitle, setFilterSetTitle] = useState("");
  const [activeSavedSetId, setActiveSavedSetId] = useState<string | null>(null);
  const [savedFilterSets, setSavedFilterSets] = useState<SavedFilterSet[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSetForPreview, setSelectedSetForPreview] = useState<SavedFilterSet | null>(null);
  const [savingFilterSet, setSavingFilterSet] = useState(false);
  const [brokerShareModalVisible, setBrokerShareModalVisible] = useState(false);
  const [availableBrokers, setAvailableBrokers] = useState<BrokerDirectoryItem[]>([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);
  const [sendingBrokerId, setSendingBrokerId] = useState<string | null>(null);
  const [shareConfirmationVisible, setShareConfirmationVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "liked">("all");
  const [viewMode, setViewMode] = useState<"list" | "map" | "grid" | "compact">("list");
  const [selectedMapApartment, setSelectedMapApartment] = useState<Apartment | null>(null);
  const mapRef = useRef<MapView>(null);
  const [isViewingMyListings, setIsViewingMyListings] = useState(false);
  const [hideCreateFab, setHideCreateFab] = useState(false);
  const [hasPublishedHostApartment, setHasPublishedHostApartment] = useState(false);
  const [hasApartmentShareFlag, setHasApartmentShareFlag] = useState(false);
  const [hostInboxHasUnread, setHostInboxHasUnread] = useState(false);
  const [hostChatByApartmentId, setHostChatByApartmentId] = useState<Record<string, ApartmentQuickChatMeta>>({});
  const [likedApartmentIds, setLikedApartmentIds] = useState<Set<string>>(new Set());
  const [likedApartmentTimestampById, setLikedApartmentTimestampById] = useState<Record<string, number>>({});
  const [likeErrorModalVisible, setLikeErrorModalVisible] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesList, setNotesList] = useState<ApartmentNoteItem[]>([]);
  const [notesOrderSaving, setNotesOrderSaving] = useState(false);
  const SWIPE_THRESHOLD = 56;
  const canOpenHostInbox = hasPublishedHostApartment || hasApartmentShareFlag;
  const canManageListings = !auth.isGuest && (hasPublishedHostApartment || hasApartmentShareFlag || auth.isBroker);
  const isHostUser = canManageListings;
  const showCreateFab = !auth.isGuest && (!hideCreateFab || auth.isBroker);
  const showHostInboxFab = !auth.isGuest && !auth.isBroker && !hideCreateFab && canOpenHostInbox;

  const detachSavedFilterSet = useCallback(() => {
    if (activeSavedSetId !== null) {
      setActiveSavedSetId(null);
      setFilterSetTitle("");
    }
  }, [activeSavedSetId]);

  const updateFilterValue = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: React.SetStateAction<T>) => {
      detachSavedFilterSet();
      setter(value);
    },
    [detachSavedFilterSet],
  );

  const currentFilterSet = useMemo<FilterSetPayload>(
    () => ({
      title: filterSetTitle.trim() || undefined,
      rentMin: rentMin || undefined,
      rentMax: rentMax || undefined,
      minSqmPrice: minSqmPrice || undefined,
      maxSqmPrice: maxSqmPrice || undefined,
      cityQuery: cityQuery || undefined,
      sizeMin: sizeMin || undefined,
      sizeMax: sizeMax || undefined,
      petFriendly,
      nearMetro,
      polygonCoordinates: polygonCoordinates.length >= 3 ? polygonCoordinates : undefined,
      sortBy,
    }),
    [cityQuery, filterSetTitle, maxSqmPrice, nearMetro, petFriendly, polygonCoordinates, rentMax, rentMin, sizeMax, sizeMin, sortBy, minSqmPrice],
  );

  const savedFilterSetsRef = useMemo(() => auth.userId ? collection(db, "users", auth.userId, "savedFilterSets") : null, [auth.userId]);

  const loadSavedFilterSets = useCallback(async () => {
    if (!savedFilterSetsRef) {
      setSavedFilterSets([]);
      return;
    }

    const snapshot = await getDocs(query(savedFilterSetsRef, orderBy("updatedAt", "desc"), limit(20)));
    const sets = snapshot.docs.map((savedDoc) => ({
      id: savedDoc.id,
      ...(savedDoc.data() as FilterSetDoc),
    }));
    setSavedFilterSets(sets);
  }, [savedFilterSetsRef]);

  useEffect(() => {
    if (!showHistoryModal) return;

    setLoadingHistory(true);
    void loadSavedFilterSets()
      .catch(() => setSavedFilterSets([]))
      .finally(() => setLoadingHistory(false));
  }, [loadSavedFilterSets, showHistoryModal]);

  const saveFilterSet = useCallback(async () => {
    if (!savedFilterSetsRef || !auth.userId || savingFilterSet) return;

    setSavingFilterSet(true);
    try {
      const now = Date.now();
      const rawPayload: FilterSetDoc = {
        ...currentFilterSet,
        userId: auth.userId,
        createdAt: now,
        updatedAt: now,
      };
      const payload = sanitizeFirestorePayload(rawPayload as unknown as Record<string, unknown>);
      const savedDoc = await addDoc(savedFilterSetsRef, payload);
      setActiveSavedSetId(savedDoc.id);
      setFilterSetTitle(currentFilterSet.title ?? "");
      await loadSavedFilterSets();
    } catch (error) {
      console.error("[Apartments] Error saving filter set:", error);
    } finally {
      setSavingFilterSet(false);
    }
  }, [auth.userId, currentFilterSet, loadSavedFilterSets, savedFilterSetsRef, savingFilterSet]);

  const applySavedFilterSet = useCallback((savedSet: SavedFilterSet) => {
    setRentMin(savedSet.rentMin ?? "");
    setRentMax(savedSet.rentMax ?? "");
    setMinSqmPrice(savedSet.minSqmPrice ?? "");
    setMaxSqmPrice(savedSet.maxSqmPrice ?? "");
    setCityQuery(savedSet.cityQuery ?? "");
    setSizeMin(savedSet.sizeMin ?? "");
    setSizeMax(savedSet.sizeMax ?? "");
    setPetFriendly(savedSet.petFriendly === true);
    setNearMetro(savedSet.nearMetro === true);
    setPolygonCoordinates(savedSet.polygonCoordinates ?? []);
    setSortBy(savedSet.sortBy && SORT_OPTIONS.includes(savedSet.sortBy) ? savedSet.sortBy : "newest");
    setFilterSetTitle(savedSet.title ?? "");
    setActiveSavedSetId(savedSet.id);
    setSelectedSetForPreview(null);
    setShowHistoryModal(false);
  }, []);

  const shareFilterSet = useCallback(async () => {
    if (!auth.userId || auth.isGuest) return;
    setBrokerShareModalVisible(true);
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!brokerShareModalVisible || !auth.userId) return;

    let active = true;
    setLoadingBrokers(true);
    void (async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "users"), where("is_broker", "==", true)),
        );
        if (!active) return;
        const brokers: BrokerDirectoryItem[] = [];

        snapshot.docs.forEach((brokerDoc) => {
          if (brokerDoc.id === auth.userId) return;

          const data = brokerDoc.data() as {
            name?: string;
            photoUrl?: string;
            avatar?: string;
            photos?: string[];
            is_visible?: boolean;
            isVisible?: boolean;
          };
          const isVisible = data.is_visible !== false && data.isVisible !== false;

          if (isVisible) {
            brokers.push({
              id: brokerDoc.id,
              name: data.name?.trim() || "Μεσίτης",
              avatar: data.photoUrl || data.avatar || data.photos?.[0] || "",
            });
          }
        });

        setAvailableBrokers(brokers);
      } catch (error) {
        console.error("[Apartments] Error loading brokers:", error);
        if (active) setAvailableBrokers([]);
      } finally {
        if (active) setLoadingBrokers(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, brokerShareModalVisible]);

  useEffect(() => {
    if (showOnlyModalType !== "broker") return;

    let active = true;
    setLoadingBrokerDirectory(true);
    void (async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "users"), where("is_broker", "==", true)),
        );
        if (!active) return;
        const brokers: BrokerDirectoryItem[] = [];

        snapshot.docs.forEach((brokerDoc) => {
          const data = brokerDoc.data() as {
            name?: string;
            photoUrl?: string;
            avatar?: string;
            photos?: string[];
            is_visible?: boolean;
            isVisible?: boolean;
          };
          const isVisible = data.is_visible !== false && data.isVisible !== false;

          if (isVisible) {
            brokers.push({
              id: brokerDoc.id,
              name: data.name?.trim() || "Μεσίτης",
              avatar: data.photoUrl || data.avatar || data.photos?.[0] || "",
            });
          }
        });

        setBrokerDirectory(brokers);
      } catch (error) {
        console.error("[Apartments] Error loading broker directory:", error);
        if (active) setBrokerDirectory([]);
      } finally {
        if (active) setLoadingBrokerDirectory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [showOnlyModalType]);

  const sendFilterSetToBroker = useCallback(async (brokerId: string) => {
    if (!auth.userId || sendingBrokerId) return;

    const title = filterSetTitle.trim();
    const summary = formatFilterSetSummary(currentFilterSet);
    const messageText = `[Κριτήρια Αναζήτησης: ${title || summary}]`;
    setSendingBrokerId(brokerId);
    try {
      const chatRoomId = [auth.userId, brokerId].sort().join("_");
      await setDoc(
        doc(db, "chats", chatRoomId),
        sanitizeFirestorePayload({
          users: [auth.userId, brokerId],
          type: "host",
          brokerChatRole: "client",
          status: "active",
          apartmentId: null,
          apartmentTitle: null,
          apartmentUnavailable: false,
          updatedAt: serverTimestamp(),
          lastMessageText: messageText,
          lastMessageTimestamp: serverTimestamp(),
        }),
        { merge: true },
      );
      const filterSetData = sanitizeFirestorePayload({
        title: title || "",
        rentMin: rentMin || "",
        rentMax: rentMax || "",
        minSqmPrice: minSqmPrice || "",
        maxSqmPrice: maxSqmPrice || "",
        cityQuery: cityQuery || "",
        sizeMin: sizeMin || "",
        sizeMax: sizeMax || "",
        petFriendly: Boolean(petFriendly),
        nearMetro: Boolean(nearMetro),
        sortBy: sortBy || "newest",
        summary,
        sharedAt: Date.now(),
      });
      const broker = availableBrokers.find((item) => item.id === brokerId);
      const filterSetRef = doc(collection(db, "users", auth.userId, "sharedFilterSets"));
      const version: FilterSetVersionData = {
        version: 1,
        title: title || "",
        rentMin: rentMin || undefined,
        rentMax: rentMax || undefined,
        minSqmPrice: minSqmPrice || undefined,
        maxSqmPrice: maxSqmPrice || undefined,
        cityQuery: cityQuery || undefined,
        sizeMin: sizeMin || undefined,
        sizeMax: sizeMax || undefined,
        petFriendly: Boolean(petFriendly),
        nearMetro: Boolean(nearMetro),
        sortBy,
        summary,
        updatedAt: Date.now(),
      };
      const sharedBroker = { brokerId, brokerName: broker?.name || "Μεσίτης", ...(broker?.avatar ? { brokerAvatar: broker.avatar } : {}), sharedAt: version.updatedAt };
      const sharedFilterSet: Omit<SharedFilterSetRecord, "id"> = {
        userId: auth.userId,
        title: title || "",
        currentVersion: 1,
        versions: [version],
        sharedBrokers: [sharedBroker],
        createdAt: version.updatedAt,
        updatedAt: version.updatedAt,
      };
      await setDoc(filterSetRef, sharedFilterSet);
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "filter_set_share",
        text: messageText,
        filterSetData,
        filterSetId: filterSetRef.id,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      setBrokerShareModalVisible(false);
      setShareConfirmationVisible(true);
    } catch (error) {
      console.error("[Apartments] Error sharing filter set to broker:", error);
    } finally {
      setSendingBrokerId(null);
    }
  }, [auth.userId, cityQuery, currentFilterSet, filterSetTitle, maxSqmPrice, minSqmPrice, nearMetro, petFriendly, rentMax, rentMin, sendingBrokerId, sizeMax, sizeMin, sortBy]);

  useEffect(() => {
    if (typeof importedFilters !== "string" || !importedFilters.trim()) return;
    try {
      const imported = JSON.parse(importedFilters) as Partial<FilterSetPayload>;
      setRentMin(imported.rentMin || "");
      setRentMax(imported.rentMax || "");
      setMinSqmPrice(imported.minSqmPrice || "");
      setMaxSqmPrice(imported.maxSqmPrice || "");
      setCityQuery(imported.cityQuery || "");
      setSizeMin(imported.sizeMin || "");
      setSizeMax(imported.sizeMax || "");
      setPetFriendly(imported.petFriendly === true);
      setNearMetro(imported.nearMetro === true);
      setPolygonCoordinates(imported.polygonCoordinates ?? []);
      if (imported.sortBy && SORT_OPTIONS.includes(imported.sortBy)) setSortBy(imported.sortBy);
      setFilterSetTitle(imported.title || "");
      setActiveSavedSetId(null);
      setActiveTab("all");
      setShowFilters(true);
    } catch {
      // Ignore malformed imported filter payloads.
    }
  }, [importedFilters]);

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setRecentSearches([]);
      setShowRecentSearches(false);
      return;
    }

    const unsubscribe = subscribeRecentSearches(auth.userId, (items) => {
      setRecentSearches(items);
    });

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!showSearch) {
      setShowRecentSearches(false);
    }
  }, [showSearch]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const savedSort = await storage.getItem<SortOption>(APARTMENTS_SORT_BY_STORAGE_KEY, "newest");
      if (!active || !savedSort) return;
      if (SORT_OPTIONS.includes(savedSort)) {
        setSortBy(savedSort);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void storage.setItem(APARTMENTS_SORT_BY_STORAGE_KEY, sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (!showFilters && isSortDropdownOpen) {
      setIsSortDropdownOpen(false);
    }
  }, [isSortDropdownOpen, showFilters]);

  useEffect(() => {
    if (!showNotesPanel || auth.isGuest || !auth.userId) {
      return;
    }

    let active = true;
    setLoadingNotes(true);

    void (async () => {
      try {
        const notes = await getUserApartmentNotes(auth.userId!);
        if (!active) return;
        const sorted = [...notes].sort((left, right) => {
          const leftIndex = Number.isFinite(left.orderIndex) ? left.orderIndex : Number.MAX_SAFE_INTEGER;
          const rightIndex = Number.isFinite(right.orderIndex) ? right.orderIndex : Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
        setNotesList(sorted);
      } catch {
        if (!active) return;
        setNotesList([]);
      } finally {
        if (active) setLoadingNotes(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.userId, showNotesPanel]);

  const handlePersistedSearch = useCallback(
    async (queryText: string) => {
      const trimmedQuery = queryText.trim();
      if (trimmedQuery.length >= 2 && !auth.isGuest && auth.userId) {
        try {
          await saveRecentSearch(auth.userId, trimmedQuery);
        } catch {
          // Keep search UX responsive even if persistence fails.
        }
      }
      setShowRecentSearches(false);
    },
    [auth.isGuest, auth.userId],
  );


  useEffect(() => {
    if (auth.isGuest || !auth.userId || !canOpenHostInbox) {
      setHostInboxHasUnread(false);
      return;
    }

    let mounted = true;
    
    // 🚨 Βγάλαμε το where("type", "==", "host")
    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId)
    );

    const unsubscribe = onSnapshot(hostChatsQ, (snapshot) => {
      void (async () => {
        try {
          const unreadFlags = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              
              // 🚨 Τοπικό φιλτράρισμα ρόλων
              if (chatData.type !== "host") return false;
              if (chatData.initiatedBy === auth.userId) return false;

              const counterpartId = (Array.isArray(chatData.users) ? chatData.users : []).find((uid) => uid !== auth.userId);
              if (!counterpartId) return false;

              try {
                const unreadQuery = query(
                  collection(db, "chats", chatDoc.id, "messages"),
                  where("senderId", "==", counterpartId),
                  where("isRead", "==", false),
                );
                const unreadSnapshot = await getDocs(unreadQuery);
                return !unreadSnapshot.empty;
              } catch (e) {
                // 🛡️ Fallback ασφαλείας
                const lastMsgSnap = await getDocs(query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1)));
                if (!lastMsgSnap.empty) {
                  const lastMsg = lastMsgSnap.docs[0].data();
                  return lastMsg.senderId === counterpartId && lastMsg.isRead === false;
                }
                return false;
              }
            }),
          );

          if (mounted) {
            setHostInboxHasUnread(unreadFlags.some(Boolean));
          }
        } catch {
          if (mounted) setHostInboxHasUnread(false);
        }
      })();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.isGuest, auth.userId, canOpenHostInbox]);

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setHostChatByApartmentId({});
      return;
    }

    const chatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId),
      where("type", "==", "host"),
    );

    const unsubscribe = onSnapshot(
      chatsQ,
      (snapshot) => {
        const nextMap: Record<string, ApartmentQuickChatMeta> = {};

        snapshot.docs.forEach((chatDoc) => {
          const data = chatDoc.data() as FirestoreHostChatDoc;
          const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId.trim() : "";
          if (!apartmentId) return;

          const users = Array.isArray(data.users) ? data.users : [];
          const hostId = users.find((uid) => uid !== auth.userId) ?? "";
          if (!hostId) return;

          const initiatedByCurrentUser = data.initiatedBy === auth.userId;
          nextMap[apartmentId] = {
            hasContactedHost: true,
            chatRoomId: chatDoc.id,
            hostId,
            initiatedByCurrentUser,
          };
        });

        setHostChatByApartmentId(nextMap);
      },
      () => {
        setHostChatByApartmentId({});
      },
    );

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (auth.isLoading) return;

    let active = true;

    (async () => {
      try {
        const apartmentsQuery = query(collection(db, "apartments"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(
          apartmentsQuery,
          async (snapshot) => {
            if (!active) return;

            const excludedUserIds = auth.userId ? await getExcludedUserIds(auth.userId) : new Set<string>();

            // Bidirectional visibility filtering for blocked users.
            const fetched = await Promise.all(
              snapshot.docs.map(async (snap): Promise<Apartment | null> => {
                const data = snap.data() as FirestoreApartmentDoc;
                const hostOrOwnerId = data.hostId || data.ownerId;
                if (hostOrOwnerId && excludedUserIds.has(hostOrOwnerId)) return null;

                const amenities = Array.isArray(data.amenities) ? data.amenities : [];
                const rawTags = Array.isArray(data.tags) ? data.tags : amenities;
                const tags = rawTags.map(normalizeTagSlug);
                const imageList = Array.isArray(data.images)
                  ? data.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
                  : [];
                const fallbackImage = typeof data.image === "string" ? data.image.trim() : "";
                const resolvedImages = imageList.length > 0 ? imageList : fallbackImage ? [fallbackImage] : [];
                const available = typeof data.available === "boolean" ? data.available : typeof data.isAvailable === "boolean" ? data.isAvailable : true;

                return {
                  id: snap.id,
                  title: data.title?.trim() || t("apartments.unknownListing"),
                  description: data.description || data.about || "",
                  propertyCategory:
                    typeof data.propertyCategory === "string" && data.propertyCategory.trim().length > 0
                      ? data.propertyCategory.trim()
                      : undefined,
                  propertyType:
                    typeof data.propertyType === "string" && data.propertyType.trim().length > 0
                      ? data.propertyType.trim()
                      : undefined,
                  floor:
                    typeof data.floor === "string" && data.floor.trim().length > 0
                      ? data.floor.trim()
                      : undefined,
                  area: data.area?.trim() || t("apartments.unknownArea"),
                  city: data.city?.trim() || t("apartments.unknownCity"),
                  address: data.address?.trim(),
                  latitude: typeof data.latitude === "number" ? data.latitude : undefined,
                  longitude: typeof data.longitude === "number" ? data.longitude : undefined,
                  hasExactLocation: data.hasExactLocation === true,
                  rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
                  rooms: typeof data.rooms === "number" ? data.rooms : 1,
                  size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
                  createdAt: parseTimestampToMillis(data.createdAt),
                  image: resolvedImages[0] || "",
                  images: resolvedImages,
                  tags: tags.length ? tags : ["new_listing"],
                  amenities,
                  hostId: data.hostId,
                  ownerId: data.ownerId || data.hostId,
                  assignedBrokerIds: Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds : [],
                  isOffMarket: data.isOffMarket === true,
                  offMarketAccessUserIds: Array.isArray(data.offMarketAccessUserIds) ? data.offMarketAccessUserIds : [],
                  status: data.status === "closed_deal" ? "closed_deal" : "active",
                  rentedToUserId: typeof data.rentedToUserId === "string" ? data.rentedToUserId : data.rentedToUserId === null ? null : null,
                  rentedAtMillis: parseTimestampToMillis(data.rentedAt) || null,
                  available,
                  watermarkConfig: data.watermarkConfig,
                };
              })
            );

            if (active) {
              setPublishedApartments(fetched.filter((item): item is Apartment => item !== null));
            }
          },
          () => {
            if (active) setPublishedApartments([]);
          },
        );

        return () => unsubscribe();
      } catch (err) {
        console.error("Failed to fetch apartments:", err);
        if (active) setPublishedApartments([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, auth.isLoading]);

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

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setHasPublishedHostApartment(false);
      setHasApartmentShareFlag(false);
      return;
    }

    const apartmentsQ = query(collection(db, "apartments"), where("hostId", "==", auth.userId));
    const unsubscribeApartments = onSnapshot(apartmentsQ, (snapshot) => {
      setHasPublishedHostApartment(snapshot.size > 0);
    });

    const userRef = doc(db, "users", auth.userId);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as FirestoreHostInboxUserDoc) : null;
      setHasApartmentShareFlag(snapshot.exists() && !!(data?.already_have_apartment_to_share || data?.has_place));
    });

    return () => {
      unsubscribeApartments();
      unsubscribeUser();
    };
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!canManageListings && isViewingMyListings) {
      setIsViewingMyListings(false);
    }
  }, [canManageListings, isViewingMyListings]);

  const handleSwipeTabChange = useCallback(
    (direction: "left" | "right") => {
      if (isViewingMyListings) {
        if (!auth.isBroker) {
          setViewMode("list");
          return;
        }
        if (direction === "left") {
          setViewMode("compact");
          return;
        }
        setViewMode("grid");
        return;
      }

      if (direction === "left") {
        setActiveTab("liked");
        return;
      }
      setActiveTab("all");
    },
    [auth.isBroker, isViewingMyListings],
  );

  const contentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            handleSwipeTabChange("left");
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            handleSwipeTabChange("right");
          }
        },
      }),
    [handleSwipeTabChange],
  );

  useEffect(() => {
    if (auth.isGuest || !auth.userId || !canOpenHostInbox) {
      setHostInboxHasUnread(false);
      return;
    }

    let mounted = true;
    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId),
      where("type", "==", "host"),
    );

    const unsubscribe = onSnapshot(hostChatsQ, (snapshot) => {
      void (async () => {
        try {
          const unreadFlags = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              
              // 🚨 ΚΑΘΟΡΙΣΤΙΚΟΣ ΕΛΕΓΧΟΣ:
              // Αν το chat αυτό το ξεκινήσαμε εμείς (auth.userId), τότε είμαστε ο Guest/Student.
              // Επομένως, το chat αυτό ανήκει στο Matches Screen και ΟΧΙ στο δικό μας Host Inbox!
              if (chatData.initiatedBy === auth.userId) return false;

              const counterpartId = (Array.isArray(chatData.users) ? chatData.users : []).find((uid) => uid !== auth.userId);
              if (!counterpartId) return false;

              const unreadQuery = query(
                collection(db, "chats", chatDoc.id, "messages"),
                where("senderId", "==", counterpartId),
                where("isRead", "==", false),
              );
              const unreadSnapshot = await getDocs(unreadQuery);
              return !unreadSnapshot.empty;
            }),
          );

          if (mounted) {
            setHostInboxHasUnread(unreadFlags.some(Boolean));
          }
        } catch {
          if (mounted) setHostInboxHasUnread(false);
        }
      })();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.isGuest, auth.userId, canOpenHostInbox]);

  // 🟢 Real-time συγχρονισμός των Likes μεταξύ Feed και Detail Screen
  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setLikedApartmentIds(new Set());
      setLikedApartmentTimestampById({});
      return;
    }

    const likesQ = query(collection(db, "liked_apartments"), where("userId", "==", auth.userId));
    const unsubscribe = onSnapshot(likesQ, (snapshot) => {
      const ids = new Set<string>();
      const timestampMap: Record<string, number> = {};

      snapshot.forEach((item) => {
        const data = item.data() as FirestoreLikedApartmentDoc;
        const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId : "";
        if (!apartmentId) return;

        ids.add(apartmentId);
        const likedAt = parseTimestampToMillis(data.timestamp);
        if (likedAt > 0) {
          timestampMap[apartmentId] = likedAt;
        }
      });

      setLikedApartmentIds(ids);
      setLikedApartmentTimestampById(timestampMap);
    });

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  const apartments = useMemo(() => [...publishedApartments], [publishedApartments]);

  const handleToggleLike = useCallback(
    async (apartmentId: string) => {
      if (auth.isGuest || !auth.userId) {
        router.push("/auth-landing");
        return;
      }

      const wasLiked = likedApartmentIds.has(apartmentId);
      setLikedApartmentIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(apartmentId);
        else next.add(apartmentId);
        return next;
      });

      try {
        const isLiked = await toggleApartmentLike(auth.userId, apartmentId);
        setLikedApartmentIds((prev) => {
          const next = new Set(prev);
          if (isLiked) next.add(apartmentId);
          else next.delete(apartmentId);
          return next;
        });
      } catch {
        setLikedApartmentIds((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(apartmentId);
          else next.delete(apartmentId);
          return next;
        });
        setLikeErrorModalVisible(true);
      }
    },
    [auth.isGuest, auth.userId, likedApartmentIds, router],
  );

  const filteredApartments = useMemo(() => {
    const minRent = rentMin ? Number(rentMin) : null;
    const maxRent = rentMax ? Number(rentMax) : null;
    const minSqm = minSqmPrice ? parseFloat(minSqmPrice) : Number.NaN;
    const maxSqm = maxSqmPrice ? parseFloat(maxSqmPrice) : Number.NaN;
    const minSize = sizeMin ? Number(sizeMin) : null;
    const maxSize = sizeMax ? Number(sizeMax) : null;
    const locationQuery = cityQuery.trim().toLowerCase();
    const normalizedSearch = normalizeText(searchQuery);
    const currentUid = auth.userId;

    const baseFiltered = apartments.filter((apt) => {
      const isDirectOwner = !!currentUid && (apt.ownerId === currentUid || apt.hostId === currentUid);
      const isAssignedBroker = !!currentUid && auth.isBroker === true && Array.isArray(apt.assignedBrokerIds) && apt.assignedBrokerIds.includes(currentUid);
      const isOwnListing = isDirectOwner || isAssignedBroker;
      const isPrivilegedClient = !!currentUid && Array.isArray(apt.offMarketAccessUserIds) && apt.offMarketAccessUserIds.includes(currentUid);
      if (apt.isOffMarket && !isOwnListing && !isPrivilegedClient) return false;
      const isClosedDeal = apt.status === "closed_deal";
      const likedAtMillis = likedApartmentTimestampById[apt.id] ?? 0;
      const closedAtMillis = typeof apt.rentedAtMillis === "number" ? apt.rentedAtMillis : 0;
      const isSelectedRenter = !!currentUid && !!apt.rentedToUserId && apt.rentedToUserId === currentUid;
      const likedBeforeClosure = likedAtMillis > 0 && (closedAtMillis <= 0 || likedAtMillis <= closedAtMillis);

      if (isViewingMyListings) {
        if (!isOwnListing) return false;
      } else {
        if (activeTab === "all" && isClosedDeal && !isOwnListing) {
          return false;
        }

        if (activeTab === "liked" && !likedApartmentIds.has(apt.id)) {
          return false;
        }

        if (activeTab === "liked" && isClosedDeal) {
          const canViewClosedLiked =
            isOwnListing ||
            (isSelectedRenter && likedBeforeClosure);
          if (!canViewClosedLiked) {
            return false;
          }
        }

        if (activeTab === "liked" && isOwnListing && !isClosedDeal) {
          return false;
        }
        if (activeTab === "all" && isOwnListing && !showOwnListingsInFeed) {
          return false;
        }
      }

      if (selectedBrokerFilter !== null) {
        const isOwner = apt.hostId === selectedBrokerFilter.id || apt.ownerId === selectedBrokerFilter.id;
        const isAssigned = Array.isArray(apt.assignedBrokerIds) && apt.assignedBrokerIds.includes(selectedBrokerFilter.id);
        if (!isOwner && !isAssigned) return false;
      }

      if (polygonCoordinates.length >= 3) {
        if (!Number.isFinite(apt.latitude) || !Number.isFinite(apt.longitude)) return false;
        if (!isPointInPolygon({ latitude: apt.latitude!, longitude: apt.longitude! }, polygonCoordinates)) return false;
      }

      const cityMatch =
        locationQuery.length === 0 ||
        apt.city.toLowerCase().includes(locationQuery) ||
        apt.area.toLowerCase().includes(locationQuery);
      const rentMatch =
        (minRent == null || apt.rent >= minRent) &&
        (maxRent == null || apt.rent <= maxRent);
      const sizeMatch =
        (minSize == null || apt.size >= minSize) &&
        (maxSize == null || apt.size <= maxSize);
      const petMatch = !petFriendly || apt.tags.includes("pet_friendly");
      const metroMatch = !nearMetro || apt.tags.includes("near_metro");
      const sqmPrice = calculatePricePerSqm(apt.rent, apt.size);

      if (!Number.isNaN(minSqm) && sqmPrice < minSqm) return false;
      if (!Number.isNaN(maxSqm) && sqmPrice > maxSqm) return false;

      return cityMatch && rentMatch && sizeMatch && petMatch && metroMatch;
    });

    if (!normalizedSearch) return baseFiltered;

    return baseFiltered
      .map((apt, index) => {
        const titleNorm = normalizeText(apt.title);
        const areaNorm = normalizeText(apt.area);
        const descriptionNorm = normalizeText(apt.description || "");
        const tagsNorm = apt.tags.map((tag) => normalizeText(tag));
        const amenitiesNorm = apt.amenities.map((amenity) => normalizeText(amenity));

        let score = 0;
        if (titleNorm.includes(normalizedSearch)) score += 4;
        if (areaNorm.includes(normalizedSearch)) score += 3;
        if (descriptionNorm.includes(normalizedSearch)) score += 2;
        if (
          tagsNorm.some((item) => item.includes(normalizedSearch)) ||
          amenitiesNorm.some((item) => item.includes(normalizedSearch))
        ) {
          score += 1;
        }

        return { apt, score, index };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.apt);
  }, [
    activeTab,
    apartments,
    auth.isBroker,
    auth.userId,
    cityQuery,
    isViewingMyListings,
    likedApartmentIds,
    nearMetro,
    petFriendly,
    minSqmPrice,
    maxSqmPrice,
    rentMax,
    rentMin,
    searchQuery,
    selectedBrokerFilter,
    showOwnListingsInFeed,
    sizeMax,
    sizeMin,
    likedApartmentTimestampById,
    polygonCoordinates,
  ]);

  const sortedApartments = useMemo(() => {
    return [...filteredApartments].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return (a.createdAt || 0) - (b.createdAt || 0);
        case "price_asc":
          return (a.rent || 0) - (b.rent || 0);
        case "price_desc":
          return (b.rent || 0) - (a.rent || 0);
        case "size_asc":
          return (a.size || 0) - (b.size || 0);
        case "size_desc":
          return (b.size || 0) - (a.size || 0);
        case "price_sqm_asc":
          return calculatePricePerSqm(a.rent, a.size) - calculatePricePerSqm(b.rent, b.size);
        case "price_sqm_desc":
          return calculatePricePerSqm(b.rent, b.size) - calculatePricePerSqm(a.rent, a.size);
        case "newest":
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });
  }, [filteredApartments, sortBy]);

  const mapRegion = useMemo<Region>(() => {
    const locatedApartments = filteredApartments.filter(
      (apt) => Number.isFinite(apt.latitude) && Number.isFinite(apt.longitude),
    );
    if (locatedApartments.length === 0) {
      return { latitude: 37.9838, longitude: 23.7275, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }

    const latitudes = locatedApartments.map((apt) => apt.latitude!);
    const longitudes = locatedApartments.map((apt) => apt.longitude!);
    const latitudeDelta = Math.max(0.04, Math.min(1.2, Math.max(...latitudes) - Math.min(...latitudes) + 0.04));
    const longitudeDelta = Math.max(0.04, Math.min(1.2, Math.max(...longitudes) - Math.min(...longitudes) + 0.04));
    return {
      latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  }, [filteredApartments]);

  useEffect(() => {
    if (!auth.isBroker && viewMode !== "list") {
      setViewMode("list");
      setSelectedMapApartment(null);
    }
  }, [auth.isBroker, viewMode]);

  useEffect(() => {
    if (auth.isBroker && viewMode === "map") {
      mapRef.current?.animateToRegion(mapRegion, 350);
      setSelectedMapApartment(null);
    }
  }, [auth.isBroker, mapRegion, viewMode]);

  const isCompactActive = isViewingMyListings && viewMode === "compact";

  return (
    <View style={styles.container} testID="apartments-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRowTop}>
          <Text style={styles.title}>{t("apartments.title")}</Text>
          {canManageListings ? (
            <Pressable
              style={[styles.myListingsPill, isViewingMyListings && styles.myListingsPillActive]}
              onPress={() => setIsViewingMyListings((prev) => !prev)}
              testID="apartments-my-listings-pill"
            >
              <Text style={[styles.myListingsPillText, isViewingMyListings && styles.myListingsPillTextActive]}>
                {t("apartments.myListings")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>{t("apartments.subtitle")}</Text>
        <View style={styles.headerControlsRow}>
          <Pressable
            style={[styles.iconControlButton, showFilters && styles.iconControlButtonActive]}
            onPress={() => setShowFilters((v) => !v)}
            testID="apartments-filter-toggle"
          >
            <Ionicons name="options-outline" size={18} color={colors.onBrandTertiary} />
          </Pressable>
          <Pressable
            style={[styles.iconControlButton, showSearch && styles.iconControlButtonActive]}
            onPress={() => setShowSearch((prev) => !prev)}
            testID="apartments-search-toggle"
          >
            <Ionicons name="search-outline" size={18} color={colors.onBrandTertiary} />
          </Pressable>
          {auth.isBroker ? (
            <Pressable
              style={[styles.iconControlButton, styles.mapToggleButton]}
              onPress={() => setViewMode((previous) => previous === "map" ? "list" : "map")}
              hitSlop={8}
              testID="broker-map-toggle-btn"
            >
              <Ionicons name={viewMode === "map" ? "list-outline" : "map-outline"} size={20} color={colors.onSurface} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.iconControlButton, showNotesPanel && styles.iconControlButtonActive]}
              onPress={() => setShowNotesPanel((previous) => !previous)}
              hitSlop={8}
              testID="seeker-notes-btn"
            >
              <Ionicons name="document-text-outline" size={18} color={colors.onBrandTertiary} />
            </Pressable>
          )}
          {!isViewingMyListings ? (
            <View style={styles.viewToggle} testID="apartments-view-toggle">
              <Pressable
                style={[styles.viewToggleOption, activeTab === "all" && styles.viewToggleOptionActive]}
                onPress={() => setActiveTab("all")}
                testID="apartments-view-all"
              >
                <Text style={[styles.viewToggleText, activeTab === "all" && styles.viewToggleTextActive]}>{t("apartments.all")}</Text>
              </Pressable>
              <Pressable
                style={[styles.viewToggleOption, activeTab === "liked" && styles.viewToggleOptionActive]}
                onPress={() => setActiveTab("liked")}
                testID="apartments-view-liked"
              >
                <Text
                  style={[styles.viewToggleText, activeTab === "liked" && styles.viewToggleTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t("apartments.liked")}
                </Text>
              </Pressable>
            </View>
          ) : auth.isBroker ? (
            <View style={styles.viewToggle} testID="apartments-view-toggle">
              <Pressable
                style={[styles.viewToggleOption, viewMode === "grid" && styles.viewToggleOptionActive]}
                onPress={() => setViewMode("grid")}
                testID="apartments-view-grid"
              >
                <Ionicons
                  name={viewMode === "grid" ? "grid" : "grid-outline"}
                  size={19}
                  color={viewMode === "grid" ? colors.onBrand : colors.onBrandTertiary}
                />
              </Pressable>
              <Pressable
                style={[styles.viewToggleOption, viewMode === "compact" && styles.viewToggleOptionActive]}
                onPress={() => setViewMode("compact")}
                testID="apartments-view-compact"
              >
                <Ionicons
                  name={viewMode === "compact" ? "list" : "contract-outline"}
                  size={19}
                  color={viewMode === "compact" ? colors.onBrand : colors.onBrandTertiary}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
        {showSearch && (
          <View style={styles.searchPanel} testID="apartments-search-panel">
            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={18} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  void handlePersistedSearch(searchQuery);
                }}
                placeholder="Αναζήτηση τίτλου, περιοχής, amenities..."
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="apartments-search-input"
              />
              <View style={styles.searchActionsWrap}>
                <Pressable
                  onPress={() => setShowRecentSearches((prev) => !prev)}
                  style={[styles.searchHistoryBtn, showRecentSearches && styles.searchHistoryBtnActive]}
                  testID="apartments-search-history-toggle"
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={showRecentSearches ? colors.onBrand : colors.onSurfaceTertiary}
                  />
                </Pressable>
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")} style={styles.searchClearBtn} testID="apartments-search-clear">
                    <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
                  </Pressable>
                )}
              </View>
            </View>
            {showRecentSearches ? (
              <View style={styles.recentSearchesPanel} testID="apartments-recent-searches-panel">
                <ScrollView
                  style={styles.recentSearchesScroll}
                  contentContainerStyle={styles.recentSearchesContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {recentSearches.length === 0 ? (
                    <View style={styles.recentSearchEmptyRow}>
                      <Text style={styles.recentSearchEmptyText}>Δεν υπάρχουν πρόσφατες αναζητήσεις</Text>
                    </View>
                  ) : (
                    recentSearches.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.recentSearchRow}
                        onPress={() => {
                          setSearchQuery(item);
                          void handlePersistedSearch(item);
                        }}
                        testID={`apartments-recent-search-${item}`}
                      >
                        <Ionicons name="time-outline" size={16} color={colors.onSurfaceTertiary} />
                        <Text style={styles.recentSearchText} numberOfLines={1}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}
        {showFilters && (
          <ScrollView
            style={styles.filterPanel}
            contentContainerStyle={styles.filterPanelContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            nestedScrollEnabled={true}
            testID="apartments-filter-panel"
          >
            <View style={styles.filterActionsRow}>
              <Pressable
                style={[styles.filterActionButton, showHistoryModal && styles.filterActionButtonActive]}
                onPress={() => {
                  setSelectedSetForPreview(null);
                  setShowHistoryModal(true);
                }}
                testID="apartments-filter-history-btn"
              >
                <Ionicons name="time-outline" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable style={styles.filterActionButton} onPress={() => void shareFilterSet()} testID="apartments-filter-share-btn">
                <Ionicons name="share-social-outline" size={18} color={colors.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.sortTitle}>Ταξινόμηση</Text>
            <Pressable
              style={styles.sortSelectionBar}
              onPress={() => setIsSortDropdownOpen((prev) => !prev)}
              testID="apartments-sort-toggle"
            >
              <Text style={styles.sortSelectionText}>{SORT_OPTION_LABELS[sortBy]}</Text>
              <Ionicons
                name={isSortDropdownOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>

            {isSortDropdownOpen ? (
              <View style={styles.sortDropdownList} testID="apartments-sort-dropdown">
                {SORT_OPTIONS.map((option) => {
                  const isActive = option === sortBy;
                  return (
                    <Pressable
                      key={option}
                      style={styles.sortOptionRow}
                      onPress={() => {
                        setSortBy(option);
                        setIsSortDropdownOpen(false);
                      }}
                      testID={`apartments-sort-option-${option}`}
                    >
                      <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>{SORT_OPTION_LABELS[option]}</Text>
                      {isActive ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.polygonFilterSection}>
              <Text style={styles.filterLabel}>Περιοχή στο Χάρτη</Text>
              <Pressable
                style={[styles.polygonTriggerButton, polygonCoordinates.length >= 3 && styles.polygonTriggerButtonActive]}
                onPress={() => setIsPolygonModalVisible(true)}
                testID="open-polygon-draw-modal"
              >
                <Ionicons
                  name={polygonCoordinates.length >= 3 ? "map" : "map-outline"}
                  size={18}
                  color={polygonCoordinates.length >= 3 ? colors.onBrand : colors.onSurface}
                />
                <Text style={[styles.polygonTriggerText, polygonCoordinates.length >= 3 && styles.polygonTriggerTextActive]} numberOfLines={2}>
                  {polygonCoordinates.length >= 3
                    ? `Προσαρμοσμένο Πολύγωνο (${polygonCoordinates.length} σημεία)`
                    : "Σχεδιασμός πολυγώνου στο χάρτη"}
                </Text>
                {polygonCoordinates.length >= 3 ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      setPolygonCoordinates([]);
                    }}
                    hitSlop={8}
                    testID="clear-polygon-filter"
                  >
                    <Ionicons name="close-circle" size={18} color={colors.onBrand} />
                  </Pressable>
                ) : null}
              </Pressable>
            </View>

            <Text style={[styles.sortTitle, { marginTop: spacing.md }]}>Show only</Text>
            <View style={styles.showOnlyRow}>
              <Pressable
                style={styles.showOnlyCard}
                onPress={() => setShowOnlyModalType("agency")}
                testID="apartments-show-only-agency"
              >
                <Ionicons name="business-outline" size={20} color={colors.onSurface} />
                <Text style={styles.showOnlyLabel} numberOfLines={1}>Μεσιτικό γραφείο</Text>
              </Pressable>
              <Pressable
                style={[styles.showOnlyCard, selectedBrokerFilter && styles.showOnlyCardActive]}
                onPress={() => setShowOnlyModalType("broker")}
                testID="apartments-show-only-broker"
              >
                <Ionicons name="person-outline" size={20} color={selectedBrokerFilter ? colors.onBrand : colors.onSurface} />
                <Text style={[styles.showOnlyLabel, selectedBrokerFilter && styles.showOnlyLabelActive]} numberOfLines={1}>
                  {selectedBrokerFilter ? selectedBrokerFilter.name : "Μεσίτης"}
                </Text>
                {selectedBrokerFilter ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      setSelectedBrokerFilter(null);
                    }}
                    hitSlop={8}
                    testID="apartments-clear-broker-filter"
                  >
                    <Ionicons name="close-circle" size={16} color={colors.onBrand} />
                  </Pressable>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.showOnlyCard}
                onPress={() => setShowOnlyModalType("list")}
                testID="apartments-show-only-list"
              >
                <Ionicons name="list-outline" size={20} color={colors.onSurface} />
                <Text style={styles.showOnlyLabel} numberOfLines={1}>Λίστα</Text>
              </Pressable>
            </View>

            {isHostUser && !isViewingMyListings ? (
              <View style={styles.hostFeedToggleRow} testID="apartments-own-listings-toggle-row">
                <View style={styles.hostFeedToggleTextWrap}>
                  <Text style={styles.hostFeedToggleTitle}>Εμφάνιση των δικών μου καταχωρίσεων στο All</Text>
                </View>
                <Switch
                  value={showOwnListingsInFeed}
                  onValueChange={setShowOwnListingsInFeed}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={showOwnListingsInFeed ? colors.onBrand : colors.onSurface}
                  testID="apartments-own-listings-toggle"
                />
              </View>
            ) : null}

            <Text style={styles.filterLabel}>Τίτλος set φίλτρων</Text>
            <TextInput
              style={styles.singleInput}
              value={filterSetTitle}
              onChangeText={setFilterSetTitle}
              maxLength={40}
              placeholder="π.χ. 2άρι κέντρο φοιτητικό (έως 40 χαρ.)"
              placeholderTextColor={colors.onSurfaceTertiary}
              testID="apartments-filter-set-title-input"
            />
            <Pressable
              style={[styles.saveFilterSetButton, savingFilterSet && styles.saveFilterSetButtonDisabled]}
              onPress={() => void saveFilterSet()}
              disabled={savingFilterSet || auth.isGuest || !auth.userId}
              testID="apartments-filter-set-save"
            >
              <Ionicons name="bookmark-outline" size={17} color={colors.onBrand} />
              <Text style={styles.saveFilterSetButtonText}>Αποθήκευση Set</Text>
            </Pressable>

            <Text style={styles.filterLabel}>{t("apartments.monthlyRent", { currency: CURRENCY })}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={rentMin}
                  onChangeText={(value) => updateFilterValue(setRentMin, value.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.min")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={rentMax}
                  onChangeText={(value) => updateFilterValue(setRentMax, value.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.max")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-max"
              />
            </View>

            <Text style={styles.filterLabel}>Τιμή ανά τ.μ. (€/m²)</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={minSqmPrice}
                onChangeText={(value) => updateFilterValue(setMinSqmPrice, sanitizeDecimalInput(value))}
                placeholder="Από (€/m²)"
                keyboardType="numeric"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-sqm-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={maxSqmPrice}
                onChangeText={(value) => updateFilterValue(setMaxSqmPrice, sanitizeDecimalInput(value))}
                placeholder="Έως (€/m²)"
                keyboardType="numeric"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-sqm-max"
              />
            </View>

            <Text style={styles.filterLabel}>{t("apartments.areaCity")}</Text>
            <TextInput
              style={styles.singleInput}
              value={cityQuery}
              onChangeText={(value) => updateFilterValue(setCityQuery, value)}
              placeholder={t("apartments.cityPlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              testID="apartments-city-filter"
            />

            <Text style={styles.filterLabel}>{t("apartments.squareMeters")}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={sizeMin}
                onChangeText={(value) => updateFilterValue(setSizeMin, value.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.min")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={sizeMax}
                onChangeText={(value) => updateFilterValue(setSizeMax, value.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.max")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-max"
              />
            </View>

            <Text style={styles.filterLabel}>{t("apartments.preferences")}</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t("apartments.petFriendly")}</Text>
              <Switch value={petFriendly} onValueChange={(value) => updateFilterValue(setPetFriendly, value)} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t("apartments.nearMetro")}</Text>
              <Switch value={nearMetro} onValueChange={(value) => updateFilterValue(setNearMetro, value)} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
          </ScrollView>
        )}
      </View>
      <View {...contentPanResponder.panHandlers} style={styles.flexOne}>
      {auth.isBroker && viewMode === "map" ? (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={mapRegion}
            onPress={() => setSelectedMapApartment(null)}
          >
            {filteredApartments.map((apt) => {
              if (!Number.isFinite(apt.latitude) || !Number.isFinite(apt.longitude)) return null;
              const pinLabel = `${apt.rent}${CURRENCY}`;
              const isSelected = selectedMapApartment?.id === apt.id;
              return (
                <Marker
                  key={apt.id}
                  coordinate={{ latitude: apt.latitude!, longitude: apt.longitude! }}
                  onPress={() => setSelectedMapApartment(apt)}
                >
                  <View style={[styles.markerBubble, isSelected && styles.markerBubbleSelected]}>
                    <Text style={[styles.markerBubbleText, isSelected && styles.markerBubbleTextSelected]}>{pinLabel}</Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>
          {selectedMapApartment ? (
            <View style={styles.mapCardPreviewOverlay}>
              <ApartmentGridCard
                apt={selectedMapApartment}
                styles={styles}
                colors={colors}
                isLiked={likedApartmentIds.has(selectedMapApartment.id)}
                isOwnListing={false}
                isMyListingsView={isViewingMyListings}
                quickChatMeta={hostChatByApartmentId[selectedMapApartment.id]}
                onOpen={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(selectedMapApartment) } } as any)}
                onToggleLike={() => handleToggleLike(selectedMapApartment.id)}
              />
            </View>
          ) : null}
        </View>
      ) : <ScrollView
        contentContainerStyle={[styles.list, isCompactActive && styles.compactList, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {isCompactActive && sortedApartments.length > 0 && (
          <View style={styles.compactHeaderRow}>
            <View style={styles.compactThumbSpacer} />
            <View style={[styles.compactCol, styles.compactAreaCol]}>
              <Text style={styles.compactHeaderPill}>Περιοχή</Text>
            </View>
            <View style={[styles.compactCol, styles.compactSqmCol]}>
              <Text style={styles.compactHeaderPill}>Τ.μ.</Text>
            </View>
            <View style={[styles.compactCol, styles.compactAvailCol]}>
              <Text style={styles.compactHeaderPill}>Διαθ.</Text>
            </View>
            <View style={[styles.compactCol, styles.compactRentCol]}>
              <Text style={styles.compactHeaderPill}>Νοίκιο</Text>
            </View>
          </View>
        )}

        {sortedApartments.map((apt) => {
          const isLiked = likedApartmentIds.has(apt.id);
          const isMyListingsView = isViewingMyListings;
          const isDirectOwner = !!auth.userId && (apt.ownerId === auth.userId || apt.hostId === auth.userId);
          const isAssignedBroker = !!auth.userId && auth.isBroker === true && Array.isArray(apt.assignedBrokerIds) && apt.assignedBrokerIds.includes(auth.userId);
          const isOwnListing = isDirectOwner || isAssignedBroker;
          const chatMeta = hostChatByApartmentId[apt.id];
          const canShowQuickChat =
            !!chatMeta &&
            !!auth.userId &&
            apt.hostId !== auth.userId &&
            (chatMeta.initiatedByCurrentUser || apt.hostId !== auth.userId);
          const quickChatMeta = canShowQuickChat ? chatMeta : undefined;

          if (isCompactActive) {
            return (
              <TouchableOpacity
                key={apt.id}
                style={styles.compactRowCard}
                activeOpacity={0.86}
                onPress={() =>
                  router.push({
                    pathname: "/apartment-detail",
                    params: { data: JSON.stringify(apt) },
                  } as any)
                }
                testID={`apartment-compact-row-${apt.id}`}
              >
                {apt.image ? (
                  <Image source={{ uri: apt.image }} style={styles.compactThumb} contentFit="cover" transition={100} />
                ) : (
                  <View style={[styles.compactThumb, styles.compactThumbPlaceholder]}>
                    <Ionicons name="home" size={16} color={colors.brand} />
                  </View>
                )}

                <View style={[styles.compactCol, styles.compactAreaCol]}>
                  <Text style={styles.compactNeutralPill} numberOfLines={1}>
                    {apt.area}
                  </Text>
                </View>

                <View style={[styles.compactCol, styles.compactSqmCol]}>
                  <Text style={styles.compactCellText} numberOfLines={1}>
                    {apt.size}
                  </Text>
                </View>

                <View style={[styles.compactCol, styles.compactAvailCol]}>
                  <View style={[styles.availabilityBadge, apt.available ? styles.availabilityOn : styles.availabilityOff]}>
                    <Ionicons name={apt.available ? "checkmark" : "close"} size={12} color={apt.available ? colors.onBrand : colors.onSurfaceTertiary} />
                  </View>
                </View>

                <View style={[styles.compactCol, styles.compactRentCol]}>
                  <Text style={styles.compactRentPill} numberOfLines={1}>
                    {`${apt.rent}${CURRENCY}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <ApartmentGridCard
              key={apt.id}
              apt={apt}
              styles={styles}
              colors={colors}
              isLiked={isLiked}
              isOwnListing={isOwnListing}
              isMyListingsView={isMyListingsView}
              quickChatMeta={quickChatMeta}
              onOpen={() =>
                router.push({
                  pathname: "/apartment-detail",
                  params: { data: JSON.stringify(apt) },
                } as any)
              }
              onToggleLike={() => handleToggleLike(apt.id)}
            />
          );
        })}
        {sortedApartments.length === 0 && (
          <View style={styles.emptyState} testID="apartments-empty-state">
            <Text style={styles.emptyTitle}>
              {isViewingMyListings
                ? t("apartments.emptyMine")
                : activeTab === "liked"
                ? t("apartments.emptyLiked")
                : t("apartments.emptyFiltered")}
            </Text>
            {!isViewingMyListings && activeTab !== "liked" && (
              <Text style={styles.emptySub}>{t("apartments.emptyHint")}</Text>
            )}
          </View>
        )}
      </ScrollView>}
      </View>
      {showCreateFab && (
        <View style={[styles.fabCluster, { bottom: TAB_BAR_SPACE + insets.bottom + spacing.md }]}>
          {showHostInboxFab && (
            <Pressable
              style={[styles.hostInboxFab, hostInboxHasUnread && styles.hostInboxFabUnread]}
              onPress={() => router.push("/host-inbox" as any)}
              testID="apartments-host-inbox-fab"
            >
              <Text style={[styles.hostInboxFabText, hostInboxHasUnread && styles.hostInboxFabTextUnread]}>✉️</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.fab}
            onPress={() => router.push("/create-listing" as any)}
            testID="apartments-create-fab"
          >
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        </View>
      )}

      <CenteredActionModal
        visible={likeErrorModalVisible}
        title={t("apartments.likeUpdateTitle")}
        description={t("apartments.likeUpdateMessage")}
        onDismiss={() => setLikeErrorModalVisible(false)}
        actions={[
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setLikeErrorModalVisible(false),
          },
        ]}
        testID="apartments-like-error-modal"
      />

      <CenteredActionModal
        visible={shareConfirmationVisible}
        title="Το set φίλτρων κοινοποιήθηκε επιτυχώς στον μεσίτη!"
        onDismiss={() => setShareConfirmationVisible(false)}
        actions={[
          {
            label: "OK",
            iconName: "checkmark-circle-outline",
            onPress: () => setShareConfirmationVisible(false),
            testID: "apartments-filter-share-confirmation-ok",
          },
        ]}
        testID="apartments-filter-share-confirmation"
      />

      <Modal
        visible={showOnlyModalType !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOnlyModalType(null)}
      >
        <View style={styles.filterHistoryBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOnlyModalType(null)} />
          <View style={styles.filterHistoryCard} testID="apartments-show-only-modal">
            <View style={styles.filterHistoryHeader}>
              <Text style={styles.filterHistoryTitle}>
                {showOnlyModalType === "agency" ? "Μεσιτικό γραφείο" : showOnlyModalType === "list" ? "Λίστα" : "Επιλογή Μεσίτη"}
              </Text>
              <Pressable
                style={styles.filterHistoryCloseButton}
                onPress={() => setShowOnlyModalType(null)}
                testID="apartments-show-only-close"
              >
                <Ionicons name="close-outline" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {showOnlyModalType === "agency" || showOnlyModalType === "list" ? (
              <View style={styles.showOnlyPlaceholderWrap}>
                <Ionicons name="construct-outline" size={36} color={colors.brand} />
                <Text style={styles.showOnlyPlaceholderText}>Δουλεύουμε σε αυτό</Text>
              </View>
            ) : null}
            {showOnlyModalType === "broker" ? (
              loadingBrokerDirectory ? (
                <View style={styles.filterHistoryState}>
                  <ActivityIndicator size="small" color={colors.brand} />
                </View>
              ) : brokerDirectory.length === 0 ? (
                <View style={styles.filterHistoryState}>
                  <Text style={styles.filterHistoryMutedText}>Δεν βρέθηκαν διαθέσιμοι μεσίτες.</Text>
                </View>
              ) : (
                <ScrollView style={styles.filterHistoryList} contentContainerStyle={styles.filterHistoryListContent}>
                  {brokerDirectory.map((broker) => {
                    const isSelected = selectedBrokerFilter?.id === broker.id;
                    return (
                      <Pressable
                        key={broker.id}
                        style={[styles.brokerShareRow, isSelected && styles.brokerRowSelected]}
                        onPress={() => {
                          setSelectedBrokerFilter(broker);
                          setShowOnlyModalType(null);
                        }}
                        testID={`apartments-select-broker-${broker.id}`}
                      >
                        {broker.avatar ? (
                          <Image source={{ uri: broker.avatar }} style={styles.brokerShareAvatar} contentFit="cover" />
                        ) : (
                          <View style={styles.brokerShareAvatarFallback}>
                            <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} />
                          </View>
                        )}
                        <Text style={styles.brokerShareName} numberOfLines={1}>{broker.name}</Text>
                        <Ionicons name={isSelected ? "checkmark-circle" : "chevron-forward"} size={20} color={isSelected ? colors.brand : colors.onSurfaceTertiary} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={brokerShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBrokerShareModalVisible(false)}
      >
        <View style={styles.filterHistoryBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBrokerShareModalVisible(false)} />
          <View style={styles.filterHistoryCard} testID="apartments-broker-share-modal">
            <View style={styles.filterHistoryHeader}>
              <Text style={styles.filterHistoryTitle}>Κοινοποίηση σε μεσίτη</Text>
              <Pressable
                style={styles.filterHistoryCloseButton}
                onPress={() => setBrokerShareModalVisible(false)}
                testID="apartments-broker-share-close"
              >
                <Ionicons name="close-outline" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {loadingBrokers ? (
              <View style={styles.filterHistoryState}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : availableBrokers.length === 0 ? (
              <View style={styles.filterHistoryState}>
                <Text style={styles.filterHistoryMutedText}>Δεν βρέθηκαν διαθέσιμοι μεσίτες.</Text>
              </View>
            ) : (
              <ScrollView style={styles.filterHistoryList} contentContainerStyle={styles.filterHistoryListContent}>
                {availableBrokers.map((broker) => (
                  <View key={broker.id} style={styles.brokerShareRow}>
                    {broker.avatar ? (
                      <Image source={{ uri: broker.avatar }} style={styles.brokerShareAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.brokerShareAvatarFallback}>
                        <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                    <Text style={styles.brokerShareName} numberOfLines={1}>{broker.name}</Text>
                    <Pressable
                      style={[styles.brokerShareSendButton, sendingBrokerId === broker.id && styles.saveFilterSetButtonDisabled]}
                      onPress={() => void sendFilterSetToBroker(broker.id)}
                      disabled={sendingBrokerId !== null}
                      testID={`apartments-send-filter-set-${broker.id}`}
                    >
                      {sendingBrokerId === broker.id ? (
                        <ActivityIndicator size="small" color={colors.onBrand} />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={18} color={colors.onBrand} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showHistoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedSetForPreview(null);
          setShowHistoryModal(false);
        }}
      >
        <View style={styles.filterHistoryBackdrop} testID="apartments-filter-history-modal">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setSelectedSetForPreview(null);
              setShowHistoryModal(false);
            }}
          />
          <View style={styles.filterHistoryCard}>
            {selectedSetForPreview === null ? (
              <>
                <View style={styles.filterHistoryHeader}>
                  <Text style={styles.filterHistoryTitle}>Ιστορικό Set Φίλτρων</Text>
                  <Pressable
                    style={styles.filterHistoryCloseButton}
                    onPress={() => setShowHistoryModal(false)}
                    testID="apartments-filter-history-close"
                  >
                    <Ionicons name="close-outline" size={22} color={colors.onSurface} />
                  </Pressable>
                </View>
                {loadingHistory ? (
                  <View style={styles.filterHistoryState}>
                    <ActivityIndicator size="small" color={colors.brand} />
                  </View>
                ) : savedFilterSets.length === 0 ? (
                  <View style={styles.filterHistoryState}>
                    <Text style={styles.filterHistoryMutedText}>Δεν υπάρχουν αποθηκευμένα set φίλτρων.</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.filterHistoryList} contentContainerStyle={styles.filterHistoryListContent}>
                    {savedFilterSets.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.filterSetHistoryRow}
                        onPress={() => setSelectedSetForPreview(item)}
                        testID={`apartments-filter-set-history-row-${item.id}`}
                      >
                        <View style={styles.filterSetHistoryTextColumn}>
                          {item.title ? (
                            <Text style={styles.filterSetHistoryTitle} numberOfLines={1}>{item.title}</Text>
                          ) : null}
                          <Text style={styles.filterSetHistorySummary} numberOfLines={1}>
                            {formatFilterSetSummary(item)}
                          </Text>
                        </View>
                        <View style={styles.filterSetHistoryAction}>
                          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : (
              <>
                <View style={styles.filterHistoryHeader}>
                  <Pressable
                    style={styles.filterHistoryCloseButton}
                    onPress={() => setSelectedSetForPreview(null)}
                    testID="apartments-filter-preview-back"
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
                  </Pressable>
                  <Text style={styles.filterHistoryTitle}>Προεπισκόπηση Φίλτρων</Text>
                  <View style={styles.filterHistoryHeaderSpacer} />
                </View>
                <ScrollView style={styles.filterHistoryList} contentContainerStyle={styles.filterPreviewContent}>
                  {selectedSetForPreview.title ? (
                    <View style={styles.filterPreviewPill}>
                      <Text style={styles.filterPreviewLabel}>Τίτλος</Text>
                      <Text style={styles.filterPreviewValue}>{selectedSetForPreview.title}</Text>
                    </View>
                  ) : null}
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Ενοίκιο</Text>
                    <Text style={styles.filterPreviewValue}>{`${selectedSetForPreview.rentMin || "0"} - ${selectedSetForPreview.rentMax || "∞"} €`}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Τιμή / τ.μ.</Text>
                    <Text style={styles.filterPreviewValue}>{`${selectedSetForPreview.minSqmPrice || "0"} - ${selectedSetForPreview.maxSqmPrice || "∞"} €/m²`}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Περιοχή / Πόλη</Text>
                    <Text style={styles.filterPreviewValue}>{selectedSetForPreview.cityQuery?.trim() || "Όλες οι περιοχές"}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Εμβαδόν</Text>
                    <Text style={styles.filterPreviewValue}>{`${selectedSetForPreview.sizeMin || "0"} - ${selectedSetForPreview.sizeMax || "∞"} m²`}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Κατοικίδια</Text>
                    <Text style={styles.filterPreviewValue}>{selectedSetForPreview.petFriendly ? "Ναι" : "Όχι"}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Μετρό</Text>
                    <Text style={styles.filterPreviewValue}>{selectedSetForPreview.nearMetro ? "Ναι" : "Όχι"}</Text>
                  </View>
                  <View style={styles.filterPreviewPill}>
                    <Text style={styles.filterPreviewLabel}>Ταξινόμηση</Text>
                    <Text style={styles.filterPreviewValue}>{SORT_OPTION_LABELS[selectedSetForPreview.sortBy || "newest"]}</Text>
                  </View>
                </ScrollView>
                <Pressable
                  style={styles.filterConfirmRestoreButton}
                  onPress={() => applySavedFilterSet(selectedSetForPreview)}
                  testID="apartments-confirm-restore-btn"
                >
                  <Ionicons name="checkmark-circle-outline" size={19} color={colors.onBrand} />
                  <Text style={styles.filterConfirmRestoreText}>Επαναφορά & Εφαρμογή</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNotesPanel}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotesPanel(false)}
      >
        <View style={styles.notesBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowNotesPanel(false)}
            testID="apartments-notes-backdrop"
          />

          <View style={styles.notesPanel}>
            <View style={styles.notesHeaderRow}>
              <Text style={styles.notesPanelTitle}>Σημειώσεις Διαμερισμάτων</Text>
              <Pressable
                style={styles.notesCloseBtn}
                onPress={() => setShowNotesPanel(false)}
                testID="apartments-notes-close"
              >
                <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {loadingNotes ? (
              <View style={styles.notesStateWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : notesList.length === 0 ? (
              <View style={styles.notesStateWrap}>
                <Text style={styles.notesStateText}>Δεν υπάρχουν αποθηκευμένες σημειώσεις ακόμα.</Text>
              </View>
            ) : (
              <DraggableFlatList
                data={notesList}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.notesListContent}
                showsVerticalScrollIndicator={false}
                activationDistance={12}
                onDragEnd={({ data }) => {
                  setNotesList(data);
                  if (!auth.userId) return;
                  const orderedIds = data.map((item) => item.id);
                  setNotesOrderSaving(true);
                  void updateNotesOrder(auth.userId, orderedIds)
                    .catch(() => {
                      // Keep UX responsive; data already reordered locally.
                    })
                    .finally(() => {
                      setNotesOrderSaving(false);
                    });
                }}
                renderItem={({ item, getIndex, drag, isActive }) => {
                  const coverImage = item.apartmentData?.image || item.apartmentData?.imageUrl || item.apartmentData?.images?.[0] || "";
                  const noteExcerpt = item.text?.trim() || t("common.values.notAvailable");

                  return (
                    <ScaleDecorator>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          router.push({
                            pathname: "/apartment-note",
                            params: {
                              data: JSON.stringify(item.apartmentData),
                              fromList: "true",
                            },
                          } as any)
                        }
                        onLongPress={drag}
                        delayLongPress={140}
                        style={[styles.noteRow, isActive && styles.noteRowActive]}
                        testID={`apartments-note-row-${item.id}`}
                      >
                        <View style={styles.noteIndexBadge}>
                          <Text style={styles.noteIndexText}>{(getIndex?.() ?? 0) + 1}</Text>
                        </View>

                        {coverImage ? (
                          <Image source={{ uri: coverImage }} style={styles.noteThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.noteThumb, styles.noteThumbPlaceholder]}>
                            <Ionicons name="home-outline" size={18} color={colors.onSurfaceTertiary} />
                          </View>
                        )}
                        <View style={styles.noteMainTextWrap}>
                          <Text style={styles.noteTitleText} numberOfLines={1}>
                            {item.apartmentData.title || t("apartments.unknownListing")}
                          </Text>
                          <Text style={styles.noteExcerptText} numberOfLines={1}>
                            {noteExcerpt}
                          </Text>
                          <View style={styles.noteRentPill}>
                            <Text style={styles.noteRentText}>{`${CURRENCY}${item.apartmentData.rent}`}</Text>
                          </View>
                        </View>

                        <Ionicons name="reorder-two-outline" size={20} color={colors.onSurfaceTertiary} />
                      </TouchableOpacity>
                    </ScaleDecorator>
                  );
                }}
              />
            )}

            {notesOrderSaving ? <Text style={styles.notesSavingText}>Αποθήκευση νέας σειράς...</Text> : null}
          </View>
        </View>
      </Modal>

      <MapPolygonDrawModal
        visible={isPolygonModalVisible}
        initialPolygon={polygonCoordinates}
        onClose={() => setIsPolygonModalVisible(false)}
        onSave={setPolygonCoordinates}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flexOne: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  titleRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  myListingsPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  myListingsPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  myListingsPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  myListingsPillTextActive: {
    color: colors.onBrand,
  },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  headerControlsRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconControlButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  iconControlButtonActive: { backgroundColor: "#C8E9FF" },
  mapToggleButton: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
  },
  filterHistoryBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
    padding: spacing.lg,
  },
  filterHistoryCard: {
    width: "100%",
    maxHeight: "82%",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  filterHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  filterHistoryTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    textAlign: "center",
  },
  filterHistoryCloseButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  filterHistoryHeaderSpacer: {
    width: 34,
  },
  filterHistoryList: {
    flexGrow: 0,
  },
  filterHistoryListContent: {
    gap: spacing.sm,
  },
  filterSetHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
  },
  filterSetHistoryTextColumn: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  filterSetHistoryTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  filterSetHistorySummary: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  filterSetHistoryAction: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  filterHistoryState: {
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  filterHistoryMutedText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  filterPreviewContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  filterPreviewPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterPreviewLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  filterPreviewValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    textAlign: "right",
  },
  filterConfirmRestoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
  },
  filterConfirmRestoreText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
  },
  brokerShareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
  },
  brokerShareAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  brokerShareAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  brokerShareName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  brokerShareSendButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  notesBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,33,40,0.44)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  notesPanel: {
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  notesPanelTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  notesCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesListContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  noteRowActive: {
    opacity: 0.92,
    borderColor: colors.brand,
  },
  noteIndexBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noteIndexText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  noteThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  noteThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteMainTextWrap: {
    flex: 1,
    gap: 4,
  },
  noteTitleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  noteExcerptText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: colors.onSurfaceTertiary,
  },
  noteRentPill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  noteRentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  notesStateWrap: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
  },
  notesStateText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  notesSavingText: {
    alignSelf: "flex-end",
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  viewToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    height: 46,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  viewToggleOption: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    // paddingVertical: spacing.sm,
  },
  viewToggleOptionActive: {
    backgroundColor: colors.brand,
  },
  viewToggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrandTertiary,
    includeFontPadding: false,
    textAlignVertical: "center",
    transform: [{ translateY: -1 }],
  },
  viewToggleTextActive: {
    color: colors.onBrand,
  },
  searchPanel: {
    marginTop: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchActionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  searchHistoryBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchHistoryBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  searchClearBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentSearchesPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  recentSearchesScroll: {
    maxHeight: 290,
  },
  recentSearchesContent: {
    paddingVertical: 4,
  },
  recentSearchRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recentSearchEmptyRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recentSearchText: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  recentSearchEmptyText: {
    flex: 1,
    color: colors.onSurfaceTertiary,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
  },
  filterPanel: {
    marginTop: spacing.sm,
    maxHeight: 380,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  filterPanelContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  polygonFilterSection: {
    gap: spacing.xs,
  },
  polygonTriggerButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  polygonTriggerButtonActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  polygonTriggerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  polygonTriggerTextActive: {
    color: colors.onBrand,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerBubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brand,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  markerBubbleSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.onBrand,
  },
  markerBubbleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xs,
    color: colors.onSurface,
  },
  markerBubbleTextSelected: {
    color: colors.onBrand,
  },
  mapCardPreviewOverlay: {
    position: "absolute",
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  filterActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  filterActionButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterActionButtonActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  saveFilterSetButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveFilterSetButtonDisabled: {
    opacity: 0.55,
  },
  saveFilterSetButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
  sortTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  sortSelectionBar: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sortSelectionText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  sortDropdownList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  sortOptionRow: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sortOptionText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  sortOptionTextActive: {
    color: colors.brand,
  },
  showOnlyRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  showOnlyCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  showOnlyCardActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  showOnlyLabel: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.xs,
    color: colors.onSurface,
  },
  showOnlyLabelActive: {
    color: colors.onBrand,
  },
  showOnlyPlaceholderWrap: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  showOnlyPlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  brokerRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  hostFeedToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hostFeedToggleTextWrap: {
    flex: 1,
  },
  hostFeedToggleTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
    lineHeight: 20,
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
  switchText: { 
    fontFamily: fonts.semibold, 
    fontSize: fontSize.base, 
    color: colors.onSurface,
  },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  compactList: { gap: spacing.sm },
  compactHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  compactThumbSpacer: {
    width: 44,
    height: 1,
  },
  compactCol: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  compactAreaCol: { flex: 2.2, alignItems: "flex-start" },
  compactSqmCol: { flex: 0.85 },
  compactAvailCol: { flex: 0.75 },
  compactRentCol: { flex: 1.1, alignItems: "flex-end" },
  compactHeaderPill: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: "hidden",
  },
  compactRowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  compactThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  compactThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactNeutralPill: {
    maxWidth: "100%",
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    overflow: "hidden",
  },
  compactCellText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  availabilityBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  availabilityOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  availabilityOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  compactRentPill: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    overflow: "hidden",
  },
  cardWrap: { position: "relative" },
  card: {
    height: 260,
    position: "relative",
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  offMarketCard: {
    borderTopWidth: 3,
    borderTopColor: colors.brand,
  },
  clientOnlyBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clientOnlyBadgeText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xs,
    color: colors.onBrand,
  },
  carouselArrowButton: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  carouselArrowLeft: {
    left: 10,
    top: "50%",
    transform: [{ translateY: -18 }],
  },
  carouselArrowRight: {
    right: 10,
    top: "50%",
    transform: [{ translateY: -18 }],
  },
  cardPressed: { opacity: 0.88 },
  likeBtn: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  likeBtnActive: {
    backgroundColor: "#FF5A66",
    borderColor: "#FF5A66",
  },
  quickChatBtn: {
    right: spacing.md + 42 + spacing.sm,
    backgroundColor: colors.brand,
    borderColor: colors.brand,
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
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  fabCluster: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { fontFamily: fonts.displayExtra, fontSize: 32, color: colors.onBrand },
  hostInboxFab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: "#A8D9FF",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  hostInboxFabUnread: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  hostInboxFabText: {
    fontSize: 22,
    color: colors.brandTertiary,
  },
  hostInboxFabTextUnread: {
    color: colors.brandTertiary,
  },
  cardPlaceholder: {
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    transform: [{ translateY: -20 }],
  },
  cardPlaceholderText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.base,
    color: colors.brand,
    letterSpacing: 1,
  },
});
