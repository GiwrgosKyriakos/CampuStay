import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View, type ViewToken } from "react-native";
import { StatusBar } from "expo-status-bar";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useRouter } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ApartmentReelCard from "@/src/components/feed/ApartmentReelCard";
import VirtualTourViewerModal from "@/src/components/VirtualTourViewerModal";
import { getOrCreateHostChat } from "@/src/api/chat";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import { getExcludedUserIds } from "@/src/api/blocking";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { radius } from "@/src/theme";
import { TAB_BAR_HEIGHT } from "@/src/components/GlassTabBar";
import type { Apartment, VirtualTourData } from "@/src/types/apartment";
import type { FilterSetPayload } from "@/src/types/filters";
import { isApartmentEligibleForClient } from "@/src/utils/apartmentEligibility";

type FirestoreRecord = Record<string, unknown>;

interface HostRoommateProfile {
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toApartment(id: string, data: FirestoreRecord): Apartment | null {
  const hostId = asString(data.hostId) ?? asString(data.ownerId);
  if (!hostId) return null;
  if (data.visibility !== undefined && data.visibility !== "public") return null;
  if (data.isOffMarket === true || (data.status !== undefined && data.status !== "active")) return null;
  if (data.available === false || data.isAvailable === false) return null;

  const area = asString(data.area) ?? asString(data.city) ?? "";
  const media = data.reelMedia && typeof data.reelMedia === "object" ? data.reelMedia as Record<string, unknown> : undefined;
  const reelMedia = media && (media.aspectRatio === "9:16" || media.aspectRatio === "16:9")
    ? {
        aspectRatio: media.aspectRatio,
        videoUrl: asString(media.videoUrl),
        thumbnailUrl: asString(media.thumbnailUrl),
        durationSeconds: typeof media.durationSeconds === "number" ? media.durationSeconds : undefined,
      }
    : undefined;

  return {
    ...data,
    id,
    title: asString(data.title) ?? t("common.values.notAvailable"),
    area,
    city: asString(data.city),
    hostId,
    ownerId: asString(data.ownerId) ?? hostId,
    showExactAddress: data.showExactAddress !== false,
    status: "active",
    reelMedia,
  } as Apartment;
}

export default function ExploreFeedScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomOffset = TAB_BAR_HEIGHT + insets.bottom;
  const reelHeight = Math.max(1, height - bottomOffset);
  const { colors } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const [listings, setListings] = useState<Apartment[]>([]);
  const [likedApartmentIds, setLikedApartmentIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tourData, setTourData] = useState<VirtualTourData | null>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable && item.index !== null)?.index;
    if (typeof nextIndex === "number") setActiveIndex(nextIndex);
  }).current;

  useEffect(() => {
    if (auth.isLoading) return;
    if (auth.isGuest || !auth.userId) {
      setListings([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    let latestFilterSet: FilterSetPayload | null = null;

    const loadLatestFilterSet = async (): Promise<void> => {
      if (!auth.userId) return;
      try {
        const filterSnapshot = await getDocs(query(
          collection(db, "users", auth.userId, "savedFilterSets"),
          orderBy("updatedAt", "desc"),
          limit(1),
        ));
        latestFilterSet = filterSnapshot.empty ? null : filterSnapshot.docs[0].data() as FilterSetPayload;
      } catch {
        latestFilterSet = null;
      }
    };

    let unsubscribe: (() => void) | null = null;
    void (async () => {
      await loadLatestFilterSet();
      if (!active) return;
      unsubscribe = onSnapshot(
        collection(db, "apartments"),
        async (snapshot) => {
        const excludedUserIds = await getExcludedUserIds(auth.userId!).catch(() => new Set<string>());
        if (!active) return;
        const nextListings = snapshot.docs
          .map((document) => toApartment(document.id, document.data()))
          .filter((apartment): apartment is Apartment => apartment !== null)
          .filter((apartment) => !excludedUserIds.has(apartment.hostId));
        const hostProfiles = await Promise.all(nextListings.map(async (apartment) => {
          const hostSnapshot = await getDoc(doc(db, "users", apartment.hostId));
          return [apartment.id ?? "", hostSnapshot.exists() ? hostSnapshot.data() as HostRoommateProfile : null] as const;
        }));
        const hostProfileByApartmentId = new Map(hostProfiles);
        const eligibleListings = nextListings.filter((apartment) => {
          const hostProfile = hostProfileByApartmentId.get(apartment.id ?? "") ?? null;
          const hostRequiresRoommate = hostProfile !== null && (
            hostProfile.looking_for_roommate === true
            || hostProfile.isLookingForRoommate === true
            || (hostProfile.not_looking_for_roommate !== true
              && hostProfile.looking_for_roommate === undefined
              && hostProfile.isLookingForRoommate === undefined)
          );
          return isApartmentEligibleForClient(apartment, {
            excludedUserIds,
            filterSet: latestFilterSet,
            notLookingForRoommate: auth.notLookingForRoommate,
            hostRequiresRoommate,
          });
        });
        setListings(eligibleListings);
        setActiveIndex((current) => Math.min(current, Math.max(0, eligibleListings.length - 1)));
        setLoading(false);
        },
        () => {
          if (!active) return;
          setListings([]);
          setLoading(false);
        },
      );
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [auth.isGuest, auth.isLoading, auth.notLookingForRoommate, auth.userId]);

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setLikedApartmentIds(new Set());
      return;
    }
    return subscribeUserLikedApartmentIds(auth.userId, setLikedApartmentIds);
  }, [auth.isGuest, auth.userId]);

  const openDetails = useCallback((apartment: Apartment) => {
    router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never);
  }, [router]);

  const openChat = useCallback(async (apartment: Apartment) => {
    if (auth.isGuest || !auth.userId) {
      router.push("/auth-landing");
      return;
    }
    const hostId = apartment.assignedBrokerIds?.[0] ?? apartment.hostId ?? apartment.ownerId;
    if (!hostId || !apartment.id) return;
    try {
      const chatRoomId = await getOrCreateHostChat({
        currentUserId: auth.userId,
        hostId,
        apartmentId: apartment.id,
        apartmentTitle: apartment.title,
      });
      router.push({ pathname: "/chat/[id]", params: { id: hostId, targetUserId: hostId, apartmentId: apartment.id, chatRoomId } } as never);
    } catch {
      Alert.alert(t("common.messages.tryAgain"));
    }
  }, [auth.isGuest, auth.userId, router]);

  const toggleLike = useCallback(async (apartmentId: string) => {
    if (auth.isGuest || !auth.userId) {
      router.push("/auth-landing");
      return;
    }
    const wasLiked = likedApartmentIds.has(apartmentId);
    setLikedApartmentIds((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(apartmentId);
      else next.add(apartmentId);
      return next;
    });
    try {
      const isLiked = await toggleApartmentLike(auth.userId, apartmentId);
      setLikedApartmentIds((current) => {
        const next = new Set(current);
        if (isLiked) next.add(apartmentId);
        else next.delete(apartmentId);
        return next;
      });
    } catch {
      setLikedApartmentIds((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(apartmentId);
        else next.delete(apartmentId);
        return next;
      });
      Alert.alert(t("common.messages.tryAgain"));
    }
  }, [auth.isGuest, auth.userId, likedApartmentIds, router]);

  if (loading) {
    return <View style={[styles.state, { backgroundColor: colors.surface }]}><StatusBar style="light" /><ActivityIndicator color={colors.brand} /></View>;
  }

  if (listings.length === 0) {
    return <View style={[styles.state, { backgroundColor: colors.surface }]}><StatusBar style="light" /><Text style={[styles.emptyText, { color: colors.onSurface }]}>{t("feed.noReelsAvailable")}</Text></View>;
  }

  return (
    <View style={[styles.root, { borderColor: colors.border }]}>
      <StatusBar style="light" />
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id ?? item.title ?? "reel"}
        renderItem={({ item, index }) => (
          <ApartmentReelCard
            apartment={item}
            height={reelHeight}
            isActive={index === activeIndex}
            isLiked={item.id ? likedApartmentIds.has(item.id) : false}
            onToggleLike={() => item.id && void toggleLike(item.id)}
            onOpenChat={() => void openChat(item)}
            onOpenDetails={() => openDetails(item)}
            onOpenVirtualTour={() => {
              const itemTour = item.virtualTour as VirtualTourData | undefined;
              if (itemTour?.enabled && itemTour.scenes.length > 0) {
                setTourData(itemTour);
                setTourVisible(true);
              }
            }}
          />
        )}
        pagingEnabled
        snapToInterval={reelHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        removeClippedSubviews
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: reelHeight, offset: reelHeight * index, index })}
      />
      <VirtualTourViewerModal visible={tourVisible} tourData={tourData} onClose={() => setTourVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0e13" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { textAlign: "center", fontSize: 16, fontWeight: "700" },
});