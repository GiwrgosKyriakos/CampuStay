import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { getUserId } from "@/src/utils/userId";
import { DELETED_ACCOUNT_LABEL } from "@/src/api/accountDeletion";
import { t } from "@/src/locales";

interface FirestoreUserDoc {
  name?: string | null;
  deleted?: boolean;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
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
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [items, setItems] = useState<HostInboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isGuest) {
      setCurrentUserId("");
      setItems([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    getUserId()
      .then((uid) => {
        if (mounted) setCurrentUserId(uid);
      })
      .catch(() => {
        if (mounted) setCurrentUserId("");
      });

    return () => {
      mounted = false;
    };
  }, [auth.isGuest]);

  useEffect(() => {
    if (auth.isGuest || !currentUserId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let mounted = true;

    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", currentUserId),
      where("type", "==", "host"),
    );

    const unsubscribe = onSnapshot(hostChatsQ, (snapshot) => {
      void (async () => {
        try {
          const rows = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              const users = Array.isArray(chatData.users) ? chatData.users : [];
              const customerId = users.find((uid) => uid !== currentUserId) || "";
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
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.isGuest, currentUserId]);

  const handleOpenChat = (item: HostInboxItem) => {
    router.push({ pathname: "/chat/[id]", params: { id: item.customerId, chatRoomId: item.chatRoomId } });
  };

  return (
    <View style={styles.container} testID="host-inbox-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}> 
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="host-inbox-back-button">
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Incoming Requests</Text>
          <Text style={styles.subtitle}>Host inbox</Text>
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
          <Text style={styles.emptyTitle}>No incoming requests yet</Text>
          <Text style={styles.emptySub}>Chats from customers who contact you will appear here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => handleOpenChat(item)} testID={`host-inbox-row-${item.id}`}>
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
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  row: {
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
});