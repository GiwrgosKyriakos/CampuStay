import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";

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
  chat_status?: "pending" | "active";
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
  status?: "pending" | "active";
  initiatedBy?: string | null;
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
  status?: "pending" | "active",
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
  status?: "pending" | "active",
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
  const [lastMessageByChat, setLastMessageByChat] = useState<Record<string, LastMessageMeta>>({});
  const [acceptingChatId, setAcceptingChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const messageUnsubsRef = React.useRef<Record<string, () => void>>({});

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

    (async () => {
      try {
        const uid = await getUserId();
        if (!mounted) return;
        setCurrentUserId(uid);

        const chatsQ = query(
          collection(db, "chats"),
          where("users", "array-contains", uid),
          orderBy("lastMessageTimestamp", "desc"),
        );
        unsub = onSnapshot(chatsQ, (snapshot) => {
          const activeChatIds = new Set(snapshot.docs.map((d) => d.id));

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
              snapshot.docs.map(async (chatDoc) => {
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
      } catch {
        if (mounted) setMatches([]);
      }
    })();

    return () => {
      mounted = false;
      if (unsub) unsub();
      Object.values(messageUnsubsRef.current).forEach((off) => off());
      messageUnsubsRef.current = {};
    };
  }, [auth.isGuest]);

  const handleAcceptChat = async (profile: ChatListItem) => {
    if (!currentUserId || !profile.chatRoomId) return;
    setAcceptingChatId(profile.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", profile.chatRoomId), { status: "active" });
    } catch (err) {
      console.error("Accept chat failed:", err);
    } finally {
      setAcceptingChatId(null);
    }
  };

  const handleNavigateToChat = (profile: ChatListItem) => {
    const chatStatus = profile.chat_status ?? "active";
    if (chatStatus === "active") {
      router.push({ pathname: "/chat/[id]", params: { id: profile.id } });
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
            const isInitiator = isPending && p.chat_initiated_by === currentUserId;
            const isReceiver = isPending && p.chat_initiated_by !== currentUserId;
            const lastMessage = lastMessageByChat[p.chatRoomId];
            const defaultPreview = isInitiator ? t("matches.previewPending") : t("matches.previewStart");
            const lastPreviewText = lastMessage?.text || defaultPreview;
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
                disabled={isPending && isInitiator}
              >
                {hasAvatar ? (
                  <Image source={{ uri: p.photo }} style={styles.avatar} contentFit="cover" transition={150} />
                ) : (
                  <DefaultProfileAvatar size={60} iconSize={28} testID={`chat-row-avatar-fallback-${p.id}`} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text
                    style={[styles.rowMsg, previewIsFaded ? styles.rowMsgFaded : styles.rowMsgUnread]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {lastPreviewText}
                  </Text>
                </View>
                {isReceiver && acceptingChatId !== p.chatRoomId ? (
                  <Pressable
                    style={styles.acceptBtn}
                    onPress={() => handleAcceptChat(p)}
                    testID={`accept-btn-${p.id}`}
                  >
                      <Text style={styles.acceptBtnText}>{t("common.actions.accept")}</Text>
                  </Pressable>
                ) : isReceiver && acceptingChatId === p.chatRoomId ? (
                  <ActivityIndicator size="small" color={colors.brand} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
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
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
  acceptBtn: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  acceptBtnText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
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
});
