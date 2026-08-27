import { getBlockRelationshipState, setBlockStateBetweenUsers } from "@/src/api/chat";
import { useTheme } from "@/src/context/ThemeContext";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { getUserProfile } from "@/src/api/userProfile";
import { sendPushNotification } from '@/src/utils/notificationService'; // Προσάρμοσε το path ανάλογα με το φάκελό σου
import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar,
  Modal,
  Linking,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import type { Gender, RoommateProfile } from "@/src/data/profiles";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, getDocs, deleteDoc, limit } from "firebase/firestore";
import { markIncomingMessagesAsRead } from "@/src/api/chat";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal, { type CenteredModalAction } from "@/src/components/CenteredActionModal";
import FilterSetVersionModal, { type SharedFilterSetRecord, type FilterSetVersionData } from "@/src/components/FilterSetVersionModal";
import { getUserSettings, saveUserNotifications, saveUserPrivacy, type NotificationPreferences } from "@/src/api/accountSettings";
import { submitReportedUserEntry } from "@/src/services/reportedUsers";
import { subscribeUserLikedApartmentIds } from "@/src/api/apartmentLikes";
import {
  calculateMatchScore,
  type CompatibilityQuizAnswers,
  type UserProfile as MatchUserProfile,
} from "@/src/utils/matchAlgorithm";
import { t } from "@/src/locales";

const CURRENCY = "€";
const FILTER_SORT_LABELS: Record<string, string> = {
  newest: "Πιο πρόσφατα",
  oldest: "Πιο παλιά",
  price_asc: "Αύξουσα τιμή",
  price_desc: "Φθίνουσα τιμή",
  size_asc: "Αύξον εμβαδόν",
  size_desc: "Φθίνουσα εμβαδόν",
  price_sqm_asc: "Αύξουσα τιμή/τ.μ.",
  price_sqm_desc: "Φθίνουσα τιμή/τ.μ.",
};

interface Message {
  id: string;
  text: string;
  noteText?: string;
  senderId: string;
  createdAt: any;
  isRead?: boolean;
  type?: string;
  status?: "pending" | "approved";
  proposedPrice?: number;
  requestedDate?: string;
  requestedTime?: string;
  apartmentId?: string;
  apartmentData?: SharedApartmentData;
  filterSetData?: FilterSetMessageData;
  filterSetId?: string;
  listId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
  previewImages?: string[];
}

interface FilterSetMessageData {
  title?: string;
  rentMin?: string;
  rentMax?: string;
  minSqmPrice?: string;
  maxSqmPrice?: string;
  cityQuery?: string;
  sizeMin?: string;
  sizeMax?: string;
  petFriendly?: boolean;
  nearMetro?: boolean;
  sortBy?: string;
  summary?: string;
  sharedAt?: number;
}

interface SharedApartmentData {
  id: string;
  title: string;
  rent: number;
  city: string;
  area: string;
  image: string;
  imageUrl?: string;
  images?: string[];
  rooms: number;
  size: number;
  tags?: string[];
}

interface FirestoreMessageDoc {
  text?: string;
  noteText?: string;
  senderId?: string;
  createdAt?: any;
  isRead?: boolean;
  readAt?: any;
  type?: string;
  status?: "pending" | "approved";
  proposedPrice?: number;
  requestedDate?: string;
  requestedTime?: string;
  apartmentId?: string;
  apartmentData?: SharedApartmentData;
  filterSetData?: FilterSetMessageData;
  filterSetId?: string;
  listId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
  previewImages?: string[];
}

interface FirestoreChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  apartmentId?: string;
  apartmentTitle?: string;
  hostPhoneNumber?: string;
  counterpartPhoneNumber?: string;
  apartmentUnavailable?: boolean;
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  rejectedBy?: string | null;
  rejections?: string[];
  clearedAt?: Record<string, unknown>;
  dismissedCrossChatNotices?: Record<string, boolean>;
  deletedUsers?: Record<string, boolean>;
  participantDisplayNames?: Record<string, string>;
  mutedByUsers?: Record<string, boolean>;
}

interface FirestoreApartmentDoc {
  title?: string;
  description?: string; 
  about?: string;       
  propertyType?: string;
  propertyCategory?: string;
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
  maxDiscountPercentage?: number;
  status?: "active" | "closed_deal";
  rentedToUserId?: string | null;
  rentedAt?: unknown;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  hostId?: string;
}

interface MutualApartment {
  id: string;
  title: string;
  description: string;
  area: string;
  city: string;
  rent: number;
  rooms: number;
  size: number;
  image: string;
  images?: string[];
  tags: string[];
  amenities?: string[];
  propertyType?: string;
  propertyCategory?: string;
  floor?: string;
  latitude?: number;
  longitude?: number;
  hostId?: string;
}

interface FirestoreUserDoc {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  university?: string | null;
  year?: string | null;
  year_of_study?: string | null;
  maxBudget?: number | null;
  budget?: number | null;
  about?: string;
  bio?: string;
  looking_for_apartment?: boolean;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  photoUrl?: string;
  photos?: string[];
  phone_number?: string | null;
  phone?: string | null;
  directMessagesEnabled?: boolean;
}

interface FirestoreQuizDoc {
  answers?: Record<string, string>;
}

type MessageGroupPosition = "first" | "middle" | "last" | "single";

interface MessageGroupInfo {
  position: MessageGroupPosition;
  isConsecutive: boolean;
}

function isDeletedCounterpart(profile: RoommateProfile): boolean {
  return !!profile.deleted;
}

function mapFirestoreUserToProfile(uid: string, data: FirestoreUserDoc): RoommateProfile {
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const photo = data.photoUrl || photos[0] || "";

  return {
    id: uid,
    name: data.name?.trim() || t("common.values.unknown"),
    age: typeof data.age === "number" ? data.age : 0,
    gender: (data.gender as Gender) || (t("common.values.nonBinary") as Gender),
    budget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    university: data.university || "",
    program: data.year || data.year_of_study || "",
    bio: data.about || data.bio || "",
    tags: [],
    photo,
    deleted: false,
  };
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
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getApartmentCoverImage(apartment?: { image?: string; imageUrl?: string; images?: string[] } | null): string {
  return apartment?.image?.trim() || apartment?.imageUrl?.trim() || apartment?.images?.[0] || "";
}

function normalizeApartmentImages(data: FirestoreApartmentDoc): string[] {
  const images = Array.isArray(data.images)
    ? data.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
    : [];
  const fallback = getApartmentCoverImage(data);
  return images.length > 0 ? images : fallback ? [fallback] : [];
}

function mapApartmentDocToMutualApartment(apartmentId: string, data: FirestoreApartmentDoc): MutualApartment {
  const rawTags = Array.isArray(data.tags) ? data.tags : Array.isArray(data.amenities) ? data.amenities : [];
  const tags = rawTags.map(normalizeTagSlug);
  const images = normalizeApartmentImages(data);

  return {
    id: apartmentId,
    title: data.title?.trim() || t("apartments.unknownListing"),
    description: data.description?.trim() || data.about?.trim() || "",
    area: data.area?.trim() || t("apartments.unknownArea"),
    city: data.city?.trim() || t("apartments.unknownCity"),
    rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
    rooms: typeof data.rooms === "number" ? data.rooms : 1,
    size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
    image: images[0] || "",
    images,
    tags: tags.length ? tags : ["new_listing"],
    amenities: Array.isArray(data.amenities) ? data.amenities.filter((item): item is string => typeof item === "string") : undefined,
    propertyType: data.propertyType,
    propertyCategory: data.propertyCategory,
    floor: data.floor,
    latitude: data.latitude,
    longitude: data.longitude,
    hostId: data.hostId,
  };
}

type MutualApartmentCardProps = {
  apartment: MutualApartment;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
};

function MutualApartmentCard({ apartment, colors, styles, onPress }: MutualApartmentCardProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageList = apartment.images && apartment.images.length > 0 ? apartment.images : apartment.image ? [apartment.image] : [];
  const activeImage = imageList[activeImageIndex] || "";

  useEffect(() => {
    if (activeImageIndex > imageList.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, imageList.length]);

  return (
    <View style={styles.mutualCardWrap}>
      <Pressable style={({ pressed }) => [styles.mutualCard, pressed && styles.mutualCardPressed]} onPress={onPress}>
        {activeImage ? (
          <Image source={{ uri: activeImage }} style={styles.mutualCardPhoto} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.mutualCardPhoto, styles.mutualCardPlaceholder]}>
            <Ionicons name="home" size={44} color={colors.brand} />
            <Text style={styles.mutualCardPlaceholderText}>CampuStay</Text>
          </View>
        )}

        {imageList.length > 1 && activeImageIndex > 0 ? (
          <Pressable
            style={[styles.mutualCarouselArrow, styles.mutualCarouselArrowLeft]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.max(0, prev - 1));
            }}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {imageList.length > 1 && activeImageIndex < imageList.length - 1 ? (
          <Pressable
            style={[styles.mutualCarouselArrow, styles.mutualCarouselArrowRight]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.min(imageList.length - 1, prev + 1));
            }}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}

        <LinearGradient
          colors={["transparent", "rgba(26,26,26,0.95)"]}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.mutualRentBadge}>
          <Text style={styles.mutualRentText}>€{apartment.rent}</Text>
          <Text style={styles.mutualRentMeta}>{t("apartments.perMonthShort")}</Text>
        </View>

        <View style={styles.mutualCardBody}>
          <View style={styles.mutualLocRow}>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.mutualLocText}>{apartment.area}, {apartment.city}</Text>
          </View>
          <View style={styles.mutualStatsRow}>
            <Text style={styles.mutualStatText}>{`${apartment.rooms} ${t("apartments.rooms")}`}</Text>
            <View style={styles.mutualDot} />
            <Text style={styles.mutualStatText}>{apartment.size} m²</Text>
          </View>
          <View style={styles.mutualTagRow}>
            {apartment.tags.map((tag) => (
              <View key={tag} style={styles.mutualTag}>
                <Text style={styles.mutualTagText}>{translateApartmentTag(tag)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function buildApartmentRoutePayload(apartmentId: string, data: FirestoreApartmentDoc, fallbackTitle?: string) {
  const amenities = Array.isArray(data.amenities) ? data.amenities : [];
  const tags = Array.isArray(data.tags) ? data.tags : amenities;
  const rawMaxDiscount =
    typeof data.maxDiscountPercentage === "number"
      ? data.maxDiscountPercentage
      : typeof data.maxDiscountPercent === "number"
        ? data.maxDiscountPercent
        : 10;
  const maxDiscountPercentage = Math.max(0, Math.min(90, Math.round(rawMaxDiscount)));

  return {
    id: apartmentId,
    title: data.title?.trim() || fallbackTitle || t("apartments.unknownListing"),
    description: data.description?.trim() || data.about?.trim() || "",
    about: data.about?.trim() || data.description?.trim() || "",
    area: data.area?.trim() || t("apartments.unknownArea"),
    city: data.city?.trim() || t("apartments.unknownCity"),
    address: data.address?.trim(),
    latitude: typeof data.latitude === "number" ? data.latitude : undefined,
    longitude: typeof data.longitude === "number" ? data.longitude : undefined,
    hasExactLocation: data.hasExactLocation === true,
    rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
    maxDiscountPercentage,
    rooms: typeof data.rooms === "number" ? data.rooms : 1,
    size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
    image: data.image || data.imageUrl || data.images?.[0] || "",
    tags: tags.length ? tags : [t("apartments.newListing")],
    hostId: data.hostId,
  };
}

function getMessageGroupInfo(messages: Message[], index: number, currentUserId: string): MessageGroupInfo {
  const currentMsg = messages[index];
  const prevMsg = index > 0 ? messages[index - 1] : null;
  const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

  const prevSame = prevMsg?.senderId === currentMsg.senderId;
  const nextSame = nextMsg?.senderId === currentMsg.senderId;

  if (!prevSame && !nextSame) {
    return { position: "single", isConsecutive: false };
  }
  if (!prevSame && nextSame) {
    return { position: "first", isConsecutive: true };
  }
  if (prevSame && nextSame) {
    return { position: "middle", isConsecutive: true };
  }
  return { position: "last", isConsecutive: true };
}

function toCompatibilityQuiz(answers: Record<string, string>): CompatibilityQuizAnswers {
  return answers as CompatibilityQuizAnswers;
}

function normalizeGenderForMatch(value: string | null | undefined): MatchUserProfile["gender"] {
  if (value === "Male" || value === "Female") return value;
  return "Prefer Not To Say";
}

function normalizeSocialUrl(platform: "instagram" | "facebook" | "linkedin" | "twitter", value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const withoutAt = trimmed.replace(/^@/, "");
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${withoutAt}`;
    case "facebook":
      return `https://facebook.com/${withoutAt}`;
    case "linkedin":
      return `https://linkedin.com/in/${withoutAt}`;
    case "twitter":
      return `https://x.com/${withoutAt}`;
    default:
      return trimmed;
  }
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatRequestDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getStatusLabel(status: Message["status"]): string {
  return status === "approved" ? "Επιβεβαιώθηκε" : "Σε αναμονή";
}

function getNextHalfHour(base: Date): Date {
  const rounded = new Date(base.getTime());
  rounded.setSeconds(0, 0);
  rounded.setMinutes(rounded.getMinutes() + 30);
  const minutes = rounded.getMinutes();
  const normalizedMinutes = minutes <= 30 ? 30 : 0;
  if (normalizedMinutes === 0 && minutes > 30) {
    rounded.setHours(rounded.getHours() + 1);
  }
  rounded.setMinutes(normalizedMinutes, 0, 0);
  return rounded;
}

function evaluateEffectiveChatMuted(params: {
  chatRoomId: string | null;
  muteAllNotifications: boolean;
  mutedChatIds: string[];
  unmutedChatOverrides: string[];
  legacyChatMuted: boolean;
}): boolean {
  const { chatRoomId, muteAllNotifications, mutedChatIds, unmutedChatOverrides, legacyChatMuted } = params;
  if (!chatRoomId) return legacyChatMuted;

  if (muteAllNotifications) {
    return !unmutedChatOverrides.includes(chatRoomId);
  }

  return mutedChatIds.includes(chatRoomId) || legacyChatMuted;
}

function timestampToMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const fn = (value as { toMillis?: () => number }).toMillis;
    if (typeof fn === "function") {
      const millis = fn();
      return Number.isFinite(millis) ? millis : 0;
    }
  }
  return 0;
}

function isSharedApartmentData(value: unknown): value is SharedApartmentData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<SharedApartmentData>;
  return (
    typeof data.id === "string" &&
    typeof data.title === "string" &&
    typeof data.city === "string" &&
    typeof data.area === "string"
  );
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  new_matches: true,
  direct_messages: true,
  app_updates_and_tips: true,
  mute_all_notifications: false,
  muted_chat_ids: [],
  unmuted_chat_overrides: [],
};

export default function ChatScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { id, chatRoomId: chatRoomIdParam } = useLocalSearchParams<{ id: string; chatRoomId?: string }>();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setIsKeyboardOpen(true);

        // 🚀 Δίνουμε ένα ελάχιστο delay (50-100ms) για να προλάβει το KeyboardAvoidingView
        // να μικρύνει το layout, και μετά κάνουμε scroll στο τελευταίο μήνυμα.
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 80);
      },
    );

    const hideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardOpen(false),
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const safeMenuTop = Math.max(insets.top + 12, (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 12 : 12));
  const counterpartId = typeof id === "string" ? id : "";
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoommateProfile | null>(null);
  const [counterpartDetails, setCounterpartDetails] = useState<FirestoreUserDoc | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [counterpartExists, setCounterpartExists] = useState(true);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [compatibilityScore, setCompatibilityScore] = useState<number | null>(null);
  const [isBlocker, setIsBlocker] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [settingsBlockState, setSettingsBlockState] = useState({ isBlocker: false, isBlocked: false });

  useEffect(() => {
    if (!counterpartId) {
      setProfile(null);
      setCounterpartExists(false);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    const userRef = doc(db, "users", counterpartId);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as FirestoreUserDoc;
          setProfile(mapFirestoreUserToProfile(counterpartId, data));
          setCounterpartDetails(data);
          setCounterpartExists(true);
        } else {
          setProfile(null);
          setCounterpartDetails(null);
          setCounterpartExists(false);
        }
        setLoadingProfile(false);
      },
      () => {
        setProfile(null);
        setCounterpartDetails(null);
        setCounterpartExists(false);
        setLoadingProfile(false);
      },
    );

    return () => unsubscribe();
  }, [counterpartId]);

  useEffect(() => {
    setCurrentUserId(auth.userId ?? null);
  }, [auth.userId]);

  const chatRoomId = useMemo(() => {
    if (typeof chatRoomIdParam === "string" && chatRoomIdParam.trim().length > 0) {
      return chatRoomIdParam;
    }
    if (!currentUserId || !id) return null;
    return [currentUserId, id].sort().join("_");
  }, [chatRoomIdParam, currentUserId, id]);

  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStatus, setChatStatus] = useState<"pending" | "active" | "rejected">("active");
  const [chatInitiatedBy, setChatInitiatedBy] = useState<string | null>(null);
  const [chatRejectedBy, setChatRejectedBy] = useState<string | null>(null);
  const [chatRejections, setChatRejections] = useState<string[]>([]);
  const [crossChatNoticeTarget, setCrossChatNoticeTarget] = useState<"matches" | "hostInbox" | null>(null);
  const [isCrossChatNoticeDismissed, setIsCrossChatNoticeDismissed] = useState(false);
  const [isNoticeDismissedLocally, setIsNoticeDismissedLocally] = useState(false);
  const clearedAtCutoffRef = useRef<number | null>(null);
  const [chatType, setChatType] = useState<"roommate" | "host">("roommate");
  const [hostPhoneFromChatMeta, setHostPhoneFromChatMeta] = useState("");
  const [hostApartmentId, setHostApartmentId] = useState<string | null>(null);
  const [hostApartmentTitle, setHostApartmentTitle] = useState<string | null>(null);
  const [hostApartment, setHostApartment] = useState<ReturnType<typeof buildApartmentRoutePayload> | null>(null);
  const [isApartmentUnavailable, setIsApartmentUnavailable] = useState(false);
  const [showMutualLikes, setShowMutualLikes] = useState(false);
  const [showHostActionMenu, setShowHostActionMenu] = useState(false);
  const [showPriceProposalModal, setShowPriceProposalModal] = useState(false);
  const [showVisitRequestModal, setShowVisitRequestModal] = useState(false);
  const [proposedPriceInput, setProposedPriceInput] = useState("");
  const [selectedVisitDate, setSelectedVisitDate] = useState<string | null>(null);
  const [selectedVisitHour, setSelectedVisitHour] = useState("12");
  const [selectedVisitMinute, setSelectedVisitMinute] = useState<"00" | "30">("00");
  const [visitMonthCursor, setVisitMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isSubmittingHostAction, setIsSubmittingHostAction] = useState(false);
  const [currentUserLikedIds, setCurrentUserLikedIds] = useState<Set<string>>(new Set());
  const [counterpartLikedIds, setCounterpartLikedIds] = useState<Set<string>>(new Set());
  const [mutualLikedApartments, setMutualLikedApartments] = useState<MutualApartment[]>([]);
  const [mutualLikesLoading, setMutualLikesLoading] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showGlobalUnmuteModal, setShowGlobalUnmuteModal] = useState(false);
  const [messageActionTarget, setMessageActionTarget] = useState<Message | null>(null);
  const [selectedFilterSetMessage, setSelectedFilterSetMessage] = useState<Message | null>(null);
  const [selectedFilterSetRecord, setSelectedFilterSetRecord] = useState<SharedFilterSetRecord | null>(null);
  const [isFilterHistoryActive, setIsFilterHistoryActive] = useState(false);
  const [activeViewList, setActiveViewList] = useState<{ listTitle: string; apartments: MutualApartment[] } | null>(null);
  const [loadingListFeed, setLoadingListFeed] = useState(false);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [expandReport, setExpandReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingBlockAction, setIsSubmittingBlockAction] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description?: string;
    actions: CenteredModalAction[];
  } | null>(null);
  const profileCardTranslateY = useRef(new Animated.Value(0)).current;
  const isRoommateChat = chatType === "roommate";

  const handleOpenPropertyList = useCallback(async (message: Message) => {
    const apartmentIds = message.apartmentIds ?? [];
    if (apartmentIds.length === 0) {
      setActiveViewList({ listTitle: message.listTitle || "Λίστα ακινήτων", apartments: [] });
      return;
    }
    setLoadingListFeed(true);
    try {
      const apartments = await Promise.all(apartmentIds.map(async (apartmentId) => {
        const snapshot = await getDoc(doc(db, "apartments", apartmentId));
        return snapshot.exists() ? mapApartmentDocToMutualApartment(apartmentId, snapshot.data() as FirestoreApartmentDoc) : null;
      }));
      setActiveViewList({
        listTitle: message.listTitle || "Λίστα ακινήτων",
        apartments: apartments.filter((apartment): apartment is MutualApartment => apartment !== null),
      });
    } catch (error) {
      console.warn("[Chat] Error loading shared property list:", error);
    } finally {
      setLoadingListFeed(false);
    }
  }, []);

  const closeProfileModal = useCallback(() => {
    setProfileModalVisible(false);
    profileCardTranslateY.setValue(0);
  }, [profileCardTranslateY]);

  const profileCardPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          profileModalVisible &&
          gestureState.dy > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_evt, gestureState) => {
          if (gestureState.dy > 0) {
            profileCardTranslateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const shouldClose = gestureState.dy > 120 || gestureState.vy > 1.1;
          if (shouldClose) {
            Animated.timing(profileCardTranslateY, {
              toValue: 420,
              duration: 180,
              useNativeDriver: true,
            }).start(() => {
              closeProfileModal();
            });
            return;
          }

          Animated.spring(profileCardTranslateY, {
            toValue: 0,
            bounciness: 6,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(profileCardTranslateY, {
            toValue: 0,
            bounciness: 6,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeProfileModal, profileCardTranslateY, profileModalVisible],
  );

  useEffect(() => {
    if (profileModalVisible) {
      profileCardTranslateY.setValue(0);
    }
  }, [profileCardTranslateY, profileModalVisible]);

  const createdAtToMillis = useCallback((value: any): number => {
    if (typeof value === "number") return value;
    if (value?.toMillis && typeof value.toMillis === "function") return value.toMillis();
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  }, []);

  const sortMessages = useCallback(
    (list: Message[]) =>
      [...list].sort((a, b) => createdAtToMillis(a.createdAt) - createdAtToMillis(b.createdAt)),
    [createdAtToMillis],
  );

  useEffect(() => {
    if (!currentUserId || !chatRoomId) return;
    const chatRef = doc(db, "chats", chatRoomId);
    const unsubChat = onSnapshot(chatRef, (snapshot) => {
      if (!snapshot.exists()) {
        setChatStatus("active");
        setChatInitiatedBy(null);
        setChatRejectedBy(null);
        setChatRejections([]);
        setIsCrossChatNoticeDismissed(false);
        setIsNoticeDismissedLocally(false);
        clearedAtCutoffRef.current = null;
        setChatType("roommate");
        setHostPhoneFromChatMeta("");
        setHostApartmentId(null);
        setHostApartmentTitle(null);
        setIsApartmentUnavailable(false);
        return;
      }
      const data = snapshot.data() as FirestoreChatDoc;
      setChatStatus(data.status === "pending" ? "pending" : data.status === "rejected" ? "rejected" : "active");
      setChatInitiatedBy(typeof data.initiatedBy === "string" ? data.initiatedBy : null);
      setChatRejectedBy(typeof data.rejectedBy === "string" ? data.rejectedBy : null);
      setChatRejections(Array.isArray(data.rejections) ? data.rejections.filter((entry): entry is string => typeof entry === "string") : []);
      const clearedAtMap = data.clearedAt && typeof data.clearedAt === "object"
        ? (data.clearedAt as Record<string, unknown>)
        : {};
      const dismissedCrossChatNoticesMap = data.dismissedCrossChatNotices && typeof data.dismissedCrossChatNotices === "object"
        ? (data.dismissedCrossChatNotices as Record<string, unknown>)
        : {};
      const clearCutoff = currentUserId ? timestampToMillis(clearedAtMap[currentUserId]) : 0;
      clearedAtCutoffRef.current = clearCutoff > 0 ? clearCutoff : null;
      setIsCrossChatNoticeDismissed(currentUserId ? dismissedCrossChatNoticesMap[currentUserId] === true : false);
      setChatType(data.type === "host" ? "host" : "roommate");
      const rawHostPhoneFromChat =
        typeof data.hostPhoneNumber === "string"
          ? data.hostPhoneNumber
          : typeof data.counterpartPhoneNumber === "string"
            ? data.counterpartPhoneNumber
            : "";
      setHostPhoneFromChatMeta(rawHostPhoneFromChat.trim());
      setHostApartmentId(typeof data.apartmentId === "string" && data.apartmentId.trim().length > 0 ? data.apartmentId : null);
      setHostApartmentTitle(typeof data.apartmentTitle === "string" && data.apartmentTitle.trim().length > 0 ? data.apartmentTitle : null);
      setIsApartmentUnavailable(!!data.apartmentUnavailable);
      setIsChatMuted(!!data.mutedByUsers?.[currentUserId]);
      // 🎯 ΔΙΟΡΘΩΣΗ: Ενημερώνουμε real-time τα block flags μέσα στο δωμάτιο τσατ
      const blockedMap = (data as any).blockedByUsers ?? {};
      setIsBlocker(currentUserId ? blockedMap[currentUserId] === true : false);
      setIsBlocked(counterpartId ? blockedMap[counterpartId] === true : false);
    });

    const q = query(
      collection(db, "chats", chatRoomId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const fetched: Message[] = snapshot.docs
        .map((doc) => {
          const data = doc.data() as FirestoreMessageDoc;
          const apartmentData = isSharedApartmentData(data.apartmentData) ? data.apartmentData : undefined;
          return {
            id: doc.id,
            text: data.text ?? "",
            noteText: typeof data.noteText === "string" ? data.noteText : undefined,
            senderId: data.senderId ?? "",
            createdAt: data.createdAt ?? Date.now(),
            isRead: data.isRead ?? true,
            type: data.type,
            status: data.status,
            proposedPrice: typeof data.proposedPrice === "number" ? data.proposedPrice : undefined,
            requestedDate: typeof data.requestedDate === "string" ? data.requestedDate : undefined,
            requestedTime: typeof data.requestedTime === "string" ? data.requestedTime : undefined,
            apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
            apartmentData,
            filterSetData: data.filterSetData,
            filterSetId: typeof data.filterSetId === "string" ? data.filterSetId : undefined,
            listId: typeof data.listId === "string" ? data.listId : undefined,
            listTitle: typeof data.listTitle === "string" ? data.listTitle : undefined,
            apartmentIds: Array.isArray(data.apartmentIds) ? data.apartmentIds.filter((item): item is string => typeof item === "string") : undefined,
            apartmentCount: typeof data.apartmentCount === "number" ? data.apartmentCount : undefined,
            previewImages: Array.isArray(data.previewImages) ? data.previewImages.filter((item): item is string => typeof item === "string") : undefined,
          };
        });

      const cutoff = clearedAtCutoffRef.current;
      const filteredFetched = cutoff
        ? fetched.filter((message) => createdAtToMillis(message.createdAt) > cutoff)
        : fetched;

      setMessages((prev) => {
        const optimisticPending = prev.filter((m) => {
          if (!(m.id.startsWith("temp-") && m.senderId === currentUserId)) return false;
          return cutoff ? createdAtToMillis(m.createdAt) > cutoff : true;
        });
        const unresolved = optimisticPending.filter(
          (temp) => !filteredFetched.some((serverMsg) => serverMsg.senderId === temp.senderId && serverMsg.text === temp.text),
        );
        return sortMessages([...filteredFetched, ...unresolved]);
      });
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    });
    return () => {
      unsub();
      unsubChat();
    };
  }, [chatRoomId, currentUserId, sortMessages]);

  useEffect(() => {
    if (!isRoommateChat && showMutualLikes) {
      setShowMutualLikes(false);
    }
  }, [isRoommateChat, showMutualLikes]);

  useEffect(() => {
    if (!isRoommateChat || !currentUserId) {
      setCurrentUserLikedIds(new Set());
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(currentUserId, (ids) => {
      setCurrentUserLikedIds(ids);
    });

    return () => unsubscribe();
  }, [currentUserId, isRoommateChat]);

  useEffect(() => {
    if (!isRoommateChat || !counterpartId) {
      setCounterpartLikedIds(new Set());
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(counterpartId, (ids) => {
      setCounterpartLikedIds(ids);
    });

    return () => unsubscribe();
  }, [counterpartId, isRoommateChat]);

  const mutualLikedIds = useMemo(() => {
    if (!isRoommateChat) return [] as string[];
    return Array.from(currentUserLikedIds).filter((id) => counterpartLikedIds.has(id));
  }, [counterpartLikedIds, currentUserLikedIds, isRoommateChat]);

  useEffect(() => {
    if (!isRoommateChat) {
      setMutualLikedApartments([]);
      setMutualLikesLoading(false);
      return;
    }

    if (mutualLikedIds.length === 0) {
      setMutualLikedApartments([]);
      setMutualLikesLoading(false);
      return;
    }

    let active = true;
    setMutualLikesLoading(true);

    void (async () => {
      try {
        const apartmentsSnap = await getDocs(query(collection(db, "apartments"), orderBy("createdAt", "desc")));
        if (!active) return;

        const mutualIdSet = new Set(mutualLikedIds);
        const fetched = apartmentsSnap.docs
          .map((docSnap) => mapApartmentDocToMutualApartment(docSnap.id, docSnap.data() as FirestoreApartmentDoc))
          .filter((apartment) => mutualIdSet.has(apartment.id));

        if (active) {
          setMutualLikedApartments(fetched);
        }
      } catch {
        if (active) {
          setMutualLikedApartments([]);
        }
      } finally {
        if (active) {
          setMutualLikesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isRoommateChat, mutualLikedIds]);

  useEffect(() => {
    setIsNoticeDismissedLocally(false);
  }, [chatRoomId, currentUserId, counterpartId]);

  useEffect(() => {
    setShowHostActionMenu(false);
    setShowPriceProposalModal(false);
    setShowVisitRequestModal(false);
  }, [chatRoomId]);

  useEffect(() => {
    if (!currentUserId || !counterpartId || !chatRoomId) {
      setCrossChatNoticeTarget(null);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const chatDocs = await getDocs(query(collection(db, "chats"), where("users", "array-contains", currentUserId)));
        if (!active) return;

        const crossChat = chatDocs.docs.find((chatDoc) => {
          if (chatDoc.id === chatRoomId) return false;
          const data = chatDoc.data() as FirestoreChatDoc;
          const users = Array.isArray(data.users) ? data.users : [];
          if (!users.includes(counterpartId)) return false;
          if ((data.status ?? "active") !== "active") return false;

          const otherType = data.type === "host" ? "host" : "roommate";
          return otherType !== chatType;
        });

        if (!crossChat) {
          setCrossChatNoticeTarget(null);
          return;
        }

        const otherData = crossChat.data() as FirestoreChatDoc;
        setCrossChatNoticeTarget(otherData.type === "host" ? "hostInbox" : "matches");
      } catch {
        if (!active) return;
        setCrossChatNoticeTarget(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [chatRoomId, chatType, counterpartId, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }

    let active = true;
    void (async () => {
      const settings = await getUserSettings(currentUserId).catch(() => null);
      if (!active) return;
      setNotificationPreferences(settings?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES);
    })();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !counterpartId) {
      setSettingsBlockState({ isBlocker: false, isBlocked: false });
      return;
    }

    let active = true;
    void (async () => {
      const state = await getBlockRelationshipState(currentUserId, counterpartId);
      if (active) {
        setSettingsBlockState(state);
        setIsBlocker(state.isBlocker);
      }
    })();

    return () => {
      active = false;
    };
  }, [counterpartId, currentUserId]);

  useEffect(() => {
    if (chatType !== "host" || !hostApartmentId) {
      setHostApartment(null);
      setIsApartmentUnavailable(false);
      return;
    }

    const apartmentRef = doc(db, "apartments", hostApartmentId);
    const unsubscribe = onSnapshot(
      apartmentRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          setIsApartmentUnavailable(false);
          setHostApartment(buildApartmentRoutePayload(hostApartmentId, snapshot.data() as FirestoreApartmentDoc, hostApartmentTitle ?? undefined));
          return;
        }

        setIsApartmentUnavailable(true);
        setHostApartment({
          id: hostApartmentId,
          title: t("apartments.unavailable"),
          description: "",
          about: "",
          area: t("apartments.unknownArea"),
          city: t("apartments.unknownCity"),
          address: undefined,
          latitude: undefined,
          longitude: undefined,
          hasExactLocation: false,
          rent: 0,
          maxDiscountPercentage: 10,
          rooms: 1,
          size: 0,
          image: "https://images.unsplash.com/photo-1564078516393-cf04bd966897?crop=entropy&cs=srgb&fm=jpg&w=1200&q=85",
          tags: [t("apartments.newListing")],
          hostId: undefined,
        });
      },
      () => {
        setIsApartmentUnavailable(true);
        setHostApartment(null);
      },
    );

    return () => unsubscribe();
  }, [chatType, hostApartmentId, hostApartmentTitle]);

  useEffect(() => {
    if (!currentUserId || !counterpartId) {
      setCompatibilityScore(null);
      return;
    }

    let active = true;

    void (async () => {
      try {
        // 1. Χρησιμοποιούμε το Cache API μας για ακαριαία, ομαλοποιημένα προφίλ
        const [currentProfile, counterpartProfile, currentQuizSnap, counterpartQuizSnap] = await Promise.all([
          getUserProfile(currentUserId),
          getUserProfile(counterpartId),
          getDoc(doc(db, "quiz_answers", currentUserId)),
          getDoc(doc(db, "quiz_answers", counterpartId)),
        ]);

        if (!active || !currentProfile || !counterpartProfile) {
          if (active) setCompatibilityScore(null);
          return;
        }

        // 2. Καθαρίζουμε τις απαντήσεις του Quiz όπως ακριβώς κάνουμε και στο roommates.tsx
        const rawCurrentQuiz = (currentQuizSnap.exists() ? (currentQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {};
        const rawCounterpartQuiz = (counterpartQuizSnap.exists() ? (counterpartQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {};

        const cleanCurrentQuiz: any = {};
        Object.keys(rawCurrentQuiz).forEach(key => {
          if (typeof rawCurrentQuiz[key] === "string" && rawCurrentQuiz[key].trim().length > 0) {
            cleanCurrentQuiz[key] = rawCurrentQuiz[key];
          }
        });

        const cleanCounterpartQuiz: any = {};
        Object.keys(rawCounterpartQuiz).forEach(key => {
          if (typeof rawCounterpartQuiz[key] === "string" && rawCounterpartQuiz[key].trim().length > 0) {
            cleanCounterpartQuiz[key] = rawCounterpartQuiz[key];
          }
        });

        // 3. Δημιουργία των αντικειμένων για τον αλγόριθμο
        const currentProfileForScore: MatchUserProfile = {
          uid: currentUserId,
          city: (currentProfile.city ?? "").trim(),
          gender: normalizeGenderForMatch(currentProfile.gender),
          monthlyBudget: currentProfile.budget ?? 0,
          quiz: cleanCurrentQuiz as CompatibilityQuizAnswers,
        };

        const counterpartProfileForScore: MatchUserProfile = {
          uid: counterpartId,
          city: (counterpartProfile.city ?? "").trim(),
          gender: normalizeGenderForMatch(counterpartProfile.gender),
          monthlyBudget: counterpartProfile.budget ?? 0,
          quiz: cleanCounterpartQuiz as CompatibilityQuizAnswers,
        };

        // 4. Υπολογισμός και αποθήκευση του σκορ
        const score = calculateMatchScore(currentProfileForScore, counterpartProfileForScore);
        if (active) {
          setCompatibilityScore(score);
        }
      } catch (error) {
        console.error("[Chat] Compatibility score computation failed:", error);
        if (active) {
          setCompatibilityScore(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [counterpartId, currentUserId]);

  // Mark incoming messages as read when user enters this chat
  useEffect(() => {
    if (!currentUserId || !chatRoomId || !id) return;
    
    // Call the async function to mark messages from counterpart as read
    void markIncomingMessagesAsRead(chatRoomId, currentUserId, id);
  }, [chatRoomId, currentUserId, id]);

  const send = useCallback(async () => {
    const trimmed = text.trim();
    const counterpartDeleted = !counterpartExists;
    const apartmentLocked = chatType === "host" && isApartmentUnavailable;
    if (!trimmed || !currentUserId || !id || !chatRoomId || chatStatus === "pending" || chatStatus === "rejected" || counterpartDeleted || apartmentLocked) return;

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      text: trimmed,
      senderId: currentUserId,
      createdAt: Date.now(),
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));
    setText("");
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    try {
      // 1. Αποθήκευση μηνύματος στο Firestore (Subcollection)
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        text: trimmed,
        senderId: currentUserId,
        receiverId: id,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      // 2. Ενημέρωση τελευταίου μηνύματος στο Chat Document
      await updateDoc(doc(db, "chats", chatRoomId), {
        lastMessage: trimmed,
        lastMessageTimestamp: serverTimestamp(),
      });

      // 🚨 ------------------ ΒΗΜΑ 2: ΕΛΕΓΧΟΙ NOTIFICATIONS & MUTE ------------------
      
      // Α. Έλεγχος αν ο παραλήπτης έχει κάνει Mute αυτή τη συγκεκριμένη συνομιλία
      const chatSnap = await getDoc(doc(db, "chats", chatRoomId));
      const chatData = chatSnap.exists() ? chatSnap.data() : null;
      const receiverLegacyMuted = chatData?.mutedByUsers?.[id] === true;

      // Β. Έλεγχος αν ο παραλήπτης έχει κλείσει γενικά τα Direct Messages από το Notifications Screen
      const receiverSettings = await getUserSettings(id).catch(() => null);
      const globalDmsEnabled = receiverSettings?.notifications?.direct_messages ?? true;
      const receiverNotifications = receiverSettings?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
      const isMutedByReceiver = evaluateEffectiveChatMuted({
        chatRoomId,
        muteAllNotifications: receiverNotifications.mute_all_notifications,
        mutedChatIds: receiverNotifications.muted_chat_ids,
        unmutedChatOverrides: receiverNotifications.unmuted_chat_overrides,
        legacyChatMuted: receiverLegacyMuted,
      });

      // Αν ο άλλος χρήστης σε έχει κάνει Mute Ή έχει κλείσει γενικά τα DMs, σταματάμε εδώ!
      // Το μήνυμα αποθηκεύεται κανονικά στο chat, αλλά ΔΕΝ του στέλνουμε Push Notification.
      if (isMutedByReceiver || !globalDmsEnabled) {
        console.log("[Notifications] Η ειδοποίηση ακυρώθηκε: Ο παραλήπτης έχει κάνει Mute ή έχει απενεργοποιήσει τα DMs.");
        return; 
      }

      // 3. Ανάκτηση Token & Αποστολή Push Notification στον Παραλήπτη
      const receiverDocRef = doc(db, "users", id);
      const receiverSnap = await getDoc(receiverDocRef);

      if (receiverSnap.exists()) {
        const receiverData = receiverSnap.data();
        const receiverToken = receiverData?.expoPushToken;

        if (receiverToken) {
          await sendPushNotification(
            receiverToken,
            "Νέο μήνυμα στο CampuStay! 💬",
            trimmed,
            { chatRoomId, senderId: currentUserId }
          );
        } else {
          console.log("[Notifications] Ο παραλήπτης δεν έχει καταχωρημένο expoPushToken.");
        }
      }

    } catch (error) {
      console.error("Error sending message/notification:", error);
      // Επαναφορά του UI (αφαίρεση του optimistic message) σε περίπτωση αποτυχίας
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
    }
  }, [chatRoomId, chatStatus, chatType, counterpartExists, currentUserId, id, isApartmentUnavailable, sortMessages, text]);

  const socialLinks = useMemo(
    () => [
      {
        id: "instagram",
        label: t("chat.socialPlatforms.instagram"),
        icon: "logo-instagram" as const,
        url: normalizeSocialUrl("instagram", counterpartDetails?.instagram ?? ""),
      },
      {
        id: "facebook",
        label: t("chat.socialPlatforms.facebook"),
        icon: "logo-facebook" as const,
        url: normalizeSocialUrl("facebook", counterpartDetails?.facebook ?? ""),
      },
      {
        id: "linkedin",
        label: t("chat.socialPlatforms.linkedin"),
        icon: "logo-linkedin" as const,
        url: normalizeSocialUrl("linkedin", counterpartDetails?.linkedin ?? ""),
      },
      {
        id: "twitter",
        label: t("chat.socialPlatforms.twitter"),
        icon: "logo-twitter" as const,
        url: normalizeSocialUrl("twitter", counterpartDetails?.twitter ?? ""),
      },
    ].filter((item) => item.url.length > 0),
    [counterpartDetails?.facebook, counterpartDetails?.instagram, counterpartDetails?.linkedin, counterpartDetails?.twitter],
  );

  const deletedProfileFallback: RoommateProfile = {
    id,
    name: t("common.account.deleted"),
    age: 0,
    gender: t("common.values.nonBinary") as Gender,
    budget: 0,
    university: "",
    program: "",
    bio: "",
    tags: [],
    photo: "",
    deleted: true,
  };

  const activeProfile = profile ?? deletedProfileFallback;

  const deletedCounterpart = !counterpartExists || isDeletedCounterpart(activeProfile);
  const rejectedByCounterpart =
    chatStatus === "rejected" &&
    !!currentUserId &&
    !!counterpartId &&
    (
      chatRejectedBy === counterpartId ||
      chatRejections.includes(currentUserId) ||
      chatInitiatedBy === currentUserId
    );
  const maskedAsDeleted = deletedCounterpart || rejectedByCounterpart;

  const hasBlockedByMe = isBlocker || settingsBlockState.isBlocker;
  const blockedByOtherUser = isBlocked || settingsBlockState.isBlocked;

  // 🎯 ΔΙΟΡΘΩΣΗ: Δυναμικός έλεγχος για απόκρυψη στοιχείων λόγω Block
  let displayName = maskedAsDeleted ? t("common.account.deleted") : activeProfile.name;
  let displayAbout = maskedAsDeleted
    ? t("chat.placeholderDeleted")
    : counterpartDetails?.about?.trim() || counterpartDetails?.bio?.trim() || t("common.values.notAvailable");
  let showAvatarImage = !maskedAsDeleted && !!activeProfile.photo?.trim();
  let displayUniversity = maskedAsDeleted ? "" : activeProfile.university;

  if (hasBlockedByMe) {
    displayName = t("common.account.blocked");
    showAvatarImage = false;
    displayUniversity = "";
    displayAbout = t("chat.blocked.profileHidden");
  } else if (blockedByOtherUser) {
    displayName = t("common.account.deleted") || "Deleted Account";
    showAvatarImage = false;
    displayUniversity = "";
    displayAbout = t("chat.placeholderDeleted") || t("chat.blocked.accountDeletedFallback");
  }

  const apartmentLocked = chatType === "host" && isApartmentUnavailable;
  const hostPhoneNumber =
    chatType === "host"
      ? (
          hostPhoneFromChatMeta ||
          (typeof counterpartDetails?.phone_number === "string" ? counterpartDetails.phone_number : "") ||
          (typeof counterpartDetails?.phone === "string" ? counterpartDetails.phone : "")
        ).trim()
      : "";
  const shouldShowHostPhoneBadge = chatType === "host" && hostPhoneNumber.length > 0;
  const isAllMuteActive = notificationPreferences.mute_all_notifications;
  const isChatMutedEffective = evaluateEffectiveChatMuted({
    chatRoomId,
    muteAllNotifications: notificationPreferences.mute_all_notifications,
    mutedChatIds: notificationPreferences.muted_chat_ids,
    unmutedChatOverrides: notificationPreferences.unmuted_chat_overrides,
    legacyChatMuted: isChatMuted,
  });

  // 🎯 ΑΣΦΑΛΕΙΑ: Αν υπάρχει οποιοδήποτε block, κλειδώνουμε το input bar
  const inputBlocked = chatStatus === "pending" || chatStatus === "rejected" || deletedCounterpart || apartmentLocked || hasBlockedByMe || blockedByOtherUser;

  const filterHistoryRecords = useMemo<SharedFilterSetRecord[]>(() => {
    const records = new Map<string, SharedFilterSetRecord>();
    messages.forEach((message) => {
      if (message.type !== "filter_set_share" || !message.filterSetData) return;
      const data = message.filterSetData;
      const updatedAt = data.sharedAt ?? (createdAtToMillis(message.createdAt) || Date.now());
      const version: FilterSetVersionData = {
        version: 1,
        title: data.title ?? "",
        rentMin: data.rentMin,
        rentMax: data.rentMax,
        minSqmPrice: data.minSqmPrice,
        maxSqmPrice: data.maxSqmPrice,
        cityQuery: data.cityQuery,
        sizeMin: data.sizeMin,
        sizeMax: data.sizeMax,
        petFriendly: data.petFriendly === true,
        nearMetro: data.nearMetro === true,
        sortBy: data.sortBy as FilterSetVersionData["sortBy"],
        summary: data.summary ?? "",
        updatedAt,
      };
      const id = message.filterSetId ?? message.id;
      const existing = records.get(id);
      const broker = counterpartId && counterpartDetails ? {
        brokerId: counterpartId,
        brokerName: counterpartDetails.name?.trim() || displayName,
        brokerAvatar: counterpartDetails.photoUrl || counterpartDetails.photos?.[0],
        sharedAt: updatedAt,
      } : undefined;
      records.set(id, existing ? { ...existing, currentVersion: version.version, versions: [version], updatedAt } : {
        id,
        userId: message.senderId,
        title: version.title,
        currentVersion: 1,
        versions: [version],
        sharedBrokers: broker ? [broker] : [],
        createdAt: updatedAt,
        updatedAt,
      });
    });
    return [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [counterpartDetails, counterpartId, createdAtToMillis, displayName, messages]);

  // Κρύβουμε τα social links σε περίπτωση block
  const shouldShowSocialLinks = !maskedAsDeleted && !hasBlockedByMe && !blockedByOtherUser && !!counterpartDetails?.looking_for_apartment;

  const blockedBannerText = hasBlockedByMe
    ? t("chat.blocked.youBlockedBanner")
    : blockedByOtherUser
    ? t("chat.blocked.unavailableBanner")
    : null;
  const hasCrossChat = !!crossChatNoticeTarget;
  const crossChatLocationLabel = crossChatNoticeTarget
    ? t(crossChatNoticeTarget === "hostInbox" ? "chat.crossChatNotice.hostInbox" : "chat.crossChatNotice.matches")
    : "";
  const showCrossChatNotice = hasCrossChat && !isCrossChatNoticeDismissed && !isNoticeDismissedLocally;

  const displayGender = maskedAsDeleted ? t("common.values.notApplicable") : activeProfile.gender;
  const displayAge = maskedAsDeleted ? t("common.values.emptyDash") : `${activeProfile.age} ${t("common.format.yearsSuffix")}`;
  const displayBudget = maskedAsDeleted ? t("common.values.emptyDash") : `${CURRENCY}${activeProfile.budget}${t("common.format.perMonthShort")}`;
  const displayCity = maskedAsDeleted
    ? t("common.values.notApplicable")
    : counterpartDetails?.city?.trim() || t("common.values.notAvailable");
  const apartmentPillTitle = apartmentLocked ? t("apartments.unavailable") : hostApartment?.title || hostApartmentTitle || t("apartments.unavailable");
  const apartmentPreviewSubtitle = !apartmentLocked && hostApartment
    ? `${hostApartment.area}, ${hostApartment.city}`
    : "";
  const apartmentPreviewPrice = !apartmentLocked && hostApartment?.rent
    ? `${CURRENCY}${hostApartment.rent}${t("common.format.perMonthShort")}`
    : "";
  const hostUserId =
    chatType === "host" && typeof hostApartment?.hostId === "string" && hostApartment.hostId.trim().length > 0
      ? hostApartment.hostId.trim()
      : null;
  const isCurrentUserHost = !!currentUserId && !!hostUserId && currentUserId === hostUserId;
  const shouldShowHostClientActions =
    chatType === "host" &&
    !!hostUserId &&
    !isCurrentUserHost &&
    !auth.isGuest &&
    !!hostApartmentId;

  const hostDiscountPercentage =
    typeof hostApartment?.maxDiscountPercentage === "number" ? hostApartment.maxDiscountPercentage : 10;
  const hostRent = typeof hostApartment?.rent === "number" ? hostApartment.rent : 0;
  const minRecommendedPrice = hostRent * ((100 - hostDiscountPercentage) / 100);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = toIsoDate(todayStart);

  const calendarCells = useMemo(() => {
    const year = visitMonthCursor.getFullYear();
    const month = visitMonthCursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayRaw = new Date(year, month, 1).getDay();
    const firstDay = (firstDayRaw + 6) % 7;

    const cells: Array<{ day: number; iso: string; disabled: boolean } | null> = [];
    for (let i = 0; i < firstDay; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const iso = toIsoDate(date);
      const disabled = date.getTime() < todayStart.getTime();
      cells.push({ day, iso, disabled });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [todayStart, visitMonthCursor]);

  const canGoToPreviousMonth =
    visitMonthCursor.getFullYear() > todayStart.getFullYear() ||
    (visitMonthCursor.getFullYear() === todayStart.getFullYear() && visitMonthCursor.getMonth() > todayStart.getMonth());

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, value) => `${value}`.padStart(2, "0")),
    [],
  );
  const minuteOptions = useMemo(() => ["00", "30"] as const, []);
  const isSelectedDateToday = selectedVisitDate === todayIso;

  const isHourDisabled = useCallback(
    (hour: string) => {
      if (!isSelectedDateToday) return false;
      const numericHour = Number(hour);
      if (numericHour < now.getHours()) return true;
      if (numericHour > now.getHours()) return false;
      return minuteOptions.every((minute) => Number(minute) < now.getMinutes());
    },
    [isSelectedDateToday, minuteOptions, now],
  );

  const isMinuteDisabled = useCallback(
    (minute: "00" | "30") => {
      if (!isSelectedDateToday) return false;
      const numericHour = Number(selectedVisitHour);
      if (numericHour > now.getHours()) return false;
      if (numericHour < now.getHours()) return true;
      return Number(minute) < now.getMinutes();
    },
    [isSelectedDateToday, now, selectedVisitHour],
  );

  const openVisitRequestModal = useCallback(() => {
    const nextSlot = getNextHalfHour(new Date());
    setSelectedVisitDate(toIsoDate(nextSlot));
    setSelectedVisitHour(`${nextSlot.getHours()}`.padStart(2, "0"));
    setSelectedVisitMinute(nextSlot.getMinutes() >= 30 ? "30" : "00");
    setVisitMonthCursor(new Date(nextSlot.getFullYear(), nextSlot.getMonth(), 1));
    setShowVisitRequestModal(true);
    setShowHostActionMenu(false);
  }, []);

  const submitPriceProposal = useCallback(async () => {
    if (!currentUserId || !chatRoomId || !hostApartmentId || isSubmittingHostAction) return;

    const parsedPrice = Number(proposedPriceInput.replace(/,/g, ".").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

    setIsSubmittingHostAction(true);
    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "price_proposal",
        proposedPrice: Math.round(parsedPrice),
        status: "pending",
        apartmentId: hostApartmentId,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "brokerClientProfiles", `${counterpartId}_${currentUserId}`), {
        pipelineStage: "offer_made",
        stageUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });

      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          lastMessage: `Πρόταση τιμής: ${Math.round(parsedPrice)}${CURRENCY}`,
          lastMessageTimestamp: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setProposedPriceInput("");
      setShowPriceProposalModal(false);
    } catch {
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsSubmittingHostAction(false);
    }
  }, [chatRoomId, currentUserId, hostApartmentId, isSubmittingHostAction, proposedPriceInput]);

  const submitVisitRequest = useCallback(async () => {
    if (!currentUserId || !chatRoomId || !hostApartmentId || !selectedVisitDate || isSubmittingHostAction) return;
    if (isHourDisabled(selectedVisitHour) || isMinuteDisabled(selectedVisitMinute)) return;

    const visitDate = parseIsoDate(selectedVisitDate);
    if (!visitDate) return;

    setIsSubmittingHostAction(true);
    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "visit_request",
        requestedDate: selectedVisitDate,
        requestedTime: `${selectedVisitHour}:${selectedVisitMinute}`,
        status: "pending",
        apartmentId: hostApartmentId,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "brokerClientProfiles", `${counterpartId}_${currentUserId}`), {
        pipelineStage: "showing_scheduled",
        stageUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });

      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          lastMessage: `Αίτημα επίσκεψης: ${formatRequestDate(selectedVisitDate)} ${selectedVisitHour}:${selectedVisitMinute}`,
          lastMessageTimestamp: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setShowVisitRequestModal(false);
    } catch {
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsSubmittingHostAction(false);
    }
  }, [
    chatRoomId,
    currentUserId,
    hostApartmentId,
    isHourDisabled,
    isMinuteDisabled,
    isSubmittingHostAction,
    selectedVisitDate,
    selectedVisitHour,
    selectedVisitMinute,
  ]);

  const approveHostActionMessage = useCallback(
    async (message: Message) => {
      if (!chatRoomId || !currentUserId || !isCurrentUserHost || message.status !== "pending") return;

      try {
        await updateDoc(doc(db, "chats", chatRoomId, "messages", message.id), {
          status: "approved",
          approvedBy: currentUserId,
          approvedAt: serverTimestamp(),
        });

        if (message.type === "price_proposal" && typeof message.proposedPrice === "number") {
          const offerApartmentId =
            typeof message.apartmentId === "string" && message.apartmentId.trim().length > 0
              ? message.apartmentId
              : hostApartmentId || "";

          if (offerApartmentId) {
            const offerDocId = `${message.senderId}_${offerApartmentId}`;
            await setDoc(
              doc(db, "chats", chatRoomId, "approvedOffers", offerDocId),
              {
                clientUserId: message.senderId,
                apartmentId: offerApartmentId,
                approvedPrice: message.proposedPrice,
                approvedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        }

        const confirmationText =
          message.type === "price_proposal"
            ? "Ο αγγελιοδότης επιβεβαίωσε την πρόταση τιμής!"
            : "Ο αγγελιοδότης επιβεβαίωσε το αίτημα επίσκεψης!";

        await addDoc(collection(db, "chats", chatRoomId, "messages"), {
          senderId: "system",
          text: confirmationText,
          type: "system_notice",
          createdAt: serverTimestamp(),
          isRead: true,
        });

        await setDoc(
          doc(db, "chats", chatRoomId),
          {
            lastMessage: confirmationText,
            lastMessageTimestamp: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch {
        setActionModal({
          title: t("chat.modals.actionFailedTitle"),
          description: t("common.messages.tryAgain"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "alert-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
      }
    },
    [chatRoomId, currentUserId, hostApartmentId, isCurrentUserHost],
  );

  const handleApartmentPillPress = () => {
    if (!hostApartment || apartmentLocked) return;
    router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(hostApartment) } });
  };

  const handleDismissNotice = useCallback(async () => {
    if (!currentUserId || !chatRoomId) return;

    setIsNoticeDismissedLocally(true);
    try {
      await updateDoc(doc(db, "chats", chatRoomId), {
        [`dismissedCrossChatNotices.${currentUserId}`]: true,
      });
      setIsCrossChatNoticeDismissed(true);
    } catch {
      setIsNoticeDismissedLocally(false);
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    }
  }, [chatRoomId, currentUserId]);

  const syncChatLastMessage = useCallback(async (roomId: string) => {
    const latestMessageSnap = await getDocs(
      query(collection(db, "chats", roomId, "messages"), orderBy("createdAt", "desc"), limit(1)),
    );

    if (latestMessageSnap.empty) {
      await setDoc(
        doc(db, "chats", roomId),
        {
          lastMessage: "",
          lastMessageTimestamp: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    const latestMessageData = latestMessageSnap.docs[0].data() as FirestoreMessageDoc;
    await setDoc(
      doc(db, "chats", roomId),
      {
        lastMessage: latestMessageData.text ?? "",
        lastMessageTimestamp: latestMessageData.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }, []);

  const handleDeleteMessageForEveryone = useCallback(async () => {
    if (!chatRoomId || !currentUserId || !messageActionTarget || isDeletingMessage) return;
    if (messageActionTarget.senderId !== currentUserId) return;

    setIsDeletingMessage(true);
    try {
      await deleteDoc(doc(db, "chats", chatRoomId, "messages", messageActionTarget.id));
      await syncChatLastMessage(chatRoomId);
      setMessageActionTarget(null);
    } catch {
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsDeletingMessage(false);
    }
  }, [chatRoomId, currentUserId, isDeletingMessage, messageActionTarget, syncChatLastMessage]);

  const handleMuteConversation = useCallback(async () => {
    if (!currentUserId || !chatRoomId || isMuting) return;

    setShowContextMenu(false);

    if (isAllMuteActive && isChatMutedEffective) {
      setShowGlobalUnmuteModal(true);
      return;
    }

    setIsMuting(true);

    try {
      const settings = await getUserSettings(currentUserId);
      const currentNotifications = settings.notifications;

      if (isAllMuteActive) {
        const nextOverrides = currentNotifications.unmuted_chat_overrides.filter((id) => id !== chatRoomId);
        const updatedSettings = await saveUserNotifications(currentUserId, {
          ...currentNotifications,
          unmuted_chat_overrides: nextOverrides,
        });
        setNotificationPreferences(updatedSettings.notifications);

        await setDoc(
          doc(db, "chats", chatRoomId),
          {
            mutedByUsers: {
              [currentUserId]: true,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setIsChatMuted(true);
        setActionModal({
          title: t("chat.modals.conversationUpdatedTitle"),
          description: t("chat.modals.notificationsMutedMessage"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "checkmark-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
        return;
      }

      const nextMutedState = !isChatMutedEffective;
      const nextMutedChatIds = nextMutedState
        ? Array.from(new Set([...currentNotifications.muted_chat_ids, chatRoomId]))
        : currentNotifications.muted_chat_ids.filter((id) => id !== chatRoomId);

      const updatedSettings = await saveUserNotifications(currentUserId, {
        ...currentNotifications,
        muted_chat_ids: nextMutedChatIds,
      });
      setNotificationPreferences(updatedSettings.notifications);

      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          mutedByUsers: {
            [currentUserId]: nextMutedState,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setIsChatMuted(nextMutedState);
      setActionModal({
        title: t("chat.modals.conversationUpdatedTitle"),
        description: nextMutedState
          ? t("chat.modals.notificationsMutedMessage")
          : t("chat.modals.notificationsUnmutedMessage"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } catch {
      setActionModal({
        title: t("chat.modals.notificationsUpdateFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsMuting(false);
    }
  }, [chatRoomId, currentUserId, isAllMuteActive, isChatMutedEffective, isMuting]);

  const handleConfirmGlobalUnmuteOverride = useCallback(async () => {
    if (!currentUserId || !chatRoomId || isMuting) return;

    setIsMuting(true);
    try {
      const settings = await getUserSettings(currentUserId);
      const currentNotifications = settings.notifications;
      const nextOverrides = Array.from(new Set([...currentNotifications.unmuted_chat_overrides, chatRoomId]));

      const updatedSettings = await saveUserNotifications(currentUserId, {
        ...currentNotifications,
        unmuted_chat_overrides: nextOverrides,
      });
      setNotificationPreferences(updatedSettings.notifications);

      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          mutedByUsers: {
            [currentUserId]: false,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setIsChatMuted(false);
      setShowGlobalUnmuteModal(false);
      setActionModal({
        title: t("chat.modals.conversationUpdatedTitle"),
        description: t("chat.modals.notificationsUnmutedMessage"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } catch {
      setShowGlobalUnmuteModal(false);
      setActionModal({
        title: t("chat.modals.notificationsUpdateFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsMuting(false);
    }
  }, [chatRoomId, currentUserId, isMuting]);

  const handleOpenBlockModal = useCallback(() => {
    setShowContextMenu(false);
    setShowBlockModal(true);
    setExpandReport(false);
    setReportReason("");
  }, []);

  const handleDeleteChatForCurrentUser = useCallback(async () => {
    if (!currentUserId || !chatRoomId) return;

    try {
      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          [`clearedAt.${currentUserId}`]: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      router.back();
    } catch {
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    }
  }, [chatRoomId, currentUserId, router]);

  const handleBlockFlow = useCallback(
    async (withReport: boolean) => {
      if (!currentUserId || !counterpartId || isSubmittingBlockAction) return;

      setIsSubmittingBlockAction(true);
      try {
        const settings = await getUserSettings(currentUserId);
        const alreadyBlocked = settings.privacy.blocked_profiles.some((profileItem) => profileItem.id === counterpartId);

        const blockedProfiles = alreadyBlocked
          ? settings.privacy.blocked_profiles
          : [
              ...settings.privacy.blocked_profiles,
              {
                id: counterpartId,
                name: displayName,
              },
            ];

        await saveUserPrivacy(currentUserId, {
          ...settings.privacy,
          blocked_profiles: blockedProfiles,
        });

        await setBlockStateBetweenUsers(currentUserId, counterpartId, true);
        setIsBlocker(true);
        setSettingsBlockState((prev) => ({ ...prev, isBlocker: true }));

        if (withReport) {
          await submitReportedUserEntry({
            reportedUserId: counterpartId,
            reportedUsername: displayName,
            reporterUid: currentUserId,
            reportReasonText: reportReason,
            chatRoomId,
          });
        }

        setShowBlockModal(false);
        setExpandReport(false);
        setReportReason("");

        setActionModal({
          title: t("chat.modals.actionCompletedTitle"),
          description: withReport
            ? t("chat.modals.blockAndReportSuccessMessage")
            : t("chat.modals.blockSuccessMessage"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "checkmark-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
      } catch {
        setActionModal({
          title: t("chat.modals.actionFailedTitle"),
          description: t("common.messages.tryAgain"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "alert-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
      } finally {
        setIsSubmittingBlockAction(false);
      }
    },
    [chatRoomId, counterpartId, currentUserId, displayName, isSubmittingBlockAction, reportReason],
  );

  const executeUnblock = useCallback(async () => {
    if (!currentUserId || !counterpartId || isSubmittingBlockAction) return;

    // Optimistic UI update: reflect unblocked state instantly in chat controls and banner.
    const previousSettingsState = settingsBlockState;
    const previousIsBlocker = isBlocker;
    setShowContextMenu(false);
    setIsBlocker(false);
    setSettingsBlockState((prev) => ({ ...prev, isBlocker: false }));

    setIsSubmittingBlockAction(true);
    try {
      // 1. Αφαιρούμε τον χρήστη από τη λίστα blocked_profiles των ρυθμίσεών μας
      const settings = await getUserSettings(currentUserId);
      const updatedBlockedProfiles = settings.privacy.blocked_profiles.filter(
        (profileItem) => profileItem.id !== counterpartId
      );

      await saveUserPrivacy(currentUserId, {
        ...settings.privacy,
        blocked_profiles: updatedBlockedProfiles,
      });

      await setBlockStateBetweenUsers(currentUserId, counterpartId, false);
      setActionModal({
        title: t("chat.modals.actionCompletedTitle") || "Success",
        description: t("chat.modals.unblockSuccessMessage"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } catch {
      // Revert optimistic state on failure.
      setIsBlocker(previousIsBlocker);
      setSettingsBlockState(previousSettingsState);
      setActionModal({
        title: t("chat.modals.actionFailedTitle"),
        description: t("common.messages.tryAgain"),
        actions: [
          {
            label: t("common.actions.gotIt"),
            iconName: "alert-circle-outline",
            onPress: () => setActionModal(null),
          },
        ],
      });
    } finally {
      setIsSubmittingBlockAction(false);
    }
  }, [chatRoomId, counterpartId, currentUserId, isBlocker, isSubmittingBlockAction, settingsBlockState]);

  if (!profile && loadingProfile) {
    return (
      <View style={[styles.container, styles.center]} testID="chat-screen">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="chat-screen">
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {chatType === "host" && (hostApartment || hostApartmentId || apartmentLocked) ? (
          <Pressable
            style={[styles.apartmentPill, apartmentLocked && styles.apartmentPillDisabled]}
            onPress={handleApartmentPillPress}
            disabled={apartmentLocked}
            testID="chat-apartment-pill"
          >
            {apartmentLocked ? (
              <View style={styles.apartmentThumbFallback}>
                <Ionicons name="image-outline" size={16} color={colors.onSurfaceTertiary} />
              </View>
            ) : hostApartment?.image ? (
              <Image source={{ uri: hostApartment.image }} style={styles.apartmentThumb} contentFit="cover" />
            ) : (
              <View style={styles.apartmentThumbFallback}>
                <Ionicons name="home-outline" size={16} color={colors.onSurfaceTertiary} />
              </View>
            )}
            <View style={styles.apartmentPillTextWrap}>
              <Text style={styles.apartmentPillText} numberOfLines={1}>
                {apartmentPillTitle}
              </Text>
              {!apartmentLocked && (apartmentPreviewSubtitle || apartmentPreviewPrice) ? (
                <Text style={styles.apartmentPillMeta} numberOfLines={1}>
                  {[apartmentPreviewSubtitle, apartmentPreviewPrice].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            {shouldShowHostClientActions && !inputBlocked ? (
              <Pressable
                style={styles.hostActionTrigger}
                onPress={(event) => {
                  event.stopPropagation();
                  setShowContextMenu(false);
                  setShowHostActionMenu((prev) => !prev);
                }}
                hitSlop={6}
                testID="chat-host-actions-trigger"
              >
                <Ionicons
                  name={showHostActionMenu ? "chevron-down" : "chevron-down-circle-outline"}
                  size={22}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            ) : null}
          </Pressable>
        ) : null}
        {showHostActionMenu && shouldShowHostClientActions && !inputBlocked ? (
          <View style={styles.hostActionMenu} testID="chat-host-actions-menu">
            <Pressable
              style={styles.hostActionMenuItem}
              onPress={() => {
                setShowHostActionMenu(false);
                setShowPriceProposalModal(true);
              }}
              testID="chat-host-action-price-proposal"
            >
              <Text style={styles.hostActionMenuText}>Πρότεινε τιμή</Text>
            </Pressable>
            <Pressable
              style={styles.hostActionMenuItem}
              onPress={openVisitRequestModal}
              testID="chat-host-action-visit-request"
            >
              <Text style={styles.hostActionMenuText}>Ζήτα επίσκεψη</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.headerTop}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.back()}
            testID="chat-back-button"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Pressable
            style={styles.headerProfileTapArea}
            onPress={() => setProfileModalVisible(true)}
            disabled={maskedAsDeleted || chatStatus === "rejected"}
            testID="chat-header-profile-trigger"
          >
            {showAvatarImage ? (
              <Image source={{ uri: activeProfile.photo }} style={styles.headerAvatar} contentFit="cover" />
            ) : (
              <DefaultProfileAvatar size={44} iconSize={22} testID="chat-header-avatar-fallback" />
            )}
            <View style={[styles.headerTextWrap, !displayUniversity?.trim() && { transform: [{ translateY: 7 }] }]}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {displayName}
                </Text>
                {shouldShowHostPhoneBadge ? (
                  <View style={styles.hostPhoneBadge}>
                    <Ionicons name="call-outline" size={11} color={colors.onSurfaceTertiary} />
                    <Text style={styles.hostPhoneBadgeText} numberOfLines={1}>{hostPhoneNumber}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.headerUni} numberOfLines={1}>
                {displayUniversity}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              setShowHostActionMenu(false);
              setShowContextMenu((prev) => !prev);
            }}
            testID="chat-context-menu-button"
            hitSlop={8}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, isFilterHistoryActive && styles.iconBtnActive]}
            onPress={() => {
              setShowContextMenu(false);
              setIsFilterHistoryActive((previous) => !previous);
            }}
            testID="chat-filter-history-toggle"
            hitSlop={8}
          >
            <Ionicons name="time-outline" size={22} color={isFilterHistoryActive ? colors.brand : colors.onSurface} />
          </Pressable>
          {isRoommateChat ? (
            <Pressable
              style={[styles.iconBtn, showMutualLikes && styles.iconBtnActive]}
              onPress={() => {
                setShowContextMenu(false);
                setShowMutualLikes((prev) => !prev);
              }}
              testID="chat-mutual-likes-toggle"
              hitSlop={8}
            >
              <Text style={[styles.mutualLikesEmoji, showMutualLikes && styles.mutualLikesEmojiActive]}>💕</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailPill}>
            <Ionicons name="person-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.detailText}>{displayGender}</Text>
          </View>
          <View style={styles.detailPill}>
            <Ionicons name="calendar-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.detailText}>{displayAge}</Text>
          </View>
          <View style={[styles.detailPill, styles.budgetPill]}>
            <Ionicons name="wallet-outline" size={13} color={colors.onBrandTertiary} />
            <Text style={[styles.detailText, { color: colors.onBrandTertiary }]}>
              {displayBudget}
            </Text>
          </View>
        </View>

        {showContextMenu ? (
          <View style={[styles.contextMenu, { top: safeMenuTop, right: 16 }]} testID="chat-context-menu">
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => {
                void handleMuteConversation();
              }}
              disabled={isMuting}
              testID="chat-context-mute"
            >
              <Ionicons name={isChatMutedEffective ? "notifications-outline" : "notifications-off-outline"} size={18} color={colors.onSurface} />
              <Text style={styles.contextMenuText}>
                {isChatMutedEffective ? t("chat.menu.unmuteNotifications") : t("chat.menu.muteNotifications")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => {
                void handleDeleteChatForCurrentUser();
              }}
              testID="chat-context-delete"
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.contextMenuText, styles.contextMenuDangerText]}>{t("chatList.delete")}</Text>
            </Pressable>
            {/* 🎯 ΔΙΟΡΘΩΣΗ: Αν είμαστε εμείς ο blocker, το κουμπί μετατρέπεται σε Ξεμπλοκάρισμα */}
            {hasBlockedByMe ? (
              <Pressable
                style={styles.contextMenuItem}
                onPress={() => {
                  void executeUnblock();
                }}
                testID="chat-context-unblock"
              >
                <Ionicons name="refresh-outline" size={18} color={colors.brand} />
                <Text style={[styles.contextMenuText, { color: colors.brand }]}>{t("chat.menu.unblockUser")}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.contextMenuItem}
                onPress={handleOpenBlockModal}
                testID="chat-context-block"
              >
                <Ionicons name="hand-left-outline" size={18} color={colors.error} />
                <Text style={[styles.contextMenuText, styles.contextMenuDangerText]}>{t("chat.menu.block")}</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      {showContextMenu || showHostActionMenu ? (
        <Pressable
          style={styles.contextMenuBackdrop}
          onPress={() => {
            setShowContextMenu(false);
            setShowHostActionMenu(false);
          }}
          testID="chat-context-menu-backdrop"
        />
      ) : null}

      {blockedBannerText ? (
        <View style={styles.blockedBanner}>
          <Text style={styles.blockedBannerText}>{blockedBannerText}</Text>
          {hasBlockedByMe ? (
            <Pressable
              style={[styles.blockedBannerAction, isSubmittingBlockAction && styles.blockedBannerActionDisabled]}
              onPress={() => {
                void executeUnblock();
              }}
              disabled={isSubmittingBlockAction}
              testID="chat-blocked-banner-unblock"
            >
              <Text style={styles.blockedBannerActionText}>{t("common.actions.unblock")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showCrossChatNotice ? (
        <View style={styles.crossChatBanner}>
          <Text style={styles.crossChatBannerText}>
            {t("chat.crossChatNotice.message", { location: crossChatLocationLabel })}
          </Text>
          <Pressable
            style={styles.crossChatDismissButton}
            onPress={() => {
              void handleDismissNotice();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            testID="chat-cross-chat-dismiss"
          >
            <Ionicons name="checkmark" size={16} color={colors.onBrand} />
          </Pressable>
        </View>
      ) : null}

      {activeViewList ? (
        <View style={styles.flex}>
          <View style={styles.listFeedHeaderBanner}>
            <Pressable onPress={() => setActiveViewList(null)} hitSlop={8} style={styles.backToMessagesBtn} testID="back-to-chat-messages">
              <Ionicons color={colors.onSurface} name="arrow-back" size={18} />
              <Text style={styles.backToMessagesText}>Πίσω στα μηνύματα</Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.listFeedBannerTitle}>{activeViewList.listTitle}</Text>
          </View>
          {loadingListFeed ? (
            <View style={styles.mutualLikesLoadingWrap}><ActivityIndicator size="large" color={colors.brand} /></View>
          ) : (
            <ScrollView style={styles.flex} contentContainerStyle={styles.mutualLikesScroll} showsVerticalScrollIndicator={false}>
              {activeViewList.apartments.length === 0 ? (
                <View style={styles.mutualEmptyCard}><Text style={styles.mutualEmptyTitle}>Δεν βρέθηκαν ακίνητα στη λίστα</Text></View>
              ) : activeViewList.apartments.map((apartment) => (
                <MutualApartmentCard
                  key={apartment.id}
                  apartment={apartment}
                  colors={colors}
                  styles={styles}
                  onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as any)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ) : isFilterHistoryActive ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.filterHistoryList} showsVerticalScrollIndicator={false}>
          {filterHistoryRecords.length === 0 ? (
            <View style={styles.mutualEmptyCard}><Ionicons name="time-outline" size={34} color={colors.onSurfaceTertiary} /><Text style={styles.mutualEmptyTitle}>Δεν υπάρχουν κοινοποιημένα set φίλτρων</Text></View>
          ) : filterHistoryRecords.map((record) => (
            <Pressable key={record.id} style={styles.filterHistoryCard} onPress={() => setSelectedFilterSetRecord(record)} testID={`chat-filter-history-${record.id}`}>
              <View style={styles.filterHistoryCardHeader}><Text style={styles.filterHistoryCardTitle} numberOfLines={1}>{record.title || "Set Φίλτρων"}</Text><Text style={styles.filterHistoryVersion}>Έκδοση {record.currentVersion}</Text></View>
              <Text style={styles.filterHistoryDate}>{new Date(record.updatedAt).toLocaleDateString("el-GR")}</Text>
              <Text style={styles.filterHistorySummary} numberOfLines={2}>{record.versions[record.versions.length - 1]?.summary || "Όλα τα διαμερίσματα"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : showMutualLikes ? (
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.mutualLikesScroll} showsVerticalScrollIndicator={false}>
            {mutualLikesLoading ? (
              <View style={styles.mutualLikesLoadingWrap}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            ) : mutualLikedIds.length === 0 ? (
              <View style={styles.mutualEmptyCard}>
                <Ionicons name="heart-outline" size={34} color={colors.onSurfaceTertiary} />
                <Text style={styles.mutualEmptyTitle}>Δεν έχετε κοινά αγαπημένα διαμερίσματα ακόμα</Text>
                <Text style={styles.mutualEmptySubtitle}>Όταν κάνετε like στα ίδια διαμερίσματα, θα εμφανίζονται εδώ!</Text>
              </View>
            ) : (
              mutualLikedApartments.map((apartment) => (
                <MutualApartmentCard
                  key={apartment.id}
                  apartment={apartment}
                  colors={colors}
                  styles={styles}
                  onPress={() =>
                    router.push({
                      pathname: "/apartment-detail",
                      params: { data: JSON.stringify(apartment) },
                    } as any)
                  }
                />
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.map((m, idx) => {
              const groupInfo = getMessageGroupInfo(messages, idx, currentUserId || "");
              const isMine = m.senderId === currentUserId;
              const canDeleteForEveryone = isMine && !m.id.startsWith("temp-");
              const lastMsgIsDifferentSender = idx > 0 && messages[idx - 1].senderId !== m.senderId;
              const isApartmentShare = m.type === "apartment_share" && !!m.apartmentData;
              const isApartmentNoteShare = m.type === "apartment_note_share" && !!m.apartmentData;
              const isFilterSetShare = m.type === "filter_set_share" && !!m.filterSetData;
              const isPropertyListShare = m.type === "property_list_share";
              const isPriceProposal = m.type === "price_proposal";
              const isVisitRequest = m.type === "visit_request";
              const isSystemNotice = m.type === "system_notice";
              const apartmentData = m.apartmentData;
              const apartmentCoverImage = getApartmentCoverImage(apartmentData);
              const apartmentNoteText = (m.noteText || m.text || "").trim();

              const itemMarginStyle = {
                marginVertical: groupInfo.isConsecutive
                  ? groupInfo.position === "first"
                    ? spacing.xs
                    : 2
                  : lastMsgIsDifferentSender
                  ? spacing.sm
                  : spacing.xs,
              };

              let borderRadii = {};
              if (isMine) {
                if (groupInfo.position === "first") {
                  borderRadii = { borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.lg };
                } else if (groupInfo.position === "middle") {
                  borderRadii = { borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm };
                } else if (groupInfo.position === "last") {
                  borderRadii = { borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.sm };
                } else {
                  borderRadii = { borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.sm };
                }
              } else {
                if (groupInfo.position === "first") {
                  borderRadii = { borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.lg };
                } else if (groupInfo.position === "middle") {
                  borderRadii = { borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm };
                } else if (groupInfo.position === "last") {
                  borderRadii = { borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.sm };
                } else {
                  borderRadii = { borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.sm };
                }
              }

              if (isApartmentShare && apartmentData) {
                return (
                  <Pressable
                    key={m.id}
                    style={[
                      styles.shareBubble,
                      isMine ? styles.shareBubbleMine : styles.shareBubbleTheirs,
                      itemMarginStyle,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: "/apartment-detail",
                        params: { data: JSON.stringify(apartmentData) },
                      });
                    }}
                    onLongPress={
                      canDeleteForEveryone
                        ? () => {
                            setMessageActionTarget(m);
                          }
                        : undefined
                    }
                    delayLongPress={300}
                    testID={`chat-message-${m.id}`}
                  >
                    {apartmentCoverImage ? (
                      <Image source={{ uri: apartmentCoverImage }} style={styles.shareImage} contentFit="cover" transition={120} />
                    ) : (
                      <View style={styles.shareImageFallback}>
                        <Ionicons name="home-outline" size={22} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                    <View style={styles.shareContent}>
                      <Text style={[styles.shareTitle, isMine && styles.shareTitleMine]} numberOfLines={1}>
                        {apartmentData.title || m.text}
                      </Text>

                      <View style={styles.shareLocationRow}>
                        <Ionicons
                          name="location-outline"
                          size={13}
                          color={isMine ? "rgba(255,255,255,0.88)" : colors.onSurfaceTertiary}
                        />
                        <Text style={[styles.shareLocationText, isMine && styles.shareLocationTextMine]} numberOfLines={1}>
                          {[apartmentData.area, apartmentData.city].filter(Boolean).join(", ")}
                        </Text>
                      </View>

                      <View style={styles.shareMetaRow}>
                        <View style={styles.sharePricePill}>
                          <Text style={styles.sharePriceText}>€{apartmentData.rent ?? 0}</Text>
                        </View>
                        <Text style={[styles.shareStatsText, isMine && styles.shareStatsTextMine]} numberOfLines={1}>
                          {`${apartmentData.rooms ?? 0} rooms · ${apartmentData.size ?? 0} m²`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }

              if (isFilterSetShare && m.filterSetData) {
                const filterSet = m.filterSetData;
                return (
                  <Pressable
                    key={m.id}
                    style={[
                      styles.filterSetShareBubble,
                      isMine ? styles.filterSetShareBubbleMine : styles.filterSetShareBubbleTheirs,
                      itemMarginStyle,
                    ]}
                    onPress={() => setSelectedFilterSetRecord(filterHistoryRecords.find((record) => record.id === (m.filterSetId ?? m.id)) ?? null)}
                    onLongPress={
                      canDeleteForEveryone
                        ? () => {
                            setMessageActionTarget(m);
                          }
                        : undefined
                    }
                    delayLongPress={300}
                    testID={`chat-message-${m.id}`}
                  >
                    <View style={styles.filterSetShareIcon}>
                      <Ionicons name="options-outline" size={20} color={isMine ? colors.onBrand : colors.brand} />
                    </View>
                    <View style={styles.filterSetShareContent}>
                      <Text style={[styles.filterSetShareTag, isMine && styles.filterSetShareTagMine]}>
                        Κριτήρια Αναζήτησης / Set Φίλτρων
                      </Text>
                      <Text style={[styles.filterSetShareTitle, isMine && styles.filterSetShareTitleMine]} numberOfLines={1}>
                        {filterSet.title || filterSet.summary || "Όλα τα διαμερίσματα"}
                      </Text>
                      <Text style={[styles.filterSetShareSubtitle, isMine && styles.filterSetShareSubtitleMine]}>
                        Πατήστε για προβολή λεπτομερειών
                      </Text>
                    </View>
                  </Pressable>
                );
              }

              if (isPropertyListShare) {
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.sharedListMessageCard, itemMarginStyle]}
                    onPress={() => void handleOpenPropertyList(m)}
                    onLongPress={canDeleteForEveryone ? () => setMessageActionTarget(m) : undefined}
                    delayLongPress={300}
                    testID={`open-shared-list-${m.id}`}
                  >
                    <View style={styles.sharedListHeader}>
                      <Ionicons color={isMine ? colors.onBrand : colors.brand} name="layers-outline" size={18} />
                      <Text numberOfLines={1} style={[styles.sharedListTitle, isMine && styles.sharedListTitleMine]}>{m.listTitle || "Λίστα ακινήτων"}</Text>
                    </View>
                    <Text style={[styles.sharedListCountText, isMine && styles.sharedListCountTextMine]}>{`${m.apartmentCount || m.apartmentIds?.length || 0} προτεινόμενα ακίνητα`}</Text>
                    <View style={styles.sharedListActionRow}>
                      <Text style={[styles.sharedListViewBtnText, isMine && styles.sharedListViewBtnTextMine]}>Προβολή Λίστας</Text>
                      <Ionicons color={isMine ? colors.onBrand : colors.brand} name="chevron-forward" size={16} />
                    </View>
                  </Pressable>
                );
              }

              if (isApartmentNoteShare && apartmentData) {
                return (
                  <Pressable
                    key={m.id}
                    style={[
                      styles.noteShareBubble,
                      isMine ? styles.noteShareBubbleMine : styles.noteShareBubbleTheirs,
                      itemMarginStyle,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: "/apartment-detail",
                        params: { data: JSON.stringify(apartmentData) },
                      });
                    }}
                    onLongPress={
                      canDeleteForEveryone
                        ? () => {
                            setMessageActionTarget(m);
                          }
                        : undefined
                    }
                    delayLongPress={300}
                    accessibilityRole="button"
                    testID={`chat-message-${m.id}`}
                  >
                    <View style={styles.noteShareHeader}>
                      <View style={styles.noteShareBadge}>
                        <Ionicons
                          name="document-text-outline"
                          size={12}
                          color={isMine ? colors.onBrand : colors.onBrandTertiary}
                        />
                        <Text style={[styles.noteShareBadgeText, isMine && styles.noteShareBadgeTextMine]} numberOfLines={1}>
                          Σημείωση Αγγελίας
                        </Text>
                      </View>
                    </View>

                    <View style={styles.noteShareQuote}>
                      <Ionicons
                        name="open-outline"
                        size={16}
                        color={isMine ? "rgba(255,255,255,0.72)" : colors.onSurfaceTertiary}
                      />
                      <Text style={[styles.noteShareQuoteText, isMine && styles.noteShareQuoteTextMine]}>
                        {apartmentNoteText || m.text}
                      </Text>
                    </View>

                    <View style={styles.noteShareFooter}>
                      
                      {apartmentCoverImage ? (
                        <Image
                          source={{ uri: apartmentCoverImage }}
                          style={styles.noteShareThumb}
                          contentFit="cover"
                          transition={120}
                        />
                      ) : (
                        <View style={styles.noteShareThumbFallback}>
                          <Ionicons name="home-outline" size={18} color={colors.onSurfaceTertiary} />
                        </View>
                      )}
                      

                      <View style={styles.noteShareApartmentTextWrap}>
                        <Text style={[styles.noteShareApartmentTitle, isMine && styles.noteShareApartmentTitleMine]} numberOfLines={1}>
                          {apartmentData.title || m.text}
                        </Text>
                        <Text style={[styles.noteShareApartmentMeta, isMine && styles.noteShareApartmentMetaMine]} numberOfLines={1}>
                          {[apartmentData.area, apartmentData.city].filter(Boolean).join(", ") || t("common.values.notAvailable")}
                        </Text>
                      </View>

                      <View style={[styles.noteShareRentPill, isMine && styles.noteShareRentPillMine]}>
                        <Text style={[styles.noteShareRentText, isMine && styles.noteShareRentTextMine]}>{`€${apartmentData.rent ?? 0}`}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }

              if (chatType === "host" && (isPriceProposal || isVisitRequest)) {
                const statusLabel = getStatusLabel(m.status);
                const isPending = m.status !== "approved";
                const canApprove = isCurrentUserHost && isPending;
                const title = isPriceProposal ? "Πρόταση τιμής" : "Αίτημα επίσκεψης";
                const detailText = isPriceProposal
                  ? `${typeof m.proposedPrice === "number" ? m.proposedPrice : 0}${CURRENCY}/μήνα`
                  : `${m.requestedDate ? formatRequestDate(m.requestedDate) : "-"} στις ${m.requestedTime || "--:--"}`;

                return (
                  <View key={m.id} style={[styles.hostActionCardWrap, itemMarginStyle]} testID={`chat-message-${m.id}`}>
                    <View style={styles.hostActionCard}>
                      <Text style={styles.hostActionCardTitle}>{title}</Text>
                      <Text style={styles.hostActionCardDetail}>{detailText}</Text>
                      <View style={styles.hostActionCardFooter}>
                        <View style={[styles.hostActionStatusBadge, !isPending && styles.hostActionStatusBadgeApproved]}>
                          <Text style={[styles.hostActionStatusText, !isPending && styles.hostActionStatusTextApproved]}>
                            {statusLabel}
                          </Text>
                        </View>
                        {canApprove ? (
                          <Pressable
                            style={styles.hostActionApproveBtn}
                            onPress={() => {
                              void approveHostActionMessage(m);
                            }}
                            testID={`chat-host-action-approve-${m.id}`}
                          >
                            <Ionicons name="checkmark-circle" size={28} color={colors.brand} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              }

              if (isSystemNotice) {
                return (
                  <View key={m.id} style={[styles.systemNoticeWrap, itemMarginStyle]} testID={`chat-message-${m.id}`}>
                    <Text style={styles.systemNoticeText}>{m.text}</Text>
                  </View>
                );
              }

              return (
                <Pressable
                  key={m.id}
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    borderRadii,
                    itemMarginStyle,
                  ]}
                  onLongPress={
                    canDeleteForEveryone
                      ? () => {
                          setMessageActionTarget(m);
                        }
                      : undefined
                  }
                  delayLongPress={300}
                  testID={`chat-message-${m.id}`}
                >
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.text}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={[
              styles.inputBar,
              {
                paddingBottom: isKeyboardOpen ? spacing.sm : insets.bottom + spacing.sm,
              },
              inputBlocked && styles.inputBarLocked,
            ]}
            pointerEvents={inputBlocked ? "none" : "auto"}
          >
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={
                apartmentLocked
                  ? t("chat.unavailable")
                  : deletedCounterpart
                  ? t("chat.placeholderDeleted")
                  : chatStatus === "pending"
                  ? t("chat.placeholderPending")
                  : t("chat.placeholderMessage", { name: displayName })
              }
              placeholderTextColor={colors.onSurfaceTertiary}
              multiline
              testID="chat-input"
              onSubmitEditing={send}
              editable={!inputBlocked}
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || inputBlocked) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!text.trim() || inputBlocked}
              testID="chat-send-button"
            >
              <Ionicons name="paper-plane" size={20} color={colors.onBrand} />
            </Pressable>
          </View>

          {chatStatus === "rejected" ? (
            <View style={styles.rejectedActionWrap}>
              <Pressable
                style={styles.rejectedDeleteBtn}
                onPress={() => {
                  void handleDeleteChatForCurrentUser();
                }}
                testID="chat-rejected-delete-button"
              >
                <Ionicons name="trash-outline" size={16} color={colors.onBrand} />
                <Text style={styles.rejectedDeleteBtnText}>Delete Chat</Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={showPriceProposalModal}
        onRequestClose={() => {
          if (!isSubmittingHostAction) {
            setShowPriceProposalModal(false);
          }
        }}
      >
        <View style={styles.hostRequestModalBackdrop}>
          <View style={styles.hostRequestModalCard}>
            <Text style={styles.hostRequestModalTitle}>Υπόβαλλε πρόταση τιμής στον αγγελιοδότη</Text>
            <TextInput
              style={styles.hostRequestPriceInput}
              value={proposedPriceInput}
              onChangeText={setProposedPriceInput}
              placeholder="0"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="numeric"
              editable={!isSubmittingHostAction}
              testID="chat-price-proposal-input"
            />
            <Text style={styles.hostRequestHintText}>
              {`Η πρόταση τιμής θα ήταν καλό να μην είναι λιγότερο από ${minRecommendedPrice.toFixed(0)}${CURRENCY} (${hostDiscountPercentage}% κάτω)`}
            </Text>

            <View style={styles.hostRequestModalActions}>
              <Pressable
                style={styles.hostRequestCancelBtn}
                onPress={() => setShowPriceProposalModal(false)}
                disabled={isSubmittingHostAction}
                testID="chat-price-proposal-cancel"
              >
                <Text style={styles.hostRequestCancelText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.hostRequestSubmitBtn,
                  (!proposedPriceInput.trim() || isSubmittingHostAction) && styles.hostRequestSubmitBtnDisabled,
                ]}
                onPress={() => {
                  void submitPriceProposal();
                }}
                disabled={!proposedPriceInput.trim() || isSubmittingHostAction}
                testID="chat-price-proposal-submit"
              >
                <Ionicons name="checkmark-circle" size={30} color={colors.onBrand} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FilterSetVersionModal
        visible={!!selectedFilterSetRecord}
        filterSet={selectedFilterSetRecord}
        onClose={() => setSelectedFilterSetRecord(null)}
        onUpdated={setSelectedFilterSetRecord}
      />

      <Modal
        transparent
        animationType="slide"
        visible={showVisitRequestModal}
        onRequestClose={() => {
          if (!isSubmittingHostAction) {
            setShowVisitRequestModal(false);
          }
        }}
      >
        <View style={styles.hostRequestModalBackdrop}>
          <View style={styles.hostVisitModalCard}>
            <Text style={styles.hostRequestModalTitle}>Ζήτα επίσκεψη</Text>

            <View style={styles.visitCalendarHeader}>
              <Pressable
                style={[styles.visitCalendarNavBtn, !canGoToPreviousMonth && styles.visitCalendarNavBtnDisabled]}
                onPress={() => {
                  if (!canGoToPreviousMonth) return;
                  setVisitMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                }}
                disabled={!canGoToPreviousMonth}
                testID="chat-visit-prev-month"
              >
                <Ionicons name="chevron-back" size={16} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.visitCalendarHeaderText}>
                {new Intl.DateTimeFormat("el-GR", { month: "long", year: "numeric" }).format(visitMonthCursor)}
              </Text>
              <Pressable
                style={styles.visitCalendarNavBtn}
                onPress={() => {
                  setVisitMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                }}
                testID="chat-visit-next-month"
              >
                <Ionicons name="chevron-forward" size={16} color={colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.visitWeekdaysRow}>
              {["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"].map((weekday) => (
                <Text key={weekday} style={styles.visitWeekdayText}>{weekday}</Text>
              ))}
            </View>

            <View style={styles.visitDaysGrid}>
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={styles.visitDayCell} />;
                }

                const isSelected = selectedVisitDate === cell.iso;
                return (
                  <Pressable
                    key={cell.iso}
                    style={[
                      styles.visitDayCell,
                      styles.visitDayButton,
                      isSelected && styles.visitDayButtonSelected,
                      cell.disabled && styles.visitDayButtonDisabled,
                    ]}
                    onPress={() => {
                      if (cell.disabled) return;
                      setSelectedVisitDate(cell.iso);
                    }}
                    disabled={cell.disabled}
                    testID={`chat-visit-day-${cell.iso}`}
                  >
                    <Text
                      style={[
                        styles.visitDayText,
                        isSelected && styles.visitDayTextSelected,
                        cell.disabled && styles.visitDayTextDisabled,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.visitTimePickerWrap}>
              <View style={styles.visitTimeColumn}>
                <Text style={styles.visitTimeColumnLabel}>Ώρα</Text>
                <ScrollView style={styles.visitTimeList} showsVerticalScrollIndicator={false}>
                  {hourOptions.map((hour) => {
                    const disabled = isHourDisabled(hour);
                    const selected = selectedVisitHour === hour;
                    return (
                      <Pressable
                        key={hour}
                        style={[
                          styles.visitTimeOption,
                          selected && styles.visitTimeOptionSelected,
                          disabled && styles.visitTimeOptionDisabled,
                        ]}
                        onPress={() => {
                          if (disabled) return;
                          setSelectedVisitHour(hour);
                        }}
                        disabled={disabled}
                        testID={`chat-visit-hour-${hour}`}
                      >
                        <Text
                          style={[
                            styles.visitTimeOptionText,
                            selected && styles.visitTimeOptionTextSelected,
                            disabled && styles.visitTimeOptionTextDisabled,
                          ]}
                        >
                          {hour}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.visitTimeColumn}>
                <Text style={styles.visitTimeColumnLabel}>Λεπτά</Text>
                <ScrollView style={styles.visitTimeList} showsVerticalScrollIndicator={false}>
                  {minuteOptions.map((minute) => {
                    const disabled = isMinuteDisabled(minute);
                    const selected = selectedVisitMinute === minute;
                    return (
                      <Pressable
                        key={minute}
                        style={[
                          styles.visitTimeOption,
                          selected && styles.visitTimeOptionSelected,
                          disabled && styles.visitTimeOptionDisabled,
                        ]}
                        onPress={() => {
                          if (disabled) return;
                          setSelectedVisitMinute(minute);
                        }}
                        disabled={disabled}
                        testID={`chat-visit-minute-${minute}`}
                      >
                        <Text
                          style={[
                            styles.visitTimeOptionText,
                            selected && styles.visitTimeOptionTextSelected,
                            disabled && styles.visitTimeOptionTextDisabled,
                          ]}
                        >
                          {minute}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={styles.hostRequestModalActions}>
              <Pressable
                style={styles.hostRequestCancelBtn}
                onPress={() => setShowVisitRequestModal(false)}
                disabled={isSubmittingHostAction}
                testID="chat-visit-request-cancel"
              >
                <Text style={styles.hostRequestCancelText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.hostRequestSubmitBtn,
                  (!selectedVisitDate || isSubmittingHostAction || isHourDisabled(selectedVisitHour) || isMinuteDisabled(selectedVisitMinute)) &&
                    styles.hostRequestSubmitBtnDisabled,
                ]}
                onPress={() => {
                  void submitVisitRequest();
                }}
                disabled={!selectedVisitDate || isSubmittingHostAction || isHourDisabled(selectedVisitHour) || isMinuteDisabled(selectedVisitMinute)}
                testID="chat-visit-request-submit"
              >
                <Ionicons name="checkmark-circle" size={30} color={colors.onBrand} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={showBlockModal}
        onRequestClose={() => {
          if (!isSubmittingBlockAction) {
            setShowBlockModal(false);
            setExpandReport(false);
            setReportReason("");
          }
        }}
      >
        <View style={styles.blockModalBackdrop}>
          <View style={styles.blockModalCard}>
            <Text style={styles.blockModalTitle}>{t("chat.blockModal.title")}</Text>

            <Pressable
              style={[styles.blockButton, isSubmittingBlockAction && styles.blockButtonDisabled]}
              onPress={() => {
                void handleBlockFlow(false);
              }}
              disabled={isSubmittingBlockAction}
              testID="chat-block-confirm-button"
            >
              <Text style={styles.blockButtonText}>{t("chat.blockModal.blockOnly")}</Text>
            </Pressable>

            <Pressable
              style={[styles.reportToggleButton, isSubmittingBlockAction && styles.blockButtonDisabled]}
              onPress={() => setExpandReport(true)}
              disabled={isSubmittingBlockAction}
              testID="chat-block-report-expand"
            >
              <Text style={styles.reportToggleText}>{t("chat.blockModal.blockAndReport")}</Text>
            </Pressable>

            {expandReport ? (
              <View style={styles.reportInputWrapper}>
                <TextInput
                  value={reportReason}
                  onChangeText={setReportReason}
                  placeholder={t("chat.blockModal.reportReasonPlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.reportInput}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!isSubmittingBlockAction}
                  testID="chat-block-report-reason-input"
                />
                <Pressable
                  style={[
                    styles.reportSubmitButton,
                    (!reportReason.trim() || isSubmittingBlockAction) && styles.blockButtonDisabled,
                  ]}
                  onPress={() => {
                    void handleBlockFlow(true);
                  }}
                  disabled={!reportReason.trim() || isSubmittingBlockAction}
                  testID="chat-block-report-submit"
                >
                  <Text style={styles.reportSubmitText}>{t("chat.blockModal.submitBlockAndReport")}</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={styles.modalCancelButton}
              onPress={() => {
                if (!isSubmittingBlockAction) {
                  setShowBlockModal(false);
                  setExpandReport(false);
                  setReportReason("");
                }
              }}
              disabled={isSubmittingBlockAction}
              testID="chat-block-cancel"
            >
              <Text style={styles.modalCancelText}>{t("common.actions.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CenteredActionModal
        visible={showGlobalUnmuteModal}
        title={t("chat.modals.unmuteChatTitle")}
        description={t("chat.modals.unmuteGlobalOverrideMessage")}
        onDismiss={() => {
          if (!isMuting) {
            setShowGlobalUnmuteModal(false);
          }
        }}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "muted",
            iconName: "close-outline",
            onPress: () => setShowGlobalUnmuteModal(false),
          },
          {
            label: t("chat.modals.unmuteGlobalOverrideConfirm"),
            iconName: "notifications-outline",
            onPress: () => {
              void handleConfirmGlobalUnmuteOverride();
            },
          },
        ]}
        testID="chat-unmute-global-override-modal"
      />

      <Modal
        transparent
        animationType="slide"
        visible={profileModalVisible}
        onRequestClose={closeProfileModal}
      >
        <View style={styles.profileModalBackdrop}>
          <Animated.View
            style={[styles.profileModalCard, { transform: [{ translateY: profileCardTranslateY }] }]}
            {...profileCardPanResponder.panHandlers}
          >
          <View style={styles.profileModalTopRow}>
            <View style={styles.profileSummaryLeft}>
              {showAvatarImage ? (
                <Image source={{ uri: activeProfile.photo }} style={styles.profileModalAvatar} contentFit="cover" />
              ) : (
                <DefaultProfileAvatar size={64} iconSize={28} />
              )}
              <View style={styles.profileMetaColumn}>
                <Text style={styles.profileMetaName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.profileMetaLine}>{`${t("common.format.ageLabel", { age: activeProfile.age || 0 })}`}</Text>
                <Text style={styles.profileMetaLine}>{displayCity}</Text>
                <Text style={styles.profileMetaLine} numberOfLines={1}>{displayUniversity || t("common.values.notAvailable")}</Text>
              </View>
            </View>

            <View style={styles.compatibilityPill}>
              <Text style={styles.compatibilityPillLabel}>{t("chat.compatibility")}</Text>
              <Text style={styles.compatibilityPillValue}>{compatibilityScore != null ? `${compatibilityScore}%` : "--"}</Text>
            </View>
          </View>

          <View style={styles.aboutSection}>
            <Text style={styles.aboutTitle}>{t("chat.aboutMe")}</Text>
            <Text style={styles.aboutBody}>{displayAbout}</Text>
          </View>

          {shouldShowSocialLinks && socialLinks.length > 0 ? (
            <View style={styles.socialSection}>
              <Text style={styles.aboutTitle}>{t("chat.socialLinks")}</Text>
              <View style={styles.socialGrid}>
                {socialLinks.map((social) => (
                  <Pressable
                    key={social.id}
                    style={styles.socialPill}
                    onPress={() => {
                      void Linking.openURL(social.url);
                    }}
                    testID={`chat-social-link-${social.id}`}
                  >
                    <Ionicons name={social.icon} size={16} color={colors.onBrandTertiary} />
                    <Text style={styles.socialPillText}>{social.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable style={styles.modalCloseBtn} onPress={closeProfileModal}>
            <Text style={styles.modalCloseBtnText}>{t("common.actions.done")}</Text>
          </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={!!selectedFilterSetMessage}
        onRequestClose={() => setSelectedFilterSetMessage(null)}
      >
        <View style={styles.filterSetModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedFilterSetMessage(null)} />
          <View style={styles.filterSetModalCard} testID="chat-filter-set-details-modal">
            <View style={styles.filterSetModalHeader}>
              <Text style={styles.filterSetModalTitle}>Κριτήρια Αναζήτησης</Text>
              <Pressable
                style={styles.filterSetModalClose}
                onPress={() => setSelectedFilterSetMessage(null)}
                testID="chat-filter-set-details-close"
              >
                <Ionicons name="close-outline" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            {selectedFilterSetMessage?.filterSetData ? (
              <>
                <ScrollView style={styles.filterSetModalScroll} contentContainerStyle={styles.filterSetModalContent}>
                  {selectedFilterSetMessage.filterSetData.title ? (
                    <View style={styles.filterSetDetailRow}>
                      <Text style={styles.filterSetDetailLabel}>Τίτλος</Text>
                      <Text style={styles.filterSetDetailValue}>{selectedFilterSetMessage.filterSetData.title}</Text>
                    </View>
                  ) : null}
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Ενοίκιο</Text>
                    <Text style={styles.filterSetDetailValue}>{`${selectedFilterSetMessage.filterSetData.rentMin || "0"} - ${selectedFilterSetMessage.filterSetData.rentMax || "∞"} €`}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Τιμή / τ.μ.</Text>
                    <Text style={styles.filterSetDetailValue}>{`${selectedFilterSetMessage.filterSetData.minSqmPrice || "0"} - ${selectedFilterSetMessage.filterSetData.maxSqmPrice || "∞"} €/m²`}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Περιοχή / Πόλη</Text>
                    <Text style={styles.filterSetDetailValue}>{selectedFilterSetMessage.filterSetData.cityQuery?.trim() || "Όλες οι περιοχές"}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Εμβαδόν</Text>
                    <Text style={styles.filterSetDetailValue}>{`${selectedFilterSetMessage.filterSetData.sizeMin || "0"} - ${selectedFilterSetMessage.filterSetData.sizeMax || "∞"} m²`}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Κατοικίδια</Text>
                    <Text style={styles.filterSetDetailValue}>{selectedFilterSetMessage.filterSetData.petFriendly ? "Ναι" : "Όχι"}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Μετρό</Text>
                    <Text style={styles.filterSetDetailValue}>{selectedFilterSetMessage.filterSetData.nearMetro ? "Ναι" : "Όχι"}</Text>
                  </View>
                  <View style={styles.filterSetDetailRow}>
                    <Text style={styles.filterSetDetailLabel}>Ταξινόμηση</Text>
                    <Text style={styles.filterSetDetailValue}>{FILTER_SORT_LABELS[selectedFilterSetMessage.filterSetData.sortBy || "newest"] || selectedFilterSetMessage.filterSetData.sortBy || "Πιο πρόσφατα"}</Text>
                  </View>
                </ScrollView>
                {auth.isBroker && selectedFilterSetMessage.senderId !== currentUserId ? (
                  <Pressable
                    style={styles.filterSetApplyButton}
                    onPress={() => {
                      const filterSetData = selectedFilterSetMessage.filterSetData;
                      setSelectedFilterSetMessage(null);
                      router.push({
                        pathname: "/(tabs)/apartments",
                        params: { importedFilters: JSON.stringify(filterSetData) },
                      } as never);
                    }}
                    testID="broker-apply-filter-set-btn"
                  >
                    <Ionicons name="search-outline" size={19} color={colors.onBrand} />
                    <Text style={styles.filterSetApplyButtonText}>Εφαρμογή στην Αναζήτηση</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <CenteredActionModal
        visible={!!messageActionTarget}
        title={t("chat.modals.deleteMessageTitle")}
        description={t("chat.modals.deleteMessageBody")}
        onDismiss={() => {
          if (!isDeletingMessage) {
            setMessageActionTarget(null);
          }
        }}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "muted",
            iconName: "close-outline",
            onPress: () => setMessageActionTarget(null),
          },
          {
            label: t("chat.modals.deleteMessageConfirm"),
            variant: "danger",
            iconName: "trash-outline",
            onPress: () => {
              void handleDeleteMessageForEveryone();
            },
          },
        ]}
        testID="chat-delete-message-modal"
      />

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={actionModal?.actions ?? []}
        testID="chat-action-modal"
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  fallback: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  backPill: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  backPillText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  apartmentPill: {
    alignSelf: "center",
    maxWidth: "92%",
    width: "100%",
    backgroundColor: "#D9F0FF",
    borderWidth: 1,
    borderColor: "#A8D9FF",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  apartmentPillDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  apartmentThumb: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  apartmentThumbFallback: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  apartmentPillTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  apartmentPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  apartmentPillMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  hostActionTrigger: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hostActionMenu: {
    position: "absolute",
    right: spacing.lg,
    top: 66,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 180,
    zIndex: 35,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  hostActionMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hostActionMenuText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerProfileTapArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 2,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  iconBtnActive: {
    backgroundColor: colors.brandTertiary,
  },
  mutualLikesEmoji: {
    fontSize: 20,
    opacity: 0.7,
  },
  mutualLikesEmojiActive: {
    opacity: 1,
  },
  headerAvatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  headerName: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    transform: [{ translateY: 0 }],
  },
  hostPhoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  hostPhoneBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
    flexShrink: 1,
  },
  headerUni: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  detailRow: { flexDirection: "row", gap: spacing.sm },
  detailPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  budgetPill: { backgroundColor: colors.brandTertiary },
  detailText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  contextMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  contextMenu: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    minWidth: 210,
    maxWidth: "92%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  contextMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  contextMenuText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  contextMenuDangerText: {
    color: colors.error,
  },
  blockedBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
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
  blockedBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  blockedBannerAction: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  blockedBannerActionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  blockedBannerActionDisabled: {
    opacity: 0.5,
  },
  mutualLikesScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  mutualLikesLoadingWrap: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  mutualEmptyCard: {
    minHeight: 240,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mutualEmptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    textAlign: "center",
  },
  mutualEmptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    lineHeight: 22,
  },
  mutualCardWrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  mutualCard: {
    minHeight: 360,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  mutualCardPressed: {
    opacity: 0.95,
  },
  mutualCardPhoto: {
    width: "100%",
    height: 360,
    backgroundColor: colors.surfaceTertiary,
  },
  mutualCardPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  mutualCardPlaceholderText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  mutualCarouselArrow: {
    position: "absolute",
    top: "42%",
    zIndex: 4,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  mutualCarouselArrowLeft: {
    left: spacing.sm,
  },
  mutualCarouselArrowRight: {
    right: spacing.sm,
  },
  mutualRentBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    zIndex: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  mutualRentText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: "#FFFFFF",
  },
  mutualRentMeta: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: "rgba(255,255,255,0.82)",
    textTransform: "uppercase",
  },
  mutualCardBody: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  mutualLocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mutualLocText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: "rgba(255,255,255,0.92)",
    flexShrink: 1,
  },
  mutualStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mutualStatText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: "rgba(255,255,255,0.88)",
  },
  mutualDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  mutualTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  mutualTag: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  mutualTagText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: "#FFFFFF",
    textTransform: "capitalize",
  },
  crossChatBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
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
  crossChatBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  crossChatDismissButton: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  blockModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  blockModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  blockModalTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  blockButton: {
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  blockButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onError,
  },
  reportToggleButton: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  reportToggleText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  reportInputWrapper: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  reportInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  reportSubmitButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  reportSubmitText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
  },
  modalCancelButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  modalCancelText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
  },
  blockButtonDisabled: {
    opacity: 0.6,
  },
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  profileModalCard: {
    maxHeight: "100%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 60,
  },
  profileModalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  profileSummaryLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    flex: 1,
  },
  profileModalAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  profileMetaColumn: {
    flex: 1,
    gap: 2,
  },
  profileMetaName: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
  },
  profileMetaLine: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  compatibilityPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: "center",
    minWidth: 82,
  },
  compatibilityPillLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.onBrandTertiary,
    textTransform: "uppercase",
  },
  compatibilityPillValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onBrandTertiary,
  },
  aboutSection: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  aboutTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  aboutBody: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
  socialSection: {
    gap: spacing.sm,
  },
  socialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  socialPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  socialPillText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  modalCloseBtn: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCloseBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
  },
  messages: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 0 },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceTertiary,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
  },
  bubbleText: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurface },
  bubbleTextMine: { color: colors.onBrand, fontFamily: fonts.semibold },
  filterSetShareBubble: {
    maxWidth: "90%",
    minHeight: 92,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  filterSetShareBubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterSetShareBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
  },
  filterSetShareIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  filterSetShareContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  filterSetShareTag: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  filterSetShareTagMine: {
    color: colors.onBrand,
  },
  filterSetShareTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  filterSetShareTitleMine: {
    color: colors.onBrand,
  },
  filterSetShareSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  filterSetShareSubtitleMine: {
    color: "rgba(255,255,255,0.82)",
  },
  sharedListMessageCard: {
    width: 240,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  sharedListMessageCardMine: { backgroundColor: colors.brand, borderColor: colors.brand },
  sharedListHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sharedListTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  sharedListTitleMine: { color: colors.onBrand },
  sharedListCountText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  sharedListCountTextMine: { color: "rgba(255,255,255,0.82)" },
  sharedListActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sharedListViewBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  sharedListViewBtnTextMine: { color: colors.onBrand },
  listFeedHeaderBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backToMessagesBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  backToMessagesText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurface },
  listFeedBannerTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface, textAlign: "right" },
  filterHistoryList: { padding: spacing.lg, gap: spacing.sm },
  filterHistoryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: spacing.xs },
  filterHistoryCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterHistoryCardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  filterHistoryVersion: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
  filterHistoryDate: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  filterHistorySummary: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
  filterSetModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: spacing.lg,
  },
  filterSetModalCard: {
    width: "100%",
    maxHeight: "82%",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  filterSetModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  filterSetModalTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  filterSetModalClose: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  filterSetModalScroll: {
    flexGrow: 0,
  },
  filterSetModalContent: {
    gap: spacing.sm,
  },
  filterSetDetailRow: {
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
  filterSetDetailLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  filterSetDetailValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    textAlign: "right",
  },
  filterSetApplyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
  },
  filterSetApplyButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
  },
  shareBubble: {
    maxWidth: "90%",
    minHeight: 112,
    borderRadius: radius.lg,
    padding: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  shareBubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
  },
  shareImage: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  shareImageFallback: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  shareContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
    gap: 6,
    paddingRight: spacing.xs,
  },
  shareTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  shareTitleMine: {
    color: colors.onBrand,
  },
  shareLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  shareLocationText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  shareLocationTextMine: {
    color: "rgba(255,255,255,0.88)",
  },
  shareMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sharePricePill: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  sharePriceText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
  shareStatsText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  shareStatsTextMine: {
    color: "rgba(255,255,255,0.92)",
  },
  noteShareBubble: {
    maxWidth: "90%",
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noteShareBubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteShareBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  noteShareHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  noteShareBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  noteShareBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.onBrandTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noteShareBadgeTextMine: {
    color: colors.onBrand,
  },
  noteShareQuote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  noteShareQuoteText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: 21,
    color: colors.onSurface,
  },
  noteShareQuoteTextMine: {
    color: colors.onSurface,
  },
  noteShareFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noteShareThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  noteShareThumbFallback: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  noteShareApartmentTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  noteShareApartmentTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  noteShareApartmentTitleMine: {
    color: colors.onBrand,
  },
  noteShareApartmentMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  noteShareApartmentMetaMine: {
    color: "rgba(255,255,255,0.84)",
  },
  noteShareRentPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  noteShareRentPillMine: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  noteShareRentText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  noteShareRentTextMine: {
    color: colors.onBrand,
  },
  hostActionCardWrap: {
    alignItems: "center",
  },
  hostActionCard: {
    width: "92%",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  hostActionCardTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
    textAlign: "center",
  },
  hostActionCardDetail: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  hostActionCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  hostActionStatusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceTertiary,
  },
  hostActionStatusBadgeApproved: {
    backgroundColor: colors.brandTertiary,
  },
  hostActionStatusText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  hostActionStatusTextApproved: {
    color: colors.brand,
  },
  hostActionApproveBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  systemNoticeWrap: {
    alignItems: "center",
  },
  systemNoticeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputBarLocked: {
    opacity: 0.45,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  rejectedActionWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  rejectedDeleteBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,23,68,0.08)",
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    transform: [{ translateY: -45 }],
  },
  rejectedDeleteBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  hostRequestModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  hostRequestModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  hostVisitModalCard: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  hostRequestModalTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  hostRequestPriceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  hostRequestHintText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  hostRequestModalActions: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hostRequestCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hostRequestCancelText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
  },
  hostRequestSubmitBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  hostRequestSubmitBtnDisabled: {
    opacity: 0.45,
  },
  visitCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  visitCalendarNavBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  visitCalendarNavBtnDisabled: {
    opacity: 0.45,
  },
  visitCalendarHeaderText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
    textTransform: "capitalize",
  },
  visitWeekdaysRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  visitWeekdayText: {
    width: "14.28%",
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  visitDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  visitDayCell: {
    width: "14.28%",
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  visitDayButton: {
    borderRadius: radius.pill,
  },
  visitDayButtonSelected: {
    backgroundColor: colors.brand,
  },
  visitDayButtonDisabled: {
    opacity: 0.32,
  },
  visitDayText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  visitDayTextSelected: {
    color: colors.onBrand,
  },
  visitDayTextDisabled: {
    color: colors.onSurfaceTertiary,
  },
  visitTimePickerWrap: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  visitTimeColumn: {
    flex: 1,
    gap: 6,
  },
  visitTimeColumnLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  visitTimeList: {
    maxHeight: 118,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  visitTimeOption: {
    borderRadius: radius.md,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  visitTimeOptionSelected: {
    backgroundColor: colors.brand,
  },
  visitTimeOptionDisabled: {
    opacity: 0.35,
  },
  visitTimeOptionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  visitTimeOptionTextSelected: {
    color: colors.onBrand,
  },
  visitTimeOptionTextDisabled: {
    color: colors.onSurfaceTertiary,
  },
  sheetBackground: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handleIndicator: {
    width: 48,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
});
