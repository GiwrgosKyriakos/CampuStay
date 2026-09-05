import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewToken } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useRouter } from "expo-router";

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
import type { Apartment, VirtualTourData } from "@/src/types/apartment";
import type { FilterSetPayload } from "@/src/types/filters";
import { isApartmentEligibleForClient } from "@/src/utils/apartmentEligibility";
import { shouldDisplayListingForUser } from "@/src/utils/listingFilters";

type FirestoreRecord = Record<string, unknown>;

const SEEN_REELS_STORAGE_PREFIX = "@campustay_seen_reels_";

interface HostRoommateProfile {
  is_broker?: boolean;
  agencyId?: string;
  agencyRole?: string;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
  notLookingForRoommate?: boolean;
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
  // Measure the exact rendered viewport; static window-height math drifts on Android.
  const [viewportHeight, setViewportHeight] = useState(0);
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setViewportHeight((current) => (height > 0 && Math.abs(height - current) > 1 ? height : current));
  }, []);
  const { colors } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const [listings, setListings] = useState<Apartment[]>([]);
  const [seenReelIds, setSeenReelIds] = useState<string[]>([]);
  const [seenReelsLoaded, setSeenReelsLoaded] = useState(false);
  const [likedApartmentIds, setLikedApartmentIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tourData, setTourData] = useState<VirtualTourData | null>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const seenReelsStorageKey = `${SEEN_REELS_STORAGE_PREFIX}${auth.userId ?? "guest"}`;
  const seenReelsStorageKeyRef = useRef(seenReelsStorageKey);
  const seenReelIdsRef = useRef<string[]>([]);
  const isResettingRef = useRef(false);
  const listRef = useRef<FlatList<Apartment>>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  useEffect(() => {
    seenReelsStorageKeyRef.current = seenReelsStorageKey;
    seenReelIdsRef.current = [];
    setSeenReelIds([]);
    setSeenReelsLoaded(false);
    let active = true;
    void AsyncStorage.getItem(seenReelsStorageKey).then((storedIds) => {
      if (!active) return;
      try {
        const parsed: unknown = storedIds ? JSON.parse(storedIds) : [];
        const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
        seenReelIdsRef.current = ids;
        setSeenReelIds(ids);
      } catch {
        seenReelIdsRef.current = [];
        setSeenReelIds([]);
      }
      setSeenReelsLoaded(true);
    }).catch(() => {
      if (active) setSeenReelsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [seenReelsStorageKey]);

  // Persisted without touching `seenReelIds`, so the visible feed never shrinks under the user mid-scroll.
  const markReelAsSeen = useCallback((id: string) => {
    if (seenReelIdsRef.current.includes(id)) return;
    seenReelIdsRef.current = [...seenReelIdsRef.current, id];
    void AsyncStorage.setItem(seenReelsStorageKeyRef.current, JSON.stringify(seenReelIdsRef.current));
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable && item.index !== null)?.index;
    if (typeof nextIndex === "number") setActiveIndex(nextIndex);
    if (isResettingRef.current) return;
    const currentItem = viewableItems[0]?.item as Apartment | undefined;
    if (currentItem?.id) markReelAsSeen(currentItem.id);
  }).current;

  const visibleListings = useMemo(() => {
    if (seenReelIds.length === 0) return listings;
    const seenSet = new Set(seenReelIds);
    return listings.filter((item) => item.id && !seenSet.has(item.id));
  }, [listings, seenReelIds]);

  const handleResetSeenReels = useCallback(async () => {
    try {
      isResettingRef.current = true;
      await AsyncStorage.removeItem(seenReelsStorageKeyRef.current);
      seenReelIdsRef.current = [];
      setSeenReelIds([]);
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } finally {
      // Let the list remount and settle before viewability may mark reels again.
      setTimeout(() => {
        isResettingRef.current = false;
      }, 500);
    }
  }, []);

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
          const listingWithCreatorMetadata: Apartment = {
            ...apartment,
            agencyId: apartment.agencyId ?? hostProfile?.agencyId,
            isBroker: apartment.isBroker === true || hostProfile?.is_broker === true,
            creatorRole: apartment.creatorRole || (hostProfile?.is_broker === true || hostProfile?.agencyId ? "agency" : undefined),
            creatorNotLookingForRoommate:
              typeof apartment.creatorNotLookingForRoommate === "boolean"
                ? apartment.creatorNotLookingForRoommate
                : hostProfile?.not_looking_for_roommate === true
                  || hostProfile?.notLookingForRoommate === true
                  || hostProfile?.looking_for_roommate === false
                  || hostProfile?.isLookingForRoommate === false,
            lookingForRoommate:
              typeof apartment.lookingForRoommate === "boolean"
                ? apartment.lookingForRoommate
                : hostProfile?.looking_for_roommate === true || hostProfile?.isLookingForRoommate === true,
          };
          const hostRequiresRoommate = hostProfile !== null && (
            hostProfile.looking_for_roommate === true
            || hostProfile.isLookingForRoommate === true
            || (hostProfile.not_looking_for_roommate !== true
              && hostProfile.looking_for_roommate === undefined
              && hostProfile.isLookingForRoommate === undefined)
          );
          if (!shouldDisplayListingForUser(listingWithCreatorMetadata, {
            isBroker: auth.isBroker,
            notLookingForRoommate: auth.notLookingForRoommate,
          })) return false;
          return isApartmentEligibleForClient(listingWithCreatorMetadata, {
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

  if (!seenReelsLoaded) {
    return <View style={[styles.state, { backgroundColor: colors.surface }]}><StatusBar style="light" /><ActivityIndicator color={colors.brand} /></View>;
  }

  if (listings.length === 0) {
    return <View style={[styles.state, { backgroundColor: colors.surface }]}><StatusBar style="light" /><Text style={[styles.emptyText, { color: colors.onSurface }]}>{t("feed.noReelsAvailable")}</Text></View>;
  }

  const renderCaughtUpCard = () => (
    <View style={[styles.caughtUpContainer, { height: viewportHeight, backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.checkCircle, { backgroundColor: colors.surface }]}>
        <Ionicons color={colors.brand} name="checkmark-done" size={40} />
      </View>
      <Text style={[styles.caughtUpTitle, { color: colors.onSurface }]}>You're all caught up</Text>
      <Text style={[styles.caughtUpSubtitle, { color: colors.onSurfaceTertiary }]}>Έχετε δει όλα τα διαθέσιμα reels.</Text>
      <Pressable onPress={() => void handleResetSeenReels()} style={[styles.refreshReelsButton, { backgroundColor: colors.brand }]}>
        <Ionicons color={colors.onBrand} name="refresh-outline" size={20} />
        <Text style={[styles.refreshReelsText, { color: colors.onBrand }]}>Ανανέωση Reels</Text>
      </Pressable>
    </View>
  );

  if (visibleListings.length === 0) {
    return <View style={[styles.root, { borderColor: colors.border }]} onLayout={handleContainerLayout}><StatusBar style="light" />{viewportHeight > 0 ? renderCaughtUpCard() : null}</View>;
  }

  return (
    <View style={[styles.root, { borderColor: colors.border }]} onLayout={handleContainerLayout}>
      <StatusBar style="light" />
      {viewportHeight > 0 ? (
        <FlatList
          ref={listRef}
          data={visibleListings}
          keyExtractor={(item) => item.id ?? item.title ?? "reel"}
          style={{ height: viewportHeight }}
          renderItem={({ item, index }) => (
            <ApartmentReelCard
              apartment={item}
              height={viewportHeight}
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
          pagingEnabled={Platform.OS === "ios"}
          snapToInterval={viewportHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          removeClippedSubviews
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: viewportHeight, offset: viewportHeight * index, index })}
          ListFooterComponent={renderCaughtUpCard}
        />
      ) : null}
      <VirtualTourViewerModal visible={tourVisible} tourData={tourData} onClose={() => setTourVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0e13" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { textAlign: "center", fontSize: 16, fontWeight: "700" },
  caughtUpContainer: { alignItems: "center", justifyContent: "center", padding: 24 },
  checkCircle: { width: 88, height: 88, alignItems: "center", justifyContent: "center", borderRadius: 44, marginBottom: 20 },
  caughtUpTitle: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  caughtUpSubtitle: { marginTop: 8, fontSize: 15, textAlign: "center" },
  refreshReelsButton: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
  refreshReelsText: { fontSize: 15, fontWeight: "700" },
});