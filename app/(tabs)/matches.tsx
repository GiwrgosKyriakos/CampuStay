import React, { useEffect, useState, useMemo } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Animated, PanResponder, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, deleteField, FieldPath, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import type { Gender, RoommateProfile } from "@/src/data/profiles";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { cleanupObsoleteChatMessages } from "@/src/api/chatCleanup";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { t } from "@/src/locales";
import { getBlockRelationshipState } from "@/src/api/chat";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";
import { HostInboxContent } from "../host-inbox";
import FilterSetVersionModal, { type SharedFilterSetRecord } from "@/src/components/FilterSetVersionModal";
import InboxSkeleton from "@/src/components/skeletons/InboxSkeleton";

const TAB_BAR_SPACE = 100;

function isDeletedCounterpart(profile: RoommateProfile): boolean {
  return !!profile.deleted;
}

interface ChatListItem extends RoommateProfile {
  chatRoomId: string;
  chat_users?: string[];
  chat_status?: "pending" | "active" | "rejected";
  chat_initiated_by?: string | null;
  chat_rejected_by?: string | null;
  chat_rejections?: string[];
  // 🎯 ΠΡΟΣΘΗΚΗ: Flags για την κατάσταση blocking
  isBlocker?: boolean;
  isBlocked?: boolean;
  brokerChatRole?: "client" | "owner";
}

interface FirestoreUserDoc {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  university?: string | null;
  year?: string | null;
  year_of_study?: string | null;
  maxBudget?: number | null;
  budget?: number | null;
  about?: string;
  bio?: string;
  photoUrl?: string;
  photos?: string[];
  deleted?: boolean;
  is_broker?: boolean;
  agencyId?: string | null;
  agencyRole?: string | null;
  is_agency_ceo?: boolean;
}

interface FirestoreChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  brokerChatRole?: "client" | "owner" | string;
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  rejectedBy?: string | null;
  rejections?: string[];
  clearedAt?: Record<string, unknown>;
  deletedUsers?: Record<string, boolean>;
  participantDisplayNames?: Record<string, string>;
  lastMessageTimestamp?: { toMillis?: () => number } | number | null;
  updatedAt?: { toMillis?: () => number } | number | null;
  createdAt?: { toMillis?: () => number } | number | null;
}

interface FirestoreLastMessageDoc {
  text?: string;
  senderId?: string;
  isRead?: boolean;
  read?: boolean;
  readAt?: unknown;
  readBy?: string[];
  seenBy?: string[];
}

interface LastMessageMeta {
  text: string;
  senderId: string;
  isRead: boolean;
}

let memoryMatchesCache: Record<string, ChatListItem[]> = {};
let memoryLastMessagesCache: Record<string, LastMessageMeta> = {};

// Roommate/host/broker each need an isolated cache slot so switching tabs never flashes stale rows.
function getInboxCacheKey(isBrokersView: boolean, selectedChatType: "roommate" | "host"): string {
  return isBrokersView ? "broker" : selectedChatType;
}

const getSafeMillis = (timestamp: any): number => {
  if (!timestamp) return 0;
  try {
    if (typeof timestamp.toMillis === "function") {
      const millis = timestamp.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
  } catch {
    // Pending Firestore timestamps can expose an unavailable delegate.
  }
  try {
    if (typeof timestamp.seconds === "number") {
      const nanos = typeof timestamp.nanoseconds === "number" ? timestamp.nanoseconds : 0;
      return timestamp.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  } catch {
    return 0;
  }
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

function getClearedAtForUser(chatData: FirestoreChatDoc, uid: string): number {
  const nestedValue = chatData.clearedAt && typeof chatData.clearedAt === "object"
    ? chatData.clearedAt[uid]
    : undefined;
  const flatValue = (chatData as FirestoreChatDoc & Record<string, unknown>)[`clearedAt.${uid}`];
  return getSafeMillis(nestedValue ?? flatValue);
}

function isDeletedForUser(chatData: FirestoreChatDoc, uid: string): boolean {
  const nestedValue = chatData.deletedUsers && typeof chatData.deletedUsers === "object"
    ? chatData.deletedUsers[uid]
    : undefined;
  const flatValue = (chatData as FirestoreChatDoc & Record<string, unknown>)[`deletedUsers.${uid}`];
  return nestedValue === true || flatValue === true;
}

function isMessageRead(msg: FirestoreLastMessageDoc | null, currentUserId: string): boolean {
  if (!msg) return true;
  if (msg.isRead === true || msg.read === true) return true;
  if (msg.readAt != null) return true;
  if (Array.isArray(msg.readBy) && msg.readBy.includes(currentUserId)) return true;
  if (Array.isArray(msg.seenBy) && msg.seenBy.includes(currentUserId)) return true;
  return false;
}

function buildDeletedCandidate(
  uid: string,
  chatRoomId: string,
  status?: "pending" | "active" | "rejected",
  initiatedBy?: string | null,
  label?: string,
): ChatListItem {
  return {
    id: uid,
    name: label || DELETED_ACCOUNT_LABEL,
    age: 0,
    gender: t("common.values.nonBinary") as Gender,
    budget: 0,
    university: "",
    program: "",
    bio: "",
    tags: [],
    photo: "",
    deleted: true,
    chatRoomId,
    chat_status: status,
    chat_initiated_by: initiatedBy ?? null,
  };
}

function mapUserToChatItem(
  uid: string,
  chatRoomId: string,
  users?: string[],
  status?: "pending" | "active" | "rejected",
  initiatedBy?: string | null,
  rejectedBy?: string | null,
  rejections?: string[],
  data?: FirestoreUserDoc | null,
): ChatListItem {
  if (!data) return buildDeletedCandidate(uid, chatRoomId, status, initiatedBy);

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const photo = data.photoUrl || photos[0] || "";

  return {
    id: uid,
    name: data.name?.trim() || DELETED_ACCOUNT_LABEL,
    age: typeof data.age === "number" ? data.age : 0,
    gender: (data.gender as Gender) || (t("common.values.nonBinary") as Gender),
    budget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    university: data.university || "",
    program: data.year || data.year_of_study || "",
    bio: data.about || data.bio || "",
    tags: [],
    photo,
    deleted: !!data.deleted,
    chatRoomId,
    chat_users: Array.isArray(users) ? users : undefined,
    chat_status: status,
    chat_initiated_by: initiatedBy ?? null,
    chat_rejected_by: rejectedBy ?? null,
    chat_rejections: Array.isArray(rejections) ? rejections : [],
  };
}

export default function MatchesScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [selectedChatType, setSelectedChatType] = useState<"roommate" | "host">("roommate");
  const [inboxLimit, setInboxLimit] = useState(15);
  const [hasMoreInbox, setHasMoreInbox] = useState(true);
  const [isBrokersView, setIsBrokersView] = useState(false);
  const [matches, setMatches] = useState<ChatListItem[]>(() => memoryMatchesCache[getInboxCacheKey(false, "roommate")] ?? []);
  const [loading, setLoading] = useState(() => {
    const cached = memoryMatchesCache[getInboxCacheKey(false, "roommate")];
    return !cached || cached.length === 0;
  });
  const [showGlobalFilterHistoryModal, setShowGlobalFilterHistoryModal] = useState(false);
  const [globalFilterSets, setGlobalFilterSets] = useState<SharedFilterSetRecord[]>([]);
  const [selectedGlobalFilterSet, setSelectedGlobalFilterSet] = useState<SharedFilterSetRecord | null>(null);
  const [loadingGlobalFilterSets, setLoadingGlobalFilterSets] = useState(false);
  const [lastMessageByChat, setLastMessageByChat] = useState<Record<string, LastMessageMeta>>(() => memoryLastMessagesCache);
  const [acceptingChatId, setAcceptingChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [activeContextChatId, setActiveContextChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatListItem | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const swipeX = React.useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = 56;
  const messageUnsubsRef = React.useRef<Record<string, () => void>>({});
  const locallyDeletedChatIdsRef = React.useRef(new Set<string>());
  const chatSnapshotVersionRef = React.useRef(0);
  const inboxLoadMoreLockRef = React.useRef(false);
  const isBroker = !!auth.isBroker;
  const notLookingForRoommate = auth.notLookingForRoommate === true;

  const handleInboxScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
    if (!isNearBottom || !hasMoreInbox || inboxLoadMoreLockRef.current) return;

    inboxLoadMoreLockRef.current = true;
    setInboxLimit((previous) => previous + 15);
  }, [hasMoreInbox]);

  useEffect(() => {
    memoryLastMessagesCache = lastMessageByChat;
  }, [lastMessageByChat]);

  useEffect(() => {
    if (!showGlobalFilterHistoryModal || !auth.userId) return;
    let active = true;
    setLoadingGlobalFilterSets(true);
    void (async () => {
      try {
        const snapshot = await getDocs(collection(db, "users", auth.userId!, "sharedFilterSets"));
        if (active) {
          setGlobalFilterSets(snapshot.docs.map((filterDoc) => ({ id: filterDoc.id, ...(filterDoc.data() as Omit<SharedFilterSetRecord, "id">) })).sort((a, b) => b.updatedAt - a.updatedAt));
        }
      } catch (error) {
        console.error("[Matches] Error loading shared filter sets:", error);
        if (active) setGlobalFilterSets([]);
      } finally {
        if (active) setLoadingGlobalFilterSets(false);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, showGlobalFilterHistoryModal]);

  const deleteChatForCurrentUser = React.useCallback(
    async (profile: ChatListItem) => {
      if (!currentUserId || !profile.chatRoomId) return;

      const roomId = profile.chatRoomId;
      setDeletingChatId(roomId);
      locallyDeletedChatIdsRef.current.add(roomId);
      setMatches((prev) => prev.filter((item) => item.chatRoomId !== roomId));
      Object.keys(memoryMatchesCache).forEach((cacheKey) => {
        memoryMatchesCache[cacheKey] = memoryMatchesCache[cacheKey].filter((item) => item.chatRoomId !== roomId);
      });
      setChatToDelete(null);
      setActiveContextChatId(null);

      try {
        const chatRef = doc(db, "chats", roomId);
        const now = Date.now();

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
        void cleanupObsoleteChatMessages(roomId);
      } catch (err) {
        console.error("Delete chat failed:", err);
      } finally {
        setDeletingChatId(null);
      }
    },
    [currentUserId],
  );

  const ensureRoommateChatsFromLikes = React.useCallback(async (uid: string) => {
    const likesQ = query(
      collection(db, "swipes"),
      where("fromUid", "==", uid),
    );
    const likesSnap = await getDocs(likesQ);
    if (likesSnap.empty) return;

    await Promise.all(
      likesSnap.docs.map(async (swipeDoc) => {
        const swipeType = swipeDoc.data()?.type;
        if (swipeType !== "like") return;

        const toUid = swipeDoc.data()?.toUid;
        if (typeof toUid !== "string" || !toUid) return;

        const chatRoomId = [uid, toUid].sort().join("_");
        const chatRef = doc(db, "chats", chatRoomId);
        const chatSnap = await getDoc(chatRef);
        const chatData = chatSnap.exists()
          ? (chatSnap.data() as FirestoreChatDoc)
          : null;
        if (chatData && (isDeletedForUser(chatData, uid) || getClearedAtForUser(chatData, uid) > 0)) return;
        const blockState = await getBlockRelationshipState(uid, toUid);
        const blockedByUsers = {
          [uid]: blockState.isBlocker,
          [toUid]: blockState.isBlocked,
        };

        await setDoc(
          chatRef,
          {
            users: [uid, toUid],
            type: "roommate",
            status: chatData?.status ?? "pending",
            initiatedBy: chatData?.initiatedBy ?? uid,
            blockedByUsers,
            updatedAt: serverTimestamp(),
            ...(chatSnap.exists()
              ? {}
              : {
                  createdAt: serverTimestamp(),
                  lastMessage: "",
                  lastMessageTimestamp: serverTimestamp(),
                }),
          },
          { merge: true },
        );
      }),
    );
  }, []);

  const handleSwipeTabChange = React.useCallback((direction: "left" | "right") => {
    if (notLookingForRoommate) {
      setSelectedChatType("host");
      return;
    }
    if (direction === "left") {
      setSelectedChatType("host");
      return;
    }
    setSelectedChatType("roommate");
  }, [notLookingForRoommate]);

  React.useEffect(() => {
    if (notLookingForRoommate) {
      setSelectedChatType("host");
    }
  }, [notLookingForRoommate]);

  React.useEffect(() => {
    setInboxLimit(15);
    setHasMoreInbox(true);
    inboxLoadMoreLockRef.current = false;
  }, [isBrokersView, notLookingForRoommate, selectedChatType]);

  const contentPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          !notLookingForRoommate &&
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_evt, gestureState) => {
          swipeX.setValue(gestureState.dx * 0.35);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            handleSwipeTabChange("left");
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            handleSwipeTabChange("right");
          }
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
          }).start();
        },
      }),
    [handleSwipeTabChange, notLookingForRoommate, swipeX],
  );

  React.useEffect(() => {
    const cacheKey = getInboxCacheKey(isBrokersView, selectedChatType);
    const cachedMatches = memoryMatchesCache[cacheKey];
    if (cachedMatches) {
      // Cache hit: show the target tab's rows immediately, no stale flash from the previous tab.
      setMatches(cachedMatches);
      setLoading(false);
    } else {
      // No cache yet for this tab: clear stale rows so the skeleton renders instead of the old tab's list.
      setMatches([]);
      setLoading(true);
    }
  }, [isBrokersView, selectedChatType]);

  React.useEffect(() => {
    if (auth.isGuest) {
      setCurrentUserId("");
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const uid = auth.userId;
        if (!uid) {
          if (mounted) {
            setCurrentUserId("");
            setLoading(false);
          }
          return;
        }
        if (!mounted) return;
        setCurrentUserId(uid);
        console.log("[Matches] Subscribing with resolved user id", {
          authUserId: auth.userId,
          resolvedUid: uid,
        });

        // Reconcile any previously liked users into roommate chats so they always appear in Matches.
        try {
          await ensureRoommateChatsFromLikes(uid);
        } catch (reconcileError) {
          console.warn("[Matches] Roommate chat backfill skipped", reconcileError);
        }

        const chatsQ = query(
          collection(db, "chats"),
          where("users", "array-contains", uid),
          orderBy("lastMessageTimestamp", "desc"),
          limit(inboxLimit),
        );
        unsub = onSnapshot(chatsQ, (snapshot) => {
          const snapshotVersion = ++chatSnapshotVersionRef.current;
          setHasMoreInbox(snapshot.docs.length >= inboxLimit);
          inboxLoadMoreLockRef.current = false;
          // 🚨 Αφαιρέσαμε το πρόωρο setLoading(false) από εδώ!
          console.log("[Matches] Chats snapshot received", {
            uid,
            selectedChatType,
            totalChats: snapshot.docs.length,
          });
          const activeChatIds = new Set(snapshot.docs.map((d) => d.id));
          const visibleChatDocs = snapshot.docs.filter((chatDoc) => {
            const chatData = chatDoc.data() as FirestoreChatDoc;
            const isExplicitlyDeleted = isDeletedForUser(chatData, uid);
            const clearedAtForCurrentUser = getClearedAtForUser(chatData, uid);
            const lastMessageTs = getSafeMillis(chatData.lastMessageTimestamp);

            if (
              locallyDeletedChatIdsRef.current.has(chatDoc.id) &&
              clearedAtForCurrentUser > 0 &&
              lastMessageTs > clearedAtForCurrentUser
            ) {
              locallyDeletedChatIdsRef.current.delete(chatDoc.id);
            }

            const isHiddenByClear = clearedAtForCurrentUser > 0 && lastMessageTs <= clearedAtForCurrentUser;
            const shouldHideForClear =
              locallyDeletedChatIdsRef.current.has(chatDoc.id) || isExplicitlyDeleted || isHiddenByClear;
            if (shouldHideForClear) {
              console.log("[Matches] Hiding chat because no message exists after clear cutoff", {
                chatId: chatDoc.id,
              });
            }
            const chatType = chatData.type ?? "roommate";
            // 🚨 ΔΙΑΧΩΡΙΣΜΟΣ ΡΟΛΩΝ:
            // Αν είμαστε στο Tab "Hosts", δείχνουμε ΜΟΝΟ τα chats που ξεκινήσαμε ΕΜΕΙΣ (ως guests).
            const isVisibleForTab = isBrokersView
              ? true
              : (notLookingForRoommate || selectedChatType === "host")
              ? true
              : (chatType !== "host");
            if (!isVisibleForTab) {
              console.log("[Matches] Hiding chat due to tab/type split", {
                chatId: chatDoc.id,
                selectedChatType,
                chatType,
              });
            }
            return isVisibleForTab && !shouldHideForClear;
          });

          Object.entries(messageUnsubsRef.current).forEach(([chatId, off]) => {
            if (!activeChatIds.has(chatId)) {
              off();
              delete messageUnsubsRef.current[chatId];
              setLastMessageByChat((prev) => {
                if (!(chatId in prev)) return prev;
                const next = { ...prev };
                delete next[chatId];
                return next;
              });
            }
          });

          snapshot.docs.forEach((chatDoc) => {
            const chatId = chatDoc.id;
            if (messageUnsubsRef.current[chatId]) return;

            const lastMessageQ = query(
              collection(db, "chats", chatId, "messages"),
              orderBy("createdAt", "desc"),
              limit(1),
            );

            messageUnsubsRef.current[chatId] = onSnapshot(lastMessageQ, (messageSnap) => {
              const lastDoc = messageSnap.docs[0];
              if (!lastDoc) {
                setLastMessageByChat((prev) => {
                  if (!(chatId in prev)) return prev;
                  const next = { ...prev };
                  delete next[chatId];
                  return next;
                });
                return;
              }

              const data = lastDoc.data() as FirestoreLastMessageDoc;
              setLastMessageByChat((prev) => ({
                ...prev,
                [chatId]: {
                  text: data.text?.trim() || "",
                  senderId: data.senderId || "",
                  isRead: isMessageRead(data, uid),
                },
              }));
            });
          });

          void (async () => {
            try { // 🚀 ΠΡΟΣΘΗΚΗ ΤΟΥ TRY ΓΙΑ ΑΣΦΑΛΕΙΑ
              const rows = await Promise.all(
                visibleChatDocs.map(async (chatDoc) => {
                  const chatData = chatDoc.data() as FirestoreChatDoc;
                  const sortKey =
                    getSafeMillis(chatData.lastMessageTimestamp) ||
                    getSafeMillis(chatData.updatedAt) ||
                    getSafeMillis(chatData.createdAt) ||
                    0;
                  const users = Array.isArray(chatData.users) ? chatData.users : [];
                  const counterpartUid = users.find((u) => u !== uid);
                  if (!counterpartUid) {
                    return null;
                  }

                  const userSnap = await getDoc(doc(db, "users", counterpartUid));
                  const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;
                  const isCounterpartAgencyMember = isBrokerOrAgencyUser(userData);
                  const isEffectiveHostChat = chatData.type === "host" || isCounterpartAgencyMember;
                  if (isBrokersView && !isCounterpartAgencyMember && !chatData.brokerChatRole) return null;
                  if (!isBrokersView && selectedChatType === "roommate" && isCounterpartAgencyMember) return null;
                  if (!isBrokersView && selectedChatType === "host" && (!isEffectiveHostChat || (chatData.type === "host" && chatData.initiatedBy !== uid))) return null;
                  const chat_status = chatData.status ?? "active";
                  const chat_initiated_by = chatData.initiatedBy ?? null;
                  const chat_rejected_by = typeof chatData.rejectedBy === "string" ? chatData.rejectedBy : null;
                  const chat_rejections = Array.isArray(chatData.rejections)
                    ? chatData.rejections.filter((entry): entry is string => typeof entry === "string")
                    : [];

                  // 🎯 ΔΙΟΡΘΩΣΗ: Διαβάζουμε το blockedByUsers map από το metadata του chat document
                  const blockedMap = (chatData as any).blockedByUsers ?? {};
                  const isBlocker = blockedMap[uid] === true;
                  const isBlocked = blockedMap[counterpartUid] === true;

                  return {
                    sortKey,
                    item: {
                      ...mapUserToChatItem(
                        counterpartUid,
                        chatDoc.id,
                        users,
                        chat_status,
                        chat_initiated_by,
                        chat_rejected_by,
                        chat_rejections,
                        userData,
                      ),
                      // Περνάμε τα flags στο αντικείμενο
                      isBlocker,
                      isBlocked,
                      brokerChatRole: chatData.brokerChatRole === "client" || chatData.brokerChatRole === "owner" ? chatData.brokerChatRole : undefined,
                    },
                  };
                })
              );

              let fallbackRows: Array<{ sortKey: number; item: ChatListItem }> = [];
              if (!isBrokersView && !notLookingForRoommate && selectedChatType !== "host") {
                const existingChatIds = new Set(snapshot.docs.map((docSnap) => docSnap.id));

                const likesSnap = await getDocs(query(collection(db, "swipes"), where("fromUid", "==", uid)));
                const likedTargets = likesSnap.docs
                  .map((d) => d.data() as { toUid?: string; type?: string })
                  .filter((d) => d.type === "like" && typeof d.toUid === "string" && !!d.toUid)
                  .map((d) => d.toUid as string);

                const missingTargets = likedTargets.filter((targetUid) => {
                  const chatRoomId = [uid, targetUid].sort().join("_");
                  return !existingChatIds.has(chatRoomId);
                });

                const fallbackCandidates = await Promise.all(
                  missingTargets.map(async (targetUid) => {
                    const chatRoomId = [uid, targetUid].sort().join("_");
                    if (locallyDeletedChatIdsRef.current.has(chatRoomId)) return null;
                    const existingChat = await getDoc(doc(db, "chats", chatRoomId));
                    const existingChatData = existingChat.exists() ? existingChat.data() as FirestoreChatDoc : null;
                    if (existingChatData && (isDeletedForUser(existingChatData, uid) || getClearedAtForUser(existingChatData, uid) > 0)) return null;
                    const userSnap = await getDoc(doc(db, "users", targetUid));
                    const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;

                    return {
                      sortKey: 0,
                      item: mapUserToChatItem(targetUid, chatRoomId, [uid, targetUid], "pending", uid, null, [], userData),
                    };
                  }),
                );
                fallbackRows = fallbackCandidates.filter(
                  (row): row is { sortKey: number; item: ChatListItem } => row !== null,
                );
              }

              if (mounted && snapshotVersion === chatSnapshotVersionRef.current) {
                const finalItems = [...rows, ...fallbackRows]
                  .filter((r): r is { sortKey: number; item: ChatListItem } => !!r)
                  .filter((row) => !locallyDeletedChatIdsRef.current.has(row.item.chatRoomId))
                  .sort((a, b) => (Number.isFinite(b.sortKey) ? b.sortKey : 0) - (Number.isFinite(a.sortKey) ? a.sortKey : 0))
                  .map((row) => row.item);
                memoryMatchesCache[getInboxCacheKey(isBrokersView, selectedChatType)] = finalItems;
                setMatches(finalItems);
              }
            } catch (error) {
              console.error("[Matches] Error mapping users to chat items:", error);
            } finally {
              // 🚀 ΕΔΩ είναι το κλειδί: Κλείνει το loading ΑΦΟΥ ολοκληρωθεί το UI update, είτε πετύχει είτε όχι
              if (mounted) setLoading(false);
            }
          })();
        });
      } catch (error) {
        console.error("[Matches] Failed to initialize chats subscription", error);
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (unsub) unsub();
      Object.values(messageUnsubsRef.current).forEach((off) => off());
      messageUnsubsRef.current = {};
    };
  }, [auth.isGuest, auth.userId, ensureRoommateChatsFromLikes, inboxLimit, isBrokersView, notLookingForRoommate, selectedChatType]);

  const handleAcceptChat = async (profile: ChatListItem) => {
    if (!currentUserId || !profile.chatRoomId) return;
    setAcceptingChatId(profile.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", profile.chatRoomId), {
        status: "active",
      });
      console.log("[Matches] Accepted pending roommate chat", {
        chatRoomId: profile.chatRoomId,
        currentUserId,
      });
      router.push({ pathname: "/chat/[id]", params: { id: profile.id, chatRoomId: profile.chatRoomId } });
    } catch (err) {
      console.error("Accept chat failed:", err);
    } finally {
      setAcceptingChatId(null);
    }
  };

  const handleRejectChat = async (profile: ChatListItem) => {
    if (!currentUserId || !profile.chatRoomId) return;
    setAcceptingChatId(profile.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", profile.chatRoomId), {
        status: "rejected",
      });
      console.log("[Matches] Rejected pending roommate chat", {
        chatRoomId: profile.chatRoomId,
        currentUserId,
      });
    } catch (err) {
      console.error("Reject chat failed:", err);
    } finally {
      setAcceptingChatId(null);
    }
  };

  const handleNavigateToChat = (profile: ChatListItem) => {
    if (activeContextChatId) {
      setActiveContextChatId(null);
      return;
    }
    const chatStatus = profile.chat_status ?? "active";
    if (chatStatus === "active" || chatStatus === "rejected") {
      router.push({ pathname: "/chat/[id]", params: { id: profile.id, chatRoomId: profile.chatRoomId } });
    }
  };

  const handleConfirmDeleteChat = async () => {
    if (!currentUserId || !chatToDelete) return;

    await deleteChatForCurrentUser(chatToDelete);
  };

  const handleDeleteRejectedChat = async (profile: ChatListItem) => {
    if (!currentUserId || !profile.chatRoomId) return;
    await deleteChatForCurrentUser(profile);
  };

  if (isBroker) {
    return <HostInboxContent titleOverride="Inbox Μεσίτη" showBackButton={false} />;
  }

  return (
    <View style={styles.container} testID="matches-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>{t("matches.title")}</Text>
          <View style={styles.brokersHeaderActions}>
            {isBrokersView ? <Pressable style={styles.circularHistoryBtn} onPress={() => setShowGlobalFilterHistoryModal(true)} testID="matches-global-filter-history-btn" hitSlop={8}><Ionicons name="time-outline" size={20} color={colors.onSurface} /></Pressable> : null}
            <Pressable
              style={[styles.brokersToggleBtn, isBrokersView && styles.brokersToggleBtnActive]}
              onPress={() => setIsBrokersView((previous) => !previous)}
              testID="matches-brokers-view-toggle"
            >
              <Ionicons name="briefcase-outline" size={16} color={isBrokersView ? colors.onBrand : colors.onSurface} />
              <Text style={[styles.brokersToggleBtnText, isBrokersView && styles.brokersToggleBtnTextActive]}>Brokers</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {isBrokersView
            ? "Συνομιλίες με Μεσίτες"
            : auth.isGuest
            ? t("matches.subtitleGuest")
            : matches.length > 0 && selectedChatType === "roommate"
            ? t("matches.subtitleCount", {
                count: matches.length,
                roommateLabel: matches.length === 1 ? t("matches.roommateSingular") : t("matches.roommatePlural"),
              })
            : selectedChatType === "host"
            ? t("matches.subtitleHosts")
            : t("matches.subtitleNone")}
            
        </Text>
      </View>
      {!isBrokersView && !notLookingForRoommate && (
        <View style={[styles.toggleShell, { marginHorizontal: spacing.lg }]}> 
          <Pressable
            style={[styles.toggleOption, selectedChatType === "roommate" && styles.toggleOptionActive]}
            onPress={() => setSelectedChatType("roommate")}
            testID="matches-toggle-roommates"
          >
            <Text style={[styles.toggleText, selectedChatType === "roommate" && styles.toggleTextActive]}>
              {t("matches.roommatesToggle")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleOption, selectedChatType === "host" && styles.toggleOptionActive]}
            onPress={() => setSelectedChatType("host")}
            testID="matches-toggle-hosts"
          >
            <Text style={[styles.toggleText, selectedChatType === "host" && styles.toggleTextActive]}>
              {t("matches.hostsToggle")}
            </Text>
          </Pressable>
        </View>
      )}

      <Animated.View style={[styles.flexOne, { transform: [{ translateX: swipeX }] }]} {...contentPanResponder.panHandlers}>
      {auth.isGuest ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>
            {selectedChatType === "roommate" 
              ? t("matches.emptyGuestTitleRoommates")
              : t("matches.emptyGuestTitleHosts")}
          </Text>
          <Text style={styles.emptySub}>
            {selectedChatType === "roommate" 
              ? t("matches.emptyGuestBodyRoommates") 
              : t("matches.emptyGuestBodyHosts")}
          </Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.push("/auth-landing")} testID="matches-signin-button">
            <Text style={styles.ctaText}>{t("common.cta.signInOrRegister")}</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <InboxSkeleton testID="matches-loading" />
      ) : matches.length === 0 ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>
            {selectedChatType === "roommate" 
              ? t("matches.emptyTitleRoommates") 
              : t("matches.emptyTitleHosts")}
          </Text>
          <Text style={styles.emptySub}>
            {selectedChatType === "roommate" 
              ? t("matches.emptyBodyRoommates") 
              : t("matches.emptyBodyHosts")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleInboxScroll}
          scrollEventThrottle={100}
        >
          {matches.map((p) => {
            const isDeleted = isDeletedCounterpart(p);
            
            // 🎯 ΔΙΟΡΘΩΣΗ: Καθαρό conditional mapping για blocking και deletion
            let displayName = isDeleted ? t("common.account.deleted") : p.name;
            let hasAvatar = !isDeleted && !!p.photo?.trim();

            if (p.isBlocker) {
              displayName = t("common.account.blocked");
              hasAvatar = false; // Αναγκάζει το UI να δείξει το DefaultProfileAvatar
            } else if (p.isBlocked) {
              displayName = t("common.account.deleted");
              hasAvatar = false; // Εξομοιώνει τη διαγραφή λογαριασμού στον μπλοκαρισμένο
            }
            
            const chatStatus = p.chat_status ?? "active";
            const isPending = chatStatus === "pending";
            const isRejected = chatStatus === "rejected";
            const rejectedByCounterpart = isRejected && !!currentUserId && (
              p.chat_rejected_by === p.id ||
              (Array.isArray(p.chat_rejections) && p.chat_rejections.includes(currentUserId)) ||
              p.chat_initiated_by === currentUserId
            );
            const participants = Array.isArray(p.chat_users) ? p.chat_users : [];
            const isCurrentUserParticipant = !!currentUserId && participants.includes(currentUserId);
            const isInitiator = isPending && isCurrentUserParticipant && p.chat_initiated_by === currentUserId;
            const isReceiver = isPending && isCurrentUserParticipant && p.chat_initiated_by !== currentUserId;

            if (rejectedByCounterpart) {
              displayName = t("common.account.deleted");
              hasAvatar = false;
            }
            const lastMessage = lastMessageByChat[p.chatRoomId];
            const defaultPreview = isPending ? t("matches.previewPending") : t("matches.previewStart");
            const lastPreviewText = isPending
              ? t("matches.previewPending")
              : isRejected
              ? "Unavailable communication"
              : (lastMessage?.text || defaultPreview);
            const unreadFromCounterparty =
              !isPending &&
              !!lastMessage &&
              lastMessage.senderId !== currentUserId &&
              !lastMessage.isRead;
            const previewIsFaded = !unreadFromCounterparty;

            return (
              <Pressable
                key={p.id}
                style={styles.row}
                testID={`chat-row-${p.id}`}
                onPress={() => handleNavigateToChat(p)}
                onLongPress={() => setActiveContextChatId(p.chatRoomId)}
                delayLongPress={350}
                disabled={isPending}
              >
                {activeContextChatId === p.chatRoomId ? (
                  <View style={styles.contextTooltip} testID={`matches-delete-tooltip-${p.chatRoomId}`}>
                    <Pressable
                      style={styles.contextTooltipAction}
                      onPress={() => setChatToDelete(p)}
                      testID={`matches-delete-action-${p.chatRoomId}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.contextTooltipText}>{t("chatList.deleteThisChat")}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {hasAvatar ? (
                  <Image source={{ uri: p.photo }} style={styles.avatar} contentFit="cover" transition={150} />
                ) : (
                  <DefaultProfileAvatar size={60} iconSize={28} testID={`chat-row-avatar-fallback-${p.id}`} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {isPending ? (
                    isReceiver ? (
                      acceptingChatId === p.chatRoomId ? (
                        <View style={styles.pendingActionRow}>
                          <ActivityIndicator size="small" color={colors.brand} />
                        </View>
                      ) : (
                        <View style={styles.pendingActionRow}>
                          <Pressable
                            style={[styles.pendingPillBtn, styles.pendingApproveBtn]}
                            onPress={() => handleAcceptChat(p)}
                            testID={`pending-approve-btn-${p.id}`}
                          >
                            <Text style={styles.pendingApproveBtnText}>{t("common.actions.accept")}</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.pendingPillBtn, styles.pendingRejectBtn]}
                            onPress={() => handleRejectChat(p)}
                            testID={`pending-reject-btn-${p.id}`}
                          >
                            <Text style={styles.pendingRejectBtnText}>{t("common.actions.reject")}</Text>
                          </Pressable>
                        </View>
                      )
                    ) : (
                      <Text
                        style={[styles.rowMsg, styles.rowMsgFaded]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                       {t("matches.pendingApproval")}
                      </Text>
                    )
                  ) : (
                    <>
                      <Text
                        style={[styles.rowMsg, previewIsFaded ? styles.rowMsgFaded : styles.rowMsgUnread]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {lastPreviewText}
                      </Text>
                      {isRejected ? (
                        <Pressable
                          style={styles.rejectedInlineDeleteBtn}
                          onPress={() => {
                            void handleDeleteRejectedChat(p);
                          }}
                          disabled={deletingChatId === p.chatRoomId}
                          testID={`rejected-delete-btn-${p.id}`}
                        >
                          <Text style={styles.rejectedInlineDeleteBtnText}>
                            {deletingChatId === p.chatRoomId ? t("common.actions.loading") : "Delete Chat"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </View>
                {isPending ? (
                  <Ionicons name="time-outline" size={22} color={colors.onSurfaceTertiary} />
                ) : unreadFromCounterparty ? (
                  <View style={styles.unreadDot} testID={`chat-unread-dot-${p.id}`} />
                ) : (
                  <Ionicons name="paper-plane-outline" size={22} color={colors.onSurfaceTertiary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      </Animated.View>

      <Modal
        visible={showGlobalFilterHistoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGlobalFilterHistoryModal(false)}
      >
        <View style={styles.filterHistoryBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGlobalFilterHistoryModal(false)} />
          <View style={styles.filterHistoryCard} testID="matches-global-filter-history-modal">
            <View style={styles.filterHistoryHeader}>
              <Text style={styles.filterHistoryTitle}>Ιστορικό Set Φίλτρων</Text>
              <Pressable onPress={() => setShowGlobalFilterHistoryModal(false)} hitSlop={8} testID="matches-global-filter-history-close"><Ionicons name="close-outline" size={22} color={colors.onSurface} /></Pressable>
            </View>
            {loadingGlobalFilterSets ? <View style={styles.filterHistoryState}><ActivityIndicator color={colors.brand} /></View> : globalFilterSets.length === 0 ? <View style={styles.filterHistoryState}><Text style={styles.filterHistoryMutedText}>Δεν υπάρχουν κοινοποιημένα set φίλτρων.</Text></View> : <ScrollView style={styles.filterHistoryList} contentContainerStyle={styles.filterHistoryListContent}>
              {globalFilterSets.map((filterSet) => <Pressable key={filterSet.id} style={styles.filterSetHistoryRow} onPress={() => { setSelectedGlobalFilterSet(filterSet); setShowGlobalFilterHistoryModal(false); }} testID={`matches-global-filter-history-row-${filterSet.id}`}>
                <View style={styles.filterSetHistoryTextColumn}><Text style={styles.filterSetHistoryTitle} numberOfLines={1}>{filterSet.title || "Set Φίλτρων"}</Text><Text style={styles.filterSetHistorySummary} numberOfLines={1}>{filterSet.sharedBrokers.length} μεσίτες</Text></View>
                <View style={styles.sharedBrokerAvatars}>{filterSet.sharedBrokers.map((broker) => broker.brokerAvatar ? <Image key={broker.brokerId} source={{ uri: broker.brokerAvatar }} style={styles.sharedBrokerAvatar} /> : <View key={broker.brokerId} style={styles.sharedBrokerAvatarFallback}><Ionicons name="person-outline" size={14} color={colors.onSurfaceTertiary} /></View>)}</View>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
              </Pressable>)}
            </ScrollView>}
          </View>
        </View>
      </Modal>

      <FilterSetVersionModal visible={!!selectedGlobalFilterSet} filterSet={selectedGlobalFilterSet} onClose={() => setSelectedGlobalFilterSet(null)} onUpdated={setSelectedGlobalFilterSet} />

      <Modal
        transparent
        animationType="fade"
        visible={!!chatToDelete}
        onRequestClose={() => {
          if (!deletingChatId) {
            setChatToDelete(null);
          }
        }}
      >
        <View style={styles.confirmModalBackdrop}>
          <View style={styles.confirmModalCard}>
            <Text style={styles.confirmModalTitle}>{t("chatList.deleteConfirmTitle")}</Text>
            <Text style={styles.confirmModalBody}>{t("chatList.deleteConfirmBody")}</Text>
            <View style={styles.confirmModalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setChatToDelete(null)}
                disabled={!!deletingChatId}
              >
                <Text style={styles.cancelButtonText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteButton, !!deletingChatId && styles.deleteButtonDisabled]}
                onPress={() => {
                  void handleConfirmDeleteChat();
                }}
                disabled={!!deletingChatId}
              >
                <Text style={styles.deleteButtonText}>{t("chatList.delete")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flexOne: { flex: 1 },
  toggleShell: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  toggleOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  toggleOptionActive: {
    backgroundColor: colors.brand,
  },
  toggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  toggleTextActive: {
    color: colors.onBrand,
  },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.xs },
  headerTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  brokersToggleBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surfaceSecondary },
  brokersToggleBtnActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  brokersToggleBtnText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  brokersToggleBtnTextActive: { color: colors.onBrand },
  brokersHeaderActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  circularHistoryBtn: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  filterHistoryBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.48)" },
  filterHistoryCard: { width: "100%", maxHeight: "82%", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  filterHistoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  filterHistoryTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  filterHistoryList: { flexGrow: 0 },
  filterHistoryListContent: { gap: spacing.sm },
  filterHistoryState: { minHeight: 90, alignItems: "center", justifyContent: "center" },
  filterHistoryMutedText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  filterSetHistoryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md },
  filterSetHistoryTextColumn: { flex: 1, gap: 3 },
  filterSetHistoryTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  filterSetHistorySummary: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  sharedBrokerAvatars: { flexDirection: "row", alignItems: "center" },
  sharedBrokerAvatar: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surface, marginLeft: -6 },
  sharedBrokerAvatarFallback: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surface, marginLeft: -6, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: { width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  rowText: { flex: 1, gap: 3 },
  rowName: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  rowMsg: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  rowMsgFaded: { color: colors.onSurfaceTertiary, opacity: 0.55 },
  rowMsgUnread: { color: colors.onSurface, fontFamily: fonts.semibold },
  pendingActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  pendingPillBtn: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pendingApproveBtn: {
    backgroundColor: colors.brandTertiary,
  },
  pendingRejectBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.error,
  },
  pendingApproveBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  pendingRejectBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.error,
  },
  rejectedInlineDeleteBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: "#F59E0B",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  rejectedInlineDeleteBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
  },
  contextTooltip: {
    position: "absolute",
    top: 50,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(255,23,68,0.08)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  contextTooltipAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contextTooltipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["xl"], color: colors.onSurface, textAlign: "center" },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  ctaBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
  confirmModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  confirmModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confirmModalTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  confirmModalBody: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
  confirmModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  cancelButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  deleteButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.error,
  },
  deleteButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onError,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
});
