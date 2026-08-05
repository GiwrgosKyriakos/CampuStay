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

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
  isRead?: boolean;
}

interface FirestoreMessageDoc {
  text?: string;
  senderId?: string;
  createdAt?: any;
  isRead?: boolean;
  readAt?: any;
}

interface FirestoreChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  apartmentId?: string;
  apartmentTitle?: string;
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
  area?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent?: number;
  price?: number;
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

function normalizeApartmentImages(data: FirestoreApartmentDoc): string[] {
  const images = Array.isArray(data.images)
    ? data.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
    : [];
  const fallback = typeof data.image === "string" && data.image.trim().length > 0
    ? data.image.trim()
    : typeof data.imageUrl === "string" && data.imageUrl.trim().length > 0
      ? data.imageUrl.trim()
      : "";
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
    rooms: typeof data.rooms === "number" ? data.rooms : 1,
    size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
    image:
    data.image || "",
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
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardOpen(true);
        
        // 🚀 Δίνουμε ένα ελάχιστο delay (50-100ms) για να προλάβει το KeyboardAvoidingView 
        // να μικρύνει το layout, και μετά κάνουμε scroll στο τελευταίο μήνυμα.
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
    );
    
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardOpen(false)
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const safeMenuTop = Math.max(insets.top + 12, (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 12 : 12));
  const router = useRouter();
  const auth = useAuth();
  const { id, chatRoomId: chatRoomIdParam } = useLocalSearchParams<{ id: string; chatRoomId?: string }>();
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
  const [hostApartmentId, setHostApartmentId] = useState<string | null>(null);
  const [hostApartmentTitle, setHostApartmentTitle] = useState<string | null>(null);
  const [hostApartment, setHostApartment] = useState<ReturnType<typeof buildApartmentRoutePayload> | null>(null);
  const [isApartmentUnavailable, setIsApartmentUnavailable] = useState(false);
  const [showMutualLikes, setShowMutualLikes] = useState(false);
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
          return {
            id: doc.id,
            text: data.text ?? "",
            senderId: data.senderId ?? "",
            createdAt: data.createdAt ?? Date.now(),
            isRead: data.isRead ?? true,
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
          </Pressable>
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
              <Text style={styles.headerName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.headerUni} numberOfLines={1}>
                {displayUniversity}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setShowContextMenu((prev) => !prev)}
            testID="chat-context-menu-button"
            hitSlop={8}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurface} />
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

      {showContextMenu ? (
        <Pressable
          style={styles.contextMenuBackdrop}
          onPress={() => setShowContextMenu(false)}
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

      {showMutualLikes ? (
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

              return (
                <Pressable
                  key={m.id}
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    borderRadii,
                    {
                      marginVertical: groupInfo.isConsecutive
                        ? groupInfo.position === "first"
                          ? spacing.xs
                          : 2
                        : lastMsgIsDifferentSender
                        ? spacing.sm
                        : spacing.xs,
                    },
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
    fontSize: fontSize.xs,
    color: colors.onSurfaceTertiary,
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
    fontSize: fontSize.xs,
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
