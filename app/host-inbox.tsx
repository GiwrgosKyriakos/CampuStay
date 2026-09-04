import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import { ActivityIndicator, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, orderBy, limit, updateDoc, FieldPath, deleteField } from "firebase/firestore";

import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { cleanupObsoleteChatMessages } from "@/src/api/chatCleanup";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import { t } from "@/src/locales";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { getBlockRelationshipState } from "@/src/api/chat";
import { syncBrokerClientProfile } from "@/src/api/brokerClientProfiles";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";
import InboxSkeleton from "@/src/components/skeletons/InboxSkeleton";
import AgencyColleaguesModal from "@/src/components/AgencyColleaguesModal";
import { createOrGetColleagueChat } from "@/src/api/agencyCollaboration";

interface FirestoreUserDoc {
  name?: string | null;
  photoUrl?: string;
  photos?: string[];
  deleted?: boolean;
  is_broker?: boolean;
  agencyId?: string | null;
  agencyRole?: string | null;
  is_agency_ceo?: boolean;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | "colleague" | string;
  clearedAt?: Record<string, unknown>;
  deletedUsers?: Record<string, boolean>;
  apartmentTitle?: string;
  apartmentId?: string;
  apartmentImage?: string;
  brokerChatRole?: "client" | "owner" | string;
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  lastMessageTimestamp?: { toMillis?: () => number } | number | null;
  updatedAt?: { toMillis?: () => number } | number | null;
  createdAt?: { toMillis?: () => number } | number | null;
}

interface FirestoreInboxMessageDoc {
  text?: string;
  type?: string;
  requestedDate?: string;
  metadata?: { appointmentDate?: string };
  senderId?: string;
  isRead?: boolean;
}

function formatInboxMessage(data: FirestoreInboxMessageDoc): string {
  const appointmentDate = data.metadata?.appointmentDate ?? data.requestedDate;
  switch (data.type) {
    case "filter_share":
    case "filter_set_share": return "Διαμοιρασμός Φίλτρων Αναζήτησης";
    case "assignment_request": return "Νέα Ανάθεση Ακινήτου";
    case "visit_confirmed": return `Επιβεβαιωμένη Υπόδειξη: ${appointmentDate ? new Date(appointmentDate).toLocaleDateString("el-GR") : ""}`;
    case "visit_rescheduled": return "Αλλαγή Ραντεβού Υπόδειξης";
    case "visit_cancelled": return "Ακύρωση Ραντεβού Υπόδειξης";
    default: return data.text?.trim() || "";
  }
}

interface HostInboxItem {
  id: string; 
  customerId: string;
  customerName: string;
  customerAvatar: string;
  apartmentTitle: string;
  apartmentId?: string;
  chatRoomId: string;
  status: "pending" | "active" | "rejected";
  initiatedBy: string | null;
  isUnread: boolean;
  lastMessageText: string;
  sortKey: number;
  brokerChatRole?: "client" | "owner";
  apartmentImage: string;
  // ΠΡΟΣΘΗΚΗ: Flags για το blocking
  isBlocker?: boolean;
  isBlocked?: boolean;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return 0;

  const ts = value as any;
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

function getClearedAtForUser(chatData: FirestoreHostChatDoc, uid: string): number {
  if (chatData.clearedAt && typeof chatData.clearedAt === "object" && uid in chatData.clearedAt) {
    return getSafeMillis(chatData.clearedAt[uid]);
  }
  const flatKey = `clearedAt.${uid}`;
  return getSafeMillis((chatData as Record<string, unknown>)[flatKey]);
}

function isDeletedForUser(chatData: FirestoreHostChatDoc, uid: string): boolean {
  if (chatData.deletedUsers && typeof chatData.deletedUsers === "object" && uid in chatData.deletedUsers) {
    return chatData.deletedUsers[uid] === true;
  }
  const flatKey = `deletedUsers.${uid}`;
  return (chatData as Record<string, unknown>)[flatKey] === true;
}

const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

type HostInboxContentProps = {
  titleOverride?: string;
  showBackButton?: boolean;
};

export function HostInboxContent({ titleOverride, showBackButton = true }: HostInboxContentProps = {}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [items, setItems] = useState<HostInboxItem[]>([]);
  const [hostInboxLimit, setHostInboxLimit] = useState(15);
  const [hasMoreHostInbox, setHasMoreHostInbox] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeContextChatId, setActiveContextChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<HostInboxItem | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [acceptingChatId, setAcceptingChatId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [colleaguesVisible, setColleaguesVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const canSeeBrokerRoleMetadata = auth.isBroker === true || isBrokerOrAgencyUser(auth.user as Parameters<typeof isBrokerOrAgencyUser>[0]);
  const locallyDeletedChatIdsRef = useRef(new Set<string>());
  const hostInboxLoadMoreLockRef = useRef(false);
  const scopedApartmentIds = useMemo(() => Array.from(new Set(items.map((item) => item.apartmentId).filter((apartmentId): apartmentId is string => !!apartmentId))), [items]);

  const handleHostInboxScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
    if (!isNearBottom || !hasMoreHostInbox || hostInboxLoadMoreLockRef.current) return;

    hostInboxLoadMoreLockRef.current = true;
    setHostInboxLimit((previous) => previous + 15);
  }, [hasMoreHostInbox]);

  const normalizedQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;

    return items.filter((item) => {
      const normalizedName = normalizeText(item.customerName);
      const normalizedTitle = normalizeText(item.apartmentTitle);
      return normalizedName.includes(normalizedQuery) || normalizedTitle.includes(normalizedQuery);
    });
  }, [items, normalizedQuery]);

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    hostInboxLoadMoreLockRef.current = false;
    let mounted = true;
    const currentUid = auth.userId;

    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", currentUid),
      orderBy("lastMessageTimestamp", "desc"),
      limit(hostInboxLimit),
    );

    const unsubscribe = onSnapshot(
      hostChatsQ,
      (snapshot) => {
        setHasMoreHostInbox(snapshot.docs.length >= hostInboxLimit);
        hostInboxLoadMoreLockRef.current = false;
        if (snapshot.empty) {
          if (mounted) {
            setItems([]);
            setLoading(false);
          }
          return;
        }

        void (async () => {
          try {
            // 1. Φιλτράρουμε τα έγγραφα
            const approvedDocs = snapshot.docs.filter((chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              const isHostChat = chatData.type === "host" || !!chatData.apartmentId;
              const isColleagueChat = chatData.type === "colleague";
              if (!isHostChat && !isColleagueChat) return false;
              if (chatData.initiatedBy === currentUid) return false;

              const isExplicitlyDeleted = isDeletedForUser(chatData, currentUid);
              const clearedAtForCurrentUser = getClearedAtForUser(chatData, currentUid);
              const lastMessageTs = getSafeMillis(chatData.lastMessageTimestamp);

              // If a new message arrived after the user cleared the chat, unhide it
              if (
                locallyDeletedChatIdsRef.current.has(chatDoc.id) &&
                clearedAtForCurrentUser > 0 &&
                lastMessageTs > clearedAtForCurrentUser
              ) {
                locallyDeletedChatIdsRef.current.delete(chatDoc.id);
              }

              const isHiddenByClear = clearedAtForCurrentUser > 0 && lastMessageTs <= clearedAtForCurrentUser;
              const shouldHide = locallyDeletedChatIdsRef.current.has(chatDoc.id) || isExplicitlyDeleted || isHiddenByClear;

              return !shouldHide;
            });

            // 2. Επεξεργαζόμαστε ΜΟΝΟ τα εγκεκριμένα με απόλυτη ασφάλεια (try/catch ανά chat)
            const rows = await Promise.all(
              approvedDocs.map(async (chatDoc) => {
                try {
                  const chatData = chatDoc.data() as FirestoreHostChatDoc;
                  const isColleagueChat = chatData.type === "colleague";
                  const users = Array.isArray(chatData.users) ? chatData.users : [];
                  const customerId = users.find((uid) => uid !== currentUid) || "";
                  
                  if (!customerId) return null; // Λείπει ο χρήστης

                  const customerSnap = await getDoc(doc(db, "users", customerId));
                  const customerData = customerSnap.exists() ? (customerSnap.data() as FirestoreUserDoc) : null;
                  if (!isColleagueChat && isBrokerOrAgencyUser(customerData) && chatData.brokerChatRole !== "client" && !chatData.apartmentId) {
                    return null;
                  }
                  
                  let isUnread = false;
                  let lastMessageText = "";

                  try {
                    const lastMsgSnap = await getDocs(
                      query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1))
                    );
                    if (!lastMsgSnap.empty) {
                      const lastMsg = lastMsgSnap.docs[0].data() as FirestoreInboxMessageDoc;
                      lastMessageText = formatInboxMessage(lastMsg);
                      isUnread = lastMsg.senderId === customerId && lastMsg.isRead === false;
                    }
                  } catch (msgError) {
                    console.log(`[HostInbox] Σφάλμα ανάγνωσης μηνυμάτων για chat ${chatDoc.id}:`, msgError);
                  }

                  const apartmentTitle = isColleagueChat ? "Συνεργάτης" : chatData.apartmentTitle?.trim() || "Apartment";
                  const brokerChatRole = chatData.brokerChatRole === "client" || chatData.brokerChatRole === "owner"
                    ? chatData.brokerChatRole
                    : undefined;
                  const customerName = customerData?.name?.trim() || DELETED_ACCOUNT_LABEL;
                  const photos = Array.isArray(customerData?.photos) ? customerData.photos : [];
                  const customerAvatar = customerData?.photoUrl || photos[0] || "";

                  // Combine metadata and settings-based relationship checks for global blocking.
                  const blockedMap = (chatData as any).blockedByUsers ?? {};
                  const relationState = await getBlockRelationshipState(currentUid, customerId);
                  const isBlocker = blockedMap[currentUid] === true || relationState.isBlocker;
                  const isBlocked = blockedMap[customerId] === true || relationState.isBlocked;

                  return {
                    id: chatDoc.id,
                    customerId,
                    customerName,
                    customerAvatar,
                    apartmentTitle,
                    apartmentId: chatData.apartmentId,
                    chatRoomId: chatDoc.id,
                    status: chatData.status ?? "active",
                    initiatedBy: chatData.initiatedBy ?? null,
                    isUnread,
                    lastMessageText,
                    sortKey: toMillis(chatData.lastMessageTimestamp) || toMillis(chatData.updatedAt) || toMillis(chatData.createdAt), 
                    brokerChatRole,
                    apartmentImage: chatData.apartmentImage?.trim() || "",
                    isBlocker,
                    isBlocked,
                  } as HostInboxItem;

                } catch (itemError) {
                  console.error(`[HostInbox] Κρασάρισμα στο chat ${chatDoc.id}:`, itemError);
                  return null; // Αν σκάσει 1 chat, δεν καταστρέφεται η υπόλοιπη λίστα!
                }
              })
            );

            if (mounted) {
              const finalItems = rows
                .filter((row): row is HostInboxItem => !!row)
                .sort((a, b) => b.sortKey - a.sortKey);
                
              setItems(finalItems);
            }
          } catch (globalError) {
            console.error("[HostInbox] Χοντρό κρασάρισμα στο Promise.all:", globalError);
            if (mounted) setItems([]);
          } finally {
            if (mounted) setLoading(false);
          }
        })();
      },
      (error) => {
        console.error("[HostInbox] Σφάλμα Snapshot:", error);
        if (mounted) {
          setItems([]);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.isGuest, auth.userId, hostInboxLimit]);

  const handleOpenChat = (item: HostInboxItem) => {
    if (activeContextChatId) {
      setActiveContextChatId(null);
      return;
    }
    if (item.isBlocker || item.isBlocked) {
      return;
    }
    if (item.status === "active" || item.status === "rejected") {
      router.push({ pathname: "/chat/[id]", params: { id: item.customerId, chatRoomId: item.chatRoomId } });
    }
  };

  const handleConfirmDeleteChat = async () => {
    if (!auth.userId || !chatToDelete) return;
    const roomId = chatToDelete.chatRoomId;
    const currentUid = auth.userId;

    setDeletingChatId(roomId);
    locallyDeletedChatIdsRef.current.add(roomId);
    setItems((prev) => prev.filter((item) => item.chatRoomId !== roomId));
    setChatToDelete(null);
    setActiveContextChatId(null);

    try {
      const chatRef = doc(db, "chats", roomId);
      const now = Date.now();

      await setDoc(
        chatRef,
        {
          clearedAt: { [currentUid]: now },
          deletedUsers: { [currentUid]: true },
          updatedAt: now,
        },
        { merge: true },
      );

      await updateDoc(
        chatRef,
        new FieldPath(`clearedAt.${currentUid}`),
        deleteField(),
        new FieldPath(`deletedUsers.${currentUid}`),
        deleteField(),
      ).catch(() => {});
      void cleanupObsoleteChatMessages(roomId);
    } catch (err) {
      console.error("[HostInbox] Delete chat failed:", err);
    } finally {
      setDeletingChatId(null);
    }
  };

  const handleAcceptChat = async (item: HostInboxItem) => {
    if (!auth.userId || !item.chatRoomId) return;
    setAcceptingChatId(item.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", item.chatRoomId), {
        status: "active",
      });
      await syncBrokerClientProfile({
        brokerId: auth.userId,
        clientId: item.customerId,
        role: item.brokerChatRole === "owner" ? "owner" : "client",
        chatRoomId: item.chatRoomId,
        apartmentId: item.apartmentId,
      });
      router.push({ pathname: "/chat/[id]", params: { id: item.customerId, chatRoomId: item.chatRoomId } });
    } catch (err) {
      console.error("Accept chat failed:", err);
    } finally {
      setAcceptingChatId(null);
    }
  };

  const handleRejectChat = async (item: HostInboxItem) => {
    if (!auth.userId || !item.chatRoomId) return;
    setAcceptingChatId(item.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", item.chatRoomId), {
        status: "rejected",
      });
    } catch (err) {
      console.error("Reject chat failed:", err);
    } finally {
      setAcceptingChatId(null);
    }
  };
  
  const handleDeleteRejectedChat = async (item: HostInboxItem) => {
    if (!auth.userId || !item.chatRoomId) return;
    const roomId = item.chatRoomId;
    const currentUid = auth.userId;

    setDeletingChatId(roomId);
    locallyDeletedChatIdsRef.current.add(roomId);
    setItems((prev) => prev.filter((i) => i.chatRoomId !== roomId));

    try {
      const chatRef = doc(db, "chats", roomId);
      const now = Date.now();

      await setDoc(
        chatRef,
        {
          clearedAt: { [currentUid]: now },
          deletedUsers: { [currentUid]: true },
          updatedAt: now,
        },
        { merge: true },
      );

      await updateDoc(
        chatRef,
        new FieldPath(`clearedAt.${currentUid}`),
        deleteField(),
        new FieldPath(`deletedUsers.${currentUid}`),
        deleteField(),
      ).catch(() => {});
      void cleanupObsoleteChatMessages(roomId);
    } catch (err) {
      console.error("[HostInbox] Delete rejected chat failed:", err);
    } finally {
      setDeletingChatId(null);
    }
  };

  return (
    <View style={styles.container} testID="host-inbox-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}> 
        {showBackButton ? (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
        ) : null}
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{titleOverride ?? t("host-inbox.title")}</Text>
        </View>
        <View style={styles.headerActionGroup}>
          {canSeeBrokerRoleMetadata ? (
            <Pressable
              onPress={() => setInfoOpen((prev) => !prev)}
              style={[styles.headerActionBtn, infoOpen && styles.headerActionBtnActive]}
              testID="host-inbox-info-toggle"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("host-inbox.roleLegendLabel")}
            >
              <Ionicons name={infoOpen ? "information-circle" : "information-circle-outline"} size={20} color={infoOpen ? colors.brand : colors.onSurface} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setColleaguesVisible(true)}
            style={styles.headerActionBtn}
            testID="host-inbox-colleagues-toggle"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Συνεργάτες"
          >
            <Ionicons name="people-outline" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => {
              setSearchOpen((prev) => {
                const next = !prev;
                if (!next) setSearchQuery("");
                return next;
              });
            }}
            style={[styles.headerActionBtn, searchOpen && styles.headerActionBtnActive]}
            testID="host-inbox-search-toggle"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("host-inbox.searchLabel")}
          >
            <Ionicons name={searchOpen ? "search" : "search-outline"} size={20} color={searchOpen ? colors.brand : colors.onSurface} />
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchBarWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.onSurfaceTertiary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("host-inbox.searchPlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              testID="host-inbox-search-input"
            />
            {searchQuery.trim().length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} style={styles.searchClearBtn} testID="host-inbox-search-clear">
                <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {infoOpen && canSeeBrokerRoleMetadata ? (
        <View style={styles.legendContainer} testID="host-inbox-role-legend">
          <View style={styles.legendItem}>
            <Text style={styles.clientBadge}>C</Text>
            <Text style={styles.legendText}>{t("host-inbox.clientRole")}</Text>
          </View>
          <View style={styles.legendDivider} />
          <View style={styles.legendItem}>
            <Text style={styles.ownerBadge}>O</Text>
            <Text style={styles.legendText}>{t("host-inbox.ownerRole")}</Text>
          </View>
        </View>
      ) : null}

      {auth.isGuest ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("common.cta.signInOrRegister")}</Text>
        </View>
      ) : loading ? (
        <InboxSkeleton testID="host-inbox-loading" />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("host-inbox.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("host-inbox.emptySub")}</Text>
        </View>
      ) : normalizedQuery.length > 0 && filteredItems.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.searchEmptyIconWrap}>
            <Ionicons name="search-outline" size={30} color={colors.onSurfaceTertiary} />
          </View>
          <Text style={styles.emptyTitle}>{t("host-inbox.noSearchResults")}</Text>
          <Text style={styles.emptySub}>{t("host-inbox.tryDifferentSearch")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={handleHostInboxScroll}
          scrollEventThrottle={100}
        >
          {filteredItems.map((item) => {
            
            // ΔΙΟΡΘΩΣΗ: Δυναμική αλλαγή ονόματος και avatar βάσει block state
            let customerName = item.customerName;
            let hasAvatar = !!item.customerAvatar;

            if (item.isBlocker) {
              customerName = t("common.account.blocked");
              hasAvatar = false;
            } else if (item.isBlocked) {
              customerName = t("common.account.deleted");
              hasAvatar = false;
            }
            
            const isPending = item.status === "pending";
            const isRejected = item.status === "rejected";
            const isBlockedChat = !!item.isBlocker || !!item.isBlocked;
            const isReceiver = isPending && item.initiatedBy !== auth.userId;
            const defaultPreview = isPending ? t("matches.previewPending") : t("matches.previewStart");
            const lastPreviewText = isPending
              ? t("matches.previewPending")
              : isRejected
              ? "Unavailable communication"
              : (item.lastMessageText || defaultPreview);
            const previewIsFaded = !item.isUnread;

            return (
              <Pressable
                key={item.id}
                style={[styles.row, isBlockedChat && styles.rowBlocked]}
                onPress={() => handleOpenChat(item)}
                onLongPress={() => setActiveContextChatId(item.id)}
                delayLongPress={350}
                disabled={isPending || isBlockedChat}
              >
                {activeContextChatId === item.id ? (
                  <View style={styles.contextTooltip}>
                    <Pressable
                      style={styles.contextTooltipAction}
                      onPress={() => setChatToDelete(item)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.contextTooltipText}>{t("chatList.deleteThisChat")}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {hasAvatar ? (
                  <Image source={{ uri: item.customerAvatar }} style={styles.avatar} contentFit="cover" transition={150} />
                ) : (
                  <DefaultProfileAvatar size={60} iconSize={28} />
                )}

                <View style={styles.rowText}>
                  <View style={styles.rowNameHeader}>
                    <Text style={styles.rowName} numberOfLines={1}>{customerName}</Text>
                    <Text style={styles.apartmentTitle} numberOfLines={1}>{item.apartmentTitle}</Text>
                    {canSeeBrokerRoleMetadata && item.brokerChatRole === "client" ? <Text style={styles.clientBadge}>C</Text> : null}
                    {canSeeBrokerRoleMetadata && item.brokerChatRole === "owner" ? <Text style={styles.ownerBadge}>O</Text> : null}
                    {isBlockedChat ? (
                      <View style={styles.blockedBadge}>
                        <Text style={styles.blockedBadgeText}>{t("host-inbox.blockedBadge")}</Text>
                      </View>
                    ) : null}
                  </View>

                  {isPending ? (
                    isReceiver ? (
                      item.isBlocker || item.isBlocked ? (
                        <Text style={[styles.rowMsg, styles.rowMsgFaded]} numberOfLines={1}>
                          {t("host-inbox.blockedUnavailable")}
                        </Text>
                      ) : acceptingChatId === item.chatRoomId ? (
                        <View style={styles.pendingActionRow}>
                          <ActivityIndicator size="small" color={colors.brand} />
                        </View>
                      ) : (
                        <View style={styles.pendingActionRow}>
                          <Pressable
                            style={[styles.pendingPillBtn, styles.pendingApproveBtn]}
                            onPress={() => handleAcceptChat(item)}
                          >
                            <Text style={styles.pendingApproveBtnText}>{t("common.actions.accept")}</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.pendingPillBtn, styles.pendingRejectBtn]}
                            onPress={() => handleRejectChat(item)}
                          >
                            <Text style={styles.pendingRejectBtnText}>{t("common.actions.reject")}</Text>
                          </Pressable>
                        </View>
                      )
                    ) : (
                      <Text style={[styles.rowMsg, styles.rowMsgFaded]} numberOfLines={1} ellipsizeMode="tail">
                       {t("matches.pendingApproval")}
                      </Text>
                    )
                  ) : (
                    <Text style={[styles.rowMsg, previewIsFaded ? styles.rowMsgFaded : styles.rowMsgUnread]} numberOfLines={1} ellipsizeMode="tail">
                      {lastPreviewText}
                    </Text>
                  )}
                </View>

                {isPending ? (
                  <Ionicons name="time-outline" size={22} color={colors.onSurfaceTertiary} />
                ) : isRejected ? (
                  <Pressable
                    style={styles.rejectedInlineDeleteBtn}
                    onPress={() => {
                      void handleDeleteRejectedChat(item);
                    }}
                    disabled={deletingChatId === item.chatRoomId}
                  >
                    <Text style={styles.rejectedInlineDeleteBtnText}>
                      {deletingChatId === item.chatRoomId ? t("common.actions.loading") : "Delete"}
                    </Text>
                  </Pressable>
                ) : item.isUnread ? (
                  <View style={styles.unreadDot} />
                ) : (
                  <Ionicons name="paper-plane-outline" size={22} color={colors.onSurfaceTertiary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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

      <AgencyColleaguesModal
        visible={colleaguesVisible}
        agencyId={auth.agencyId ?? ""}
        currentUserId={auth.userId ?? ""}
        apartmentIds={scopedApartmentIds}
        onClose={() => setColleaguesVisible(false)}
        onSelect={(colleague) => {
          if (!auth.userId) return;
          setColleaguesVisible(false);
          void createOrGetColleagueChat({ currentUserId: auth.userId, colleagueId: colleague.id }).then((chatRoomId) => {
            router.push({ pathname: "/chat/[id]", params: { id: colleague.id, chatRoomId } });
          });
        }}
      />
    </View>
  );
}

export default function HostInboxScreen() {
    return <HostInboxContent />;
  }

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCopy: { flex: 1, justifyContent: "center" },
  headerActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerActionBtnActive: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brand,
  },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  searchBarWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  searchClearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowBlocked: {
    opacity: 0.6,
  },
  avatar: { width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  rowText: { flex: 1, gap: 3, justifyContent: 'center' },
  rowNameHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowName: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  apartmentTitle: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.brand, textAlign: "right" },
  clientBadge: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, textAlign: "center", minWidth: 20 },
  ownerBadge: { fontFamily: fonts.bold, fontSize: 11, color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, textAlign: "center", minWidth: 20 },
  legendContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDivider: { width: 1, height: 16, backgroundColor: colors.border },
  legendText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  blockedBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: "rgba(255,90,95,0.12)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  blockedBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.error,
  },
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
    alignSelf: "center",
    borderRadius: radius.pill,
    backgroundColor: "#F59E0B",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  rejectedInlineDeleteBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.onBrand,
  },
  contextTooltip: {
    position: "absolute",
    top: 20,
    right: 48,
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  searchEmptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
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