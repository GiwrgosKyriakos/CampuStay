import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { sendPropertyCardMessage, type PropertyCardMessageData } from "@/src/api/chat";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

interface ShareChatDoc {
  users?: string[];
  type?: string;
  status?: string;
  deletedForUsers?: string[] | Record<string, boolean>;
  deletedUsers?: Record<string, boolean>;
  blockedUsers?: string[] | Record<string, boolean>;
  blockedByUsers?: string[] | Record<string, boolean>;
  rejectedUsers?: string[] | Record<string, boolean>;
  rejectedBy?: string | null;
  rejections?: string[] | Record<string, boolean>;
  memberStatuses?: Record<string, string>;
}

interface ShareUserDoc {
  name?: string;
  role?: string | null;
  isBroker?: boolean;
  is_broker?: boolean;
  agencyId?: string | null;
  deleted?: boolean;
  isDeleted?: boolean;
  deletedAt?: unknown;
  status?: string;
  blockedUsers?: string[] | Record<string, boolean>;
  blockedByUsers?: string[] | Record<string, boolean>;
  rejected?: boolean;
}

interface ListingShareTarget {
  chatRoomId: string;
  userId: string;
  label: string;
}

export interface SelectListingShareTargetModalProps {
  visible: boolean;
  currentUserId: string;
  apartment: PropertyCardMessageData;
  onClose: () => void;
  onSent: () => void;
}

function includesUser(values: string[] | Record<string, boolean> | undefined, userId: string): boolean {
  if (Array.isArray(values)) return values.includes(userId);
  return values?.[userId] === true;
}

function isBrokerProfile(user: ShareUserDoc): boolean {
  return user.isBroker === true || user.is_broker === true || user.role === "broker" || Boolean(user.agencyId?.trim());
}

function isDeletedForUser(chat: ShareChatDoc, userId: string): boolean {
  return includesUser(chat.deletedForUsers, userId) || chat.deletedUsers?.[userId] === true;
}

function isRejectedForUser(chat: ShareChatDoc, currentUserId: string, targetUserId: string): boolean {
  const involvedIds = [currentUserId, targetUserId];
  return chat.status === "rejected"
    || involvedIds.includes(chat.rejectedBy ?? "")
    || involvedIds.some((userId) => includesUser(chat.rejectedUsers, userId) || includesUser(chat.rejections, userId) || chat.memberStatuses?.[userId] === "rejected");
}

function isBlockedForUser(chat: ShareChatDoc, user: ShareUserDoc, currentUserId: string): boolean {
  return includesUser(chat.blockedUsers, currentUserId)
    || includesUser(chat.blockedByUsers, currentUserId)
    || includesUser(user.blockedUsers, currentUserId)
    || includesUser(user.blockedByUsers, currentUserId);
}

export default function SelectListingShareTargetModal({ visible, currentUserId, apartment, onClose, onSent }: SelectListingShareTargetModalProps) {
  const { colors } = useTheme();
  const [targets, setTargets] = useState<ListingShareTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !currentUserId) return;
    let active = true;
    setLoading(true);
    setErrorText(null);

    void (async () => {
      try {
        const chatsSnapshot = await getDocs(query(collection(db, "chats"), where("users", "array-contains", currentUserId)));
        const result: ListingShareTarget[] = [];
        for (const chatDocument of chatsSnapshot.docs) {
          const chat = chatDocument.data() as ShareChatDoc;
          if (chat.type !== "roommate" && chat.type !== "host") continue;
          if ((chat.status ?? "active") !== "active" || isDeletedForUser(chat, currentUserId)) continue;
          const targetUserId = (Array.isArray(chat.users) ? chat.users : []).find((userId) => userId !== currentUserId);
          if (!targetUserId || isRejectedForUser(chat, currentUserId, targetUserId)) continue;

          const userSnapshot = await getDoc(doc(db, "users", targetUserId));
          if (!userSnapshot.exists()) continue;
          const user = userSnapshot.data() as ShareUserDoc;
          if (isBrokerProfile(user) || user.deleted === true || user.isDeleted === true || user.deletedAt != null || user.rejected === true || user.status === "rejected" || isBlockedForUser(chat, user, currentUserId)) continue;

          result.push({
            chatRoomId: chatDocument.id,
            userId: targetUserId,
            label: user.name?.trim() || t("common.values.unknown"),
          });
        }
        if (active) setTargets(result);
      } catch {
        if (active) {
          setTargets([]);
          setErrorText(t("chat.listingShare.loadFailed"));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserId, visible]);

  const handleSend = async (target: ListingShareTarget) => {
    if (sendingChatId) return;
    setSendingChatId(target.chatRoomId);
    setErrorText(null);
    try {
      await sendPropertyCardMessage({
        chatRoomId: target.chatRoomId,
        senderId: currentUserId,
        receiverId: target.userId,
        apartment,
      });
      onSent();
    } catch {
      setErrorText(t("chat.listingShare.sendFailed"));
    } finally {
      setSendingChatId(null);
    }
  };

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="78%">
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.onSurface }]}>{t("chat.listingShare.title")}</Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>{apartment.title}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable>
        </View>
        {loading ? <ActivityIndicator color={colors.brand} /> : (
          <View style={styles.list}>
            {targets.map((target) => (
              <Pressable key={target.chatRoomId} style={[styles.row, { backgroundColor: colors.surfaceSecondary }]} disabled={!!sendingChatId} onPress={() => void handleSend(target)} testID={`listing-share-target-${target.chatRoomId}`}>
                <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]}><Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} /></View>
                <Text style={[styles.label, { color: colors.onSurface }]} numberOfLines={1}>{target.label}</Text>
                {sendingChatId === target.chatRoomId ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />}
              </Pressable>
            ))}
          </View>
        )}
        {errorText ? <Text style={[styles.error, { color: colors.error }]}>{errorText}</Text> : null}
        {!loading && targets.length === 0 && !errorText ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>{t("chat.listingShare.empty")}</Text> : null}
      </View>
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  list: { gap: spacing.sm },
  row: { minHeight: 56, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base },
  empty: { textAlign: "center", fontFamily: fonts.regular, paddingVertical: spacing.lg },
  error: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.sm },
});