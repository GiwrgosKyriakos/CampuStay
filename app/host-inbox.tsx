import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import { t } from "@/src/locales";

interface FirestoreUserDoc {
  name?: string | null;
  deleted?: boolean;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  deletedBy?: string[];
  apartmentTitle?: string;
  apartmentId?: string;
  status?: "pending" | "active";
  initiatedBy?: string | null;
  lastMessageTimestamp?: { toMillis?: () => number } | number | null;
  updatedAt?: { toMillis?: () => number } | number | null;
  createdAt?: { toMillis?: () => number } | number | null;
}

interface HostInboxItem {
  id: string;
  customerId: string;
  customerName: string;
  apartmentTitle: string;
  chatRoomId: string;
  isUnread: boolean;
  sortKey: number;
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

export default function HostInboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [items, setItems] = useState<HostInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeContextChatId, setActiveContextChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<HostInboxItem | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

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
      where("users", "array-contains", currentUid),
      where("type", "==", "host"),
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
            const rows = await Promise.all(
              snapshot.docs
                .filter((chatDoc) => {
                  const chatData = chatDoc.data() as FirestoreHostChatDoc;
                  const deletedBy = Array.isArray(chatData.deletedBy) ? chatData.deletedBy : [];
                  return !deletedBy.includes(currentUid);
                })
                .map(async (chatDoc) => {
                const chatData = chatDoc.data() as FirestoreHostChatDoc;
                const users = Array.isArray(chatData.users) ? chatData.users : [];
                const customerId = users.find((uid) => uid !== currentUid) || "";
                if (!customerId) return null;

                const [customerSnap, unreadSnap] = await Promise.all([
                  getDoc(doc(db, "users", customerId)),
                  getDocs(
                    query(
                      collection(db, "chats", chatDoc.id, "messages"),
                      where("senderId", "==", customerId),
                      where("isRead", "==", false),
                    ),
                  ),
                ]);

                const customerData = customerSnap.exists() ? (customerSnap.data() as FirestoreUserDoc) : null;
                const apartmentTitle = chatData.apartmentTitle?.trim() || t("apartmentDetail.dataUnavailable");
                const customerName = customerData?.name?.trim() || DELETED_ACCOUNT_LABEL;

                return {
                  id: chatDoc.id,
                  customerId,
                  customerName,
                  apartmentTitle,
                  chatRoomId: chatDoc.id,
                  isUnread: !unreadSnap.empty,
                  sortKey:
                    toMillis(chatData.lastMessageTimestamp) ||
                    toMillis(chatData.updatedAt) ||
                    toMillis(chatData.createdAt),
                } as HostInboxItem;
              }),
            );

            if (mounted) {
              setItems(
                rows
                  .filter((row): row is HostInboxItem => !!row)
                  .sort((a, b) => b.sortKey - a.sortKey),
              );
            }
          } catch {
            if (mounted) setItems([]);
          } finally {
            if (mounted) setLoading(false);
          }
        })();
      },
      () => {
        if (mounted) {
          setItems([]);
          setLoading(false);
        }
      },
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
    router.push({ pathname: "/chat/[id]", params: { id: item.customerId, chatRoomId: item.chatRoomId } });
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

  return (
    <View style={styles.container} testID="host-inbox-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}> 
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="host-inbox-back-button">
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
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={styles.row}
              onPress={() => handleOpenChat(item)}
              onLongPress={() => setActiveContextChatId(item.id)}
              delayLongPress={350}
              testID={`host-inbox-row-${item.id}`}
            >
              {activeContextChatId === item.id ? (
                <View style={styles.contextTooltip} testID={`host-inbox-delete-tooltip-${item.id}`}>
                  <Pressable
                    style={styles.contextTooltipAction}
                    onPress={() => setChatToDelete(item)}
                    testID={`host-inbox-delete-action-${item.id}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={styles.contextTooltipText}>{t("chatList.deleteThisChat")}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {item.customerName}
                  </Text>
                  <Text style={styles.apartmentTitle} numberOfLines={1}>
                    {item.apartmentTitle}
                  </Text>
                </View>
              </View>
              <View style={styles.rowSide}>
                {item.isUnread && <View style={styles.unreadDot} />}
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </View>
            </Pressable>
          ))}
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
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowMain: { flex: 1 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  customerName: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  apartmentTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "right", flexShrink: 1 },
  rowSide: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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