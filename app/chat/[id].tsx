import { getBlockRelationshipState, markIncomingMessagesAsRead, setBlockStateBetweenUsers } from "@/src/api/chat";
import { createVisitAppointment, getPublicApartmentAddress, updateLinkedCalendarNotes, updateVisitAppointment } from "@/src/api/visitAppointments";
import { useTheme } from "@/src/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import { getUserProfile } from "@/src/api/userProfile";
import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Platform,
  StatusBar,
  Keyboard,
  AppState,
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
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, getDocs, deleteDoc, limit, FieldPath, deleteField, runTransaction } from "firebase/firestore";
import { cleanupObsoleteChatMessages } from "@/src/api/chatCleanup";
import { syncBrokerClientProfile } from "@/src/api/brokerClientProfiles";
import { saveShowingCalendarNotes } from "@/src/api/brokerCalendar";
import { addPropertyInteraction } from "@/src/api/propertyInteractions";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal, { type CenteredModalAction } from "@/src/components/CenteredActionModal";
import FilterSetVersionModal, { type SharedFilterSetRecord, type FilterSetVersionData } from "@/src/components/FilterSetVersionModal";
import ChatMessageItem from "@/src/components/chat/ChatMessageItem";
import PriceProposalModal from "@/src/components/chat/modals/PriceProposalModal";
import VisitRequestModal, { type VisitRequestListing } from "@/src/components/chat/modals/VisitRequestModal";
import EditVisitModal from "@/src/components/chat/modals/EditVisitModal";
import SendAddressModal from "@/src/components/chat/modals/SendAddressModal";
import ChatUserProfileSheet from "@/src/components/chat/ChatUserProfileSheet";
import BlockUserModal from "@/src/components/chat/modals/BlockUserModal";
import AssignClientEmailModal from "@/src/components/AssignClientEmailModal";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import FilterSetDetailsModal from "@/src/components/chat/modals/FilterSetDetailsModal";
import SearchHistoryPickerModal, { type SearchHistorySelection } from "@/src/components/chat/modals/SearchHistoryPickerModal";
import type { FilterSetMessageData, FirestoreUserDoc } from "@/src/components/chat/modals/types";
import { getUserSettings, saveUserNotifications, saveUserPrivacy, type NotificationPreferences } from "@/src/api/accountSettings";
import { submitReportedUserEntry } from "@/src/services/reportedUsers";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import {
  calculateMatchScore,
  type CompatibilityQuizAnswers,
  type UserProfile as MatchUserProfile,
} from "@/src/utils/matchAlgorithm";
import { calculateTenantCompatibilityScore } from "@/src/utils/compatibilityScore";
import type { FilterSetPayload } from "@/src/types/filters";
import { t } from "@/src/locales";
import { WatermarkBadge } from "@/src/components/WatermarkBadge";
import type { WatermarkConfig } from "@/src/types/listing";
import ChatMessagesSkeleton from "@/src/components/skeletons/ChatMessagesSkeleton";
import { getWordCount, isNoteBodyValid, MAX_NOTE_BODY_CHARS, MAX_NOTE_BODY_WORDS } from "@/src/utils/noteValidation";
import GroupChatScreen from "@/src/screens/chat/GroupChatScreen";
import type { GroupChatMetadata, SharedProfileMessageMetadata } from "@/src/types/chat";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";
import { getSharedCoManagedListings } from "@/src/api/agencyCollaboration";
import { sendContractChatRequest } from "@/src/api/contracts";
import SelectShareTargetModal from "@/src/components/chat/SelectShareTargetModal";
import RoommateDeckDetailModal from "@/src/components/chat/RoommateDeckDetailModal";
import RoommateContractPickerModal from "@/src/components/RoommateContractPickerModal";
import SignContractModal from "@/src/components/SignContractModal";
import type { ContractDraftContext, ContractType, DigitalContractDocument } from "@/src/types/esignature";

const CURRENCY = "€";
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
  apartmentTitle?: string;
  apartmentPrice?: number;
  apartmentData?: SharedApartmentData;
  filterSetData?: FilterSetMessageData;
  filterSetId?: string;
  listId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
  previewImages?: string[];
  contractId?: string;
  contractType?: ContractType;
  contractTitle?: string;
  hasClientInteracted?: boolean;
  proposalFeedback?: Record<string, ProposalItemFeedback>;
  metadata?: {
    appointmentId?: string;
    contractId?: string;
    contractType?: ContractType;
    contractTitle?: string;
    apartmentId?: string;
    apartmentTitle?: string;
    apartmentAddress?: string;
    appointmentDate?: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
    exactAddress?: string;
    latitude?: number;
    longitude?: number;
    sharedProfile?: SharedProfileMessageMetadata;
  };
}

interface ProposalItemFeedback {
  status: "accepted" | "rejected";
  reason?: string;
  updatedAt: number;
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
  latitude?: number;
  longitude?: number;
  amenities?: string[];
  propertyType?: string;
  propertyCategory?: string;
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
  apartmentTitle?: string;
  apartmentPrice?: number;
  apartmentData?: SharedApartmentData;
  filterSetData?: FilterSetMessageData;
  filterSetId?: string;
  listId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
  previewImages?: string[];
  contractId?: string;
  contractType?: ContractType;
  contractTitle?: string;
  hasClientInteracted?: boolean;
  proposalFeedback?: Record<string, ProposalItemFeedback>;
  metadata?: Message["metadata"];
}

interface FirestoreChatDoc {
  users?: string[];
  type?: "roommate" | "host" | "colleague" | string;
  agencyId?: string;
  apartmentId?: string;
  apartmentTitle?: string;
  hostPhoneNumber?: string;
  counterpartPhoneNumber?: string;
  apartmentUnavailable?: boolean;
  status?: "pending" | "active" | "rejected";
  brokerChatRole?: "client" | "owner";
  initiatedBy?: string | null;
  rejectedBy?: string | null;
  rejections?: string[];
  clearedAt?: Record<string, unknown>;
  dismissedCrossChatNotices?: Record<string, boolean>;
  deletedUsers?: Record<string, boolean>;
  participantDisplayNames?: Record<string, string>;
  mutedByUsers?: Record<string, boolean>;
  searchSharingPromptShown?: boolean;
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
  ownerId?: string;
  assignedBrokerIds?: string[];
  isOffMarket?: boolean;
  watermarkConfig?: WatermarkConfig;
  exactAddress?: string;
  showExactAddress?: boolean;
}

interface BrokerClientDropdownProperty {
  id: string;
  title: string;
  rent: number;
  area: string;
  city: string;
  compatibilityScore: number;
  rawApartmentPayload: ReturnType<typeof buildApartmentRoutePayload>;
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
  isOffMarket?: boolean;
  watermarkConfig?: WatermarkConfig;
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
    isOffMarket: data.isOffMarket === true,
    watermarkConfig: data.watermarkConfig,
  };
}

type MutualApartmentCardProps = {
  apartment: MutualApartment;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  isLiked: boolean;
  showMatchScore: boolean;
  compatibilityScore: number;
  onPress: () => void;
  onToggleLike: () => void;
  proposalFeedback?: ProposalItemFeedback;
  proposalMode?: boolean;
  onAcceptProposal?: () => void;
  onRejectProposal?: () => void;
};

function getChatMatchScoreColor(score: number, colors: ThemeColors): string {
  return score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.error;
}

function getChatApartmentCompatibilityScore(apartment: MutualApartment | SharedApartmentData, filterSet: FilterSetMessageData | null): number {
  return calculateTenantCompatibilityScore({
    city: apartment.city,
    area: apartment.area,
    latitude: apartment.latitude,
    longitude: apartment.longitude,
    rent: apartment.rent,
    size: apartment.size,
    tags: apartment.tags,
    amenities: apartment.amenities,
    propertyType: apartment.propertyType,
    propertyCategory: apartment.propertyCategory,
  }, filterSet as FilterSetPayload | null);
}

function MutualApartmentCard({ apartment, colors, styles, isLiked, showMatchScore, compatibilityScore, onPress, onToggleLike, proposalFeedback, proposalMode = false, onAcceptProposal, onRejectProposal }: MutualApartmentCardProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageList = apartment.images && apartment.images.length > 0 ? apartment.images : apartment.image ? [apartment.image] : [];
  const activeImage = imageList[activeImageIndex] || "";

  useEffect(() => {
    if (activeImageIndex > imageList.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, imageList.length]);

  return (
    <View style={[styles.cardWrap, proposalFeedback?.status === "rejected" && styles.rejectedCardDimmed]}>
      <Pressable
        style={({ pressed }) => [styles.card, apartment.isOffMarket && styles.offMarketCard, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        {activeImage ? (
          <Image source={{ uri: activeImage }} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, styles.cardPlaceholder]}>
            <Ionicons name="home" size={44} color={colors.brand} />
            <Text style={styles.cardPlaceholderText}>CampuStay</Text>
          </View>
        )}

        <WatermarkBadge config={apartment.watermarkConfig} position="top-left" />

        {apartment.isOffMarket ? (
          <View style={styles.clientOnlyBadge}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.onBrand} />
            <Text style={styles.clientOnlyBadgeText}>client-only view</Text>
          </View>
        ) : null}

        {imageList.length > 1 && activeImageIndex > 0 ? (
          <Pressable
            style={[styles.carouselArrowButton, styles.carouselArrowLeft]}
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
            style={[styles.carouselArrowButton, styles.carouselArrowRight]}
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

        <View style={styles.topRightBadgesContainer}>
          <View style={styles.rentBadge}>
            <Text style={styles.rentText}>{CURRENCY}{apartment.rent}</Text>
            <Text style={styles.rentMo}>{t("apartments.perMonthShort")}</Text>
          </View>
          {showMatchScore ? (
            <View style={[styles.matchScoreCardBadge, { borderColor: getChatMatchScoreColor(compatibilityScore, colors) }]}>
              <Ionicons name="sparkles" size={11} color={getChatMatchScoreColor(compatibilityScore, colors)} style={styles.matchScoreIcon} />
              <Text style={[styles.matchScoreCardText, { color: getChatMatchScoreColor(compatibilityScore, colors) }]}>{`${Math.round(compatibilityScore)}%`}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.loc}>{apartment.area}, {apartment.city}</Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.stat}>{`${apartment.rooms} ${t("apartments.rooms")}`}</Text>
            <View style={styles.dot} />
            <Text style={styles.stat}>{apartment.size} m²</Text>
          </View>
          <View style={styles.tagRow}>
            {apartment.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{translateApartmentTag(tag)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
      {proposalMode ? (
        <View style={styles.proposalCardActionsRow}>
          <Pressable
            style={[styles.proposalActionBtn, styles.proposalRejectBtn, proposalFeedback?.status === "rejected" && styles.proposalRejectBtnActive]}
            onPress={onRejectProposal}
            hitSlop={6}
            testID={`proposal-reject-${apartment.id}`}
          >
            <Ionicons name="close" size={20} color={proposalFeedback?.status === "rejected" ? "#FFFFFF" : "#EF4444"} />
          </Pressable>
          <Pressable
            style={[styles.proposalActionBtn, styles.proposalAcceptBtn, proposalFeedback?.status === "accepted" && styles.proposalAcceptBtnActive]}
            onPress={onAcceptProposal}
            hitSlop={6}
            testID={`proposal-accept-${apartment.id}`}
          >
            <Ionicons name="add" size={22} color={proposalFeedback?.status === "accepted" ? "#FFFFFF" : "#10B981"} />
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.likeBtn, isLiked && styles.likeBtnActive]} onPress={onToggleLike} testID={`apartment-like-${apartment.id}`}>
          <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
        </Pressable>
      )}
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
    exactAddress: data.exactAddress?.trim() || data.address?.trim(),
    showExactAddress: data.showExactAddress !== false,
    latitude: typeof data.latitude === "number" ? data.latitude : undefined,
    longitude: typeof data.longitude === "number" ? data.longitude : undefined,
    hasExactLocation: data.hasExactLocation === true && data.showExactAddress !== false,
    rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
    maxDiscountPercentage,
    rooms: typeof data.rooms === "number" ? data.rooms : 1,
    size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
    image: data.image || data.imageUrl || data.images?.[0] || "",
    tags: tags.length ? tags : [t("apartments.newListing")],
    hostId: data.hostId,
    ownerId: data.ownerId,
    assignedBrokerIds: data.assignedBrokerIds,
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

export function safeTimestampToMillis(value: unknown, fallback: number = 0): number {
  if (value == null) return fallback;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : fallback;
  }

  if (typeof value === "object") {
    try {
      const maybeToMillis = (value as { toMillis?: () => number }).toMillis;
      if (typeof maybeToMillis === "function") {
        const millis = maybeToMillis.call(value);
        if (typeof millis === "number" && Number.isFinite(millis)) {
          return millis;
        }
      }
    } catch {
      // Pending Firestore timestamp delegates can be unavailable in local snapshots.
    }

    try {
      const seconds = (value as { seconds?: unknown }).seconds;
      const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        const safeNanos = typeof nanoseconds === "number" && Number.isFinite(nanoseconds) ? nanoseconds : 0;
        return Math.trunc(seconds * 1000 + safeNanos / 1_000_000);
      }
    } catch {
      // Fall through to the configured fallback.
    }
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return fallback;
}

function getUserClearedAt(data: FirestoreChatDoc, userId: string): number {
  return safeTimestampToMillis(getUserClearedAtValue(data, userId), 0);
}

function getUserClearedAtValue(data: FirestoreChatDoc, userId: string): unknown {
  if (data.clearedAt && typeof data.clearedAt === "object" && userId in data.clearedAt) {
    return data.clearedAt[userId];
  }
  const flatKey = `clearedAt.${userId}`;
  return (data as FirestoreChatDoc & Record<string, unknown>)[flatKey];
}

function getUserDeleted(data: FirestoreChatDoc, userId: string): boolean {
  if (data.deletedUsers && typeof data.deletedUsers === "object" && userId in data.deletedUsers) {
    return data.deletedUsers[userId] === true;
  }
  const flatKey = `deletedUsers.${userId}`;
  return (data as FirestoreChatDoc & Record<string, unknown>)[flatKey] === true;
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

function DirectChatScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { id, chatRoomId: chatRoomIdParam, action: notificationAction, appointmentId: notificationAppointmentId, messageId: notificationMessageId } = useLocalSearchParams<{ id: string; chatRoomId?: string; action?: string; appointmentId?: string; messageId?: string }>();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setIsKeyboardOpen(true);

        // Δίνουμε ένα ελάχιστο delay (50-100ms) για να προλάβει το KeyboardAvoidingView
        // να μικρύνει το layout, και μετά κάνουμε scroll στο τελευταίο μήνυμα.
        setTimeout(() => {
          scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.userId ?? null);
  const [profile, setProfile] = useState<RoommateProfile | null>(null);
  const [counterpartDetails, setCounterpartDetails] = useState<FirestoreUserDoc | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [counterpartExists, setCounterpartExists] = useState(true);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [sharedProfileQuizAnswers, setSharedProfileQuizAnswers] = useState<Record<string, any>>({});
  const [shareTargetVisible, setShareTargetVisible] = useState(false);
  const [sharedProfileVisible, setSharedProfileVisible] = useState(false);
  const [selectedSharedProfile, setSelectedSharedProfile] = useState<SharedProfileMessageMetadata | null>(null);
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

  const scrollRef = useRef<FlatList<Message>>(null);
  const [text, setText] = useState("");
  const [rawMessages, setRawMessages] = useState<Message[]>([]);
  const [userClearedAt, setUserClearedAt] = useState(0);
  const [userClearedAtValue, setUserClearedAtValue] = useState<unknown>(null);
  const [userDeleted, setUserDeleted] = useState(false);
  const [chatMetadataLoaded, setChatMetadataLoaded] = useState(false);
  const [chatMetadataRoomId, setChatMetadataRoomId] = useState<string | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [targetMessage, setTargetMessage] = useState<Message | null>(null);
  const [messageLimit, setMessageLimit] = useState(15);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [chatStatus, setChatStatus] = useState<"pending" | "active" | "rejected">("active");
  const [chatInitiatedBy, setChatInitiatedBy] = useState<string | null>(null);
  const [chatRejectedBy, setChatRejectedBy] = useState<string | null>(null);
  const [chatRejections, setChatRejections] = useState<string[]>([]);
  const [crossChatNoticeTarget, setCrossChatNoticeTarget] = useState<"matches" | "hostInbox" | null>(null);
  const [isCrossChatNoticeDismissed, setIsCrossChatNoticeDismissed] = useState(false);
  const [isNoticeDismissedLocally, setIsNoticeDismissedLocally] = useState(false);
  const [chatType, setChatType] = useState<"roommate" | "host" | "colleague">("roommate");
  const showRoommateHeaderDetails = chatType === "roommate" && !isBrokerOrAgencyUser(counterpartDetails) && counterpartDetails?.looking_for_roommate !== false && counterpartDetails?.isLookingForRoommate !== false && counterpartDetails?.not_looking_for_roommate !== true;
  const headerSubInfo = isBrokerOrAgencyUser(counterpartDetails) ? "Μεσίτης" : "Ενεργός τώρα";
  const [brokerChatRole, setBrokerChatRole] = useState<"client" | "owner" | null>(null);
  const [assignedOwnerProperties, setAssignedOwnerProperties] = useState<ReturnType<typeof buildApartmentRoutePayload>[]>([]);
  const [loadingAssignedOwnerProperties, setLoadingAssignedOwnerProperties] = useState(false);
  const [clientInteractedProperties, setClientInteractedProperties] = useState<BrokerClientDropdownProperty[]>([]);
  const [loadingClientInteractedProperties, setLoadingClientInteractedProperties] = useState(false);
  const [showAssignedPropertiesDropdown, setShowAssignedPropertiesDropdown] = useState(false);
  const [propertyActionMenuId, setPropertyActionMenuId] = useState<string | null>(null);
  const [selectedInquiryProperty, setSelectedInquiryProperty] = useState<ReturnType<typeof buildApartmentRoutePayload> | null>(null);
  const [visitRequestApartmentId, setVisitRequestApartmentId] = useState<string | null>(null);
  const [hostPhoneFromChatMeta, setHostPhoneFromChatMeta] = useState("");
  const [hostApartmentId, setHostApartmentId] = useState<string | null>(null);
  const [hostApartmentTitle, setHostApartmentTitle] = useState<string | null>(null);
  const [hostApartment, setHostApartment] = useState<ReturnType<typeof buildApartmentRoutePayload> | null>(null);
  const [isApartmentUnavailable, setIsApartmentUnavailable] = useState(false);
  const [showMutualLikes, setShowMutualLikes] = useState(false);
  const [showHostActionMenu, setShowHostActionMenu] = useState(false);
  const [showPriceProposalModal, setShowPriceProposalModal] = useState(false);
  const [showVisitRequestModal, setShowVisitRequestModal] = useState(false);
  const [visitToEdit, setVisitToEdit] = useState<Message | null>(null);
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const targetedMessageHandledRef = useRef<string | null>(null);
  const [addressDisclosure, setAddressDisclosure] = useState<{ apartmentId: string; exactAddress: string; latitude?: number; longitude?: number } | null>(null);
  const [isSendingAddress, setIsSendingAddress] = useState(false);
  const addressActionHandledRef = useRef<string | null>(null);
  const [isSubmittingHostAction, setIsSubmittingHostAction] = useState(false);
  const [currentUserLikedIds, setCurrentUserLikedIds] = useState<Set<string>>(new Set());
  const [counterpartLikedIds, setCounterpartLikedIds] = useState<Set<string>>(new Set());
  const [mutualLikedApartments, setMutualLikedApartments] = useState<MutualApartment[]>([]);
  const [mutualLikesLoading, setMutualLikesLoading] = useState(false);
  const [sharedColleagueListings, setSharedColleagueListings] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showAddEmailModal, setShowAddEmailModal] = useState(false);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showGlobalUnmuteModal, setShowGlobalUnmuteModal] = useState(false);
  const [roommateContractPickerVisible, setRoommateContractPickerVisible] = useState(false);
  const [roommateContractDraft, setRoommateContractDraft] = useState<ContractDraftContext | null>(null);
  const [roommateExistingContractId, setRoommateExistingContractId] = useState<string | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<Message | null>(null);
  const [selectedFilterSetMessage, setSelectedFilterSetMessage] = useState<Message | null>(null);
  const [selectedFilterSetRecord, setSelectedFilterSetRecord] = useState<SharedFilterSetRecord | null>(null);
  const [isFilterHistoryActive, setIsFilterHistoryActive] = useState(false);
  const [searchHistoryPickerVisible, setSearchHistoryPickerVisible] = useState(false);
  const [searchSharingPromptShown, setSearchSharingPromptShown] = useState(false);
  const [activeViewList, setActiveViewList] = useState<{ listTitle: string; apartments: MutualApartment[]; messageId?: string; listId?: string } | null>(null);
  const [proposalFeedbackMap, setProposalFeedbackMap] = useState<Record<string, ProposalItemFeedback>>({});
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});
  const [submittingFeedbackAptId, setSubmittingFeedbackAptId] = useState<string | null>(null);
  const [loadingListFeed, setLoadingListFeed] = useState(false);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [isSubmittingBlockAction, setIsSubmittingBlockAction] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description?: string;
    actions: CenteredModalAction[];
  } | null>(null);
  const olderLoadTriggeredRef = useRef(false);
  const isRoommateChat = chatType === "roommate";
  const isBrokerOwnerChat = auth.isBroker && chatType === "host" && brokerChatRole === "owner";
  const isBrokerClientChat =
    chatType === "host" &&
    ((auth.isBroker && brokerChatRole !== "owner") ||
      (!auth.isBroker && counterpartDetails?.is_broker === true));
  const isManualClient = auth.isBroker && isBrokerClientChat && brokerChatRole === "client" && counterpartDetails?.is_manual_client === true;

  const startRoommateContract = useCallback((contractType: Extract<ContractType, "roommate_agreement" | "holding_deposit_viewing">) => {
    if (!currentUserId || !counterpartId || !chatRoomId || !isRoommateChat) return;
    setRoommateContractPickerVisible(false);
    setRoommateExistingContractId(null);
    setRoommateContractDraft({
      agencyId: auth.agencyId || counterpartDetails?.agencyId || "independent",
      createdByUserId: currentUserId,
      contractType,
      title: t(contractType === "roommate_agreement" ? "esign.roommateAgreement" : "esign.holdingDeposit"),
      chatRoomId,
      participantIds: [
        { id: currentUserId, role: "roommate" },
        { id: counterpartId, role: "roommate" },
      ],
      contractPayload: contractType === "holding_deposit_viewing" ? { holdingDepositAmount: 0 } : { houseRulesConfig: {} },
    });
  }, [auth.agencyId, chatRoomId, counterpartDetails?.agencyId, counterpartId, currentUserId, isRoommateChat]);

  const handleRoommateContractCreated = useCallback((createdContract: DigitalContractDocument) => {
    if (!chatRoomId || !currentUserId) return;
    void sendContractChatRequest({ chatRoomId, senderId: currentUserId, contract: createdContract }).catch(() => undefined);
  }, [chatRoomId, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !chatRoomId) return;
    const updatePresence = async (isActive: boolean) => {
      const userRef = doc(db, "users", currentUserId);
      if (isActive) {
        await setDoc(userRef, { activeChatId: chatRoomId }, { merge: true });
        return;
      }
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (snapshot.exists() && snapshot.data().activeChatId === chatRoomId) transaction.update(userRef, { activeChatId: deleteField() });
      });
    };
    void updatePresence(true).catch(() => undefined);
    const subscription = AppState.addEventListener("change", (nextState) => {
      void updatePresence(nextState === "active").catch(() => undefined);
    });
    return () => {
      subscription.remove();
      void updatePresence(false).catch(() => undefined);
    };
  }, [chatRoomId, currentUserId]);

  useEffect(() => {
    if (notificationAction !== "send_exact_address" || !notificationAppointmentId || !currentUserId || addressActionHandledRef.current === notificationAppointmentId) return;
    addressActionHandledRef.current = notificationAppointmentId;
    void (async () => {
      const appointmentSnapshot = await getDoc(doc(db, "appointments", notificationAppointmentId));
      const appointment = appointmentSnapshot.exists() ? appointmentSnapshot.data() : {};
      const apartmentId = typeof appointment.apartmentId === "string" ? appointment.apartmentId : "";
      if (!apartmentId) return;
      const apartmentSnapshot = await getDoc(doc(db, "apartments", apartmentId));
      const apartment = apartmentSnapshot.exists() ? apartmentSnapshot.data() : {};
      const exactAddress = typeof apartment.exactAddress === "string" && apartment.exactAddress.trim()
        ? apartment.exactAddress.trim()
        : typeof apartment.address === "string" ? apartment.address.trim() : "";
      if (exactAddress) setAddressDisclosure({ apartmentId, exactAddress, latitude: typeof apartment.latitude === "number" ? apartment.latitude : undefined, longitude: typeof apartment.longitude === "number" ? apartment.longitude : undefined });
    })().catch(() => undefined);
  }, [currentUserId, notificationAction, notificationAppointmentId]);

  const shareExactAddress = useCallback(async () => {
    if (!addressDisclosure || !currentUserId || !chatRoomId || isSendingAddress) return;
    setIsSendingAddress(true);
    try {
      const text = "Ο μεσίτης σας κοινοποίησε την ακριβή τοποθεσία για την αυριανή υπόδειξη.";
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        receiverId: counterpartId,
        type: "address_revealed",
        text,
        metadata: { apartmentId: addressDisclosure.apartmentId, exactAddress: addressDisclosure.exactAddress, latitude: addressDisclosure.latitude, longitude: addressDisclosure.longitude },
        createdAt: serverTimestamp(),
        isRead: false,
      });
      await setDoc(doc(db, "chats", chatRoomId), { lastMessage: text, lastMessageType: "address_revealed", lastMessageTimestamp: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
      setAddressDisclosure(null);
    } finally {
      setIsSendingAddress(false);
    }
  }, [addressDisclosure, chatRoomId, counterpartId, currentUserId, isSendingAddress]);

  const handleOpenPropertyList = useCallback(async (message: Message) => {
    const apartmentIds = message.apartmentIds ?? [];
    setProposalFeedbackMap(message.proposalFeedback ?? {});
    setRejectionDrafts({});
    if (apartmentIds.length === 0) {
      setActiveViewList({ listTitle: message.listTitle || "Λίστα ακινήτων", apartments: [], messageId: message.id, listId: message.listId || message.id });
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
        messageId: message.id,
        listId: message.listId || message.id,
      });
    } catch (error) {
      console.warn("[Chat] Error loading shared property list:", error);
    } finally {
      setLoadingListFeed(false);
    }
  }, []);

  const sortedProposalApartments = useMemo(() => {
    if (!activeViewList) return [];

    const rank = (status?: ProposalItemFeedback["status"]) => status === "accepted" ? 1 : status === "rejected" ? 2 : 0;
    return [...activeViewList.apartments].sort((first, second) =>
      rank(proposalFeedbackMap[first.id]?.status) - rank(proposalFeedbackMap[second.id]?.status),
    );
  }, [activeViewList, proposalFeedbackMap]);


  useEffect(() => {
    setTargetMessage(null);
    targetedMessageHandledRef.current = null;
    if (!notificationMessageId || !chatRoomId || !currentUserId) return;

    let active = true;
    void getDoc(doc(db, "chats", chatRoomId, "messages", notificationMessageId)).then((snapshot) => {
      if (!active || !snapshot.exists()) return;
      const data = snapshot.data() as FirestoreMessageDoc;
      setTargetMessage({
        id: snapshot.id,
        text: data.text ?? "",
        noteText: typeof data.noteText === "string" ? data.noteText : undefined,
        senderId: data.senderId ?? "",
        createdAt: safeTimestampToMillis(data.createdAt, Date.now()),
        isRead: data.isRead ?? true,
        type: data.type,
        status: data.status,
        proposedPrice: typeof data.proposedPrice === "number" ? data.proposedPrice : undefined,
        requestedDate: typeof data.requestedDate === "string" ? data.requestedDate : undefined,
        requestedTime: typeof data.requestedTime === "string" ? data.requestedTime : undefined,
        apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
        apartmentData: isSharedApartmentData(data.apartmentData) ? data.apartmentData : undefined,
        contractId: typeof data.contractId === "string" ? data.contractId : typeof data.metadata?.contractId === "string" ? data.metadata.contractId : undefined,
        contractType: data.contractType,
        contractTitle: typeof data.contractTitle === "string" ? data.contractTitle : typeof data.metadata?.contractTitle === "string" ? data.metadata.contractTitle : undefined,
        filterSetData: data.filterSetData,
        filterSetId: typeof data.filterSetId === "string" ? data.filterSetId : undefined,
        listId: typeof data.listId === "string" ? data.listId : undefined,
        listTitle: typeof data.listTitle === "string" ? data.listTitle : undefined,
        apartmentIds: Array.isArray(data.apartmentIds) ? data.apartmentIds.filter((item): item is string => typeof item === "string") : undefined,
        apartmentCount: typeof data.apartmentCount === "number" ? data.apartmentCount : undefined,
        previewImages: Array.isArray(data.previewImages) ? data.previewImages.filter((item): item is string => typeof item === "string") : undefined,
        hasClientInteracted: data.hasClientInteracted === true,
        proposalFeedback: data.proposalFeedback,
        metadata: data.metadata,
      });
    }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, [chatRoomId, currentUserId, notificationMessageId]);

  const messages = useMemo(() => {
    if (!chatMetadataLoaded || chatMetadataRoomId !== chatRoomId || userDeleted) return [];

    const sourceMessages = targetMessage && !rawMessages.some((message) => message.id === targetMessage.id)
      ? [...rawMessages, targetMessage]
      : rawMessages;
    const sorted = [...sourceMessages].sort(
      (a, b) => safeTimestampToMillis(a.createdAt) - safeTimestampToMillis(b.createdAt),
    );

    if (userClearedAt <= 0) return sorted;

    return sorted.filter((message) => safeTimestampToMillis(message.createdAt) > userClearedAt);
  }, [chatMetadataLoaded, chatMetadataRoomId, chatRoomId, rawMessages, targetMessage, userClearedAt, userDeleted]);

  // FlatList inverted={true} expects newest-first order (index 0 = latest message).
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const activePinnedAppointment = useMemo(() => {
    const latestByAppointment = new Map<string, { message: Message; index: number }>();
    messages.forEach((message, index) => {
      const appointmentId = message.metadata?.appointmentId;
      if (appointmentId) latestByAppointment.set(appointmentId, { message, index });
    });
    return [...latestByAppointment.values()]
      .filter(({ message }) => {
        const appointmentDate = message.metadata?.appointmentDate ? Date.parse(message.metadata.appointmentDate) : NaN;
        return (message.metadata?.status === "pending" || message.metadata?.status === "confirmed") && Number.isFinite(appointmentDate) && appointmentDate > Date.now();
      })
      .sort((first, second) => Date.parse(first.message.metadata?.appointmentDate ?? "") - Date.parse(second.message.metadata?.appointmentDate ?? ""))[0] ?? null;
  }, [messages]);

  useEffect(() => {
    if (!notificationMessageId || !messagesLoaded || targetedMessageHandledRef.current === notificationMessageId) return;
    const targetIndex = messages.findIndex((message) => message.id === notificationMessageId);
    if (targetIndex < 0) return;

    targetedMessageHandledRef.current = notificationMessageId;
    const invertedIndex = messages.length - 1 - targetIndex;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToIndex({ index: invertedIndex, animated: true, viewPosition: 0.5 });
    });
    setHighlightedMessageId(notificationMessageId);
    const timeout = setTimeout(() => setHighlightedMessageId(null), 1500);
    return () => clearTimeout(timeout);
  }, [messages, messagesLoaded, notificationMessageId]);

  const handleLoadOlderMessages = useCallback(() => {
    if (isLoadingOlderMessages || !hasMoreOlderMessages || !messagesLoaded || olderLoadTriggeredRef.current) return;

    olderLoadTriggeredRef.current = true;
    setIsLoadingOlderMessages(true);
    setMessageLimit((previous) => previous + 10);
  }, [hasMoreOlderMessages, isLoadingOlderMessages, messagesLoaded]);

  useEffect(() => {
    if (!currentUserId || !chatRoomId) return;

    setRawMessages([]);
    setUserClearedAt(0);
    setUserClearedAtValue(null);
    setUserDeleted(false);
    setChatMetadataLoaded(false);
    setChatMetadataRoomId(null);
    setMessagesLoaded(false);
    setSearchSharingPromptShown(false);
    setMessageLimit(15);
    setIsLoadingOlderMessages(false);
    setHasMoreOlderMessages(true);
    olderLoadTriggeredRef.current = false;

    const chatRef = doc(db, "chats", chatRoomId);
    const unsubChat = onSnapshot(chatRef, (snapshot) => {
      if (!snapshot.exists()) {
        setChatStatus("active");
        setChatInitiatedBy(null);
        setChatRejectedBy(null);
        setChatRejections([]);
        setIsCrossChatNoticeDismissed(false);
        setIsNoticeDismissedLocally(false);
        setUserClearedAt(0);
        setUserClearedAtValue(null);
        setUserDeleted(false);
        setChatMetadataLoaded(true);
        setChatMetadataRoomId(chatRoomId);
        setChatType("roommate");
        setBrokerChatRole(null);
        setSearchSharingPromptShown(false);
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
      const dismissedCrossChatNoticesMap = data.dismissedCrossChatNotices && typeof data.dismissedCrossChatNotices === "object"
        ? (data.dismissedCrossChatNotices as Record<string, unknown>)
        : {};
      const userClearCutoff = currentUserId ? getUserClearedAt(data, currentUserId) : 0;
      setUserClearedAt(userClearCutoff);
      setUserClearedAtValue(currentUserId ? getUserClearedAtValue(data, currentUserId) : null);
      setUserDeleted(currentUserId ? getUserDeleted(data, currentUserId) : false);
      setChatMetadataLoaded(true);
      setChatMetadataRoomId(chatRoomId);
      setIsCrossChatNoticeDismissed(currentUserId ? dismissedCrossChatNoticesMap[currentUserId] === true : false);
      setChatType(data.type === "host" ? "host" : data.type === "colleague" ? "colleague" : "roommate");
      setBrokerChatRole(data.brokerChatRole === "client" || data.brokerChatRole === "owner" ? data.brokerChatRole : null);
      setSearchSharingPromptShown(data.searchSharingPromptShown === true);
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
      // ΔΙΟΡΘΩΣΗ: Ενημερώνουμε real-time τα block flags μέσα στο δωμάτιο τσατ
      const blockedMap = (data as any).blockedByUsers ?? {};
      setIsBlocker(currentUserId ? blockedMap[currentUserId] === true : false);
      setIsBlocked(counterpartId ? blockedMap[counterpartId] === true : false);
    });
    return () => {
      unsubChat();
    };
  }, [chatRoomId, currentUserId]);

  useEffect(() => {
    const agencyId = counterpartDetails?.agencyId;
    if (!agencyId || chatType !== "colleague" || !currentUserId || !counterpartId) {
      setSharedColleagueListings([]);
      return;
    }

    let active = true;
    void getSharedCoManagedListings(agencyId, [currentUserId, counterpartId])
      .then((listings) => {
        if (active) setSharedColleagueListings(listings);
      })
      .catch(() => {
        if (active) setSharedColleagueListings([]);
      });
    return () => { active = false; };
  }, [chatType, counterpartDetails?.agencyId, counterpartId, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !chatRoomId || !chatMetadataLoaded || chatMetadataRoomId !== chatRoomId) return;

    if (userDeleted) {
      setRawMessages([]);
      setMessagesLoaded(true);
      setHasMoreOlderMessages(false);
      setIsLoadingOlderMessages(false);
      olderLoadTriggeredRef.current = false;
      return;
    }

    const messagesCollection = collection(db, "chats", chatRoomId, "messages");
    const messagesQuery = userClearedAt > 0 && userClearedAtValue != null
      ? query(messagesCollection, where("createdAt", ">", userClearedAtValue), orderBy("createdAt", "desc"), limit(messageLimit))
      : query(messagesCollection, orderBy("createdAt", "desc"), limit(messageLimit));

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const fetched: Message[] = snapshot.docs
          .map((messageDoc) => {
            const data = messageDoc.data() as FirestoreMessageDoc;
            const apartmentData = isSharedApartmentData(data.apartmentData) ? data.apartmentData : undefined;
            return {
              id: messageDoc.id,
              text: data.text ?? "",
              noteText: typeof data.noteText === "string" ? data.noteText : undefined,
              senderId: data.senderId ?? "",
              createdAt: safeTimestampToMillis(data.createdAt, Date.now()),
              isRead: data.isRead ?? true,
              type: data.type,
              status: data.status,
              proposedPrice: typeof data.proposedPrice === "number" ? data.proposedPrice : undefined,
              requestedDate: typeof data.requestedDate === "string" ? data.requestedDate : undefined,
              requestedTime: typeof data.requestedTime === "string" ? data.requestedTime : undefined,
              apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
              apartmentData,
              contractId: typeof data.contractId === "string" ? data.contractId : typeof data.metadata?.contractId === "string" ? data.metadata.contractId : undefined,
              contractType: data.contractType,
              contractTitle: typeof data.contractTitle === "string" ? data.contractTitle : typeof data.metadata?.contractTitle === "string" ? data.metadata.contractTitle : undefined,
              filterSetData: data.filterSetData,
              filterSetId: typeof data.filterSetId === "string" ? data.filterSetId : undefined,
              listId: typeof data.listId === "string" ? data.listId : undefined,
              listTitle: typeof data.listTitle === "string" ? data.listTitle : undefined,
              apartmentIds: Array.isArray(data.apartmentIds) ? data.apartmentIds.filter((item): item is string => typeof item === "string") : undefined,
              apartmentCount: typeof data.apartmentCount === "number" ? data.apartmentCount : undefined,
              previewImages: Array.isArray(data.previewImages) ? data.previewImages.filter((item): item is string => typeof item === "string") : undefined,
              hasClientInteracted: data.hasClientInteracted === true,
              proposalFeedback: data.proposalFeedback,
              metadata: data.metadata,
            };
          })
          .filter((message) => safeTimestampToMillis(message.createdAt) > userClearedAt);

        const oldestMessageMillis = fetched.length > 0
          ? Math.min(...fetched.map((message) => safeTimestampToMillis(message.createdAt)))
          : 0;
        const reachesClearCutoff = userClearedAt > 0 && oldestMessageMillis <= userClearedAt;
        setHasMoreOlderMessages(snapshot.docs.length >= messageLimit && !reachesClearCutoff);
        setIsLoadingOlderMessages(false);
        olderLoadTriggeredRef.current = false;

        setRawMessages((previous) => {
          const optimisticPending = previous.filter((message) => {
            if (!(message.id.startsWith("temp-") && message.senderId === currentUserId)) return false;
            return !fetched.some((serverMessage) =>
              serverMessage.senderId === message.senderId && serverMessage.text === message.text,
            );
          });
          return [...fetched, ...optimisticPending];
        });
        setMessagesLoaded(true);

        if (messageLimit === 15 && snapshot.docs.length === 15) {
          setMessageLimit(25);
        }
      },
      () => {
        setMessagesLoaded(true);
        setIsLoadingOlderMessages(false);
        olderLoadTriggeredRef.current = false;
      },
    );

    return () => unsubscribe();
  }, [chatMetadataLoaded, chatMetadataRoomId, chatRoomId, currentUserId, messageLimit, userClearedAt, userClearedAtValue, userDeleted]);

  useEffect(() => {
    if (chatType !== "host" || !currentUserId || !counterpartId || !chatRoomId) return;

    const counterpartIsBroker = counterpartDetails?.is_broker === true;
    const brokerId = auth.isBroker ? currentUserId : counterpartIsBroker ? counterpartId : null;
    if (!brokerId) return;

    const clientId = brokerId === currentUserId ? counterpartId : currentUserId;
    void syncBrokerClientProfile({
      brokerId,
      clientId,
      role: brokerChatRole === "owner" ? "owner" : "client",
      chatRoomId,
      apartmentId: hostApartmentId,
    }).catch((error) => {
      console.warn("[Chat] Failed to sync broker CRM profile:", error);
    });
  }, [auth.isBroker, brokerChatRole, chatRoomId, chatType, counterpartDetails?.is_broker, counterpartId, currentUserId, hostApartmentId]);

  useEffect(() => {
    if (!isRoommateChat && showMutualLikes) {
      setShowMutualLikes(false);
    }
  }, [isRoommateChat, showMutualLikes]);

  useEffect(() => {
    if ((!isRoommateChat && !isBrokerClientChat) || !currentUserId) {
      setCurrentUserLikedIds(new Set());
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(currentUserId, (ids) => {
      setCurrentUserLikedIds(ids);
    });

    return () => unsubscribe();
  }, [currentUserId, isBrokerClientChat, isRoommateChat]);

  const handleToggleApartmentLike = useCallback((apartmentId: string) => {
    if (!currentUserId) return;
    void toggleApartmentLike(currentUserId, apartmentId);
  }, [currentUserId]);

  const handleAcceptProposalApartment = useCallback(async (apartment: MutualApartment) => {
    if (!currentUserId || !chatRoomId || !activeViewList?.messageId || auth.isBroker) return;

    const updatedAt = Date.now();
    if (!currentUserLikedIds.has(apartment.id)) {
      await toggleApartmentLike(currentUserId, apartment.id);
    }
    setProposalFeedbackMap((previous) => ({
      ...previous,
      [apartment.id]: { status: "accepted", updatedAt },
    }));

    try {
      await updateDoc(doc(db, "chats", chatRoomId, "messages", activeViewList.messageId), {
        [`proposalFeedback.${apartment.id}`]: { status: "accepted", updatedAt },
        hasClientInteracted: true,
      });
    } catch (error) {
      console.warn("[Chat] Failed to persist proposal acceptance:", error);
    }
  }, [activeViewList?.messageId, auth.isBroker, chatRoomId, currentUserId, currentUserLikedIds]);

  const handleRejectProposalApartment = useCallback((apartmentId: string) => {
    setProposalFeedbackMap((previous) => ({
      ...previous,
      [apartmentId]: { status: "rejected", updatedAt: Date.now() },
    }));
  }, []);

  const handleSubmitRejectionReason = useCallback(async (apartment: MutualApartment) => {
    const reasonText = rejectionDrafts[apartment.id]?.trim();
    if (!reasonText || !currentUserId || !chatRoomId || !activeViewList?.messageId || submittingFeedbackAptId || auth.isBroker) return;

    const updatedAt = Date.now();
    setSubmittingFeedbackAptId(apartment.id);
    try {
      await addPropertyInteraction({
        apartmentId: apartment.id,
        apartmentTitle: apartment.title,
        clientId: currentUserId,
        clientName: counterpartDetails?.name?.trim() || t("common.values.unknown"),
        type: "comment",
        note: `Απόρριψη πρότασης: ${reasonText}`,
        loggedByUserId: currentUserId,
      });
      await updateDoc(doc(db, "chats", chatRoomId, "messages", activeViewList.messageId), {
        [`proposalFeedback.${apartment.id}`]: { status: "rejected", reason: reasonText, updatedAt },
        hasClientInteracted: true,
      });
      setProposalFeedbackMap((previous) => ({
        ...previous,
        [apartment.id]: { status: "rejected", reason: reasonText, updatedAt },
      }));
    } catch (error) {
      console.error("[Chat] Failed to submit proposal rejection reason:", error);
    } finally {
      setSubmittingFeedbackAptId(null);
    }
  }, [activeViewList?.messageId, auth.isBroker, chatRoomId, counterpartDetails?.name, currentUserId, rejectionDrafts, submittingFeedbackAptId]);

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
        const fetched = await Promise.all(
          mutualLikedIds.slice(0, 30).map(async (apartmentId) => {
            const snapshot = await getDoc(doc(db, "apartments", apartmentId));
            return snapshot.exists()
              ? mapApartmentDocToMutualApartment(apartmentId, snapshot.data() as FirestoreApartmentDoc)
              : null;
          }),
        );
        if (!active) return;

        if (active) {
          setMutualLikedApartments(fetched.filter((apartment): apartment is MutualApartment => apartment !== null));
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
    if (!currentUserId || !counterpartId || !chatRoomId || !chatMetadataLoaded || !messagesLoaded) {
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
  }, [chatMetadataLoaded, chatRoomId, chatType, counterpartId, currentUserId, messagesLoaded]);

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
          exactAddress: undefined,
          showExactAddress: false,
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
          ownerId: undefined,
          assignedBrokerIds: undefined,
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
    if (!isBrokerOwnerChat || !currentUserId || !counterpartId || !showAssignedPropertiesDropdown) {
      setAssignedOwnerProperties([]);
      setLoadingAssignedOwnerProperties(false);
      return;
    }

    let active = true;
    setLoadingAssignedOwnerProperties(true);
    void (async () => {
      try {
        const [ownerSnapshot, hostSnapshot] = await Promise.all([
          getDocs(query(
            collection(db, "apartments"),
            where("ownerId", "==", counterpartId),
            where("assignedBrokerIds", "array-contains", currentUserId),
          )),
          getDocs(query(
            collection(db, "apartments"),
            where("hostId", "==", counterpartId),
            where("assignedBrokerIds", "array-contains", currentUserId),
          )),
        ]);
        const propertiesById = new Map<string, ReturnType<typeof buildApartmentRoutePayload>>();
        [...ownerSnapshot.docs, ...hostSnapshot.docs].forEach((propertyDoc) => {
          const data = propertyDoc.data() as FirestoreApartmentDoc;
          if (data.status === "closed_deal") return;
          propertiesById.set(propertyDoc.id, buildApartmentRoutePayload(propertyDoc.id, data));
        });
        if (active) setAssignedOwnerProperties([...propertiesById.values()]);
      } catch (error) {
        console.warn("[Chat] Failed to load assigned owner properties:", error);
        if (active) setAssignedOwnerProperties([]);
      } finally {
        if (active) setLoadingAssignedOwnerProperties(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [counterpartId, currentUserId, isBrokerOwnerChat, showAssignedPropertiesDropdown]);

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
        if (active) setSharedProfileQuizAnswers(rawCounterpartQuiz);

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

    setRawMessages((previous) => [...previous, optimisticMessage]);
    setText("");
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }));

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
      const chatRef = doc(db, "chats", chatRoomId);
      await setDoc(
        chatRef,
        {
          lastMessage: trimmed,
          lastMessageType: "text",
          lastMessageSenderId: currentUserId,
          lastMessageIsRead: false,
          lastMessageReadBy: [currentUserId],
          lastMessageTimestamp: Date.now(),
          updatedAt: Date.now(),
          deletedUsers: { [id]: false },
        },
        { merge: true },
      );
      await updateDoc(
        chatRef,
        new FieldPath(`deletedUsers.${id}`),
        deleteField(),
      );
    } catch (error) {
      console.error("Error sending message/notification:", error);
      // Επαναφορά του UI (αφαίρεση του optimistic message) σε περίπτωση αποτυχίας
      setRawMessages((previous) => previous.filter((message) => message.id !== optimisticMessage.id));
    }
  }, [chatRoomId, chatStatus, chatType, counterpartExists, currentUserId, id, isApartmentUnavailable, text]);

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

  // ΔΙΟΡΘΩΣΗ: Δυναμικός έλεγχος για απόκρυψη στοιχείων λόγω Block
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

  // ΑΣΦΑΛΕΙΑ: Αν υπάρχει οποιοδήποτε block, κλειδώνουμε το input bar
  const inputBlocked = chatStatus === "pending" || chatStatus === "rejected" || deletedCounterpart || apartmentLocked || hasBlockedByMe || blockedByOtherUser;

  const filterHistoryRecords = useMemo<SharedFilterSetRecord[]>(() => {
    const records = new Map<string, SharedFilterSetRecord>();
    messages.forEach((message) => {
      if (message.type !== "filter_set_share" || !message.filterSetData) return;
      const data = message.filterSetData;
      const updatedAt = data.sharedAt ?? (safeTimestampToMillis(message.createdAt) || Date.now());
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
        showMatchScore: data.showMatchScore === true || data.showMatchScoreOnMap === true,
        propertyTypes: data.propertyTypes,
        propertyCategories: data.propertyCategories,
        floors: data.floors,
        bedroomsMin: data.bedroomsMin,
        bathroomsMin: data.bathroomsMin,
        furnishedStatus: data.furnishedStatus,
        heatingTypes: data.heatingTypes,
        energyClasses: data.energyClasses,
        constructionYearMin: data.constructionYearMin,
        renovationYearMin: data.renovationYearMin,
        selectedAmenities: data.selectedAmenities,
        polygonCoordinates: data.polygonCoordinates,
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
  }, [counterpartDetails, counterpartId, displayName, messages]);

  const latestSharedFilterVersion = useMemo<FilterSetMessageData | null>(() => {
    const versions = filterHistoryRecords.flatMap((record) => record.versions);
    return [...versions].sort((first, second) => second.updatedAt - first.updatedAt)[0] ?? null;
  }, [filterHistoryRecords]);
  const hasSharedSearchHistory = useMemo(
    () => messages.some((message) => message.type === "search_history_share" && message.senderId === currentUserId),
    [currentUserId, messages],
  );

  const markSearchSharingPromptShown = useCallback(() => {
    if (searchSharingPromptShown || !currentUserId || !chatRoomId || auth.isBroker || !isBrokerClientChat) return;
    setSearchSharingPromptShown(true);
    void setDoc(doc(db, "chats", chatRoomId), { searchSharingPromptShown: true }, { merge: true }).catch((error: unknown) => {
      console.warn("[Chat] Failed to persist search-sharing prompt state:", error);
    });
  }, [auth.isBroker, chatRoomId, currentUserId, isBrokerClientChat, searchSharingPromptShown]);

  useEffect(() => {
    if (!isBrokerClientChat || auth.isBroker || hasSharedSearchHistory || searchSharingPromptShown) return;
    markSearchSharingPromptShown();
  }, [auth.isBroker, hasSharedSearchHistory, isBrokerClientChat, markSearchSharingPromptShown, searchSharingPromptShown]);

  useEffect(() => {
    if (!isBrokerClientChat || !currentUserId || !counterpartId || !chatRoomId || (!showAssignedPropertiesDropdown && !showVisitRequestModal)) {
      setClientInteractedProperties([]);
      setLoadingClientInteractedProperties(false);
      return;
    }

    const brokerId = auth.isBroker ? currentUserId : counterpartId;
    const clientUid = auth.isBroker ? counterpartId : currentUserId;
    let active = true;
    setLoadingClientInteractedProperties(true);

    void (async () => {
      try {
        const [messagesSnapshot, likesSnapshot, brokerOwnedSnapshot, brokerAssignedSnapshot] = await Promise.all([
          getDocs(collection(db, "chats", chatRoomId, "messages")),
          getDocs(query(collection(db, "liked_apartments"), where("userId", "==", clientUid))),
          getDocs(query(collection(db, "apartments"), where("hostId", "==", brokerId))),
          getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", brokerId))),
        ]);

        const brokerApartmentDocs = new Map<string, FirestoreApartmentDoc>();
        [...brokerOwnedSnapshot.docs, ...brokerAssignedSnapshot.docs].forEach((apartmentDoc) => {
          brokerApartmentDocs.set(apartmentDoc.id, apartmentDoc.data() as FirestoreApartmentDoc);
        });

        const interactedApartmentIds = new Set<string>();
        if (hostApartmentId) interactedApartmentIds.add(hostApartmentId);
        messagesSnapshot.docs.forEach((messageDoc) => {
          const data = messageDoc.data() as FirestoreMessageDoc;
          if (data.apartmentId) interactedApartmentIds.add(data.apartmentId);
          if (data.apartmentData?.id) interactedApartmentIds.add(data.apartmentData.id);
          data.apartmentIds?.forEach((apartmentId) => interactedApartmentIds.add(apartmentId));
        });
        likesSnapshot.docs.forEach((likeDoc) => {
          const apartmentId = likeDoc.data().apartmentId;
          if (typeof apartmentId === "string" && brokerApartmentDocs.has(apartmentId)) interactedApartmentIds.add(apartmentId);
        });

        const rows: BrokerClientDropdownProperty[] = [];
        for (const apartmentId of interactedApartmentIds) {
          let apartmentData = brokerApartmentDocs.get(apartmentId);
          if (!apartmentData) {
            const apartmentSnapshot = await getDoc(doc(db, "apartments", apartmentId));
            if (apartmentSnapshot.exists()) {
              const fallbackData = apartmentSnapshot.data() as FirestoreApartmentDoc;
              const assignedBrokerIds = fallbackData.assignedBrokerIds ?? [];
              const belongsToBroker = fallbackData.hostId === brokerId || fallbackData.ownerId === brokerId || assignedBrokerIds.includes(brokerId);
              if (belongsToBroker) {
                apartmentData = fallbackData;
              }
            }
          }

          if (!apartmentData || apartmentData.status === "closed_deal") continue;
          const payload = buildApartmentRoutePayload(apartmentId, apartmentData);
          const score = latestSharedFilterVersion
            ? calculateTenantCompatibilityScore({
              city: payload.city,
              area: payload.area,
              rent: payload.rent,
              size: payload.size,
              tags: payload.tags,
            }, latestSharedFilterVersion as FilterSetPayload)
            : 0;
          rows.push({
            id: apartmentId,
            title: payload.title,
            rent: payload.rent,
            area: payload.area,
            city: payload.city,
            compatibilityScore: Math.round(score),
            rawApartmentPayload: payload,
          });
        }

        if (active) setClientInteractedProperties(rows.sort((first, second) => second.compatibilityScore - first.compatibilityScore));
      } catch (error) {
        console.warn("[Chat] Error loading client interacted broker properties:", error);
        if (active) setClientInteractedProperties([]);
      } finally {
        if (active) setLoadingClientInteractedProperties(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.isBroker, chatRoomId, counterpartId, currentUserId, hostApartmentId, isBrokerClientChat, latestSharedFilterVersion, showAssignedPropertiesDropdown, showVisitRequestModal]);

  const showChatMatchScore = latestSharedFilterVersion?.showMatchScore === true;

  const handleShareSearchHistory = useCallback(async (selection: SearchHistorySelection) => {
    if (!currentUserId || !counterpartId || !chatRoomId || auth.isBroker || (selection.queries.length === 0 && selection.filterSets.length === 0)) return;
    try {
      const sharedAt = Date.now();
      await syncBrokerClientProfile({
        brokerId: counterpartId,
        clientId: currentUserId,
        role: "client",
        chatRoomId,
      });
      await setDoc(doc(db, "brokerClientProfiles", `${counterpartId}_${currentUserId}`), {
        sharedSearchQueries: selection.queries,
        sharedSearchFilterSets: selection.filterSets,
        sharedSearchHistoryAt: sharedAt,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        receiverId: counterpartId,
        type: "search_history_share",
        searchQueries: selection.queries,
        searchFilterSets: selection.filterSets,
        text: "Κοινοποίηση ιστορικού αναζητήσεων",
        createdAt: serverTimestamp(),
        isRead: false,
      });
      setSearchHistoryPickerVisible(false);
    } catch (error) {
      console.error("[Chat] Failed to share search history:", error);
      setActionModal({
        title: t("common.messages.tryAgain"),
        description: "Δεν ήταν δυνατός ο διαμοιρασμός του ιστορικού αναζητήσεων.",
        actions: [{ label: t("common.actions.gotIt"), iconName: "checkmark-circle-outline", onPress: () => setActionModal(null) }],
      });
    }
  }, [auth.isBroker, chatRoomId, counterpartId, currentUserId]);

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
  const sanitizedName = (displayName || "").trim();
  const truncatedName = sanitizedName.length > 14 ? `${sanitizedName.slice(0, 12)}...` : sanitizedName;
  const inputPlaceholder = apartmentLocked ? t("chat.unavailable") : deletedCounterpart ? t("chat.placeholderDeleted") : chatStatus === "pending" ? t("chat.placeholderPending") : `Message ${truncatedName || "there"}`;
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

  const inquiryProperty = selectedInquiryProperty ?? hostApartment;
  const hostDiscountPercentage =
    typeof inquiryProperty?.maxDiscountPercentage === "number" ? inquiryProperty.maxDiscountPercentage : 10;
  const hostRent = typeof inquiryProperty?.rent === "number" ? inquiryProperty.rent : 0;
  const minRecommendedPrice = hostRent * ((100 - hostDiscountPercentage) / 100);
  const visitRequestListings = useMemo<VisitRequestListing[]>(() => {
    const listings = clientInteractedProperties.map((property) => ({ id: property.id, title: property.title, rent: property.rent }));
    if (hostApartmentId && hostApartment && !listings.some((listing) => listing.id === hostApartmentId)) {
      listings.unshift({ id: hostApartmentId, title: hostApartment.title, rent: hostApartment.rent });
    }
    if (selectedInquiryProperty && !listings.some((listing) => listing.id === selectedInquiryProperty.id)) {
      listings.unshift({ id: selectedInquiryProperty.id, title: selectedInquiryProperty.title, rent: selectedInquiryProperty.rent });
    }
    const preferredApartmentId = visitRequestApartmentId ?? selectedInquiryProperty?.id ?? hostApartmentId;
    return preferredApartmentId
      ? listings.sort((first, second) => Number(second.id === preferredApartmentId) - Number(first.id === preferredApartmentId))
      : listings;
  }, [clientInteractedProperties, hostApartment, hostApartmentId, selectedInquiryProperty, visitRequestApartmentId]);

  const openVisitRequestModal = useCallback((apartmentId?: string) => {
    setVisitRequestApartmentId(apartmentId ?? hostApartmentId);
    setShowVisitRequestModal(true);
    setShowHostActionMenu(false);
    setShowAssignedPropertiesDropdown(false);
    setPropertyActionMenuId(null);
  }, [hostApartmentId]);

  const submitPriceProposal = useCallback(async (price: number) => {
    const apartmentId = selectedInquiryProperty?.id ?? hostApartmentId;
    if (!currentUserId || !chatRoomId || !apartmentId || isSubmittingHostAction) return;

    setIsSubmittingHostAction(true);
    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "price_proposal",
        proposedPrice: Math.round(price),
        status: "pending",
        apartmentId,
        createdAt: serverTimestamp(),
      });

      await syncBrokerClientProfile({
        brokerId: counterpartId,
        clientId: currentUserId,
        role: brokerChatRole === "owner" ? "owner" : "client",
        chatRoomId,
        apartmentId,
        pipelineStage: "offer_made",
      });

      const chatRef = doc(db, "chats", chatRoomId);
      await setDoc(
        chatRef,
        {
          lastMessage: `Πρόταση τιμής: ${Math.round(price)}${CURRENCY}`,
          lastMessageTimestamp: Date.now(),
          updatedAt: Date.now(),
          deletedUsers: { [counterpartId]: false },
        },
        { merge: true },
      );
      await updateDoc(
        chatRef,
        new FieldPath(`deletedUsers.${counterpartId}`),
        deleteField(),
      );

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
  }, [brokerChatRole, chatRoomId, counterpartId, currentUserId, hostApartmentId, isSubmittingHostAction, selectedInquiryProperty?.id]);

  const submitVisitRequest = useCallback(async (date: string, time: string, apartmentId: string) => {
    if (!currentUserId || !chatRoomId || !apartmentId || isSubmittingHostAction) return;

    const visitDate = parseIsoDate(date);
    if (!visitDate) return;

    setIsSubmittingHostAction(true);
    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "visit_request",
        requestedDate: date,
        requestedTime: time,
        status: "pending",
        apartmentId,
        apartmentTitle: visitRequestListings.find((listing) => listing.id === apartmentId)?.title ?? hostApartmentTitle ?? "Διαμέρισμα",
        apartmentPrice: visitRequestListings.find((listing) => listing.id === apartmentId)?.rent,
        createdAt: serverTimestamp(),
      });

      await syncBrokerClientProfile({
        brokerId: counterpartId,
        clientId: currentUserId,
        role: brokerChatRole === "owner" ? "owner" : "client",
        chatRoomId,
        apartmentId,
        pipelineStage: "showing_scheduled",
      });

      const chatRef = doc(db, "chats", chatRoomId);
      await setDoc(
        chatRef,
        {
          lastMessage: `Αίτημα επίσκεψης: ${formatRequestDate(date)} ${time}`,
          lastMessageTimestamp: Date.now(),
          updatedAt: Date.now(),
          deletedUsers: { [counterpartId]: false },
        },
        { merge: true },
      );
      await updateDoc(
        chatRef,
        new FieldPath(`deletedUsers.${counterpartId}`),
        deleteField(),
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
    brokerChatRole,
    chatRoomId,
    counterpartId,
    currentUserId,
    hostApartmentTitle,
    isSubmittingHostAction,
    visitRequestListings,
  ]);

  const saveVisitChanges = useCallback(async (nextDateInput: string) => {
    const appointmentId = visitToEdit?.metadata?.appointmentId;
    if (!appointmentId || !chatRoomId || !nextDateInput.trim() || Number.isNaN(Date.parse(nextDateInput))) return;
    setIsSavingVisit(true);
    const appointmentDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nextDateInput.trim()) ? `${nextDateInput.trim()}:00` : nextDateInput.trim();
    try {
      await updateVisitAppointment(appointmentId, { appointmentDate, status: "confirmed" });
      await updateLinkedCalendarNotes({ appointmentId, appointmentDate, status: "confirmed" });
      const messageText = `Το ραντεβού επαναπρογραμματίστηκε για τις ${new Date(appointmentDate).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: "system",
        text: messageText,
        type: "visit_rescheduled",
        metadata: { ...visitToEdit.metadata, appointmentId, appointmentDate, status: "confirmed" },
        createdAt: serverTimestamp(),
        isRead: true,
      });
      await setDoc(doc(db, "chats", chatRoomId), { lastMessage: "Αλλαγή Ραντεβού Υπόδειξης", lastMessageType: "visit_rescheduled", lastMessageTimestamp: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
      setVisitToEdit(null);
    } catch {
      setActionModal({ title: t("chat.modals.actionFailedTitle"), description: t("common.messages.tryAgain"), actions: [{ label: t("common.actions.gotIt"), iconName: "alert-circle-outline", onPress: () => setActionModal(null) }] });
    } finally {
      setIsSavingVisit(false);
    }
  }, [chatRoomId, visitToEdit]);

  const cancelVisit = useCallback(async () => {
    const appointmentId = visitToEdit?.metadata?.appointmentId;
    if (!appointmentId || !chatRoomId) return;
    setIsSavingVisit(true);
    try {
      await updateVisitAppointment(appointmentId, { status: "cancelled" });
      await updateLinkedCalendarNotes({ appointmentId, appointmentDate: visitToEdit.metadata?.appointmentDate ?? "", status: "cancelled" });
      const messageText = "Το ραντεβού ακυρώθηκε.";
      await addDoc(collection(db, "chats", chatRoomId, "messages"), { senderId: "system", text: messageText, type: "visit_cancelled", metadata: { ...visitToEdit.metadata, appointmentId, status: "cancelled" }, createdAt: serverTimestamp(), isRead: true });
      await setDoc(doc(db, "chats", chatRoomId), { lastMessage: messageText, lastMessageType: "visit_cancelled", lastMessageTimestamp: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
      setVisitToEdit(null);
    } catch {
      setActionModal({ title: t("chat.modals.actionFailedTitle"), description: t("common.messages.tryAgain"), actions: [{ label: t("common.actions.gotIt"), iconName: "alert-circle-outline", onPress: () => setActionModal(null) }] });
    } finally {
      setIsSavingVisit(false);
    }
  }, [chatRoomId, visitToEdit]);

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

        let appointmentId: string | undefined;
        let appointmentAddress = "";
        if (message.type === "visit_request" && message.requestedDate && message.requestedTime && message.apartmentId) {
          const apartmentSnapshot = await getDoc(doc(db, "apartments", message.apartmentId));
          const apartmentData = apartmentSnapshot.exists() ? apartmentSnapshot.data() as FirestoreApartmentDoc : {};
          appointmentAddress = getPublicApartmentAddress(apartmentData);
          appointmentId = await createVisitAppointment({
            chatRoomId,
            brokerId: currentUserId,
            clientId: message.senderId,
            apartmentId: message.apartmentId,
            apartmentTitle: message.apartmentTitle ?? hostApartmentTitle ?? "Διαμέρισμα",
            apartmentAddress: appointmentAddress,
            appointmentDate: `${message.requestedDate}T${message.requestedTime}:00`,
          });
          await saveShowingCalendarNotes({
            brokerId: currentUserId,
            clientId: message.senderId,
            clientName: displayName,
            apartmentId: message.apartmentId,
            apartmentTitle: message.apartmentTitle ?? hostApartmentTitle ?? "Διαμέρισμα",
            apartmentPrice: message.apartmentPrice,
            scheduledDate: message.requestedDate,
            scheduledTime: message.requestedTime,
            appointmentId,
          });
        }

        const confirmationText =
          message.type === "price_proposal"
            ? "Ο αγγελιοδότης επιβεβαίωσε την πρόταση τιμής!"
            : "Ο αγγελιοδότης επιβεβαίωσε το αίτημα επίσκεψης!";

        await addDoc(collection(db, "chats", chatRoomId, "messages"), {
          senderId: "system",
          text: confirmationText,
          type: message.type === "visit_request" ? "visit_confirmed" : "system_notice",
          ...(appointmentId ? {
            metadata: {
              appointmentId,
              apartmentId: message.apartmentId,
              apartmentTitle: message.apartmentTitle ?? hostApartmentTitle ?? "Διαμέρισμα",
              apartmentAddress: appointmentAddress,
              appointmentDate: `${message.requestedDate}T${message.requestedTime}:00`,
              status: "confirmed",
            },
          } : {}),
          createdAt: serverTimestamp(),
          isRead: true,
        });

        const chatRef = doc(db, "chats", chatRoomId);
        await setDoc(
          chatRef,
          {
            lastMessage: message.type === "visit_request" ? `Επιβεβαιωμένη Υπόδειξη: ${formatRequestDate(message.requestedDate ?? "")}` : confirmationText,
            lastMessageType: message.type === "visit_request" ? "visit_confirmed" : "system_notice",
            lastMessageTimestamp: Date.now(),
            updatedAt: Date.now(),
            deletedUsers: { [counterpartId]: false },
          },
          { merge: true },
        );
        await updateDoc(
          chatRef,
          new FieldPath(`deletedUsers.${counterpartId}`),
          deleteField(),
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
    [chatRoomId, counterpartId, currentUserId, displayName, hostApartmentId, hostApartmentTitle, isCurrentUserHost],
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
  }, []);

  const handleDeleteChatForCurrentUser = useCallback(async () => {
    if (!currentUserId || !chatRoomId) return;

    const now = Date.now();
    try {
      const chatRef = doc(db, "chats", chatRoomId);
      await setDoc(
        chatRef,
        {
          clearedAt: { [currentUserId]: now },
          deletedUsers: { [currentUserId]: true },
          updatedAt: now,
        },
        { merge: true },
      );
      await updateDoc(
        chatRef,
        new FieldPath(`clearedAt.${currentUserId}`),
        deleteField(),
        new FieldPath(`deletedUsers.${currentUserId}`),
        deleteField(),
      );
      void cleanupObsoleteChatMessages(chatRoomId);
      router.back();
    } catch (error) {
      console.error("[Chat] Failed to clear chat:", error);
    }
  }, [chatRoomId, currentUserId, router]);

  const handleBlockFlow = useCallback(
    async (withReport: boolean, reason = "") => {
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
            reportReasonText: reason,
            chatRoomId,
          });
        }

        setShowBlockModal(false);

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
    [chatRoomId, counterpartId, currentUserId, displayName, isSubmittingBlockAction],
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
        {chatType === "host" && !isBrokerOwnerChat && !isBrokerClientChat && (hostApartment || hostApartmentId || apartmentLocked) ? (
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
                setSelectedInquiryProperty(hostApartment);
                setShowPriceProposalModal(true);
              }}
              testID="chat-host-action-price-proposal"
            >
              <Text style={styles.hostActionMenuText}>Πρότεινε τιμή</Text>
            </Pressable>
            <Pressable
              style={styles.hostActionMenuItem}
              onPress={() => openVisitRequestModal()}
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
                {showRoommateHeaderDetails ? displayUniversity : headerSubInfo}
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
        </View>
        {(isBrokerOwnerChat || isBrokerClientChat || isRoommateChat) ? (
          <View style={styles.headerSecondaryActions}>
            {isBrokerOwnerChat || isBrokerClientChat ? (
              <Pressable
                style={[styles.headerSecondaryAction, showAssignedPropertiesDropdown && styles.headerSecondaryActionActive]}
                onPress={() => {
                  setShowContextMenu(false);
                  setIsFilterHistoryActive(false);
                  setShowAssignedPropertiesDropdown((previous) => !previous);
                }}
                testID="chat-assigned-properties-toggle"
              >
                <Ionicons name="business-outline" size={15} color={showAssignedPropertiesDropdown ? colors.brand : colors.onSurfaceTertiary} />
                <Text style={[styles.headerSecondaryActionText, showAssignedPropertiesDropdown && styles.headerSecondaryActionTextActive]}>Ακίνητα</Text>
              </Pressable>
            ) : null}
            {isBrokerClientChat ? (
              <Pressable
                style={[styles.headerSecondaryAction, isFilterHistoryActive && styles.headerSecondaryActionActive]}
                onPress={() => {
                  setShowContextMenu(false);
                  setShowAssignedPropertiesDropdown(false);
                  setIsFilterHistoryActive((previous) => !previous);
                }}
                testID="chat-filter-history-toggle"
              >
                <Ionicons name="time-outline" size={15} color={isFilterHistoryActive ? colors.brand : colors.onSurfaceTertiary} />
                <Text style={[styles.headerSecondaryActionText, isFilterHistoryActive && styles.headerSecondaryActionTextActive]}>Ιστορικό</Text>
              </Pressable>
            ) : null}
            {isRoommateChat ? (
              <Pressable
                style={[styles.headerSecondaryAction, showMutualLikes && styles.headerSecondaryActionActive]}
                onPress={() => {
                  setShowContextMenu(false);
                  setShowMutualLikes((prev) => !prev);
                }}
                testID="chat-mutual-likes-toggle"
              >
                <Ionicons name="heart-circle-outline" size={15} color={showMutualLikes ? colors.brand : colors.onSurfaceTertiary} />
                <Text style={[styles.headerSecondaryActionText, showMutualLikes && styles.headerSecondaryActionTextActive]}>Αμοιβαία</Text>
              </Pressable>
            ) : null}
            {isRoommateChat ? (
              <Pressable
                style={[styles.headerSecondaryAction, roommateContractPickerVisible && styles.headerSecondaryActionActive]}
                onPress={() => setRoommateContractPickerVisible(true)}
                testID="chat-roommate-contract-button"
              >
                <Ionicons name="document-text-outline" size={15} color={roommateContractPickerVisible ? colors.brand : colors.onSurfaceTertiary} />
                <Text style={[styles.headerSecondaryActionText, roommateContractPickerVisible && styles.headerSecondaryActionTextActive]}>Συμβόλαιο</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {chatType === "colleague" && sharedColleagueListings.length > 0 ? (
          <Pressable
            style={styles.colleaguePropertyBanner}
            onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(sharedColleagueListings[0]) } } as never)}
            testID="chat-colleague-shared-property-banner"
          >
            <Ionicons name="business-outline" size={18} color={colors.brand} />
            <Text style={styles.colleaguePropertyBannerText} numberOfLines={1}>
              Κοινό Ακίνητο: {String(sharedColleagueListings[0].title || "Ακίνητο")}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        ) : null}
        {showRoommateHeaderDetails ? <View style={styles.detailRow}>
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
        </View> : null}

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
            {isManualClient ? (
              <Pressable
                style={styles.contextMenuItem}
                onPress={() => {
                  setShowContextMenu(false);
                  setShowAddEmailModal(true);
                }}
                testID="chat-context-add-email"
              >
                <Ionicons color={colors.onSurface} name="mail-outline" size={18} />
                <Text style={styles.contextMenuText}>Προσθήκη email</Text>
              </Pressable>
            ) : null}
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
            {/* ΔΙΟΡΘΩΣΗ: Αν είμαστε εμείς ο blocker, το κουμπί μετατρέπεται σε Ξεμπλοκάρισμα */}
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

      {activePinnedAppointment ? (
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.brandTertiary, borderBottomWidth: 1, borderBottomColor: colors.border }}
          onPress={() => {
            const targetIndex = messages.length - 1 - activePinnedAppointment.index;
            scrollRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });
            setHighlightedMessageId(activePinnedAppointment.message.id);
            setTimeout(() => setHighlightedMessageId(null), 1200);
          }}
          testID="chat-pinned-visit-banner"
        >
          <Ionicons name="calendar-outline" size={19} color={colors.brand} />
          <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface }} numberOfLines={1}>
            {`Επερχόμενη Υπόδειξη: ${new Date(activePinnedAppointment.message.metadata?.appointmentDate ?? "").toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} - ${activePinnedAppointment.message.metadata?.apartmentTitle ?? "Ακίνητο"}`}
          </Text>
          <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surface }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand }}>{activePinnedAppointment.message.metadata?.status === "pending" ? "Εκκρεμές" : "Επιβεβαιωμένο"}</Text>
          </View>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              setVisitToEdit(activePinnedAppointment.message);
            }}
            hitSlop={8}
            testID="chat-pinned-visit-edit"
          >
            <Ionicons name="create-outline" size={20} color={colors.brand} />
          </Pressable>
        </Pressable>
      ) : null}

      {showAssignedPropertiesDropdown && (isBrokerOwnerChat || isBrokerClientChat) ? (
        <>
          <Pressable
            style={styles.propertiesDropdownBackdrop}
            onPress={() => {
              setShowAssignedPropertiesDropdown(false);
              setPropertyActionMenuId(null);
            }}
            testID="chat-assigned-properties-backdrop"
          />
          <View style={[styles.propertiesDropdown, { top: insets.top + 54 }]} testID="chat-assigned-properties-dropdown">
            {isBrokerOwnerChat ? loadingAssignedOwnerProperties ? (
              <View style={styles.emptyDropdownRow}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : assignedOwnerProperties.length === 0 ? (
              <View style={styles.emptyDropdownRow}>
                <Text style={styles.emptyDropdownText}>Δεν υπάρχουν ανατεθειμένα ακίνητα</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {assignedOwnerProperties.map((property) => (
                  <View key={property.id} style={styles.propertyDropdownCard}>
                    <View style={styles.propertyCardRow}>
                      <Pressable
                        style={styles.propertyDropdownRow}
                        onPress={() => {
                          setShowAssignedPropertiesDropdown(false);
                          router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(property) } } as any);
                        }}
                        testID={`chat-assigned-property-${property.id}`}
                      >
                        {property.image ? <Image source={{ uri: property.image }} style={styles.propertyThumb} contentFit="cover" /> : <View style={styles.propertyThumbFallback}><Ionicons name="business-outline" size={18} color={colors.onSurfaceTertiary} /></View>}
                        <View style={styles.propertyTextDetails}>
                          <Text style={styles.propertyDropdownTitle} numberOfLines={1}>{property.title}</Text>
                          <Text style={styles.propertyDropdownPrice}>{property.rent.toLocaleString("el-GR")} €</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.propertyActionTrigger}
                        onPress={() => {
                          setSelectedInquiryProperty(property);
                          setPropertyActionMenuId((current) => current === property.id ? null : property.id);
                        }}
                        testID={`chat-property-actions-${property.id}`}
                        hitSlop={8}
                      >
                        <Text style={styles.propertyActionTriggerText}>Ενέργειες</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    </View>
                    {propertyActionMenuId === property.id ? (
                      <View style={styles.propertyActionMenu}>
                        <Pressable style={styles.propertyActionMenuItem} onPress={() => { setPropertyActionMenuId(null); setShowAssignedPropertiesDropdown(false); setShowPriceProposalModal(true); }} testID={`chat-property-price-proposal-${property.id}`}>
                          <Text style={styles.propertyActionMenuText}>Πρόταση τιμής</Text>
                        </Pressable>
                        <Pressable style={styles.propertyActionMenuItem} onPress={() => openVisitRequestModal(property.id)} testID={`chat-property-visit-request-${property.id}`}>
                          <Text style={styles.propertyActionMenuText}>Αίτημα επίσκεψης</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            ) : loadingClientInteractedProperties ? (
              <View style={styles.emptyDropdownRow}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : clientInteractedProperties.length === 0 ? (
              <View style={styles.emptyDropdownRow}>
                <Text style={styles.emptyDropdownText}>Δεν υπάρχουν ακίνητα επικοινωνίας / ενδιαφέροντος</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {clientInteractedProperties.map((property) => (
                  <View key={property.id} style={styles.propertyDropdownCard}>
                    <View style={styles.propertyCardRow}>
                      <Pressable
                        style={styles.clientPropertyDropdownRow}
                        onPress={() => {
                          setShowAssignedPropertiesDropdown(false);
                          router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(property.rawApartmentPayload) } } as any);
                        }}
                        testID={`chat-client-property-${property.id}`}
                      >
                        {property.rawApartmentPayload.image ? <Image source={{ uri: property.rawApartmentPayload.image }} style={styles.propertyThumb} contentFit="cover" /> : <View style={styles.propertyThumbFallback}><Ionicons name="business-outline" size={18} color={colors.onSurfaceTertiary} /></View>}
                        <View style={styles.clientPropertyDropdownMain}>
                          <Text style={styles.propertyDropdownTitle} numberOfLines={1}>{property.title}</Text>
                          <Text style={styles.clientPropertyDropdownSubtitle} numberOfLines={1}>
                            {property.area ? `${property.area} • ` : ""}{property.rent.toLocaleString("el-GR")} €
                          </Text>
                        </View>
                        {property.compatibilityScore > 0 ? (
                          <View style={styles.dropdownMatchBadge}>
                            <Ionicons color={colors.brand} name="sparkles" size={11} />
                            <Text style={styles.dropdownMatchBadgeText}>{`${property.compatibilityScore}% Match`}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                      <Pressable
                        style={styles.propertyActionTrigger}
                        onPress={() => {
                          setSelectedInquiryProperty(property.rawApartmentPayload);
                          setPropertyActionMenuId((current) => current === property.id ? null : property.id);
                        }}
                        testID={`chat-property-actions-${property.id}`}
                        hitSlop={8}
                      >
                        <Text style={styles.propertyActionTriggerText}>Ενέργειες</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    </View>
                    {propertyActionMenuId === property.id ? (
                      <View style={styles.propertyActionMenu}>
                        <Pressable style={styles.propertyActionMenuItem} onPress={() => { setPropertyActionMenuId(null); setShowAssignedPropertiesDropdown(false); setShowPriceProposalModal(true); }} testID={`chat-property-price-proposal-${property.id}`}>
                          <Text style={styles.propertyActionMenuText}>Πρόταση τιμής</Text>
                        </Pressable>
                        <Pressable style={styles.propertyActionMenuItem} onPress={() => openVisitRequestModal(property.id)} testID={`chat-property-visit-request-${property.id}`}>
                          <Text style={styles.propertyActionMenuText}>Αίτημα επίσκεψης</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : null}

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
            <Pressable
              style={styles.floatingBackButtonLeft}
              onPress={() => setActiveViewList(null)}
              hitSlop={8}
              testID="proposal-floating-back-btn"
              accessibilityRole="button"
              accessibilityLabel="Επιστροφή στα μηνύματα"
            >
              <Ionicons color={colors.onSurface} name="arrow-back" size={20} />
            </Pressable>
            <Text numberOfLines={1} style={styles.listFeedBannerTitle}>{activeViewList.listTitle}</Text>
            <Pressable
              style={styles.viewInFeedButton}
              onPress={() => {
                setActiveViewList(null);
                router.push({
                  pathname: "/(tabs)/apartments",
                  params: {
                    activeProposalListId: activeViewList.listId || "custom_list",
                    activeProposalListTitle: activeViewList.listTitle,
                    proposalApartmentIds: JSON.stringify(activeViewList.apartments.map((apartment) => apartment.id)),
                  },
                } as any);
              }}
              testID="proposal-view-in-feed-btn"
              accessibilityRole="button"
              accessibilityLabel="Προβολή στο feed"
            >
              <Ionicons name="open-outline" size={16} color={colors.onBrand} />
              <Text style={styles.viewInFeedButtonText}>Προβολή στο feed</Text>
            </Pressable>
          </View>
          {loadingListFeed ? (
            <View style={styles.mutualLikesLoadingWrap}><ActivityIndicator size="large" color={colors.brand} /></View>
          ) : (
            <ScrollView style={styles.flex} contentContainerStyle={styles.mutualLikesScroll} showsVerticalScrollIndicator={false}>
              {activeViewList.apartments.length === 0 ? (
                <View style={styles.mutualEmptyCard}><Text style={styles.mutualEmptyTitle}>Δεν βρέθηκαν ακίνητα στη λίστα</Text></View>
              ) : sortedProposalApartments.map((apartment) => {
                const feedback = proposalFeedbackMap[apartment.id];
                const isRejected = feedback?.status === "rejected";
                return (
                  <View key={apartment.id} style={styles.proposalCardWrapper}>
                    <MutualApartmentCard
                      apartment={apartment}
                      colors={colors}
                      styles={styles}
                      isLiked={currentUserLikedIds.has(apartment.id)}
                      showMatchScore={showChatMatchScore}
                      compatibilityScore={getChatApartmentCompatibilityScore(apartment, latestSharedFilterVersion)}
                      onToggleLike={() => handleToggleApartmentLike(apartment.id)}
                      onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as any)}
                      proposalFeedback={feedback}
                      proposalMode
                      onRejectProposal={() => handleRejectProposalApartment(apartment.id)}
                      onAcceptProposal={() => void handleAcceptProposalApartment(apartment)}
                    />
                    {isRejected ? (
                      <View style={styles.rejectionFeedbackBox}>
                        <Text style={styles.rejectionFeedbackTitle}>
                          {feedback.reason ? "Αιτιολογία Απόρριψης:" : "Αιτιολογήστε την απόρριψη του ακινήτου:"}
                        </Text>
                        {feedback.reason ? (
                          <Text style={styles.rejectionFeedbackSavedText}>{feedback.reason}</Text>
                        ) : (
                          <View style={styles.rejectionInputRow}>
                            <TextInput
                              value={rejectionDrafts[apartment.id] || ""}
                              onChangeText={(textValue) => setRejectionDrafts((previous) => ({ ...previous, [apartment.id]: textValue }))}
                              placeholder="π.χ. Πολύ ακριβό, μακριά από τη σχολή..."
                              placeholderTextColor={colors.onSurfaceTertiary}
                              style={[styles.rejectionTextInput, !isNoteBodyValid(rejectionDrafts[apartment.id] || "") && styles.rejectionTextInputError]}
                              maxLength={MAX_NOTE_BODY_CHARS}
                            />
                            <Text style={[styles.rejectionCounterText, getWordCount(rejectionDrafts[apartment.id] || "") >= MAX_NOTE_BODY_WORDS * 0.9 && styles.rejectionCounterTextWarning]}>{`${getWordCount(rejectionDrafts[apartment.id] || "")}/${MAX_NOTE_BODY_WORDS} λέξεις`}</Text>
                            <Pressable
                              style={[styles.rejectionSubmitBtn, !rejectionDrafts[apartment.id]?.trim() && styles.rejectionSubmitBtnDisabled]}
                              disabled={!rejectionDrafts[apartment.id]?.trim() || !isNoteBodyValid(rejectionDrafts[apartment.id] || "") || submittingFeedbackAptId === apartment.id}
                              onPress={() => void handleSubmitRejectionReason(apartment)}
                              testID={`proposal-rejection-submit-${apartment.id}`}
                            >
                              {submittingFeedbackAptId === apartment.id ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Ionicons color={colors.onBrand} name="checkmark" size={18} />}
                            </Pressable>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : isFilterHistoryActive && isBrokerClientChat ? (
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
                  isLiked={currentUserLikedIds.has(apartment.id)}
                  showMatchScore={showChatMatchScore}
                  compatibilityScore={getChatApartmentCompatibilityScore(apartment, latestSharedFilterVersion)}
                  onToggleLike={() => handleToggleApartmentLike(apartment.id)}
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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
        >
          {isBrokerClientChat && !auth.isBroker && !hasSharedSearchHistory && !searchSharingPromptShown ? (
            <View style={styles.searchHistoryShareBanner} testID="chat-search-history-share-banner">
              <View style={styles.searchHistoryShareTextWrap}>
                <Text style={styles.searchHistoryShareTitle}>Θέλετε πιο στοχευμένες προτάσεις;</Text>
                <Text style={styles.searchHistoryShareDescription}>Μοιραστείτε το ιστορικό των αναζητήσεών σας με τον μεσίτη.</Text>
              </View>
              <Pressable style={styles.searchHistoryShareButton} onPress={() => setSearchHistoryPickerVisible(true)} testID="chat-open-search-history-picker">
                <Ionicons name="search-outline" size={16} color={colors.onBrand} />
                <Text style={styles.searchHistoryShareButtonText}>Επιλογή &amp; Διαμοιρασμός</Text>
              </Pressable>
              <Pressable style={styles.searchHistoryShareDismiss} onPress={markSearchSharingPromptShown} hitSlop={8} testID="chat-dismiss-search-history-banner">
                <Ionicons name="close" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          ) : null}
          {!messagesLoaded || !chatMetadataLoaded ? (
            <ChatMessagesSkeleton style={styles.flex} testID="chat-messages-skeleton" />
          ) : (
            <FlatList
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={styles.invertedMessagesContainer}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              inverted
              data={invertedMessages}
              keyExtractor={(item) => item.id}
              onEndReached={handleLoadOlderMessages}
              onEndReachedThreshold={0.2}
              ListFooterComponent={
                isLoadingOlderMessages ? (
                  <View style={styles.topLoadingContainer} testID="chat-loading-older-messages">
                    <ActivityIndicator color={colors.brand} size="small" />
                  </View>
                ) : null
              }
              renderItem={({ item: m, index }) => {
                // invertedMessages is newest-first; map back to the chronological index for grouping.
                const idx = messages.length - 1 - index;
                const groupInfo = getMessageGroupInfo(messages, idx, currentUserId || "");
                const isMine = m.senderId === currentUserId;
                const canDeleteForEveryone = isMine && !m.id.startsWith("temp-");
                const lastMsgIsDifferentSender = idx > 0 && messages[idx - 1].senderId !== m.senderId;
                const apartmentData = m.apartmentData;
                const apartmentCoverImage = getApartmentCoverImage(apartmentData);

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

                return (
                  <View style={m.id === highlightedMessageId ? { backgroundColor: `${colors.brand}22`, borderRadius: radius.md } : undefined}>
                    <ChatMessageItem
                      message={m}
                    styles={styles}
                    colors={colors}
                    isMine={isMine}
                    itemMarginStyle={itemMarginStyle}
                    borderRadii={borderRadii}
                    isHostChat={chatType === "host"}
                    isCurrentUserHost={isCurrentUserHost}
                    canDeleteForEveryone={canDeleteForEveryone}
                    apartmentCoverImage={apartmentCoverImage}
                    statusLabel={getStatusLabel(m.status)}
                    formatRequestDate={formatRequestDate}
                    onApartmentPress={() => {
                      router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartmentData) } });
                    }}
                    onFilterSetPress={() => setSelectedFilterSetMessage(m)}
                    onPropertyListPress={() => void handleOpenPropertyList(m)}
                    onDeletePress={() => setMessageActionTarget(m)}
                    onApprove={() => void approveHostActionMessage(m)}
                    showMatchScore={showChatMatchScore}
                      compatibilityScore={apartmentData ? getChatApartmentCompatibilityScore(apartmentData, latestSharedFilterVersion) : 0}
                      onVisitEdit={() => setVisitToEdit(m)}
                      onSharedProfilePress={() => {
                        if (m.metadata?.sharedProfile) {
                          setSelectedSharedProfile(m.metadata.sharedProfile);
                          setSharedProfileVisible(true);
                        }
                      }}
                      onContractPress={() => {
                        if (!m.contractId) return;
                        setRoommateContractDraft(null);
                        setRoommateExistingContractId(m.contractId);
                      }}
                    />
                  </View>
                );
              }}
            />
          )}

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
              placeholder={inputPlaceholder}
              placeholderTextColor={colors.onSurfaceTertiary}
              multiline
              numberOfLines={1}
              testID="chat-input"
              onSubmitEditing={send}
              editable={!inputBlocked}
            />
            <VoiceInputButton
              onTextAppend={(spokenText) => setText((current) => current.trim() ? `${current.trim()} ${spokenText}` : spokenText)}
              color={colors.onSurfaceTertiary}
              disabled={inputBlocked}
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

      <PriceProposalModal
        visible={showPriceProposalModal}
        isSubmitting={isSubmittingHostAction}
        minRecommendedPrice={minRecommendedPrice}
        hostDiscountPercentage={hostDiscountPercentage}
        onClose={() => {
          setShowPriceProposalModal(false);
          setSelectedInquiryProperty(null);
        }}
        onSubmit={(price) => void submitPriceProposal(price)}
      />

      <FilterSetVersionModal
        visible={!!selectedFilterSetRecord}
        filterSet={selectedFilterSetRecord}
        onClose={() => setSelectedFilterSetRecord(null)}
        onUpdated={setSelectedFilterSetRecord}
      />

      <SearchHistoryPickerModal
        visible={searchHistoryPickerVisible}
        userId={currentUserId}
        onClose={() => setSearchHistoryPickerVisible(false)}
        onConfirm={(selection) => void handleShareSearchHistory(selection)}
      />

      <RoommateContractPickerModal
        visible={roommateContractPickerVisible}
        onClose={() => setRoommateContractPickerVisible(false)}
        onSelect={startRoommateContract}
      />

      <SignContractModal
        visible={roommateContractDraft !== null || roommateExistingContractId !== null}
        draft={roommateContractDraft ?? undefined}
        contractId={roommateExistingContractId ?? undefined}
        signerId={currentUserId ?? ""}
        onCreated={handleRoommateContractCreated}
        onClose={() => {
          setRoommateContractDraft(null);
          setRoommateExistingContractId(null);
        }}
      />

      <VisitRequestModal
        visible={showVisitRequestModal}
        isSubmitting={isSubmittingHostAction}
        brokerId={auth.isBroker ? currentUserId ?? "" : counterpartId}
        listings={visitRequestListings}
        onClose={() => {
          setShowVisitRequestModal(false);
          setVisitRequestApartmentId(null);
          setSelectedInquiryProperty(null);
        }}
        onSubmit={(date, time, apartmentId) => void submitVisitRequest(date, time, apartmentId)}
      />

      <EditVisitModal
        visible={visitToEdit !== null}
        appointmentDate={visitToEdit?.metadata?.appointmentDate}
        isSaving={isSavingVisit}
        onClose={() => setVisitToEdit(null)}
        onSave={(date) => void saveVisitChanges(date)}
        onCancelAppointment={() => void cancelVisit()}
      />

      <SendAddressModal
        visible={addressDisclosure !== null}
        exactAddress={addressDisclosure?.exactAddress ?? ""}
        latitude={addressDisclosure?.latitude}
        longitude={addressDisclosure?.longitude}
        isSending={isSendingAddress}
        onClose={() => setAddressDisclosure(null)}
        onShare={() => void shareExactAddress()}
      />

      <BlockUserModal
        visible={showBlockModal}
        isSubmitting={isSubmittingBlockAction}
        onClose={() => setShowBlockModal(false)}
        onBlockOnly={() => void handleBlockFlow(false)}
        onBlockAndReport={(reason) => void handleBlockFlow(true, reason)}
      />

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

      <ChatUserProfileSheet
        visible={profileModalVisible}
        profile={activeProfile}
        details={counterpartDetails}
        compatibilityScore={compatibilityScore}
        displayName={displayName}
        displayAbout={displayAbout}
        showAvatar={showAvatarImage}
        socialLinks={shouldShowSocialLinks ? socialLinks : []}
        canShare={showRoommateHeaderDetails && !counterpartDetails?.preferences?.hideNameInDeck && !counterpartDetails?.preferences?.hideInStack}
        onShare={() => setShareTargetVisible(true)}
        onClose={() => setProfileModalVisible(false)}
      />

      <SelectShareTargetModal
        visible={shareTargetVisible}
        currentUserId={currentUserId ?? ""}
        profile={{
          sharedUserId: counterpartId,
          sharedUserData: {
            fullName: displayName,
            ...(activeProfile.photo ? { avatarUrl: activeProfile.photo } : {}),
            ...(counterpartDetails?.photos?.length ? { photos: counterpartDetails.photos } : {}),
            ...(activeProfile.age ? { age: activeProfile.age } : {}),
            ...(activeProfile.budget ? { budget: activeProfile.budget } : {}),
            ...(activeProfile.gender ? { gender: activeProfile.gender } : {}),
            ...(activeProfile.university ? { university: activeProfile.university } : {}),
            ...(activeProfile.program ? { program: activeProfile.program } : {}),
            ...(compatibilityScore != null ? { compatibilityScore } : {}),
            ...(Object.keys(sharedProfileQuizAnswers).length > 0 ? { compatibilityQuizAnswers: sharedProfileQuizAnswers } : {}),
            ...(displayAbout ? { bio: displayAbout } : {}),
            ...(counterpartDetails?.userHardCriteria ? { hardCriteria: { required: counterpartDetails.userHardCriteria } } : {}),
          },
        }}
        onClose={() => setShareTargetVisible(false)}
        onSent={() => setShareTargetVisible(false)}
      />

      <RoommateDeckDetailModal visible={sharedProfileVisible} profile={selectedSharedProfile} onClose={() => setSharedProfileVisible(false)} />

      <FilterSetDetailsModal
        visible={!!selectedFilterSetMessage}
        filterSetData={selectedFilterSetMessage?.filterSetData ?? null}
        canApply={!!auth.isBroker && selectedFilterSetMessage?.senderId !== currentUserId}
        onClose={() => setSelectedFilterSetMessage(null)}
        onApply={() => {
          const filterSetData = selectedFilterSetMessage?.filterSetData;
          setSelectedFilterSetMessage(null);
          if (filterSetData) {
            router.push({ pathname: "/(tabs)/apartments", params: { importedFilters: JSON.stringify(filterSetData) } } as never);
          }
        }}
      />

      <AssignClientEmailModal
        visible={showAddEmailModal}
        brokerId={currentUserId ?? ""}
        clientUserId={counterpartId}
        onClose={() => setShowAddEmailModal(false)}
        onSaved={(email) => setCounterpartDetails((previous) => previous ? { ...previous, email, pendingClaimEmail: email } : previous)}
      />

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
  headerSecondaryActions: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerSecondaryAction: {
    flex: 1,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerSecondaryActionActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  headerSecondaryActionText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  headerSecondaryActionTextActive: { color: colors.brand },
  colleaguePropertyBanner: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  colleaguePropertyBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
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
  propertiesDropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  propertiesDropdown: {
    position: "absolute",
    right: spacing.md,
    width: 260,
    maxHeight: 240,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    zIndex: 9999,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  propertyDropdownRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  propertyDropdownCard: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  propertyCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  propertyTextDetails: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  propertyThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  propertyThumbFallback: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  propertyActionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  propertyActionTriggerText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.xs,
    color: colors.onSurfaceTertiary,
  },
  propertyActionMenu: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  propertyActionMenuItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  propertyActionMenuText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.xs,
    color: colors.onSurface,
  },
  propertyDropdownTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  propertyDropdownPrice: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  clientPropertyDropdownRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  clientPropertyDropdownMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  clientPropertyDropdownSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.onSurfaceTertiary,
  },
  dropdownMatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  dropdownMatchBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brand,
  },
  emptyDropdownRow: {
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyDropdownText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
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
  rejectedCardDimmed: { opacity: 0.5 },
  proposalCardWrapper: { gap: spacing.xs, marginBottom: spacing.md },
  proposalCardActionsRow: { position: "absolute", right: spacing.md, bottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.xs, zIndex: 10 },
  proposalActionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, backgroundColor: "rgba(255,255,255,0.92)", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  proposalRejectBtn: { borderColor: "#EF4444" },
  proposalRejectBtnActive: { backgroundColor: "#EF4444" },
  proposalAcceptBtn: { borderColor: "#10B981" },
  proposalAcceptBtnActive: { backgroundColor: "#10B981" },
  rejectionFeedbackBox: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  rejectionFeedbackTitle: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  rejectionInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rejectionTextInput: { flex: 1, height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
  rejectionTextInputError: { borderWidth: 1, borderColor: "#EF4444" },
  rejectionCounterText: { alignSelf: "flex-end", fontFamily: fonts.regular, fontSize: 11, color: colors.onSurfaceTertiary },
  rejectionCounterTextWarning: { color: "#F59E0B" },
  rejectionSubmitBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  rejectionSubmitBtnDisabled: { opacity: 0.45 },
  rejectionFeedbackSavedText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface, fontStyle: "italic" },
  photo: { ...StyleSheet.absoluteFillObject },
  topRightBadgesContainer: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    alignItems: "flex-end",
    gap: 6,
    zIndex: 3,
  },
  rentBadge: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  rentText: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onBrand },
  rentMo: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand, paddingBottom: 2 },
  matchScoreCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(26, 26, 26, 0.88)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignSelf: "flex-end",
  },
  matchScoreIcon: { marginRight: 1 },
  matchScoreCardText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xs,
    fontWeight: "800",
    includeFontPadding: false,
  },
  cardBody: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  loc: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  stat: { fontFamily: fonts.regular, fontSize: fontSize.base, color: "rgba(255,255,255,0.9)" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tagText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceInverse,
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
  searchHistoryShareBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
    gap: spacing.xs,
  },
  searchHistoryShareTextWrap: { gap: 2, paddingRight: spacing.lg },
  searchHistoryShareTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  searchHistoryShareDescription: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  searchHistoryShareButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brand },
  searchHistoryShareButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  searchHistoryShareDismiss: { position: "absolute", top: spacing.xs, right: spacing.xs, padding: 2 },
  invertedMessagesContainer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 0 },
  topLoadingContainer: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
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
    borderWidth: 1,
    gap: spacing.xs,
  },
  sharedListMessageCardTheirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  sharedListMessageCardMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderColor: colors.brand },
  sharedListHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sharedListTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  sharedListTitleMine: { color: colors.onBrand },
  sharedListCountText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  sharedListCountTextMine: { color: "rgba(255,255,255,0.82)" },
  sharedListActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sharedListActionRowMine: { borderTopColor: "rgba(255,255,255,0.35)" },
  sharedListViewBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  sharedListViewBtnTextMine: { color: colors.onBrand },
  contractMessageCard: {
    maxWidth: "90%",
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  contractMessageCardTheirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  contractMessageCardMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderColor: colors.brand },
  contractMessageCopy: { flex: 1, gap: 2 },
  contractMessageTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  contractMessageTitleMine: { color: colors.onBrand },
  contractMessageSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  contractMessageSubtitleMine: { color: "rgba(255,255,255,0.82)" },
  listFeedHeaderBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  listFeedBannerTitle: { flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface, textAlign: "left" },
  floatingBackButtonLeft: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  viewInFeedButton: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.sm },
  viewInFeedButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand, includeFontPadding: false },
  filterHistoryList: { padding: spacing.lg, gap: spacing.sm },
  filterHistoryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: spacing.xs },
  filterHistoryCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterHistoryCardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  filterHistoryVersion: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
  filterHistoryDate: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  filterHistorySummary: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
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
    alignSelf: "center",
    alignItems: "center",
  },
  hostActionCardWrapTheirs: {
    alignSelf: "flex-start",
  },
  hostActionCardWrapMine: {
    alignSelf: "flex-end",
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
});

export default function ChatScreenRoute() {
  const auth = useAuth();
  const { id, chatRoomId: chatRoomIdParam } = useLocalSearchParams<{ id?: string; chatRoomId?: string }>();
  const chatRoomId = typeof chatRoomIdParam === "string" && chatRoomIdParam.trim() ? chatRoomIdParam : typeof id === "string" ? id : "";
  const [groupMetadata, setGroupMetadata] = useState<GroupChatMetadata | null>(null);

  useEffect(() => {
    if (!chatRoomId) return;
    return onSnapshot(doc(db, "chats", chatRoomId), (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() as { type?: string; groupMetadata?: GroupChatMetadata; users?: string[]; groupName?: string; hostApartmentId?: string; createdBy?: string } : null;
      if (!data || data.type !== "roommate_group") {
        setGroupMetadata(null);
        return;
      }
      const memberIds = data.groupMetadata?.memberIds ?? data.users ?? [];
      setGroupMetadata({
        isGroup: true,
        groupName: data.groupMetadata?.groupName ?? data.groupName ?? "Ομαδική",
        memberIds,
        createdBy: data.groupMetadata?.createdBy ?? data.createdBy ?? memberIds[0] ?? "",
        ...(data.groupMetadata?.hostUserId ? { hostUserId: data.groupMetadata.hostUserId } : {}),
        ...(data.groupMetadata?.hostApartmentId ?? data.hostApartmentId ? { hostApartmentId: data.groupMetadata?.hostApartmentId ?? data.hostApartmentId } : {}),
      });
    });
  }, [chatRoomId]);

  if (groupMetadata && auth.userId) {
    return <GroupChatScreen chatRoomId={chatRoomId} currentUserId={auth.userId} metadata={groupMetadata} />;
  }
  return <DirectChatScreen />;
}
