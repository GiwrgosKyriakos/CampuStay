import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, orderBy, limit, updateDoc, deleteDoc } from "firebase/firestore";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import { t } from "@/src/locales";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";

interface FirestoreUserDoc {
  name?: string | null;
  photoUrl?: string;
  photos?: string[];
  deleted?: boolean;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  deletedBy?: string[];
  apartmentTitle?: string;
  apartmentId?: string;
  status?: "pending" | "active" | "rejected";
  initiatedBy?: string | null;
  lastMessageTimestamp?: { toMillis?: () => number } | number | null;
  updatedAt?: { toMillis?: () => number } | number | null;
  createdAt?: { toMillis?: () => number } | number | null;
}

interface HostInboxItem {
  id: string; 
  customerId: string;
  customerName: string;
  customerAvatar: string;
  apartmentTitle: string;
  chatRoomId: string;
  status: "pending" | "active" | "rejected";
  initiatedBy: string | null;
  isUnread: boolean;
  lastMessageText: string;
  sortKey: number;
  // 🎯 ΠΡΟΣΘΗΚΗ: Flags για το blocking
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

export default function HostInboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [items, setItems] = useState<HostInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeContextChatId, setActiveContextChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<HostInboxItem | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [acceptingChatId, setAcceptingChatId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let mounted = true;
    const currentUid = auth.userId;

    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", currentUid)
    );

    const unsubscribe = onSnapshot(
      hostChatsQ,
      (snapshot) => {
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
              if (!isHostChat) return false;
              
              const deletedBy = Array.isArray(chatData.deletedBy) ? chatData.deletedBy : [];
              if (chatData.initiatedBy === currentUid) return false;
              if (deletedBy.includes(currentUid)) return false;
              
              return true;
            });

            // 2. Επεξεργαζόμαστε ΜΟΝΟ τα εγκεκριμένα με απόλυτη ασφάλεια (try/catch ανά chat)
            const rows = await Promise.all(
              approvedDocs.map(async (chatDoc) => {
                try {
                  const chatData = chatDoc.data() as FirestoreHostChatDoc;
                  const users = Array.isArray(chatData.users) ? chatData.users : [];
                  const customerId = users.find((uid) => uid !== currentUid) || "";
                  
                  if (!customerId) return null; // Λείπει ο χρήστης

                  const customerSnap = await getDoc(doc(db, "users", customerId));
                  const customerData = customerSnap.exists() ? (customerSnap.data() as FirestoreUserDoc) : null;
                  
                  let isUnread = false;
                  let lastMessageText = "";

                  try {
                    const lastMsgSnap = await getDocs(
                      query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1))
                    );
                    if (!lastMsgSnap.empty) {
                      const lastMsg = lastMsgSnap.docs[0].data();
                      lastMessageText = lastMsg.text || "";
                      isUnread = lastMsg.senderId === customerId && lastMsg.isRead === false;
                    }
                  } catch (msgError) {
                    console.log(`[HostInbox] Σφάλμα ανάγνωσης μηνυμάτων για chat ${chatDoc.id}:`, msgError);
                  }

                  const apartmentTitle = chatData.apartmentTitle?.trim() || "Apartment";
                  const customerName = customerData?.name?.trim() || DELETED_ACCOUNT_LABEL;
                  const photos = Array.isArray(customerData?.photos) ? customerData.photos : [];
                  const customerAvatar = customerData?.photoUrl || photos[0] || "";

                  // 🎯 ΔΙΟΡΘΩΣΗ: Διαβάζουμε το blockedByUsers map
                  const blockedMap = (chatData as any).blockedByUsers ?? {};
                  const isBlocker = blockedMap[currentUid] === true;
                  const isBlocked = blockedMap[customerId] === true;

                  return {
                    id: chatDoc.id,
                    customerId,
                    customerName,
                    customerAvatar,
                    apartmentTitle,
                    chatRoomId: chatDoc.id,
                    status: chatData.status ?? "active",
                    initiatedBy: chatData.initiatedBy ?? null,
                    isUnread,
                    lastMessageText,
                    sortKey: toMillis(chatData.lastMessageTimestamp) || toMillis(chatData.updatedAt) || toMillis(chatData.createdAt), 
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
  }, [auth.isGuest, auth.userId]);

  const handleOpenChat = (item: HostInboxItem) => {
    if (activeContextChatId) {
      setActiveContextChatId(null);
      return;
    }
    if (item.status === "active" || item.status === "rejected") {
      router.push({ pathname: "/chat/[id]", params: { id: item.customerId, chatRoomId: item.chatRoomId } });
    }
  };

  const handleConfirmDeleteChat = async () => {
    if (!auth.userId || !chatToDelete) return;
    setDeletingChatId(chatToDelete.chatRoomId);
    try {
      await setDoc(
        doc(db, "chats", chatToDelete.chatRoomId),
        {
          deletedBy: arrayUnion(auth.userId),
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

  const handleAcceptChat = async (item: HostInboxItem) => {
    if (!auth.userId || !item.chatRoomId) return;
    setAcceptingChatId(item.chatRoomId);
    try {
      await updateDoc(doc(db, "chats", item.chatRoomId), {
        status: "active",
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
    setDeletingChatId(item.chatRoomId);
    try {
      await deleteDoc(doc(db, "chats", item.chatRoomId));
    } finally {
      setDeletingChatId(null);
    }
  };

  return (
    <View style={styles.container} testID="host-inbox-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}> 
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t("host-inbox.title")}</Text>
          <Text style={styles.subtitle}>{t("host-inbox.subtitle")}</Text>
        </View>
      </View>

      {auth.isGuest ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("common.cta.signInOrRegister")}</Text>
        </View>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("host-inbox.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("host-inbox.emptySub")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            
            // 🎯 ΔΙΟΡΘΩΣΗ: Δυναμική αλλαγή ονόματος και avatar βάσει block state
            let customerName = item.customerName;
            let hasAvatar = !!item.customerAvatar;

            if (item.isBlocker) {
              customerName = "Blocked Account";
              hasAvatar = false;
            } else if (item.isBlocked) {
              customerName = t("common.account.deleted") || "Deleted Account";
              hasAvatar = false;
            }
            
            const isPending = item.status === "pending";
            const isRejected = item.status === "rejected";
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
                style={styles.row}
                onPress={() => handleOpenChat(item)}
                onLongPress={() => setActiveContextChatId(item.id)}
                delayLongPress={350}
                disabled={isPending}
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
                    <Text style={styles.rowName} numberOfLines={1}>{item.customerName}</Text>
                    <Text style={styles.apartmentTitle} numberOfLines={1}>{item.apartmentTitle}</Text>
                  </View>

                  {isPending ? (
                    isReceiver ? (
                      acceptingChatId === item.chatRoomId ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerCopy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
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
  avatar: { width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  rowText: { flex: 1, gap: 3, justifyContent: 'center' },
  rowNameHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowName: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  apartmentTitle: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.brand, textAlign: "right" },
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