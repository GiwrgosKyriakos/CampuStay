import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDocs, query, updateDoc, where, addDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "expo-router";

import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";
import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

interface PropertyDoc {
  title?: string;
  rent?: number;
  price?: number;
  area?: string;
  city?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  status?: string;
  isOffMarket?: boolean;
  createdAt?: unknown;
  hostId?: string;
  creatorId?: string;
}

export interface RoommatePropertyParticipant {
  id: string;
  name: string;
}

export interface RoommateProperty {
  id: string;
  title: string;
  rent: number;
  area: string;
  city: string;
  image: string;
  ownerId: string;
  ownerName: string;
}

export interface RoommatePropertySelectorModalProps {
  visible: boolean;
  chatRoomId: string;
  currentUserId: string;
  participants: RoommatePropertyParticipant[];
  pinnedApartmentId?: string;
  onClose: () => void;
  onActivePropertyChanged: (property: RoommateProperty) => void;
}

function timestampMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return 0;
  const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  return typeof timestamp.seconds === "number" ? timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000) : 0;
}

function isActiveProperty(data: PropertyDoc): boolean {
  return data.status === "active" || (!data.status && data.isOffMarket !== true);
}

export default function RoommatePropertySelectorModal({ visible, chatRoomId, currentUserId, participants, pinnedApartmentId, onClose, onActivePropertyChanged }: RoommatePropertySelectorModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [properties, setProperties] = useState<RoommateProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    void Promise.all(participants.flatMap((participant) => [
      getDocs(query(collection(db, "apartments"), where("hostId", "==", participant.id))).catch(() => null),
      getDocs(query(collection(db, "apartments"), where("creatorId", "==", participant.id))).catch(() => null),
    ])).then((snapshots) => {
      const byId = new Map<string, RoommateProperty>();
      snapshots.forEach((snapshot, index) => {
        if (!snapshot) return;
        const participant = participants[Math.floor(index / 2)];
        snapshot.docs.forEach((apartment) => {
          const data = apartment.data() as PropertyDoc;
          if (!participant || !isActiveProperty(data)) return;
          byId.set(apartment.id, {
            id: apartment.id,
            title: data.title?.trim() || t("apartments.unknownListing"),
            rent: typeof data.rent === "number" ? data.rent : data.price ?? 0,
            area: data.area?.trim() || "",
            city: data.city?.trim() || "",
            image: data.image || data.imageUrl || data.images?.[0] || "",
            ownerId: participant.id,
            ownerName: participant.name,
          });
        });
      });
      const ordered = [...byId.values()].sort((left, right) => left.title.localeCompare(right.title));
      if (active) setProperties(ordered);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [participants, visible]);

  const setActive = async (property: RoommateProperty) => {
    if (!currentUserId || savingId) return;
    setSavingId(property.id);
    try {
      await updateDoc(doc(db, "chats", chatRoomId), {
        pinnedApartmentId: property.id,
        hostApartmentId: property.id,
        "groupMetadata.pinnedApartmentId": property.id,
        "groupMetadata.hostApartmentId": property.id,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "active_property_updated",
        text: `${t("chat.groupProfile.activePropertyUpdated")}: ${property.title}`,
        metadata: { apartmentId: property.id, apartmentTitle: property.title },
        createdAt: serverTimestamp(),
        isRead: true,
      });
      onActivePropertyChanged(property);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable>
      <View style={styles.content} testID="roommate-property-selector-modal">
        <View style={styles.header}>
          <Text style={styles.title}>{t("chat.groupProfile.selectProperty")}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={25} color={colors.onSurfaceTertiary} /></Pressable>
        </View>
        {loading ? <ActivityIndicator color={colors.brand} /> : properties.length === 0 ? <Text style={styles.empty}>{t("chat.groupProfile.noProperties")}</Text> : properties.map((property) => {
          const isPinned = property.id === pinnedApartmentId;
          return (
            <View key={property.id} style={styles.card}>
              <Pressable style={styles.cardMain} onPress={() => router.push({ pathname: "/apartment-detail", params: { id: property.id } })} testID={`group-property-view-${property.id}`}>
                {property.image ? <Image source={{ uri: property.image }} style={styles.image} contentFit="cover" /> : <View style={styles.imageFallback}><Ionicons name="home-outline" size={21} color={colors.onSurfaceTertiary} /></View>}
                <View style={styles.copy}>
                  <Text style={styles.propertyTitle} numberOfLines={1}>{property.title}</Text>
                  <Text style={styles.location} numberOfLines={1}>{[property.area, property.city].filter(Boolean).join(" · ")}</Text>
                  <Text style={styles.owner} numberOfLines={1}>{`${t("chat.groupProfile.propertyOwner")}: ${property.ownerName}`}</Text>
                  <Text style={styles.price}>{`€${property.rent}`}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
              {isPinned ? <View style={styles.activeBadge}><Ionicons name="checkmark-circle" size={15} color={colors.onBrandTertiary} /><Text style={styles.activeBadgeText}>{t("chat.groupProfile.activeProperty")}</Text></View> : <Pressable style={styles.setActiveButton} onPress={() => void setActive(property)} disabled={!!savingId} testID={`group-property-set-active-${property.id}`}><Text style={styles.setActiveText}>{savingId === property.id ? t("common.actions.saving") : t("chat.groupProfile.setActive")}</Text></Pressable>}
            </View>
          );
        })}
      </View>
    </BaseBottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  empty: { paddingVertical: spacing.xl, textAlign: "center", fontFamily: fonts.regular, color: colors.onSurfaceTertiary },
  card: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  cardMain: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  image: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  imageFallback: { width: 64, height: 64, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  copy: { flex: 1, gap: 3 },
  propertyTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  location: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  owner: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  price: { alignSelf: "flex-start", fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  activeBadgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onBrandTertiary },
  setActiveButton: { minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.surface },
  setActiveText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.brand },
});