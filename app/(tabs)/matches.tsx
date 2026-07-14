import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Animated, PanResponder } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";
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
  chat_status?: "pending" | "active" | "rejected";
  chat_initiated_by?: string | null;
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
    gender: t("common.values.nonBinary"),
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
    gender: (data.gender as RoommateProfile["gender"]) || t("common.values.nonBinary"),
    budget: typeof data.maxBudget === "number" ? data.maxBudget : typeof data.budget === "number" ? data.budget : 0,
    university: data.university || "",
    program: data.year || data.year_of_study || "",
    bio: data.about || data.bio || "",
    tags: [],
    photo,
    deleted: !!data.deleted,
    chatRoomId,
    chat_status: status,
    chat_initiated_by: initiatedBy ?? null,
  };
}

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [matches, setMatches] = useState<ChatListItem[]>([]);
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
      where("type", "==", "like"),
    );
    const likesSnap = await getDocs(likesQ);
    if (likesSnap.empty) return;

    await Promise.all(
      likesSnap.docs.map(async (swipeDoc) => {
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
      return;
    }

    let mounted = true;
    let unsub: (() => void) | null = null;

    setMatches([]);

    (async () => {
      try {
        const uid = auth.userId;
        if (!uid) {
          if (mounted) {
            setCurrentUserId("");
            setMatches([]);
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
        await ensureRoommateChatsFromLikes(uid);

        const chatsQ = query(collection(db, "chats"), where("users", "array-contains", uid));
        unsub = onSnapshot(chatsQ, (snapshot) => {
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
              return false;
            }
            const chatType = chatData.type ?? "roommate";
            const isVisibleForTab = selectedChatType === "host" ? chatType === "host" : chatType !== "host";
            if (!isVisibleForTab) {
              console.log("[Matches] Hiding chat due to tab/type split", {
                chatId: chatDoc.id,
                selectedChatType,
                chatType,
              });
            }
            return isVisibleForTab;
          });

          console.log("[Matches] Visible chats after filtering", {
            selectedChatType,
            visibleCount: visibleChatDocs.length,
          });

          // Keep per-room last-message listeners in sync with current chat rooms.
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
            const rows = await Promise.all(
              visibleChatDocs.map(async (chatDoc) => {
                const chatData = chatDoc.data() as FirestoreChatDoc;
                const sortKey =
                  toMillis(chatData.lastMessageTimestamp) ||
                  toMillis(chatData.updatedAt) ||
                  toMillis(chatData.createdAt);
                const users = Array.isArray(chatData.users) ? chatData.users : [];
                const counterpartUid = users.find((u) => u !== uid);
                if (!counterpartUid) {
                  return null;
                }

                const userSnap = await getDoc(doc(db, "users", counterpartUid));
                const userData = userSnap.exists() ? (userSnap.data() as FirestoreUserDoc) : null;

                return {
                  sortKey,
                  item: mapUserToChatItem(
                    counterpartUid,
                    chatDoc.id,
                    chatData.status ?? "active",
                    chatData.initiatedBy ?? null,
                    userData,
                  ),
                };
              }),
            );

            if (mounted) {
              setMatches(
                rows
                  .filter((r): r is { sortKey: number; item: ChatListItem } => !!r)
                  .sort((a, b) => b.sortKey - a.sortKey)
                  .map((row) => row.item),
              );
            }
          })();
        });
      } catch (error) {
        console.error("[Matches] Failed to initialize chats subscription", error);
        if (mounted) setMatches([]);
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
        approvedBy: currentUserId,
        updatedAt: serverTimestamp(),
        // Unhide the thread for both sender and receiver on approval.
        deletedBy: arrayRemove(currentUserId, profile.id),
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
        rejectedBy: currentUserId,
        updatedAt: serverTimestamp(),
      });
      console.log("[Matches] Rejected pending roommate chat", {
        chatRoomId: profile.chatRoomId,
        currentUserId,
      });
      router.push({ pathname: "/chat/[id]", params: { id: profile.id, chatRoomId: profile.chatRoomId } });
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

  return (
    <View style={styles.container} testID="matches-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
        <Text style={styles.title}>{t("matches.title")}</Text>
        <Text style={styles.subtitle}>
          {auth.isGuest
            ? t("matches.subtitleGuest")
            : matches.length > 0
            ? t("matches.subtitleCount", {
                count: matches.length,
                roommateLabel: matches.length === 1 ? t("matches.roommateSingular") : t("matches.roommatePlural"),
              })
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
            Συγκάτοικοι
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleOption, selectedChatType === "host" && styles.toggleOptionActive]}
          onPress={() => setSelectedChatType("host")}
          testID="matches-toggle-hosts"
        >
          <Text style={[styles.toggleText, selectedChatType === "host" && styles.toggleTextActive]}>
            Ιδιοκτήτες
          </Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.flexOne, { transform: [{ translateX: swipeX }] }]} {...contentPanResponder.panHandlers}>
      {auth.isGuest ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>{t("matches.emptyGuestTitle")}</Text>
          <Text style={styles.emptySub}>{t("matches.emptyGuestBody")}</Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.push("/auth-landing")} testID="matches-signin-button">
            <Text style={styles.ctaText}>{t("common.cta.signInOrRegister")}</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>{t("matches.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("matches.emptyBody")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {matches.map((p) => {
            const isDeleted = isDeletedCounterpart(p);
            const displayName = isDeleted ? t("common.account.deleted") : p.name;
            const hasAvatar = !isDeleted && !!p.photo?.trim();
            const chatStatus = p.chat_status ?? "active";
            const isPending = chatStatus === "pending";
            const isRejected = chatStatus === "rejected";
            const isInitiator = isPending && p.chat_initiated_by === currentUserId;
            const isReceiver = isPending && p.chat_initiated_by !== currentUserId;
            const lastMessage = lastMessageByChat[p.chatRoomId];
            const defaultPreview = isPending ? t("matches.previewPending") : t("matches.previewStart");
            const lastPreviewText = isPending
              ? t("matches.previewPending")
              : isRejected && p.chat_initiated_by === currentUserId
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
                        Pending Approval...
                      </Text>
                    )
                  ) : (
                    <Text
                      style={[styles.rowMsg, previewIsFaded ? styles.rowMsgFaded : styles.rowMsgUnread]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {lastPreviewText}
                    </Text>
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
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
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
    borderColor: colors.border,
  },
  pendingApproveBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  pendingRejectBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  contextTooltip: {
    position: "absolute",
    top: -42,
    right: spacing.sm,
    zIndex: 20,
    backgroundColor: colors.surface,
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
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, textAlign: "center" },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary, textAlign: "center" },
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
