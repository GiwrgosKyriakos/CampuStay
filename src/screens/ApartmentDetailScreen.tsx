import React, { useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, fontSize, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { getOrCreateHostChat } from "@/src/api/chat";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import { deleteListingPermanently } from "@/src/api/listings";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { t } from "@/src/locales";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CURRENCY = "€";
const CONTACT_EMAIL = "landlord@example.com";

interface Apartment {
  id: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  rooms: number;
  size: number;
  image: string;
  tags: string[];
  hostId?: string;
  ownerId?: string;
}

type AmenityDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tagMatch?: string;
};

function translateApartmentTag(tag: string): string {
  const translated = t(`apartments.tags.${tag}`);
  return translated === `apartments.tags.${tag}` ? tag : translated;
}

const AMENITIES: AmenityDef[] = [
  { key: "wifi",    label: "apartmentDetail.amenities.wifi",    icon: "wifi-outline",           tagMatch: "wifi" },
  { key: "ac",      label: "apartmentDetail.amenities.ac",   icon: "snow-outline" },
  { key: "washer",  label: "apartmentDetail.amenities.washer",    icon: "water-outline" },
  { key: "pet",     label: "apartmentDetail.amenities.pet",       icon: "paw-outline",            tagMatch: "pet_friendly" },
  { key: "furn",    label: "apartmentDetail.amenities.furn",          icon: "bed-outline",            tagMatch: "furnished" },
];

export default function ApartmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { data } = useLocalSearchParams<{ data: string }>();

  let apt: Apartment | null = null;
  try {
    apt = JSON.parse(data) as Apartment;
  } catch {
    apt = null;
  }

  const scrollRef = useRef<ScrollView>(null);
  const [activePage, setActivePage] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDeletingListing, setIsDeletingListing] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description: string;
  } | null>(null);

  React.useEffect(() => {
    if (auth.isGuest || !auth.userId || !apt?.id) {
      setIsLiked(false);
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(auth.userId, (ids) => {
      setIsLiked(ids.has(apt.id));
    });

    return () => unsubscribe();
  }, [apt?.id, auth.isGuest, auth.userId]);

  if (!apt) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{t("apartmentDetail.dataUnavailable")}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>{t("common.actions.back")}</Text>
        </Pressable>
      </View>
    );
  }

  // Build an array of images — currently one per listing; slot for future multi-image support.
  const images: string[] = [apt.image];

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActivePage(page);
  };

  const contactHost = () => {
    const subject = encodeURIComponent(t("apartmentDetail.emailSubject", { title: apt!.title }));
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`);
  };

  const startHostChat = async () => {
    const currentUid = auth.userId;
    const hostId = apt?.hostId;

    if (!currentUid) {
      router.push("/auth-landing");
      return;
    }

    if (!hostId) {
      contactHost();
      return;
    }

    if (hostId === currentUid) {
      setActionModal({
        title: t("apartmentDetail.hostListingTitle"),
        description: t("apartmentDetail.hostListingMessage"),
      });
      return;
    }

    try {
      const chatRoomId = await getOrCreateHostChat({
        currentUserId: currentUid,
        hostId,
        apartmentId: apt.id,
        apartmentTitle: apt.title,
      });
      router.push(
        {
          pathname: "/chat/[id]",
          params: { id: hostId, chatRoomId },
        },
      );
    } catch {
      setActionModal({
        title: t("apartmentDetail.chatUnavailableTitle"),
        description: t("apartmentDetail.chatUnavailableMessage"),
      });
    }
  };

  const handleToggleLike = async () => {
    if (auth.isGuest || !auth.userId) {
      router.push("/auth-landing");
      return;
    }

    const prev = isLiked;
    setIsLiked(!prev);
    try {
      const next = await toggleApartmentLike(auth.userId, apt.id);
      setIsLiked(next);
    } catch {
      setIsLiked(prev);
      setActionModal({
        title: t("apartments.likeUpdateTitle"),
        description: t("apartments.likeUpdateMessage"),
      });
    }
  };

  const isListingOwner = !!auth.userId && !!apt.ownerId && auth.userId === apt.ownerId;

  const handleEditListing = () => {
    if (!isListingOwner) return;
    router.push({
      pathname: "/create-listing",
      params: { mode: "edit", listingId: apt.id },
    } as any);
  };

  const handleDeleteListing = async () => {
    if (!isListingOwner || isDeletingListing) return;

    setIsDeletingListing(true);
    try {
      await deleteListingPermanently(apt.id);
      setDeleteModalVisible(false);
      router.replace("/(tabs)/apartments");
    } catch {
      setDeleteModalVisible(false);
      setActionModal({
        title: t("apartmentDetail.deleteFailedTitle"),
        description: t("apartmentDetail.deleteFailedMessage"),
      });
    } finally {
      setIsDeletingListing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Back button overlay ── */}
      <Pressable
        style={[styles.backOverlay, { top: insets.top + spacing.sm }]}
        onPress={() => router.back()}
        hitSlop={10}
        testID="apartment-detail-back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Image Carousel ── */}
        <View style={styles.carouselWrap}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            testID="apartment-detail-carousel"
          >
            {images.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={styles.carouselImage}
                contentFit="cover"
                transition={200}
              />
            ))}
          </ScrollView>

          {images.length > 1 && (
            <View style={styles.dotRow}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === activePage && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* Rent badge overlaid on carousel */}
          <View style={styles.rentBadge}>
            <Text style={styles.rentValue}>
              {CURRENCY}{apt.rent}
            </Text>
            <Text style={styles.rentPer}>{t("common.format.perMonthShort")}</Text>
          </View>
        </View>

        {/* ── Main Info Block ── */}
        <View style={styles.infoBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.aptTitle}>{apt.title}</Text>
            {isListingOwner ? (
              <Pressable
                style={styles.likeBtn}
                onPress={() => setDeleteModalVisible(true)}
                testID={`apartment-detail-delete-${apt.id}`}
              >
                <Ionicons name="trash-outline" size={20} color={colors.onSurface} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
                onPress={handleToggleLike}
                testID={`apartment-detail-like-${apt.id}`}
              >
                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
              </Pressable>
            )}
          </View>
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={16} color={colors.onSurfaceTertiary} />
            <Text style={styles.locText}>{apt.area}, {apt.city}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Ionicons name="home-outline" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.statText}>{t("common.format.roomCount", { count: apt.rooms })}</Text>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="expand-outline" size={14} color={colors.onBrandTertiary} />
              <Text style={styles.statText}>{`${apt.size} ${t("common.format.squareMetersShort")}`}</Text>
            </View>
          </View>
        </View>

        {/* ── Amenities Grid ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("apartmentDetail.amenitiesTitle")}</Text>
          <View style={styles.amenitiesGrid}>
            {AMENITIES.map((a) => {
              const active = a.tagMatch
                ? apt!.tags.some((t) => t.toLowerCase() === a.tagMatch!.toLowerCase())
                : false;
              return (
                <View
                  key={a.key}
                  style={[styles.amenityCell, active && styles.amenityCellActive]}
                  testID={`amenity-${a.key}`}
                >
                  <Ionicons
                    name={a.icon}
                    size={22}
                    color={active ? colors.onBrandTertiary : colors.onSurfaceTertiary}
                  />
                  <Text style={[styles.amenityLabel, active && styles.amenityLabelActive]}>
                    {t(a.label)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Description Box ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("apartmentDetail.aboutTitle")}</Text>
          <View style={styles.descBox}>
            <Text style={styles.descText}>{t("apartmentDetail.descriptionSummary", {
              size: apt.size,
              area: apt.area,
              city: apt.city,
              roomText: apt.rooms > 1 ? t("common.format.roomCount", { count: apt.rooms }) : t("apartmentDetail.privateRoom"),
              currency: CURRENCY,
              rent: apt.rent,
            })}</Text>
            <Text style={styles.descText}>{t("apartmentDetail.descriptionRules", {
              utilitiesText: apt.tags.includes("bills_included") ? t("apartmentDetail.utilitiesIncluded") : t("apartmentDetail.utilitiesSeparate"),
            })}</Text>
            {apt.tags.length > 0 && (
              <View style={styles.tagRow}>
                {apt.tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{translateApartmentTag(t)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Floating Contact Button ── */}
      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [styles.contactBtn, pressed && styles.contactBtnPressed]}
          onPress={
            isListingOwner
              ? handleEditListing
              : auth.isGuest
                ? () => router.push("/auth-landing")
                : startHostChat
          }
          testID={isListingOwner ? "apartment-detail-edit" : "apartment-detail-contact"}
        >
          <Ionicons name={isListingOwner ? "create-outline" : "mail-outline"} size={20} color={colors.onBrand} />
          <Text style={styles.contactBtnText}>
            {isListingOwner
              ? t("apartmentDetail.editListing")
              : auth.isGuest
                ? t("apartmentDetail.signInToContact")
                : t("common.cta.contactHost")}
          </Text>
        </Pressable>
      </View>

      <CenteredActionModal
        visible={deleteModalVisible}
        title={t("apartmentDetail.deleteListingTitle")}
        description={t("apartmentDetail.deleteListingMessage")}
        onDismiss={() => {
          if (!isDeletingListing) setDeleteModalVisible(false);
        }}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.back"),
            variant: "muted",
            iconName: "arrow-back-outline",
            onPress: () => setDeleteModalVisible(false),
          },
          {
            label: t("common.actions.delete"),
            variant: "danger",
            iconName: "trash-outline",
            onPress: () => {
              void handleDeleteListing();
            },
          },
        ]}
        testID="apartment-detail-delete-modal"
      />

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={[
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ]}
        testID="apartment-detail-action-modal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  scroll: { flex: 1 },

  /* Back overlay */
  backOverlay: {
    position: "absolute",
    left: spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  /* Carousel */
  carouselWrap: { position: "relative" },
  carouselImage: { width: SCREEN_WIDTH, height: 280 },
  dotRow: {
    position: "absolute",
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: { backgroundColor: colors.onBrand, width: 14 },
  rentBadge: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  rentValue: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["2xl"],
    color: colors.onBrand,
  },
  rentPer: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
    paddingBottom: 2,
    marginLeft: 2,
  },

  /* Info block */
  infoBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  aptTitle: {
    flex: 1,
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["2xl"],
    color: colors.onSurface,
    lineHeight: 30,
  },
  likeBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  likeBtnActive: {
    backgroundColor: "#FF5A66",
    borderColor: "#FF5A66",
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  locText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },

  /* Section wrapper */
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },

  /* Amenities */
  amenitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  amenityCell: {
    width: "30%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  amenityCellActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  amenityLabel: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  amenityLabelActive: { color: colors.onBrandTertiary },

  /* Description */
  descBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  descText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurface,
    lineHeight: 22,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  tag: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },

  /* Footer CTA */
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 56,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  contactBtnPressed: { opacity: 0.88 },
  contactBtnText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },

  /* Fallback */
  errorText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  backPill: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  backPillText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});
