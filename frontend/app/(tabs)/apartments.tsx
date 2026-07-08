import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { getUserProfile } from "@/src/api/userProfile";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import { t } from "@/src/locales";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;

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
}

interface FirestoreApartmentDoc {
  title?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  tags?: string[];
  amenities?: string[];
  hostId?: string;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
}

interface FirestoreHostInboxUserDoc {
  already_have_apartment_to_share?: boolean;
  has_place?: boolean;
}

function buildSeedApartments(): Apartment[] {
  return [
    {
      id: "a1",
      title: t("apartments.sample.a1.title"),
      area: "Kreuzberg",
      city: "Berlin",
      rent: 720,
      rooms: 3,
      size: 78,
      image:
        "https://images.unsplash.com/photo-1564078516393-cf04bd966897?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGFwYXJ0bWVudCUyMGxpdmluZyUyMHJvb20lMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzgyNzc4MzA0fDA&ixlib=rb-4.1.0&q=85",
      tags: ["Furnished", "Balcony", "WiFi"],
    },
    {
      id: "a2",
      title: t("apartments.sample.a2.title"),
      area: "Schwabing",
      city: "Munich",
      rent: 590,
      rooms: 2,
      size: 54,
      image:
        "https://images.unsplash.com/photo-1541194577687-8c63bf9e7ee3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxlbXB0eSUyMGFwYXJ0bWVudCUyMGxpdmluZyUyMHJvb20lMjB3YXJtJTIwbGlnaHR8ZW58MHx8fHwxNzgyNzc4MzA0fDA&ixlib=rb-4.1.0&q=85",
      tags: ["Pet-friendly", "Near metro"],
    },
    {
      id: "a3",
      title: t("apartments.sample.a3.title"),
      area: "Altstadt",
      city: "Heidelberg",
      rent: 850,
      rooms: 1,
      size: 42,
      image:
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
      tags: ["Furnished", "Bills incl."],
    },
    {
      id: "a4",
      title: t("apartments.sample.a4.title"),
      area: "Eimsbüttel",
      city: "Hamburg",
      rent: 480,
      rooms: 4,
      size: 95,
      image:
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85",
      tags: ["Shared kitchen", "Garden"],
    },
  ];
}

function translateApartmentTag(tag: string): string {
  const translated = t(`apartments.tags.${tag}`);
  return translated === `apartments.tags.${tag}` ? tag : translated;
}

export default function ApartmentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [publishedApartments, setPublishedApartments] = useState<Apartment[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [rentMin, setRentMin] = useState("");
  const [rentMax, setRentMax] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [nearMetro, setNearMetro] = useState(false);
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  const [hideCreateFab, setHideCreateFab] = useState(false);
  const [hasPublishedHostApartment, setHasPublishedHostApartment] = useState(false);
  const [hasApartmentShareFlag, setHasApartmentShareFlag] = useState(false);
  const [hostInboxHasUnread, setHostInboxHasUnread] = useState(false);
  const [likedApartmentIds, setLikedApartmentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setLikedApartmentIds(new Set());
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(auth.userId, setLikedApartmentIds);
    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    const apartmentsQuery = query(collection(db, "apartments"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      apartmentsQuery,
      (snapshot) => {
        const fetched: Apartment[] = snapshot.docs.map((snap) => {
          const data = snap.data() as FirestoreApartmentDoc;
          const amenities = Array.isArray(data.amenities) ? data.amenities : [];
          const tags = Array.isArray(data.tags) ? data.tags : amenities;
          return {
            id: snap.id,
            title: data.title?.trim() || t("apartments.unknownListing"),
            area: data.area?.trim() || t("apartments.unknownArea"),
            city: data.city?.trim() || t("apartments.unknownCity"),
            rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
            rooms: typeof data.rooms === "number" ? data.rooms : 1,
            size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
            image:
              data.image ||
              "https://images.unsplash.com/photo-1564078516393-cf04bd966897?crop=entropy&cs=srgb&fm=jpg&w=1200&q=85",
            tags: tags.length ? tags : [t("apartments.newListing")],
            hostId: data.hostId,
          };
        });
        setPublishedApartments(fetched);
      },
      () => {
        setPublishedApartments([]);
      },
    );

    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      if (auth.isGuest) {
        setHideCreateFab(false);
        return () => {
          mounted = false;
        };
      }
      (async () => {
        try {
          const uid = await getUserId();
          const profile = await getUserProfile(uid);
          if (mounted) setHideCreateFab(!!profile?.looking_for_apartment);
        } catch {
          if (mounted) setHideCreateFab(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [auth.isGuest]),
  );

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setHasPublishedHostApartment(false);
      setHasApartmentShareFlag(false);
      return;
    }

    const apartmentsQ = query(collection(db, "apartments"), where("hostId", "==", auth.userId));
    const unsubscribeApartments = onSnapshot(apartmentsQ, (snapshot) => {
      setHasPublishedHostApartment(snapshot.size > 0);
    });

    const userRef = doc(db, "users", auth.userId);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as FirestoreHostInboxUserDoc) : null;
      setHasApartmentShareFlag(snapshot.exists() && !!(data?.already_have_apartment_to_share || data?.has_place));
    });

    return () => {
      unsubscribeApartments();
      unsubscribeUser();
    };
  }, [auth.isGuest, auth.userId]);

  const canOpenHostInbox = hasPublishedHostApartment || hasApartmentShareFlag;

  useEffect(() => {
    if (auth.isGuest || !auth.userId || !canOpenHostInbox) {
      setHostInboxHasUnread(false);
      return;
    }

    let mounted = true;
    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId),
      where("type", "==", "host"),
    );

    const unsubscribe = onSnapshot(hostChatsQ, (snapshot) => {
      void (async () => {
        try {
          const unreadFlags = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              const counterpartId = (Array.isArray(chatData.users) ? chatData.users : []).find((uid) => uid !== auth.userId);
              if (!counterpartId) return false;

              const unreadQuery = query(
                collection(db, "chats", chatDoc.id, "messages"),
                where("senderId", "==", counterpartId),
                where("isRead", "==", false),
              );
              const unreadSnapshot = await getDocs(unreadQuery);
              return !unreadSnapshot.empty;
            }),
          );

          if (mounted) {
            setHostInboxHasUnread(unreadFlags.some(Boolean));
          }
        } catch {
          if (mounted) setHostInboxHasUnread(false);
        }
      })();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth.isGuest, auth.userId, canOpenHostInbox]);

  const apartments = useMemo(() => [...publishedApartments, ...buildSeedApartments()], [publishedApartments]);

  const handleToggleLike = useCallback(
    async (apartmentId: string) => {
      if (auth.isGuest || !auth.userId) {
        router.push("/auth-landing");
        return;
      }

      const wasLiked = likedApartmentIds.has(apartmentId);
      setLikedApartmentIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(apartmentId);
        else next.add(apartmentId);
        return next;
      });

      try {
        const isLiked = await toggleApartmentLike(auth.userId, apartmentId);
        setLikedApartmentIds((prev) => {
          const next = new Set(prev);
          if (isLiked) next.add(apartmentId);
          else next.delete(apartmentId);
          return next;
        });
      } catch {
        setLikedApartmentIds((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(apartmentId);
          else next.delete(apartmentId);
          return next;
        });
        Alert.alert(t("apartments.likeUpdateTitle"), t("apartments.likeUpdateMessage"));
      }
    },
    [auth.isGuest, auth.userId, likedApartmentIds, router],
  );

  const filteredApartments = useMemo(() => {
    const minRent = rentMin ? Number(rentMin) : null;
    const maxRent = rentMax ? Number(rentMax) : null;
    const minSize = sizeMin ? Number(sizeMin) : null;
    const maxSize = sizeMax ? Number(sizeMax) : null;
    const locationQuery = cityQuery.trim().toLowerCase();

    return apartments.filter((apt) => {
      if (showOnlyLiked && !likedApartmentIds.has(apt.id)) {
        return false;
      }

      const cityMatch =
        locationQuery.length === 0 ||
        apt.city.toLowerCase().includes(locationQuery) ||
        apt.area.toLowerCase().includes(locationQuery);
      const rentMatch =
        (minRent == null || apt.rent >= minRent) &&
        (maxRent == null || apt.rent <= maxRent);
      const sizeMatch =
        (minSize == null || apt.size >= minSize) &&
        (maxSize == null || apt.size <= maxSize);
      const petMatch = !petFriendly || apt.tags.includes("Pet-friendly");
      const metroMatch = !nearMetro || apt.tags.includes("Near metro");

      return cityMatch && rentMatch && sizeMatch && petMatch && metroMatch;
    });
  }, [apartments, cityQuery, likedApartmentIds, nearMetro, petFriendly, rentMax, rentMin, showOnlyLiked, sizeMax, sizeMin]);

  return (
    <View style={styles.container} testID="apartments-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>{t("apartments.title")}</Text>
        <Text style={styles.subtitle}>{t("apartments.subtitle")}</Text>
        <View style={styles.headerControlsRow}>
          <Pressable
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters((v) => !v)}
            testID="apartments-filter-toggle"
          >
            <Ionicons name="options-outline" size={18} color={colors.onBrandTertiary} />
            <Text style={styles.filterToggleText}>{showFilters ? t("apartments.hideFilters") : t("apartments.showFilters")}</Text>
          </Pressable>
          <View style={styles.viewToggle} testID="apartments-view-toggle">
            <Pressable
              style={[styles.viewToggleOption, !showOnlyLiked && styles.viewToggleOptionActive]}
              onPress={() => setShowOnlyLiked(false)}
              testID="apartments-view-all"
            >
              <Text style={[styles.viewToggleText, !showOnlyLiked && styles.viewToggleTextActive]}>{t("apartments.all")}</Text>
            </Pressable>
            <Pressable
              style={[styles.viewToggleOption, showOnlyLiked && styles.viewToggleOptionActive]}
              onPress={() => setShowOnlyLiked(true)}
              testID="apartments-view-liked"
            >
              <Text 
                style={[styles.viewToggleText, showOnlyLiked && styles.viewToggleTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t("apartments.liked")}
              </Text>
            </Pressable>
          </View>
        </View>
        {showFilters && (
          <View style={styles.filterPanel} testID="apartments-filter-panel">
            <Text style={styles.filterLabel}>{t("apartments.monthlyRent", { currency: CURRENCY })}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={rentMin}
                onChangeText={(t) => setRentMin(t.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.min")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={rentMax}
                onChangeText={(t) => setRentMax(t.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.max")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-rent-max"
              />
            </View>

            <Text style={styles.filterLabel}>{t("apartments.areaCity")}</Text>
            <TextInput
              style={styles.singleInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder={t("apartments.cityPlaceholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              testID="apartments-city-filter"
            />

            <Text style={styles.filterLabel}>{t("apartments.squareMeters")}</Text>
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                value={sizeMin}
                onChangeText={(t) => setSizeMin(t.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.min")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-min"
              />
              <TextInput
                style={styles.rangeInput}
                value={sizeMax}
                onChangeText={(t) => setSizeMax(t.replace(/[^0-9]/g, ""))}
                placeholder={t("apartments.max")}
                keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                testID="apartments-size-max"
              />
            </View>

            <Text style={styles.filterLabel}>{t("apartments.preferences")}</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t("apartments.petFriendly")}</Text>
              <Switch value={petFriendly} onValueChange={setPetFriendly} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>{t("apartments.nearMetro")}</Text>
              <Switch value={nearMetro} onValueChange={setNearMetro} trackColor={{ true: colors.brand, false: colors.border }} />
            </View>
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredApartments.map((apt) => {
          const isLiked = likedApartmentIds.has(apt.id);
          return (
            <View key={apt.id} style={styles.cardWrap}>
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() =>
                  router.push({
                    pathname: "/apartment-detail",
                    params: { data: JSON.stringify(apt) },
                  } as any)
                }
                testID={`apartment-card-${apt.id}`}
              >
                <Image source={{ uri: apt.image }} style={styles.photo} contentFit="cover" transition={150} />
                <LinearGradient
                  colors={["transparent", "rgba(26,26,26,0.95)"]}
                  locations={[0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.rentBadge}>
                  <Text style={styles.rentText}>
                    {CURRENCY}
                    {apt.rent}
                  </Text>
                  <Text style={styles.rentMo}>{t("apartments.perMonthShort")}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.aptTitle}>{apt.title}</Text>
                  <View style={styles.locRow}>
                    <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.loc}>
                      {apt.area}, {apt.city}
                    </Text>
                  </View>
                  <View style={styles.statsRow}>
                    <Text style={styles.stat}>{`${apt.rooms} ${t("apartments.rooms")}`}</Text>
                    <View style={styles.dot} />
                    <Text style={styles.stat}>{apt.size} m²</Text>
                  </View>
                  <View style={styles.tagRow}>
                    {apt.tags.map((t) => (
                      <View key={t} style={styles.tag}>
                        <Text style={styles.tagText}>{translateApartmentTag(t)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>
              <Pressable
                style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
                onPress={() => handleToggleLike(apt.id)}
                testID={`apartment-like-${apt.id}`}
              >
                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
              </Pressable>
            </View>
          );
        })}
        {filteredApartments.length === 0 && (
          <View style={styles.emptyState} testID="apartments-empty-state">
            <Text style={styles.emptyTitle}>
              {showOnlyLiked ? t("apartments.emptyLiked") : t("apartments.emptyFiltered")}
            </Text>
            {!showOnlyLiked && (
              <Text style={styles.emptySub}>{t("apartments.emptyHint")}</Text>
            )}
          </View>
        )}
      </ScrollView>
      {!auth.isGuest && !hideCreateFab && (
        <View style={[styles.fabCluster, { bottom: TAB_BAR_SPACE + insets.bottom + spacing.md }]}>
          {canOpenHostInbox && (
            <Pressable
              style={[styles.hostInboxFab, hostInboxHasUnread && styles.hostInboxFabUnread]}
              onPress={() => router.push("/host-inbox" as any)}
              testID="apartments-host-inbox-fab"
            >
              <Text style={[styles.hostInboxFabText, hostInboxHasUnread && styles.hostInboxFabTextUnread]}>✉️</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.fab}
            onPress={() => router.push("/create-listing" as any)}
            testID="apartments-create-fab"
          >
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  headerControlsRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  filterToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 46,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  filterToggleActive: { backgroundColor: "#C8E9FF" },
  filterToggleText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrandTertiary, 
    // --- ΠΡΟΣΘΗΚΕΣ ΓΙΑ ΚΕΝΤΡΑΡΙΣΜΑ ---
    includeFontPadding: false,  // 1. Αφαιρεί το κρυφό έξτρα padding του Android
    textAlignVertical: "center", // 2. Αναγκάζει το κείμενο να κάθισε στο κέντρο του
    transform: [{ translateY: -1 }] // 3. (Προαιρετικό) "Κλέβει" 1 pixel προς τα πάνω αν το font σου είναι πολύ περίεργο
   },
  viewToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    height: 46,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  viewToggleOption: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    // paddingVertical: spacing.sm,
  },
  viewToggleOptionActive: {
    backgroundColor: colors.brand,
  },
  viewToggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrandTertiary,
    // --- ΠΡΟΣΘΗΚΕΣ ΓΙΑ ΚΕΝΤΡΑΡΙΣΜΑ ---
    includeFontPadding: false,  // 1. Αφαιρεί το κρυφό έξτρα padding του Android
    textAlignVertical: "center", // 2. Αναγκάζει το κείμενο να κάθισε στο κέντρο του
    transform: [{ translateY: -1 }] // 3. (Προαιρετικό) "Κλέβει" 1 pixel προς τα πάνω αν το font σου είναι πολύ περίεργο
  },
  viewToggleTextActive: {
    color: colors.onBrand,
  },
  filterPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterLabel: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, marginTop: spacing.xs },
  rangeRow: { flexDirection: "row", gap: spacing.sm },
  rangeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
  },
  singleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  switchText: { 
    fontFamily: fonts.semibold, 
    fontSize: fontSize.base, 
    color: colors.onSurface,
  },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  cardWrap: { position: "relative" },
  card: {
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  cardPressed: { opacity: 0.88 },
  likeBtn: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  likeBtnActive: {
    backgroundColor: "#FF5A66",
    borderColor: "#FF5A66",
  },
  photo: { ...StyleSheet.absoluteFillObject },
  rentBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  rentText: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onBrand },
  rentMo: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand, paddingBottom: 2 },
  cardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.xs },
  aptTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurfaceInverse },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  loc: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  stat: { fontFamily: fonts.regular, fontSize: fontSize.base, color: "rgba(255,255,255,0.9)" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  tag: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceInverse },
  emptyState: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  fabCluster: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FF8A1E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { fontFamily: fonts.displayExtra, fontSize: 32, color: colors.onBrand },
  hostInboxFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D9F0FF",
    borderWidth: 1,
    borderColor: "#A8D9FF",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  hostInboxFabUnread: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  hostInboxFabText: {
    fontSize: 22,
    color: colors.brandTertiary,
  },
  hostInboxFabTextUnread: {
    color: colors.brandTertiary,
  },
});
