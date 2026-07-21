import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Animated, PanResponder } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { Gender, RoommateProfile } from "@/src/data/profiles";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { t } from "@/src/locales";

const TAB_BAR_SPACE = 100;

function isDeletedCounterpart(profile: RoommateProfile): boolean {
  return !!profile.deleted;
}

interface ChatListItem extends RoommateProfile {
  chatRoomId: string;
  chat_users?: string[];
  chat_status?: "pending" | "active" | "rejected";
  chat_initiated_by?: string | null;
  // 🎯 ΠΡΟΣΘΗΚΗ: Flags για την κατάσταση blocking
  isBlocker?: boolean;
  isBlocked?: boolean;
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
}

interface FirestoreChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  deletedBy?: string[];
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

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const fn = (value as { toMillis?: () => number }).toMillis;
    if (typeof fn === "function") {
      return fn() ?? 0;
    }
  }
  return 0;
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
  };
}

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [matches, setMatches] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatType, setSelectedChatType] = useState<"roommate" | "host">("roommate");
  const [lastMessageByChat, setLastMessageByChat] = useState<Record<string, LastMessageMeta>>({});
  const [acceptingChatId, setAcceptingChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [activeContextChatId, setActiveContextChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatListItem | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const swipeX = React.useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = 56;
  const messageUnsubsRef = React.useRef<Record<string, () => void>>({});

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
          ? (chatSnap.data() as { status?: "pending" | "active" | "rejected"; initiatedBy?: string | null })
          : null;

        await setDoc(
          chatRef,
          {
            users: [uid, toUid],
            type: "roommate",
            status: chatData?.status ?? "pending",
            initiatedBy: chatData?.initiatedBy ?? uid,
            updatedAt: serverTimestamp(),
            ...(chatSnap.exists()
              ? {}
              : {
                  createdAt: serverTimestamp(),
                  lastMessage: "",
                  lastMessageTimestamp: serverTimestamp(),
                }),
            deletedBy: arrayRemove(uid, toUid),
          },
          { merge: true },
        );
      }),
    );
  }, []);

  const handleSwipeTabChange = React.useCallback((direction: "left" | "right") => {
    if (direction === "left") {
      setSelectedChatType("host");
      return;
    }
    setSelectedChatType("roommate");
  }, []);

  const contentPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
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
    [handleSwipeTabChange, swipeX],
  );

  React.useEffect(() => {
    if (auth.isGuest) setMatches([]);
  }, [auth.isGuest]);

  React.useEffect(() => {
    if (auth.isGuest) {
      setCurrentUserId("");
      setMatches([]);
      setLastMessageByChat({});
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsub: (() => void) | null = null;

    setMatches([]);
    setLoading(true);

    (async () => {
      try {
        const uid = auth.userId;
        if (!uid) {
          if (mounted) {
            setCurrentUserId("");
            setMatches([]);
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

        const chatsQ = query(collection(db, "chats"), where("users", "array-contains", uid));
        unsub = onSnapshot(chatsQ, (snapshot) => {
          // 🚨 Αφαιρέσαμε το πρόωρο setLoading(false) από εδώ!
          console.log("[Matches] Chats snapshot received", {
            uid,
            selectedChatType,
            totalChats: snapshot.docs.length,
          });
          const activeChatIds = new Set(snapshot.docs.map((d) => d.id));
          const visibleChatDocs = snapshot.docs.filter((chatDoc) => {
            const chatData = chatDoc.data() as FirestoreChatDoc;
            const deletedBy = Array.isArray(chatData.deletedBy) ? chatData.deletedBy : [];
            if (deletedBy.includes(uid)) {
              console.log("[Matches] Hiding chat because deletedBy includes current user", {
                chatId: chatDoc.id,
              });
            }
            const chatType = chatData.type ?? "roommate";
            // 🚨 ΔΙΑΧΩΡΙΣΜΟΣ ΡΟΛΩΝ:
            // Αν είμαστε στο Tab "Hosts", δείχνουμε ΜΟΝΟ τα chats που ξεκινήσαμε ΕΜΕΙΣ (ως guests).
            const isVisibleForTab = selectedChatType === "host" 
              ? (chatType === "host" && chatData.initiatedBy === uid) 
              : (chatType !== "host");
            if (!isVisibleForTab) {
              console.log("[Matches] Hiding chat due to tab/type split", {
                chatId: chatDoc.id,
                selectedChatType,
                chatType,
              });
            }
            return isVisibleForTab;
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
                  const toSafeMillis = (value: unknown): number => {
                    if (typeof value === "number" && Number.isFinite(value)) return value;
                    if (!value || typeof value !== "object") return 0;

                    const ts = value as {
                      toMillis?: () => number;
                      toDate?: () => Date;
                      seconds?: number;
                      nanoseconds?: number;
                    };

                    if (typeof ts.toMillis === "function") {
                      const millis = ts.toMillis();
                      return Number.isFinite(millis) ? millis : 0;
                    }
                    if (typeof ts.toDate === "function") {
                      const millis = ts.toDate().getTime();
                      return Number.isFinite(millis) ? millis : 0;
                    }
                    if (typeof ts.seconds === "number") {
                      return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
                    }
                    return 0;
                  };

                  const sortKey =
                    toSafeMillis(chatData.lastMessageTimestamp) ||
                    toSafeMillis(chatData.updatedAt) ||
                    toSafeMillis(chatData.createdAt) ||
                    0;
                  const users = Array.isArray(chatData.users) ? chatData.users : [];
                  const counterpartUid = users.find((u) => u !== uid);
                  if (!counterpartUid) {
                    return null;
                  }

                  const userSnap = await getDoc(doc(db, "users", counterpartUid));
                  const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;
                  const chat_status = chatData.status ?? "active";
                  const chat_initiated_by = chatData.initiatedBy ?? null;

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
                        userData,
                      ),
                      // Περνάμε τα flags στο αντικείμενο
                      isBlocker,
                      isBlocked,
                    },
                  };
                })
              );

              let fallbackRows: Array<{ sortKey: number; item: ChatListItem }> = [];
              if (selectedChatType !== "host") {
                const existingChatIds = new Set(
                  rows
                    .filter((r): r is any => !!r)
                    .map((r) => r.item.chatRoomId),
                );

                const likesSnap = await getDocs(query(collection(db, "swipes"), where("fromUid", "==", uid)));
                const likedTargets = likesSnap.docs
                  .map((d) => d.data() as { toUid?: string; type?: string })
                  .filter((d) => d.type === "like" && typeof d.toUid === "string" && !!d.toUid)
                  .map((d) => d.toUid as string);

                const missingTargets = likedTargets.filter((targetUid) => {
                  const chatRoomId = [uid, targetUid].sort().join("_");
                  return !existingChatIds.has(chatRoomId);
                });

                fallbackRows = await Promise.all(
                  missingTargets.map(async (targetUid) => {
                    const userSnap = await getDoc(doc(db, "users", targetUid));
                    const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;
                    const chatRoomId = [uid, targetUid].sort().join("_");

                    return {
                      sortKey: 0,
                      item: mapUserToChatItem(targetUid, chatRoomId, [uid, targetUid], "pending", uid, userData),
                    };
                  }),
                );
              }

              if (mounted) {
                setMatches(
                  [...rows, ...fallbackRows]
                    .filter((r): r is { sortKey: number; item: ChatListItem } => !!r)
                    .sort((a, b) => (Number.isFinite(b.sortKey) ? b.sortKey : 0) - (Number.isFinite(a.sortKey) ? a.sortKey : 0))
                    .map((row) => row.item),
                );
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
          setMatches([]);
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
  }, [auth.isGuest, auth.userId, ensureRoommateChatsFromLikes, selectedChatType]);

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

    setDeletingChatId(chatToDelete.chatRoomId);
    try {
      await setDoc(
        doc(db, "chats", chatToDelete.chatRoomId),
        {
          deletedBy: arrayUnion(currentUserId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setChatToDelete(null);
      setActiveContextChatId(null);
    } finally {
      setDeletingChatId(null);
    }
  };

  const handleDeleteRejectedChat = async (profile: ChatListItem) => {
    if (!currentUserId || !profile.chatRoomId) return;
    setDeletingChatId(profile.chatRoomId);
    try {
      await deleteDoc(doc(db, "chats", profile.chatRoomId));
      setMatches((prev) => prev.filter((item) => item.chatRoomId !== profile.chatRoomId));
    } finally {
      setDeletingChatId(null);
    }
  };

  return (
    <View style={styles.container} testID="matches-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
        <Text style={styles.title}>{t("matches.title")}</Text>
        <Text style={styles.subtitle}>
          {auth.isGuest
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
        <View style={styles.empty} testID="matches-loading">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
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
        >
          {matches.map((p) => {
            const isDeleted = isDeletedCounterpart(p);
            
            // 🎯 ΔΙΟΡΘΩΣΗ: Καθαρό conditional mapping για blocking και deletion
            let displayName = isDeleted ? t("common.account.deleted") : p.name;
            let hasAvatar = !isDeleted && !!p.photo?.trim();

            if (p.isBlocker) {
              displayName = "Blocked Account";
              hasAvatar = false; // Αναγκάζει το UI να δείξει το DefaultProfileAvatar
            } else if (p.isBlocked) {
              displayName = t("common.account.deleted") || "Deleted Account";
              hasAvatar = false; // Εξομοιώνει τη διαγραφή λογαριασμού στον μπλοκαρισμένο
            }
            
            const chatStatus = p.chat_status ?? "active";
            const isPending = chatStatus === "pending";
            const isRejected = chatStatus === "rejected";
            const participants = Array.isArray(p.chat_users) ? p.chat_users : [];
            const isCurrentUserParticipant = !!currentUserId && participants.includes(currentUserId);
            const isInitiator = isPending && isCurrentUserParticipant && p.chat_initiated_by === currentUserId;
            const isReceiver = isPending && isCurrentUserParticipant && p.chat_initiated_by !== currentUserId;
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

const styles = StyleSheet.create({
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
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
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
