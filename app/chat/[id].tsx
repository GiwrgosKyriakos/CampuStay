import { sendPushNotification } from '@/src/utils/notificationService'; // Προσάρμοσε το path ανάλογα με το φάκελό σου
import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
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

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { Gender, RoommateProfile } from "@/src/data/profiles";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, arrayUnion } from "firebase/firestore";
import { markIncomingMessagesAsRead } from "@/src/api/chat";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal, { type CenteredModalAction } from "@/src/components/CenteredActionModal";
import { getUserSettings, saveUserPrivacy } from "@/src/api/accountSettings";
import { submitReportedUserEntry } from "@/src/services/reportedUsers";
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
  type?: "roommate" | "host" | string;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentUnavailable?: boolean;
  status?: "pending" | "active" | "rejected";
  deletedUsers?: Record<string, boolean>;
  participantDisplayNames?: Record<string, string>;
  mutedByUsers?: Record<string, boolean>;
}

interface FirestoreApartmentDoc {
  title?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  tags?: string[];
  amenities?: string[];
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

function buildApartmentRoutePayload(apartmentId: string, data: FirestoreApartmentDoc, fallbackTitle?: string) {
  const amenities = Array.isArray(data.amenities) ? data.amenities : [];
  const tags = Array.isArray(data.tags) ? data.tags : amenities;

  return {
    id: apartmentId,
    title: data.title?.trim() || fallbackTitle || t("apartments.unknownListing"),
    area: data.area?.trim() || t("apartments.unknownArea"),
    city: data.city?.trim() || t("apartments.unknownCity"),
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

export default function ChatScreen() {
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
  const [chatType, setChatType] = useState<"roommate" | "host">("roommate");
  const [hostApartmentId, setHostApartmentId] = useState<string | null>(null);
  const [hostApartmentTitle, setHostApartmentTitle] = useState<string | null>(null);
  const [hostApartment, setHostApartment] = useState<ReturnType<typeof buildApartmentRoutePayload> | null>(null);
  const [isApartmentUnavailable, setIsApartmentUnavailable] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [expandReport, setExpandReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingBlockAction, setIsSubmittingBlockAction] = useState(false);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description?: string;
    actions: CenteredModalAction[];
  } | null>(null);

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
        setChatType("roommate");
        setHostApartmentId(null);
        setHostApartmentTitle(null);
        setIsApartmentUnavailable(false);
        return;
      }
      const data = snapshot.data() as FirestoreChatDoc;
      setChatStatus(data.status === "pending" ? "pending" : data.status === "rejected" ? "rejected" : "active");
      setChatType(data.type === "host" ? "host" : "roommate");
      setHostApartmentId(typeof data.apartmentId === "string" && data.apartmentId.trim().length > 0 ? data.apartmentId : null);
      setHostApartmentTitle(typeof data.apartmentTitle === "string" && data.apartmentTitle.trim().length > 0 ? data.apartmentTitle : null);
      setIsApartmentUnavailable(!!data.apartmentUnavailable);
      setIsChatMuted(!!data.mutedByUsers?.[currentUserId]);
    });

    const q = query(
      collection(db, "chats", chatRoomId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const fetched: Message[] = snapshot.docs.map((doc) => {
        const data = doc.data() as FirestoreMessageDoc;
        return {
          id: doc.id,
          text: data.text ?? "",
          senderId: data.senderId ?? "",
          createdAt: data.createdAt ?? 0,
          isRead: data.isRead ?? true,
        };
      });
      setMessages((prev) => {
        const optimisticPending = prev.filter((m) => m.id.startsWith("temp-") && m.senderId === currentUserId);
        const unresolved = optimisticPending.filter(
          (temp) => !fetched.some((serverMsg) => serverMsg.senderId === temp.senderId && serverMsg.text === temp.text),
        );
        return sortMessages([...fetched, ...unresolved]);
      });
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    });
    return () => {
      unsub();
      unsubChat();
    };
  }, [chatRoomId, currentUserId, sortMessages]);

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
          title: t("chat.unavailable"),
          area: t("apartments.unknownArea"),
          city: t("apartments.unknownCity"),
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
        const [currentSnap, counterpartSnap, currentQuizSnap, counterpartQuizSnap] = await Promise.all([
          getDoc(doc(db, "users", currentUserId)),
          getDoc(doc(db, "users", counterpartId)),
          getDoc(doc(db, "quiz_answers", currentUserId)),
          getDoc(doc(db, "quiz_answers", counterpartId)),
        ]);

        if (!active || !currentSnap.exists() || !counterpartSnap.exists()) {
          if (active) setCompatibilityScore(null);
          return;
        }

        const currentData = currentSnap.data() as FirestoreUserDoc;
        const counterpartData = counterpartSnap.data() as FirestoreUserDoc;
        const currentQuiz = (currentQuizSnap.exists() ? (currentQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {};
        const counterpartQuiz = (counterpartQuizSnap.exists() ? (counterpartQuizSnap.data() as FirestoreQuizDoc).answers : {}) ?? {};

        const currentProfileForScore: MatchUserProfile = {
          uid: currentUserId,
          city: (currentData.city ?? "").trim(),
          gender: normalizeGenderForMatch(currentData.gender),
          monthlyBudget:
            typeof currentData.budget === "number"
              ? currentData.budget
              : typeof currentData.maxBudget === "number"
                ? currentData.maxBudget
                : 0,
          quiz: toCompatibilityQuiz(currentQuiz),
        };

        const counterpartProfileForScore: MatchUserProfile = {
          uid: counterpartId,
          city: (counterpartData.city ?? "").trim(),
          gender: normalizeGenderForMatch(counterpartData.gender),
          monthlyBudget:
            typeof counterpartData.budget === "number"
              ? counterpartData.budget
              : typeof counterpartData.maxBudget === "number"
                ? counterpartData.maxBudget
                : 0,
          quiz: toCompatibilityQuiz(counterpartQuiz),
        };

        const score = calculateMatchScore(currentProfileForScore, counterpartProfileForScore);
        if (active) {
          setCompatibilityScore(score);
        }
      } catch {
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
  const displayName = deletedCounterpart ? t("common.account.deleted") : activeProfile.name;
  const displayUniversity = deletedCounterpart ? "" : activeProfile.university;
  const displayGender = deletedCounterpart ? t("common.values.notApplicable") : activeProfile.gender;
  const displayAge = deletedCounterpart ? t("common.values.emptyDash") : `${activeProfile.age} ${t("common.format.yearsSuffix")}`;
  const displayBudget = deletedCounterpart ? t("common.values.emptyDash") : `${CURRENCY}${activeProfile.budget}${t("common.format.perMonthShort")}`;
  const displayCity = deletedCounterpart
    ? t("common.values.notApplicable")
    : counterpartDetails?.city?.trim() || t("common.values.notAvailable");
  const displayAbout = deletedCounterpart
    ? t("chat.placeholderDeleted")
    : counterpartDetails?.about?.trim() || counterpartDetails?.bio?.trim() || t("common.values.notAvailable");
  const showAvatarImage = !deletedCounterpart && !!activeProfile.photo?.trim();
  const apartmentLocked = chatType === "host" && isApartmentUnavailable;
  const inputBlocked = chatStatus === "pending" || chatStatus === "rejected" || deletedCounterpart || apartmentLocked;
  const shouldShowSocialLinks = !deletedCounterpart && !!counterpartDetails?.looking_for_apartment;
  const apartmentPillTitle = apartmentLocked ? t("chat.unavailable") : hostApartment?.title || hostApartmentTitle || t("chat.unavailable");

  const handleApartmentPillPress = () => {
    if (!hostApartment || apartmentLocked) return;
    router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(hostApartment) } });
  };

  const handleMuteConversation = useCallback(async () => {
    if (!currentUserId || !chatRoomId || isMuting) return;

    setShowContextMenu(false);
    setIsMuting(true);
    const nextMutedState = !isChatMuted;

    try {
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
  }, [chatRoomId, currentUserId, isChatMuted, isMuting]);

  const handleOpenBlockModal = useCallback(() => {
    setShowContextMenu(false);
    setShowBlockModal(true);
    setExpandReport(false);
    setReportReason("");
  }, []);

  const handleDeleteRejectedChat = useCallback(async () => {
    if (!currentUserId || !chatRoomId) return;

    try {
      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          deletedBy: arrayUnion(currentUserId),
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

        if (chatRoomId) {
          await setDoc(
            doc(db, "chats", chatRoomId),
            {
              blockedByUsers: {
                [currentUserId]: true,
              },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

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
            style={styles.apartmentPill}
            onPress={handleApartmentPillPress}
            disabled={apartmentLocked}
            testID="chat-apartment-pill"
          >
            <Text style={styles.apartmentPillText} numberOfLines={1}>
              {apartmentPillTitle}
            </Text>
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
            disabled={deletedCounterpart}
            testID="chat-header-profile-trigger"
          >
            {showAvatarImage ? (
              <Image source={{ uri: activeProfile.photo }} style={styles.headerAvatar} contentFit="cover" />
            ) : (
              <DefaultProfileAvatar size={44} iconSize={22} testID="chat-header-avatar-fallback" />
            )}
            <View style={styles.headerTextWrap}>
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
              <Ionicons name={isChatMuted ? "notifications-outline" : "notifications-off-outline"} size={18} color={colors.onSurface} />
              <Text style={styles.contextMenuText}>
                {isChatMuted ? t("chat.menu.unmuteNotifications") : t("chat.menu.muteNotifications")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.contextMenuItem}
              onPress={handleOpenBlockModal}
              testID="chat-context-block"
            >
              <Ionicons name="hand-left-outline" size={18} color={colors.error} />
              <Text style={[styles.contextMenuText, styles.contextMenuDangerText]}>{t("chat.menu.block")}</Text>
            </Pressable>
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
            const lastMsgIsDifferentSender = idx > 0 && messages[idx - 1].senderId !== m.senderId;

            let borderRadii = {};
            if (isMine) {
              // Sent messages (right side)
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
              // Received messages (left side)
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
              <View
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
                testID={`chat-message-${m.id}`}
              >
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View
          style={[styles.inputBar, 
            { 
              paddingBottom: isKeyboardOpen ? spacing.sm : insets.bottom + spacing.sm
            }, 
            inputBlocked && styles.inputBarLocked]}
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
                void handleDeleteRejectedChat();
              }}
              testID="chat-rejected-delete-button"
            >
              <Ionicons name="trash-outline" size={16} color={colors.onBrand} />
              <Text style={styles.rejectedDeleteBtnText}>Delete Chat</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

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

      <Modal
        transparent
        animationType="slide"
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.profileModalBackdrop}>
          <View style={styles.profileModalCard}>
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

            <Pressable style={styles.modalCloseBtn} onPress={() => setProfileModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>{t("common.actions.done")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

const styles = StyleSheet.create({
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
    maxWidth: "88%",
    backgroundColor: "#D9F0FF",
    borderWidth: 1,
    borderColor: "#A8D9FF",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  apartmentPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
    textAlign: "center",
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
  headerAvatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  headerName: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    transform: [{ translateY: 7 }],
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
    maxHeight: "84%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
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
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: "#F59E0B",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rejectedDeleteBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
  },
});
