import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { LeadReadinessKey } from "../broker-client-detail";
import { getPipelineStageConfig, type PipelineStageKey } from "@/src/constants/pipeline";

export interface BrokerApartment {
  id: string;
  title: string;
  rent: number;
  city: string;
  area: string;
  size: number;
  image: string;
  tags: string[];
  hostId?: string;
  ownerDetails?: { name?: string; motivation?: string; priceExpectation?: number | null };
  documents?: Record<string, BrokerDocument[]>;
  [key: string]: unknown;
}

export interface BrokerDocument {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export interface BrokerOwnerItem {
  name: string;
  apartments: BrokerApartment[];
}

export interface FilterSetPayload {
  title?: string;
  rentMin?: string;
  rentMax?: string;
  minSqmPrice?: string;
  maxSqmPrice?: string;
  cityQuery?: string;
  sizeMin?: string;
  sizeMax?: string;
  petFriendly?: boolean;
  nearMetro?: boolean;
  sortBy?: string;
  summary?: string;
}

export interface BrokerClientLead {
  clientUserId: string;
  clientName: string;
  clientAvatar: string;
  chatRoomId: string;
  sharedFilterSet?: FilterSetPayload & { sharedAt?: number };
  leadReadiness?: LeadReadinessKey | null;
  pipelineStage?: PipelineStageKey;
  pipelinePercentage?: number;
  pipelineStageLabel?: string;
  activeApartmentTitle?: string | null;
}

type BrokerHubSegment = "clients" | "owners";
const SWIPE_THRESHOLD = 56;

function mapApartment(id: string, data: Record<string, unknown>): BrokerApartment {
  return {
    ...data,
    id,
    title: typeof data.title === "string" ? data.title : "Ακίνητο",
    rent: Number(data.rent ?? data.price ?? 0),
    city: typeof data.city === "string" ? data.city : "",
    area: typeof data.area === "string" ? data.area : "",
    size: Number(data.size ?? data.sqft ?? 0),
    image: typeof data.image === "string" ? data.image : typeof data.imageUrl === "string" ? data.imageUrl : Array.isArray(data.images) ? String(data.images[0] ?? "") : "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
  };
}

export default function BrokerHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedSegment, setSelectedSegment] = useState<BrokerHubSegment>("clients");
  const [owners, setOwners] = useState<BrokerOwnerItem[]>([]);
  const [clients, setClients] = useState<BrokerClientLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const swipeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const loadBrokerData = async () => {
      if (!auth.userId) return;
      setIsLoading(true);
      try {
        const [ownedApartmentsSnap, assignedApartmentsSnap, chatsSnap] = await Promise.all([
          getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))),
          getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", auth.userId))),
          getDocs(query(collection(db, "chats"), where("users", "array-contains", auth.userId), where("type", "==", "host"))),
        ]);
        const ownerMap = new Map<string, BrokerOwnerItem>();
        const apartmentDocs = new Map(ownedApartmentsSnap.docs.map((listing) => [listing.id, listing]));
        assignedApartmentsSnap.docs.forEach((listing) => apartmentDocs.set(listing.id, listing));
        apartmentDocs.forEach((listing) => {
          const apartment = mapApartment(listing.id, listing.data() as Record<string, unknown>);
          const details = apartment.ownerDetails;
          const name = details?.name?.trim();
          if (!name) return;
          const current = ownerMap.get(name) ?? { name, apartments: [] };
          current.apartments.push(apartment);
          ownerMap.set(name, current);
        });
        const clientItems: (BrokerClientLead | null)[] = await Promise.all(chatsSnap.docs.map(async (chat): Promise<BrokerClientLead | null> => {
          const data = chat.data() as { users?: string[]; brokerChatRole?: string };
          if (data.brokerChatRole === "owner") return null;
          const clientUserId = data.users?.find((userId) => userId !== auth.userId);
          if (!clientUserId) return null;
          const [userSnap, profileSnap, messagesSnapshot] = await Promise.all([
            getDoc(doc(db, "users", clientUserId)),
            getDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${clientUserId}`)),
            getDocs(collection(db, "chats", chat.id, "messages")),
          ]);
          const user = userSnap.exists() ? userSnap.data() : {};
          const profileData = profileSnap.exists() ? profileSnap.data() as { leadReadiness?: LeadReadinessKey | null; pipelineStage?: PipelineStageKey; activeApartmentTitle?: string | null } : {};
          const stageConfig = getPipelineStageConfig(profileData.pipelineStage);
          const shared = messagesSnapshot.docs
            .map((message) => message.data() as { type?: string; filterSetData?: BrokerClientLead["sharedFilterSet"] })
            .filter((message) => message.type === "filter_set_share" && message.filterSetData)
            .at(-1)?.filterSetData;
          return {
            clientUserId,
            clientName: typeof user.name === "string" ? user.name : "Πελάτης",
            clientAvatar: typeof user.photoUrl === "string" ? user.photoUrl : typeof user.avatar === "string" ? user.avatar : Array.isArray(user.photos) ? String(user.photos[0] ?? "") : "",
            chatRoomId: chat.id,
            leadReadiness: profileData.leadReadiness ?? null,
            pipelineStage: stageConfig.key,
            pipelinePercentage: Math.round(stageConfig.probability * 100),
            pipelineStageLabel: stageConfig.label,
            activeApartmentTitle: profileData.activeApartmentTitle,
            ...(shared ? { sharedFilterSet: shared } : {}),
          } satisfies BrokerClientLead;
        }));
        if (active) {
          setOwners([...ownerMap.values()]);
          setClients(clientItems.filter((client): client is BrokerClientLead => client !== null));
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadBrokerData();
    return () => { active = false; };
  }, [auth.userId]);

  const handleSwipeTabChange = useCallback((direction: "left" | "right") => {
    setSelectedSegment(direction === "left" ? "owners" : "clients");
  }, []);
  const contentPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderMove: (_evt, gestureState) => swipeX.setValue(gestureState.dx * 0.35),
    onPanResponderRelease: (_evt, gestureState) => {
      if (gestureState.dx <= -SWIPE_THRESHOLD) handleSwipeTabChange("left");
      else if (gestureState.dx >= SWIPE_THRESHOLD) handleSwipeTabChange("right");
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start(),
  }), [handleSwipeTabChange, swipeX]);

  const clientsActive = selectedSegment === "clients";
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]} testID="broker-hub-screen">
      <View style={styles.header}>
        <Text style={styles.brand}>{t("common.brandPrefix")}<Text style={styles.brandAccent}>{t("common.brandSuffix")}</Text></Text>
      </View>
      <View style={styles.toggleShell}>
        <Pressable style={[styles.toggleOption, clientsActive && styles.toggleOptionActive]} onPress={() => setSelectedSegment("clients")} testID="broker-hub-toggle-clients"><Text style={[styles.toggleText, clientsActive && styles.toggleTextActive]}>Πελάτες</Text></Pressable>
        <Pressable style={[styles.toggleOption, !clientsActive && styles.toggleOptionActive]} onPress={() => setSelectedSegment("owners")} testID="broker-hub-toggle-owners"><Text style={[styles.toggleText, !clientsActive && styles.toggleTextActive]}>Ιδιοκτήτες</Text></Pressable>
      </View>
      {isLoading ? <ActivityIndicator testID="broker-hub-loading" color={colors.brand} /> : (
        <Animated.View style={[styles.contentArea, { transform: [{ translateX: swipeX }] }]} {...contentPanResponder.panHandlers}>
          {clientsActive ? <FlatList data={clients} testID="broker-clients-list" keyExtractor={(item) => item.clientUserId} ListEmptyComponent={<Text style={styles.emptyStateSubtitle}>Δεν υπάρχουν πελάτες ακόμα.</Text>} renderItem={({ item }) => (
            <Pressable style={styles.clientRowCard} testID={`broker-client-row-${item.clientUserId}`} onPress={() => router.push({ pathname: "/broker-client-detail", params: { clientUserId: item.clientUserId, clientName: item.clientName, clientAvatar: item.clientAvatar, chatRoomId: item.chatRoomId, sharedFilterSet: item.sharedFilterSet ? JSON.stringify(item.sharedFilterSet) : "" } })}>
              {item.clientAvatar ? <Image source={{ uri: item.clientAvatar }} style={styles.clientAvatar} /> : <DefaultProfileAvatar size={48} />}
              <View style={styles.clientInfoCol}><View style={styles.clientNameRow}><Text style={styles.rowTitle} numberOfLines={1}>{item.clientName}</Text>{item.leadReadiness === "hot" ? <Ionicons name="flame" size={18} color="#EF4444" style={styles.readinessIcon} /> : item.leadReadiness === "warm" ? <Ionicons name="sunny" size={18} color="#F59E0B" style={styles.readinessIcon} /> : item.leadReadiness === "cold" ? <Ionicons name="snow" size={18} color="#38BDF8" style={styles.readinessIcon} /> : null}</View><View style={styles.pipelineBadgeRow}><View style={styles.pipelinePercentPill}><Text style={styles.pipelinePercentText}>{`${item.pipelinePercentage ?? 10}% · ${item.pipelineStageLabel ?? "Νέο Lead"}`}</Text></View>{item.activeApartmentTitle ? <Text numberOfLines={1} style={styles.activeApartmentSub}>{item.activeApartmentTitle}</Text> : null}</View></View>
                {item.sharedFilterSet ? <View style={styles.filterBadge}><Ionicons name="options-outline" size={16} color={colors.brand} /></View> : null}
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          )} /> : <FlatList data={owners} testID="broker-owners-list" keyExtractor={(item) => item.name} ListEmptyComponent={<Text style={styles.emptyStateSubtitle}>Δεν υπάρχουν ιδιοκτήτες ακόμα.</Text>} renderItem={({ item, index }) => (
            <Pressable style={styles.ownerRowCard} testID={`broker-owner-row-${index}`} onPress={() => router.push({ pathname: "/broker-owner-detail", params: { ownerName: item.name, apartmentIds: JSON.stringify(item.apartments.map((apartment) => apartment.id)) } })}>
              <View style={styles.rowMain}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.countPill}>{item.apartments.length} ακίνητα</Text></View><Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          )} />}
        </Animated.View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }, brand: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface }, brandAccent: { color: colors.brand }, toggleShell: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4, marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 4 }, toggleOption: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.pill }, toggleOptionActive: { backgroundColor: colors.brand }, toggleText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface }, toggleTextActive: { color: colors.onBrand }, contentArea: { flex: 1, paddingHorizontal: spacing.lg }, ownerRowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, clientRowCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, rowMain: { flex: 1, gap: spacing.xs }, rowTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface }, motivationBadge: { alignSelf: "flex-start", color: colors.onSurfaceTertiary, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, fontSize: fontSize.sm }, countPill: { alignSelf: "flex-start", color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.sm }, clientAvatar: { width: 48, height: 48, borderRadius: radius.pill }, filterBadge: { padding: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary }, emptyStateSubtitle: { textAlign: "center", color: colors.onSurfaceTertiary, fontFamily: fonts.regular, padding: spacing.xl },
  clientNameRow: { flex: 1, flexDirection: "row", alignItems: "center" }, clientInfoCol: { flex: 1, gap: 2 }, pipelineBadgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2, flexWrap: "wrap" }, pipelinePercentPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.xs + 2, paddingVertical: 2, borderRadius: radius.pill }, pipelinePercentText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand }, activeApartmentSub: { flexShrink: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary }, readinessIcon: { marginLeft: spacing.xs },
});
