import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, FlatList } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";

import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import BrokerHubSkeleton from "@/src/components/skeletons/BrokerHubSkeleton";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { LeadReadinessKey } from "../broker-client-detail";
import { getPipelineStageConfig, type PipelineStageKey } from "@/src/constants/pipeline";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";
import { getBrokerDeals } from "@/src/api/brokerClientProfiles";

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
  maxDiscountPercent?: number;
  ownerDetails?: { name?: string; motivation?: string; priceExpectation?: number | null; avatar?: string };
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
  ownerId?: string;
  ownerAvatar?: string;
  aggregatePipelinePercentage: number;
  expectedRevenue: number;
  brokerCommission: number;
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
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  hasMessage: boolean;
  hasPriceProposal: boolean;
  hasVisitRequest: boolean;
  isVisitCompleted: boolean;
  isDealClosed: boolean;
  dealCommission: number;
  weightedShare: number;
}

type BrokerHubSegment = "clients" | "owners";
const SWIPE_THRESHOLD = 56;
const BROKER_COMMISSION_RATE = 1;

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

function getDealPipelinePercentage(stage: "liked" | "lead" | "showing_scheduled" | "offer_made" | "deal_closed" | "lost"): number {
  if (stage === "showing_scheduled") return 40;
  if (stage === "offer_made") return 60;
  if (stage === "deal_closed") return 100;
  return stage === "lost" ? 0 : 10;
}

export default function BrokerHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => ({ ...createStyles(colors), ...createOwnerStyles(colors) }), [colors]);
  const [selectedSegment, setSelectedSegment] = useState<BrokerHubSegment>("clients");
  const [owners, setOwners] = useState<BrokerOwnerItem[]>([]);
  const [clients, setClients] = useState<BrokerClientLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoneyModeActive, setIsMoneyModeActive] = useState(false);
  const swipeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const loadBrokerData = async () => {
      if (!auth.userId) return;
      setIsLoading(true);
      try {
        const [ownedApartmentsSnap, assignedApartmentsSnap, chatsSnap, deals] = await Promise.all([
          getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))),
          getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", auth.userId))),
          getDocs(query(collection(db, "chats"), where("users", "array-contains", auth.userId), where("type", "==", "host"))),
          getBrokerDeals(auth.userId),
        ]);
        const dealByClientApartment = new Map(deals.filter((deal) => deal.role !== "owner").map((deal) => [`${deal.apartmentId}:${deal.clientId}`, deal]));
        const ownerMap = new Map<string, BrokerOwnerItem>();
        const apartmentDocs = new Map(ownedApartmentsSnap.docs.map((listing) => [listing.id, listing]));
        assignedApartmentsSnap.docs.forEach((listing) => apartmentDocs.set(listing.id, listing));
        apartmentDocs.forEach((listing) => {
          const apartment = mapApartment(listing.id, listing.data() as Record<string, unknown>);
          const details = apartment.ownerDetails;
          const name = details?.name?.trim();
          if (!name) return;
          const current = ownerMap.get(name) ?? { name, apartments: [], aggregatePipelinePercentage: 0, expectedRevenue: 0, brokerCommission: 0 };
          current.ownerId ??= typeof apartment.ownerId === "string" ? apartment.ownerId : typeof apartment.hostId === "string" ? apartment.hostId : undefined;
          current.ownerAvatar ??= details?.avatar || "";
          current.apartments.push(apartment);
          ownerMap.set(name, current);
        });
        const clientItems: (BrokerClientLead | null)[] = await Promise.all(chatsSnap.docs.map(async (chat): Promise<BrokerClientLead | null> => {
          const data = chat.data() as { users?: string[]; brokerChatRole?: string; apartmentId?: string; apartmentTitle?: string; visitCompleted?: boolean; status?: string };
          if (data.brokerChatRole === "owner") return null;
          if ((data.status ?? "active") !== "active") return null;
          const clientUserId = data.users?.find((userId) => userId !== auth.userId);
          if (!clientUserId) return null;
          const [userSnap, profileSnap, messagesSnapshot] = await Promise.all([
            getDoc(doc(db, "users", clientUserId)),
            getDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${clientUserId}`)),
            getDocs(collection(db, "chats", chat.id, "messages")),
          ]);
          const user = userSnap.exists() ? userSnap.data() : {};
          if (isBrokerOrAgencyUser(user) && data.brokerChatRole !== "client") return null;
          const profileData = profileSnap.exists() ? profileSnap.data() as { leadReadiness?: LeadReadinessKey | null; pipelineStage?: PipelineStageKey; activeApartmentTitle?: string | null; dealCommission?: number; clientName?: string } : {};
          const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId : undefined;
          const deal = apartmentId ? dealByClientApartment.get(`${apartmentId}:${clientUserId}`) : undefined;
          const stageConfig = getPipelineStageConfig(deal?.pipelineStage === "liked" || deal?.pipelineStage === "lead" ? "new_lead" : deal?.pipelineStage === "deal_closed" ? "closed_won" : deal?.pipelineStage === "lost" ? "closed_lost" : deal?.pipelineStage ?? profileData.pipelineStage);
          const messageTypes = messagesSnapshot.docs.map((message) => (message.data() as { type?: unknown }).type);
          let apartmentTitle = typeof data.apartmentTitle === "string" ? data.apartmentTitle : profileData.activeApartmentTitle ?? undefined;
          let apartmentPrice: number | undefined;
          let isDealClosed = false;
          if (apartmentId) {
            const apartmentSnap = await getDoc(doc(db, "apartments", apartmentId));
            if (apartmentSnap.exists()) {
              const apartment = apartmentSnap.data() as { title?: unknown; price?: unknown; rent?: unknown; status?: unknown; rentedToUserId?: unknown };
              if (typeof apartment.title === "string" && apartment.title.trim()) apartmentTitle = apartment.title;
              apartmentPrice = typeof apartment.price === "number" ? apartment.price : typeof apartment.rent === "number" ? apartment.rent : undefined;
              isDealClosed = apartment.status === "closed_deal" && apartment.rentedToUserId === clientUserId;
            }
          }
          const dealCommission = typeof profileData.dealCommission === "number" ? profileData.dealCommission : apartmentPrice ?? 1000;
          const weightedShare = dealCommission * stageConfig.probability;
          const shared = messagesSnapshot.docs
            .map((message) => message.data() as { type?: string; filterSetData?: BrokerClientLead["sharedFilterSet"] })
            .filter((message) => message.type === "filter_set_share" && message.filterSetData)
            .at(-1)?.filterSetData;
          return {
            clientUserId,
            clientName: profileData.clientName?.trim() || (typeof user.name === "string" ? user.name.trim() : ""),
            clientAvatar: typeof user.photoUrl === "string" ? user.photoUrl : typeof user.avatar === "string" ? user.avatar : Array.isArray(user.photos) ? String(user.photos[0] ?? "") : "",
            chatRoomId: chat.id,
            leadReadiness: profileData.leadReadiness ?? null,
            pipelineStage: stageConfig.key,
            pipelinePercentage: Math.round(stageConfig.probability * 100),
            pipelineStageLabel: stageConfig.label,
            activeApartmentTitle: profileData.activeApartmentTitle,
            apartmentId,
            apartmentTitle,
            apartmentPrice,
            hasMessage: messagesSnapshot.size > 0,
            hasPriceProposal: messageTypes.includes("price_proposal"),
            hasVisitRequest: messageTypes.includes("visit_request"),
            isVisitCompleted: data.visitCompleted === true,
            isDealClosed,
            dealCommission,
            weightedShare,
            ...(shared ? { sharedFilterSet: shared } : {}),
          } satisfies BrokerClientLead;
        }));
        const loadedClients = clientItems.filter((client): client is BrokerClientLead => client !== null);
        ownerMap.forEach((owner) => {
          const propertyMaxStages = owner.apartments.map((apartment) => {
            const maxClientStage = loadedClients
              .filter((client) => client.apartmentId === apartment.id)
              .reduce((maximum, client) => Math.max(maximum, client.pipelinePercentage ?? 0), 0);
            const maxDealStage = deals.filter((deal) => deal.role !== "owner")
              .filter((deal) => deal.apartmentId === apartment.id)
              .reduce((maximum, deal) => Math.max(maximum, getDealPipelinePercentage(deal.pipelineStage)), 0);
            return Math.max(maxClientStage, maxDealStage);
          });
          const totalPipeline = propertyMaxStages.reduce((total, percentage) => total + percentage, 0);
          owner.aggregatePipelinePercentage = owner.apartments.length > 0 ? Math.round(totalPipeline / owner.apartments.length) : 0;
          owner.expectedRevenue = owner.apartments.reduce((total, apartment, index) => {
            const discount = Math.min(100, Math.max(0, Number(apartment.maxDiscountPercent) || 0));
            return total + (propertyMaxStages[index] / 100) * apartment.rent * (1 - discount / 100);
          }, 0);
          owner.brokerCommission = owner.expectedRevenue * BROKER_COMMISSION_RATE;
        });
        const ownerEntries = [...ownerMap.values()];
        const ownerIds = [...new Set(ownerEntries.map((owner) => owner.ownerId).filter((id): id is string => Boolean(id)))];
        const ownerProfiles = await Promise.all(ownerIds.map(async (ownerId) => {
          const snapshot = await getDoc(doc(db, "users", ownerId));
          return [ownerId, snapshot.exists() ? snapshot.data() : {}] as const;
        }));
        const ownerProfileById = new Map(ownerProfiles);
        ownerEntries.forEach((owner) => {
          if (!owner.ownerId) return;
          const profile = ownerProfileById.get(owner.ownerId) as { photoUrl?: unknown; avatar?: unknown; photos?: unknown } | undefined;
          owner.ownerAvatar = (typeof profile?.photoUrl === "string" ? profile.photoUrl : typeof profile?.avatar === "string" ? profile.avatar : Array.isArray(profile?.photos) ? String(profile.photos[0] ?? "") : "") || owner.ownerAvatar || "";
        });
        if (active) {
          setOwners(ownerEntries);
          setClients(loadedClients);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadBrokerData();
    return () => { active = false; };
  }, [auth.userId]);

  const { clientsExpectedRevenue, ownersExpectedRevenue, totalExpectedRevenue } = useMemo(() => {
    const clientsExpectedRevenue = clients.reduce((total, client) => total + client.weightedShare, 0);
    const ownersExpectedRevenue = owners.reduce((total, owner) => total + owner.expectedRevenue, 0);
    return {
      clientsExpectedRevenue,
      ownersExpectedRevenue,
      totalExpectedRevenue: clientsExpectedRevenue + ownersExpectedRevenue,
    };
  }, [clients, owners]);

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

  const handleToggleVisitCompleted = useCallback(async (client: BrokerClientLead) => {
    const nextStatus = !client.isVisitCompleted;
    setClients((current) => current.map((item) => item.chatRoomId === client.chatRoomId ? { ...item, isVisitCompleted: nextStatus } : item));
    try {
      await updateDoc(doc(db, "chats", client.chatRoomId), { visitCompleted: nextStatus });
    } catch {
      setClients((current) => current.map((item) => item.chatRoomId === client.chatRoomId ? { ...item, isVisitCompleted: client.isVisitCompleted } : item));
    }
  }, []);

  const renderClientItem = useCallback(({ item }: { item: BrokerClientLead }) => {
    const stage = getPipelineStageConfig(item.pipelineStage);
    const stagePercent = Math.round(stage.probability * 100);
    return (
      <Pressable
        style={[styles.clientCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: "/broker-client-detail", params: { clientUserId: item.clientUserId, clientName: item.clientName, clientAvatar: item.clientAvatar, chatRoomId: item.chatRoomId, sharedFilterSet: item.sharedFilterSet ? JSON.stringify(item.sharedFilterSet) : "" } })}
        testID={`broker-client-card-${item.clientUserId}`}
      >
        <View style={styles.clientCardHeader}>
          <View style={styles.clientAvatarWrap}>
            {item.clientAvatar ? <Image contentFit="cover" source={{ uri: item.clientAvatar }} style={styles.clientAvatar} /> : <DefaultProfileAvatar size={42} />}
          </View>
          <View style={styles.clientTextCol}>
            <Text style={styles.clientCardName} numberOfLines={1}>{item.clientName || "-"}</Text>
            <Text style={styles.clientCardMeta} numberOfLines={1}>{item.apartmentTitle || "Χωρίς διαμέρισμα"}{typeof item.apartmentPrice === "number" ? ` · €${item.apartmentPrice.toLocaleString("el-GR")}` : ""}</Text>
          </View>
          <View style={styles.headerBadgesRow}>
            <View style={[styles.percentBadgePill, { backgroundColor: colors.brandTertiary }]}><Text style={[styles.percentBadgeText, { color: colors.brand }]}>{stagePercent}%</Text></View>
            {item.hasMessage ? <View style={[styles.badgePill, { backgroundColor: colors.surfaceTertiary }]}><Ionicons name="mail-outline" size={14} color={colors.onSurface} /></View> : null}
            {item.leadReadiness === "hot" ? <View style={[styles.badgePill, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}><Ionicons name="flame" size={15} color="#EF4444" /></View> : item.leadReadiness === "warm" ? <View style={[styles.badgePill, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}><Ionicons name="sunny" size={15} color="#F59E0B" /></View> : item.leadReadiness === "cold" ? <View style={[styles.badgePill, { backgroundColor: "rgba(56, 189, 248, 0.12)" }]}><Ionicons name="snow" size={15} color="#38BDF8" /></View> : null}
            {item.sharedFilterSet ? <View style={[styles.badgePill, { backgroundColor: colors.surfaceTertiary }]}><Ionicons name="options-outline" size={15} color={colors.brand} /></View> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
        </View>
        {isMoneyModeActive ? (
          <View style={styles.pipelineBadgeRow}>
            <Text style={[styles.pipelineBadge, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}>Προμήθεια: €{Math.round(item.dealCommission).toLocaleString("el-GR")}</Text>
            <Text style={[styles.weightedBadge, { backgroundColor: colors.brandTertiary, color: colors.brand }]}>Αναμενόμενο: €{Math.round(item.weightedShare).toLocaleString("el-GR")}</Text>
          </View>
        ) : (
          <View style={styles.clientStatusBar}>
            {item.hasPriceProposal ? <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}><Text style={styles.statusBadgeText}>💵</Text></View> : null}
            {item.hasVisitRequest ? <Pressable style={[styles.statusBadge, { backgroundColor: item.isVisitCompleted ? colors.brand : colors.surface }]} onPress={(event) => { event.stopPropagation(); void handleToggleVisitCompleted(item); }} hitSlop={6}><Text style={[styles.statusBadgeText, { color: item.isVisitCompleted ? colors.onBrand : colors.onSurface }]}>🏠</Text></Pressable> : null}
            {item.isDealClosed ? <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}><Text style={styles.statusBadgeText}>✅</Text></View> : null}
          </View>
        )}
      </Pressable>
    );
  }, [colors, handleToggleVisitCompleted, isMoneyModeActive, router, styles]);

  const renderOwnerItem = useCallback(({ item, index }: { item: BrokerOwnerItem; index: number }) => (
    <Pressable
      style={[styles.clientCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
      testID={`broker-owner-row-${index}`}
      onPress={() => router.push({ pathname: "/broker-owner-detail", params: { ownerName: item.name, ownerAvatar: item.ownerAvatar || "", apartmentIds: JSON.stringify(item.apartments.map((apartment) => apartment.id)) } })}
    >
      <View style={styles.clientCardHeader}>
        <View style={styles.clientAvatarWrap}>
          {item.ownerAvatar ? <Image contentFit="cover" source={{ uri: item.ownerAvatar }} style={styles.clientAvatar} /> : <DefaultProfileAvatar size={42} />}
        </View>
        <View style={styles.clientTextCol}>
          <Text style={styles.ownerCardName} numberOfLines={1}>{item.name || "Ιδιοκτήτης"}</Text>
          <View style={styles.ownerCountPill}><Ionicons name="home-outline" size={13} color={colors.brand} /><Text style={styles.ownerCountText}>{t("brokerHub.propertyCount", { count: item.apartments.length })}</Text></View>
        </View>
        <View style={styles.ownerAggregatePill}><Text style={[styles.percentBadgeText, styles.ownerAggregateText]}>{item.aggregatePipelinePercentage}%</Text></View>
        <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
      </View>
      {isMoneyModeActive ? <View style={styles.pipelineBadgeRow}>
        <Text style={[styles.pipelineBadge, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}>Προμήθεια: €{Math.round(item.brokerCommission).toLocaleString("el-GR")}</Text>
        <Text style={[styles.weightedBadge, { backgroundColor: colors.brandTertiary, color: colors.brand }]}>Αναμενόμενο: €{Math.round(item.expectedRevenue).toLocaleString("el-GR")}</Text>
      </View> : null}
    </Pressable>
  ), [colors, isMoneyModeActive, router, styles]);

  const clientsActive = selectedSegment === "clients";
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]} testID="broker-hub-screen">
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.brokerTitle}>Broker<Text style={styles.brokerTitleAccent}>Tab</Text></Text>
          <View style={styles.headerActionsRow}>
          <Pressable
            style={[styles.headerIconButton, isMoneyModeActive && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            onPress={() => setIsMoneyModeActive((previous) => !previous)}
            testID="broker-money-mode-toggle"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Εναλλαγή Οικονομικής Προβολής Pipeline"
          >
            <Ionicons name="cash-outline" size={20} color={isMoneyModeActive ? colors.onBrand : colors.onSurface} />
          </Pressable>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => router.push("/profile" as any)}
            testID="broker-hub-settings-btn"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Ρυθμίσεις Προφίλ"
          >
            <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
          </Pressable>
          </View>
        </View>
      </View>
      <View style={styles.toggleShell}>
        <Pressable style={[styles.toggleOption, clientsActive && styles.toggleOptionActive]} onPress={() => setSelectedSegment("clients")} testID="broker-hub-toggle-clients"><Text style={[styles.toggleText, clientsActive && styles.toggleTextActive]}>{t("brokerHub.clients")}</Text></Pressable>
        <Pressable style={[styles.toggleOption, !clientsActive && styles.toggleOptionActive]} onPress={() => setSelectedSegment("owners")} testID="broker-hub-toggle-owners"><Text style={[styles.toggleText, !clientsActive && styles.toggleTextActive]}>{t("brokerHub.owners")}</Text></Pressable>
      </View>
      {isMoneyModeActive ? (
        <View style={styles.revenueOverviewCard} testID="broker-revenue-overview">
          <View style={styles.revenueCardHeader}>
            <Ionicons name="cash-outline" size={20} color={colors.onSurfaceTertiary} />
            <Text style={styles.revenueCardTitle}>Συνολικά Αναμενόμενα Έσοδα</Text>
          </View>
          <Text style={styles.revenueGrandTotalText}>{Math.round(totalExpectedRevenue).toLocaleString("el-GR")} €</Text>
          <View style={styles.revenueBreakdownPanel}>
            <View style={styles.breakdownColumn}>
              <Text style={styles.breakdownLabel}>Πελάτες</Text>
              <Text style={styles.breakdownValue}>{Math.round(clientsExpectedRevenue).toLocaleString("el-GR")} €</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownColumn}>
              <Text style={styles.breakdownLabel}>Ιδιοκτήτες</Text>
              <Text style={styles.breakdownValue}>{Math.round(ownersExpectedRevenue).toLocaleString("el-GR")} €</Text>
            </View>
          </View>
        </View>
      ) : null}
      {isLoading ? <BrokerHubSkeleton cardCount={6} /> : (
        <Animated.View style={[styles.contentArea, { transform: [{ translateX: swipeX }] }]} {...contentPanResponder.panHandlers}>
          {clientsActive ? <FlatList data={clients} testID="broker-clients-list" keyExtractor={(item) => item.clientUserId} ListEmptyComponent={<Text style={styles.emptyStateSubtitle}>{t("brokerHub.noClients")}</Text>} renderItem={renderClientItem} /> : <FlatList data={owners} testID="broker-owners-list" keyExtractor={(item) => item.name} ListEmptyComponent={<Text style={styles.emptyStateSubtitle}>{t("brokerHub.noOwners")}</Text>} renderItem={renderOwnerItem} />}
        </Animated.View>
      )}
    </View>
  );
}

const createOwnerStyles = (colors: ThemeColors) => StyleSheet.create({
  ownerCardName: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onSurface },
  ownerCountPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  ownerCountText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
  ownerAggregatePill: { minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  ownerAggregateText: { color: colors.brand },
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }, brand: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface }, brandAccent: { color: colors.brand }, toggleShell: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4, marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 4 }, toggleOption: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.pill }, toggleOptionActive: { backgroundColor: colors.brand }, toggleText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface }, toggleTextActive: { color: colors.onBrand }, contentArea: { flex: 1, paddingHorizontal: spacing.lg }, ownerRowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, clientRowCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, rowMain: { flex: 1, gap: spacing.xs }, rowTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface }, motivationBadge: { alignSelf: "flex-start", color: colors.onSurfaceTertiary, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, fontSize: fontSize.sm }, countPill: { alignSelf: "flex-start", color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.sm }, clientAvatar: { width: 48, height: 48, borderRadius: radius.pill }, emptyStateSubtitle: { textAlign: "center", color: colors.onSurfaceTertiary, fontFamily: fonts.regular, padding: spacing.xl }, headerBadgesRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginRight: 2 }, badgePill: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  clientInfoCol: { flex: 1, gap: 2 }, pipelineBadgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2, flexWrap: "wrap" }, percentBadgePill: { minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" }, percentBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.xs }, activeApartmentSub: { flexShrink: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }, headerActionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, brokerTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface }, brokerTitleAccent: { color: colors.brand }, headerIconButton: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, settingsIconButton: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, clientCard: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm }, clientCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, clientAvatarWrap: { width: 42, height: 42, borderRadius: radius.pill, overflow: "hidden" }, clientTextCol: { flex: 1, minWidth: 0 }, clientCardName: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface }, clientCardMeta: { marginTop: 2, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }, clientStatusBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, statusBadge: { minHeight: 28, minWidth: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs }, statusBadgeText: { fontSize: 14 }, pipelineBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontFamily: fonts.bold, fontSize: fontSize.xs }, weightedBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, fontFamily: fonts.bold, fontSize: fontSize.xs }, revenueOverviewCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }, revenueCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, width: "100%" }, revenueCardTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, textAlign: "center" }, revenueGrandTotalText: { fontFamily: fonts.displayExtra, fontSize: 32, color: colors.brand, textAlign: "center", alignSelf: "center", marginVertical: 4 }, revenueBreakdownPanel: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }, breakdownColumn: { alignItems: "center", gap: 2, flex: 1 }, breakdownLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary }, breakdownValue: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface }, breakdownDivider: { width: 1, height: 24, backgroundColor: colors.border },
});
