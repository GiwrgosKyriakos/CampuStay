import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { t } from "@/src/locales";

export interface ReceivedProposalList {
  id: string;
  title: string;
  apartmentIds: string[];
  brokerId: string;
  brokerName: string;
  brokerAvatar: string;
  createdAtMillis: number;
}

interface ProposalListsPickerModalProps {
  visible: boolean;
  selectedListId: string | null;
  onSelectList: (list: ReceivedProposalList | null) => void;
}

export default function ProposalListsPickerModal({ visible, selectedListId, onSelectList }: ProposalListsPickerModalProps) {
  const auth = useAuth();
  const { colors } = useTheme();
  const [lists, setLists] = useState<ReceivedProposalList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !auth.userId) return;
    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const chatsSnapshot = await getDocs(query(collection(db, "chats"), where("users", "array-contains", auth.userId)));
        const brokerCache = new Map<string, { name: string; avatar: string }>();
        const listItems: ReceivedProposalList[] = [];

        for (const chatDoc of chatsSnapshot.docs) {
          const messagesSnapshot = await getDocs(collection(db, "chats", chatDoc.id, "messages"));
          for (const messageDoc of messagesSnapshot.docs) {
            const data = messageDoc.data() as Record<string, unknown>;
            if (data.type !== "property_list_share" && data.type !== "property_list") continue;
            const apartmentIds = Array.isArray(data.apartmentIds) ? data.apartmentIds.filter((id): id is string => typeof id === "string") : [];
            const senderId = typeof data.senderId === "string" ? data.senderId : "";
            if (!senderId || apartmentIds.length === 0) continue;

            let broker = brokerCache.get(senderId);
            if (!broker) {
              const userSnapshot = await getDoc(doc(db, "users", senderId));
              const userData = userSnapshot.exists() ? userSnapshot.data() as Record<string, unknown> : {};
              broker = {
                name: typeof userData.name === "string" && userData.name.trim() ? userData.name.trim() : t("agency.picker.brokerFallback"),
                avatar: typeof userData.photoUrl === "string" ? userData.photoUrl : Array.isArray(userData.photos) ? String(userData.photos[0] ?? "") : "",
              };
              brokerCache.set(senderId, broker);
            }

            const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
            listItems.push({
              id: typeof data.listId === "string" ? data.listId : messageDoc.id,
              title: typeof data.listTitle === "string" ? data.listTitle : t("agency.picker.proposedProperties"),
              apartmentIds,
              brokerId: senderId,
              brokerName: broker.name,
              brokerAvatar: broker.avatar,
              createdAtMillis: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now(),
            });
          }
        }

        if (active) setLists(listItems.sort((first, second) => second.createdAtMillis - first.createdAtMillis));
      } catch (error) {
        console.warn("[ProposalListsPicker] Error fetching proposal lists:", error);
        if (active) setLists([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [auth.userId, visible]);

  if (!visible) return null;

  return (
    <View style={styles.content}>
      {loading ? <ActivityIndicator color={colors.brand} style={styles.loading} /> : lists.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>{t("agency.picker.noProposalLists")}</Text>
      ) : (
        <FlatList
            data={lists}
            keyExtractor={(item, index) => `${item.id}-${item.brokerId}-${index}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const isSelected = selectedListId === item.id;
              return (
                <Pressable style={[styles.listCard, { borderColor: isSelected ? colors.brand : colors.border, backgroundColor: colors.surfaceSecondary }]} onPress={() => onSelectList(isSelected ? null : item)}>
                  <View style={styles.listCardHeader}>
                    <Ionicons color={colors.brand} name="folder-open-outline" size={20} />
                    <Text style={[styles.listCardTitle, { color: colors.onSurface }]} numberOfLines={1}>{item.title}</Text>
                    <View style={[styles.countPill, { backgroundColor: colors.brandTertiary }]}><Text style={[styles.countText, { color: colors.brand }]}>{t("agency.picker.propertyCount", { count: item.apartmentIds.length })}</Text></View>
                  </View>
                  <View style={styles.brokerRow}>
                    {item.brokerAvatar ? <Image source={{ uri: item.brokerAvatar }} style={styles.brokerAvatar} contentFit="cover" /> : <DefaultProfileAvatar size={24} iconSize={12} />}
                    <Text style={[styles.brokerNameText, { color: colors.onSurfaceTertiary }]}>{t("agency.picker.sentBy", { name: item.brokerName })}</Text>
                  </View>
                </Pressable>
              );
            }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { minHeight: 160, maxHeight: 420 },
  loading: { marginVertical: spacing.xl },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  listCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm },
  listCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  listCardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base },
  countPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  countText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  brokerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: spacing.xs },
  brokerAvatar: { width: 24, height: 24, borderRadius: radius.pill },
  brokerNameText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  emptyText: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.sm, paddingVertical: spacing.xl },
});
