import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ApartmentReelCard from "@/src/components/feed/ApartmentReelCard";
import { TAB_BAR_HEIGHT } from "@/src/components/GlassTabBar";
import { db } from "@/src/config/firebase";
import { t } from "@/src/locales";
import { radius, spacing } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import type { Apartment } from "@/src/types/apartment";

interface AgencyReelsFeedProps {
  agencyId: string;
  onExit: () => void;
}

type FirestoreRecord = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is FirestoreRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAgencyApartment(id: string, data: FirestoreRecord, agencyId: string): Apartment | null {
  const hostId = asString(data.hostId) ?? asString(data.ownerId);
  if (
    !hostId ||
    data.status !== "active" ||
    data.showInExploreFeed === false ||
    data.visibility !== undefined && data.visibility !== "public" ||
    data.isOffMarket === true ||
    data.available === false ||
    data.isAvailable === false
  ) return null;

  const media = isRecord(data.reelMedia) ? data.reelMedia : null;
  const aspectRatio: "9:16" | "16:9" | undefined = media?.aspectRatio === "9:16" || media?.aspectRatio === "16:9" ? media.aspectRatio : undefined;
  const reelMedia = aspectRatio
    ? {
        aspectRatio,
        videoUrl: asString(media?.videoUrl),
        thumbnailUrl: asString(media?.thumbnailUrl),
        durationSeconds: typeof media?.durationSeconds === "number" ? media.durationSeconds : undefined,
      }
    : undefined;

  return {
    ...data,
    id,
    agencyId,
    hostId,
    ownerId: asString(data.ownerId) ?? hostId,
    title: asString(data.title) ?? t("common.values.notAvailable"),
    area: asString(data.area) ?? asString(data.city) ?? "",
    city: asString(data.city),
    showExactAddress: data.showExactAddress !== false,
    status: "active",
    reelMedia,
  };
}

export default function AgencyReelsFeed({ agencyId, onExit }: AgencyReelsFeedProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(1, windowWidth);
  const cardHeight = cardWidth * (16 / 9);
  const bottomSpacer = TAB_BAR_HEIGHT + insets.bottom + spacing.lg;
  const [listings, setListings] = useState<Apartment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList<Apartment>>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  useEffect(() => {
    setLoading(true);
    const listingsQuery = query(
      collection(db, "apartments"),
      where("agencyId", "==", agencyId),
      where("status", "==", "active"),
    );

    return onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs
          .map((document) => toAgencyApartment(document.id, document.data() as FirestoreRecord, agencyId))
          .filter((apartment): apartment is Apartment => apartment !== null);
        setListings(nextListings);
        setActiveIndex((current) => Math.min(current, Math.max(0, nextListings.length - 1)));
        setLoading(false);
      },
      () => {
        setListings([]);
        setActiveIndex(0);
        setLoading(false);
      },
    );
  }, [agencyId]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable && item.index !== null)?.index;
    if (typeof nextIndex === "number") setActiveIndex(nextIndex);
  }, []);

  return (
    <View style={styles.root} testID="agency-reels-feed">
      <StatusBar style="light" />
      <Pressable
        style={[styles.exitButton, { top: insets.top + spacing.sm }]}
        onPress={onExit}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("apartments.exitReels")}
        accessibilityHint={t("apartments.exitReels")}
        testID="apartments-agency-reels-exit"
      >
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        <Text style={styles.exitButtonText}>{t("apartments.exitReels")}</Text>
      </Pressable>

      {loading ? (
        <View style={styles.state} testID="agency-reels-loading">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.state} testID="agency-reels-empty">
          <Ionicons name="videocam-off-outline" size={40} color={colors.onSurfaceTertiary} />
          <Text style={[styles.emptyText, { color: colors.onSurface }]}>{t("apartments.noAgencyReels")}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={listings}
          keyExtractor={(item) => item.id ?? item.title ?? "agency-listing"}
          style={styles.list}
          renderItem={({ item, index }) => (
            <ApartmentReelCard
              apartment={item}
              height={cardHeight}
              isActive={index === activeIndex}
            />
          )}
          snapToInterval={cardHeight}
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
          getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
          ListFooterComponent={<View style={{ width: cardWidth, height: bottomSpacer }} testID="agency-reels-bottom-spacer" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0E13" },
  list: { flex: 1 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyText: { maxWidth: 320, textAlign: "center", fontSize: 16, fontWeight: "700" },
  exitButton: {
    position: "absolute",
    left: spacing.lg,
    zIndex: 50,
    elevation: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  exitButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
