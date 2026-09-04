import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, onSnapshot, orderBy, query, updateDoc, writeBatch, doc } from "firebase/firestore";

import ScreenHeader from "@/src/components/ScreenHeader";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { db } from "@/src/config/firebase";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";

type NotificationFeedItem = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  screen?: string;
  params?: Record<string, unknown>;
  action?: string;
  entityId?: string;
  read?: boolean;
  createdAt?: unknown;
};

type IconName = keyof typeof Ionicons.glyphMap;

const ROUTE_ALIASES: Record<string, string> = {
  calendar: "/(tabs)/calendar",
  broker: "/(tabs)/broker",
  profile: "/(tabs)/profile",
};

function notificationRoute(screen?: string): string {
  if (!screen) return "/notifications";
  return ROUTE_ALIASES[screen] ?? (screen.startsWith("/") ? screen : `/${screen}`);
}

function iconForType(type?: string): IconName {
  if (type === "new_offer" || type === "price_drop" || type === "closed_deal" || type === "deal_stage_update") return "cash-outline";
  if (type?.startsWith("visit") || type === "post_visit_rating") return "calendar-outline";
  if (type === "broker_registration" || type === "broker_approved" || type === "high_match") return "person-outline";
  if (type === "document_required") return "document-text-outline";
  return "notifications-outline";
}

function timestampMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (value && typeof value === "object" && typeof (value as { _seconds?: unknown })._seconds === "number") return (value as { _seconds: number })._seconds * 1000;
  return 0;
}

function formatTimestamp(value: unknown): string {
  const milliseconds = timestampMillis(value);
  return milliseconds > 0 ? new Date(milliseconds).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function NotificationFeedScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const userId = auth.userId ?? "";
  const isAdmin = ["admin", "ceo", "secretary", "secretariat"].includes((auth.agencyRole ?? "").toLowerCase());

  useEffect(() => {
    if (!userId || auth.isGuest) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notificationsQuery = query(collection(db, "users", userId, "notifications"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setItems(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as NotificationFeedItem)));
      setLoading(false);
    }, () => {
      setItems([]);
      setLoading(false);
    });
    return unsubscribe;
  }, [auth.isGuest, userId]);

  const markRead = async (item: NotificationFeedItem) => {
    if (item.read) return;
    await updateDoc(doc(db, "users", userId, "notifications", item.id), { read: true });
  };

  const openItem = async (item: NotificationFeedItem) => {
    await markRead(item).catch(() => undefined);
    const params = item.params && typeof item.params === "object" ? item.params : {};
    const routeParams = item.action ? { ...params, action: item.action } : params;
    const route = notificationRoute(item.screen);
    if (route === "/chat/[id]") {
      const chatId = typeof routeParams.chatId === "string" ? routeParams.chatId : typeof routeParams.conversationId === "string" ? routeParams.conversationId : "";
      router.push({ pathname: route, params: { ...routeParams, id: chatId } } as never);
      return;
    }
    router.push({ pathname: route, params: routeParams } as never);
  };

  const markAllRead = async () => {
    const unread = items.filter((item) => !item.read);
    if (unread.length === 0 || !userId || saving) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      unread.forEach((item) => batch.update(doc(db, "users", userId, "notifications", item.id), { read: true }));
      await batch.commit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("notifications.title")} onBackPress={() => router.back()} backButtonTestID="notification-feed-back-button" />
      <View style={styles.toolbar}>
        <Text style={styles.heading}>{isAdmin ? "Σημαντικές Ενημερώσεις" : "Ιστορικό Ειδοποιήσεων"}</Text>
        <Pressable onPress={() => void markAllRead()} disabled={saving || items.every((item) => item.read)} testID="notification-feed-mark-all">
          <Text style={[styles.markAll, (saving || items.every((item) => item.read)) && styles.disabledText]}>Σήμανση όλων ως αναγνωσμένων</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty} testID="notification-feed-empty">
          <Ionicons name="notifications-off-outline" size={42} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Δεν υπάρχουν ειδοποιήσεις</Text>
          <Text style={styles.emptyBody}>Οι νέες ενημερώσεις θα εμφανιστούν εδώ.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const highPriority = isAdmin && (item.type === "broker_registration" || item.type === "closed_deal");
            return (
              <Pressable
                onPress={() => void openItem(item)}
                style={({ pressed }) => [styles.item, !item.read && styles.unread, highPriority && styles.highPriority, pressed && styles.pressed]}
                testID={`notification-feed-item-${item.id}`}
              >
                <View style={[styles.iconWrap, highPriority && styles.highPriorityIcon]}>
                  <Ionicons name={iconForType(item.type)} size={22} color={highPriority ? colors.error : colors.brand} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>{item.title || "Ειδοποίηση"}</Text>
                    {!item.read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.body} numberOfLines={3}>{item.body || ""}</Text>
                  <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  toolbar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  heading: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.lg },
  markAll: { color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  disabledText: { color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  item: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  unread: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  highPriority: { borderColor: colors.error, borderWidth: 2 },
  pressed: { opacity: 0.78 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  highPriorityIcon: { backgroundColor: `${colors.error}18` },
  copy: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  title: { flex: 1, color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.base },
  body: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  timestamp: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.xs },
  unreadDot: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: colors.brand },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.lg },
  emptyBody: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm, textAlign: "center" },
});
