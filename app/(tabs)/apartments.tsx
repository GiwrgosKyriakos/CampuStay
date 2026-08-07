import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/src/context/ThemeContext";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, TouchableOpacity, PanResponder, Modal, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, getDocs, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { getUserProfile } from "@/src/api/userProfile";
import { getUserId } from "@/src/utils/userId";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { subscribeUserLikedApartmentIds, toggleApartmentLike } from "@/src/api/apartmentLikes";
import { saveRecentSearch, subscribeRecentSearches } from "@/src/api/recentSearches";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { t } from "@/src/locales";
import { getExcludedUserIds } from "@/src/api/blocking";
import { getUserApartmentNotes, updateNotesOrder, type Apartment as ApartmentNoteData } from "@/src/api/apartmentNotes";

const CURRENCY = "€";
const TAB_BAR_SPACE = 100;

function normalizeText(str: string): string {
  const greekAccentMap: Record<string, string> = {
    ά: "α",
    έ: "ε",
    ή: "η",
    ί: "ι",
    ΐ: "ι",
    ό: "ο",
    ύ: "υ",
    ΰ: "υ",
    ώ: "ω",
    ς: "σ",
  };

  const latinToGreekMap: Record<string, string> = {
    a: "α",
    b: "β",
    c: "κ",
    d: "δ",
    e: "ε",
    f: "φ",
    g: "γ",
    h: "η",
    i: "ι",
    j: "ζ",
    k: "κ",
    l: "λ",
    m: "μ",
    n: "ν",
    o: "ο",
    p: "π",
    q: "κ",
    r: "ρ",
    s: "σ",
    t: "τ",
    u: "υ",
    v: "β",
    w: "ω",
    x: "χ",
    y: "υ",
    z: "ζ",
  };

  const lower = str.toLowerCase().trim();
  const noDiacritics = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mapped = noDiacritics
    .split("")
    .map((char) => greekAccentMap[char] ?? latinToGreekMap[char] ?? char)
    .join("");

  return mapped
    .replace(/[^a-z0-9α-ω\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Apartment {
  id: string;
  title: string;
  description?: string;
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  area: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent: number;
  maxDiscountPercent?: number;
  rooms: number;
  size: number;
  image: string;
  images?: string[];
  tags: string[];
  amenities: string[];
  hostId?: string;
  ownerId?: string;
  available: boolean;
}

interface FirestoreApartmentDoc {
  title?: string;
  description?: string; 
  about?: string;       
  propertyCategory?: string;
  propertyType?: string;
  floor?: string;
  area?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  hasExactLocation?: boolean;
  rent?: number;
  price?: number;
  maxDiscountPercent?: number;
  rooms?: number;
  size?: number;
  sqft?: number;
  image?: string;
  images?: string[];
  tags?: string[];
  amenities?: string[];
  hostId?: string;
  ownerId?: string;
  available?: boolean;
  isAvailable?: boolean;
}

interface FirestoreHostChatDoc {
  users?: string[];
  type?: "roommate" | "host" | string;
  initiatedBy?: string | null;
  apartmentId?: string;
}

type ApartmentQuickChatMeta = {
  hasContactedHost: boolean;
  chatRoomId: string;
  hostId: string;
  initiatedByCurrentUser: boolean;
};

interface FirestoreHostInboxUserDoc {
  already_have_apartment_to_share?: boolean;
  has_place?: boolean;
}

const LEGACY_TAG_TO_SLUG: Record<string, string> = {
  "Pet-friendly": "pet_friendly",
  "Near metro": "near_metro",
  Furnished: "furnished",
  Balcony: "balcony",
  WiFi: "wifi",
  "Bills incl.": "bills_included",
  "Shared kitchen": "shared_kitchen",
  Garden: "garden",
  "New listing": "new_listing",
  "Κατάλληλο για κατοικίδια": "pet_friendly",
};

function normalizeTagSlug(tag: string): string {
  const trimmedTag = tag.trim();
  return LEGACY_TAG_TO_SLUG[trimmedTag] ?? trimmedTag.toLowerCase();
}

function translateApartmentTag(tag: string): string {
  const translated = t(`apartments.tags.${tag}`);
  return translated === `apartments.tags.${tag}` ? tag.replace(/_/g, " ") : translated;
}

type ApartmentGridCardProps = {
  apt: Apartment;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  isLiked: boolean;
  isMyListingsView: boolean;
  quickChatMeta?: ApartmentQuickChatMeta;
  onOpen: () => void;
  onToggleLike: () => void;
};

type ApartmentNoteItem = {
  id: string;
  text: string;
  apartmentData: ApartmentNoteData;
  orderIndex: number;
};

function ApartmentGridCard({
  apt,
  styles,
  colors,
  isLiked,
  isMyListingsView,
  quickChatMeta,
  onOpen,
  onToggleLike,
}: ApartmentGridCardProps) {
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const cardImages = useMemo(() => {
    const validImages = Array.isArray(apt.images)
      ? apt.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
      : [];

    if (validImages.length > 0) return validImages;
    return apt.image ? [apt.image] : [];
  }, [apt.image, apt.images]);

  useEffect(() => {
    if (activeImageIndex > cardImages.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, cardImages.length]);

  const activeImage = cardImages[activeImageIndex] || "";

  return (
    <View style={styles.cardWrap}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onOpen}
        testID={`apartment-card-${apt.id}`}
      >
        {activeImage ? (
          <Image source={{ uri: activeImage }} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, styles.cardPlaceholder]}>
            <Ionicons name="home" size={44} color={colors.brand} />
            <Text style={styles.cardPlaceholderText}>CampuStay</Text>
          </View>
        )}

        {cardImages.length > 1 && activeImageIndex > 0 && (
          <Pressable
            style={[styles.carouselArrowButton, styles.carouselArrowLeft]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.max(0, prev - 1));
            }}
            hitSlop={8}
            testID={`apartment-card-prev-image-${apt.id}`}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        )}

        {cardImages.length > 1 && activeImageIndex < cardImages.length - 1 && (
          <Pressable
            style={[styles.carouselArrowButton, styles.carouselArrowRight]}
            onPress={(e) => {
              e.stopPropagation();
              setActiveImageIndex((prev) => Math.min(cardImages.length - 1, prev + 1));
            }}
            hitSlop={8}
            testID={`apartment-card-next-image-${apt.id}`}
          >
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        )}

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
            {apt.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{translateApartmentTag(tag)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>

      {!isMyListingsView ? (
        <>
          {quickChatMeta?.hasContactedHost ? (
            <Pressable
              style={[styles.likeBtn, styles.quickChatBtn]}
              onPress={(e) => {
                e.stopPropagation();
                router.push({
                  pathname: "/chat/[id]",
                  params: {
                    id: quickChatMeta.hostId,
                    chatRoomId: quickChatMeta.chatRoomId,
                  },
                });
              }}
              testID={`apartment-quick-chat-${apt.id}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.onBrand} />
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
            onPress={onToggleLike}
            testID={`apartment-like-${apt.id}`}
          >
            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FFFFFF" : colors.onSurface} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export default function ApartmentsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [publishedApartments, setPublishedApartments] = useState<Apartment[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [rentMin, setRentMin] = useState("");
  const [rentMax, setRentMax] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [nearMetro, setNearMetro] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "liked">("all");
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");
  const [isViewingMyListings, setIsViewingMyListings] = useState(false);
  const [hideCreateFab, setHideCreateFab] = useState(false);
  const [hasPublishedHostApartment, setHasPublishedHostApartment] = useState(false);
  const [hasApartmentShareFlag, setHasApartmentShareFlag] = useState(false);
  const [hostInboxHasUnread, setHostInboxHasUnread] = useState(false);
  const [hostChatByApartmentId, setHostChatByApartmentId] = useState<Record<string, ApartmentQuickChatMeta>>({});
  const [likedApartmentIds, setLikedApartmentIds] = useState<Set<string>>(new Set());
  const [likeErrorModalVisible, setLikeErrorModalVisible] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesList, setNotesList] = useState<ApartmentNoteItem[]>([]);
  const [notesOrderSaving, setNotesOrderSaving] = useState(false);
  const SWIPE_THRESHOLD = 56;
  const canOpenHostInbox = hasPublishedHostApartment || hasApartmentShareFlag;
  const canManageListings = !auth.isGuest && (hasPublishedHostApartment || hasApartmentShareFlag);
  const showCreateFab = !auth.isGuest && (!hideCreateFab || auth.isBroker);
  const showHostInboxFab = !auth.isGuest && !auth.isBroker && !hideCreateFab && canOpenHostInbox;

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setRecentSearches([]);
      setShowRecentSearches(false);
      return;
    }

    const unsubscribe = subscribeRecentSearches(auth.userId, (items) => {
      setRecentSearches(items);
    });

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!showSearch) {
      setShowRecentSearches(false);
    }
  }, [showSearch]);

  useEffect(() => {
    if (!showNotesPanel || auth.isGuest || !auth.userId) {
      return;
    }

    let active = true;
    setLoadingNotes(true);

    void (async () => {
      try {
        const notes = await getUserApartmentNotes(auth.userId!);
        if (!active) return;
        const sorted = [...notes].sort((left, right) => {
          const leftIndex = Number.isFinite(left.orderIndex) ? left.orderIndex : Number.MAX_SAFE_INTEGER;
          const rightIndex = Number.isFinite(right.orderIndex) ? right.orderIndex : Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
        setNotesList(sorted);
      } catch {
        if (!active) return;
        setNotesList([]);
      } finally {
        if (active) setLoadingNotes(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.isGuest, auth.userId, showNotesPanel]);

  const handlePersistedSearch = useCallback(
    async (queryText: string) => {
      const trimmedQuery = queryText.trim();
      if (trimmedQuery.length >= 2 && !auth.isGuest && auth.userId) {
        try {
          await saveRecentSearch(auth.userId, trimmedQuery);
        } catch {
          // Keep search UX responsive even if persistence fails.
        }
      }
      setShowRecentSearches(false);
    },
    [auth.isGuest, auth.userId],
  );


  useEffect(() => {
    if (auth.isGuest || !auth.userId || !canOpenHostInbox) {
      setHostInboxHasUnread(false);
      return;
    }

    let mounted = true;
    
    // 🚨 Βγάλαμε το where("type", "==", "host")
    const hostChatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId)
    );

    const unsubscribe = onSnapshot(hostChatsQ, (snapshot) => {
      void (async () => {
        try {
          const unreadFlags = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data() as FirestoreHostChatDoc;
              
              // 🚨 Τοπικό φιλτράρισμα ρόλων
              if (chatData.type !== "host") return false;
              if (chatData.initiatedBy === auth.userId) return false;

              const counterpartId = (Array.isArray(chatData.users) ? chatData.users : []).find((uid) => uid !== auth.userId);
              if (!counterpartId) return false;

              try {
                const unreadQuery = query(
                  collection(db, "chats", chatDoc.id, "messages"),
                  where("senderId", "==", counterpartId),
                  where("isRead", "==", false),
                );
                const unreadSnapshot = await getDocs(unreadQuery);
                return !unreadSnapshot.empty;
              } catch (e) {
                // 🛡️ Fallback ασφαλείας
                const lastMsgSnap = await getDocs(query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1)));
                if (!lastMsgSnap.empty) {
                  const lastMsg = lastMsgSnap.docs[0].data();
                  return lastMsg.senderId === counterpartId && lastMsg.isRead === false;
                }
                return false;
              }
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

  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setHostChatByApartmentId({});
      return;
    }

    const chatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", auth.userId),
      where("type", "==", "host"),
    );

    const unsubscribe = onSnapshot(
      chatsQ,
      (snapshot) => {
        const nextMap: Record<string, ApartmentQuickChatMeta> = {};

        snapshot.docs.forEach((chatDoc) => {
          const data = chatDoc.data() as FirestoreHostChatDoc;
          const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId.trim() : "";
          if (!apartmentId) return;

          const users = Array.isArray(data.users) ? data.users : [];
          const hostId = users.find((uid) => uid !== auth.userId) ?? "";
          if (!hostId) return;

          const initiatedByCurrentUser = data.initiatedBy === auth.userId;
          nextMap[apartmentId] = {
            hasContactedHost: true,
            chatRoomId: chatDoc.id,
            hostId,
            initiatedByCurrentUser,
          };
        });

        setHostChatByApartmentId(nextMap);
      },
      () => {
        setHostChatByApartmentId({});
      },
    );

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    if (auth.isLoading) return;

    let active = true;

    (async () => {
      try {
        const apartmentsQuery = query(collection(db, "apartments"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(
          apartmentsQuery,
          async (snapshot) => {
            if (!active) return;

            const excludedUserIds = auth.userId ? await getExcludedUserIds(auth.userId) : new Set<string>();

            // Bidirectional visibility filtering for blocked users.
            const fetched = await Promise.all(
              snapshot.docs.map(async (snap): Promise<Apartment | null> => {
                const data = snap.data() as FirestoreApartmentDoc;
                const hostOrOwnerId = data.hostId || data.ownerId;
                if (hostOrOwnerId && excludedUserIds.has(hostOrOwnerId)) return null;

                const amenities = Array.isArray(data.amenities) ? data.amenities : [];
                const rawTags = Array.isArray(data.tags) ? data.tags : amenities;
                const tags = rawTags.map(normalizeTagSlug);
                const imageList = Array.isArray(data.images)
                  ? data.images.filter((img): img is string => typeof img === "string" && img.trim().length > 0)
                  : [];
                const fallbackImage = typeof data.image === "string" ? data.image.trim() : "";
                const resolvedImages = imageList.length > 0 ? imageList : fallbackImage ? [fallbackImage] : [];
                const available = typeof data.available === "boolean" ? data.available : typeof data.isAvailable === "boolean" ? data.isAvailable : true;

                return {
                  id: snap.id,
                  title: data.title?.trim() || t("apartments.unknownListing"),
                  description: data.description || data.about || "",
                  propertyCategory:
                    typeof data.propertyCategory === "string" && data.propertyCategory.trim().length > 0
                      ? data.propertyCategory.trim()
                      : undefined,
                  propertyType:
                    typeof data.propertyType === "string" && data.propertyType.trim().length > 0
                      ? data.propertyType.trim()
                      : undefined,
                  floor:
                    typeof data.floor === "string" && data.floor.trim().length > 0
                      ? data.floor.trim()
                      : undefined,
                  area: data.area?.trim() || t("apartments.unknownArea"),
                  city: data.city?.trim() || t("apartments.unknownCity"),
                  address: data.address?.trim(),
                  latitude: typeof data.latitude === "number" ? data.latitude : undefined,
                  longitude: typeof data.longitude === "number" ? data.longitude : undefined,
                  hasExactLocation: data.hasExactLocation === true,
                  rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : 0,
                  rooms: typeof data.rooms === "number" ? data.rooms : 1,
                  size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : 0,
                  image: resolvedImages[0] || "",
                  images: resolvedImages,
                  tags: tags.length ? tags : ["new_listing"],
                  amenities,
                  hostId: data.hostId,
                  ownerId: data.ownerId || data.hostId,
                  available,
                };
              })
            );

            if (active) {
              setPublishedApartments(fetched.filter((item): item is Apartment => item !== null));
            }
          },
          () => {
            if (active) setPublishedApartments([]);
          },
        );

        return () => unsubscribe();
      } catch (err) {
        console.error("Failed to fetch apartments:", err);
        if (active) setPublishedApartments([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, auth.isLoading]);

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

  useEffect(() => {
    if (!canManageListings && isViewingMyListings) {
      setIsViewingMyListings(false);
    }
  }, [canManageListings, isViewingMyListings]);

  const handleSwipeTabChange = useCallback(
    (direction: "left" | "right") => {
      if (isViewingMyListings) {
        if (direction === "left") {
          setViewMode("compact");
          return;
        }
        setViewMode("grid");
        return;
      }

      if (direction === "left") {
        setActiveTab("liked");
        return;
      }
      setActiveTab("all");
    },
    [isViewingMyListings],
  );

  const contentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            handleSwipeTabChange("left");
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            handleSwipeTabChange("right");
          }
        },
      }),
    [handleSwipeTabChange],
  );

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
              
              // 🚨 ΚΑΘΟΡΙΣΤΙΚΟΣ ΕΛΕΓΧΟΣ:
              // Αν το chat αυτό το ξεκινήσαμε εμείς (auth.userId), τότε είμαστε ο Guest/Student.
              // Επομένως, το chat αυτό ανήκει στο Matches Screen και ΟΧΙ στο δικό μας Host Inbox!
              if (chatData.initiatedBy === auth.userId) return false;

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

  // 🟢 Real-time συγχρονισμός των Likes μεταξύ Feed και Detail Screen
  useEffect(() => {
    if (auth.isGuest || !auth.userId) {
      setLikedApartmentIds(new Set());
      return;
    }

    const unsubscribe = subscribeUserLikedApartmentIds(auth.userId, (ids) => {
      setLikedApartmentIds(ids);
    });

    return () => unsubscribe();
  }, [auth.isGuest, auth.userId]);

  const apartments = useMemo(() => [...publishedApartments], [publishedApartments]);

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
        setLikeErrorModalVisible(true);
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
    const normalizedSearch = normalizeText(searchQuery);
    const currentUid = auth.userId;

    const baseFiltered = apartments.filter((apt) => {
      const isOwnListing = !!currentUid && apt.ownerId === currentUid;

      if (isViewingMyListings) {
        if (!isOwnListing) return false;
      } else {
        if (activeTab === "liked" && !likedApartmentIds.has(apt.id)) {
          return false;
        }
        if (isOwnListing) {
          return false;
        }
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
      const petMatch = !petFriendly || apt.tags.includes("pet_friendly");
      const metroMatch = !nearMetro || apt.tags.includes("near_metro");

      return cityMatch && rentMatch && sizeMatch && petMatch && metroMatch;
    });

    if (!normalizedSearch) return baseFiltered;

    return baseFiltered
      .map((apt, index) => {
        const titleNorm = normalizeText(apt.title);
        const areaNorm = normalizeText(apt.area);
        const descriptionNorm = normalizeText(apt.description || "");
        const tagsNorm = apt.tags.map((tag) => normalizeText(tag));
        const amenitiesNorm = apt.amenities.map((amenity) => normalizeText(amenity));

        let score = 0;
        if (titleNorm.includes(normalizedSearch)) score += 4;
        if (areaNorm.includes(normalizedSearch)) score += 3;
        if (descriptionNorm.includes(normalizedSearch)) score += 2;
        if (
          tagsNorm.some((item) => item.includes(normalizedSearch)) ||
          amenitiesNorm.some((item) => item.includes(normalizedSearch))
        ) {
          score += 1;
        }

        return { apt, score, index };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.apt);
  }, [
    activeTab,
    apartments,
    auth.userId,
    cityQuery,
    isViewingMyListings,
    likedApartmentIds,
    nearMetro,
    petFriendly,
    rentMax,
    rentMin,
    searchQuery,
    sizeMax,
    sizeMin,
  ]);

  const isCompactActive = isViewingMyListings && viewMode === "compact";

  return (
    <View style={styles.container} testID="apartments-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRowTop}>
          <Text style={styles.title}>{t("apartments.title")}</Text>
          {canManageListings ? (
            <Pressable
              style={[styles.myListingsPill, isViewingMyListings && styles.myListingsPillActive]}
              onPress={() => setIsViewingMyListings((prev) => !prev)}
              testID="apartments-my-listings-pill"
            >
              <Text style={[styles.myListingsPillText, isViewingMyListings && styles.myListingsPillTextActive]}>
                {t("apartments.myListings")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>{t("apartments.subtitle")}</Text>
        <View style={styles.headerControlsRow}>
          <Pressable
            style={[styles.iconControlButton, showFilters && styles.iconControlButtonActive]}
            onPress={() => setShowFilters((v) => !v)}
            testID="apartments-filter-toggle"
          >
            <Ionicons name="options-outline" size={18} color={colors.onBrandTertiary} />
          </Pressable>
          <Pressable
            style={[styles.iconControlButton, showSearch && styles.iconControlButtonActive]}
            onPress={() => setShowSearch((prev) => !prev)}
            testID="apartments-search-toggle"
          >
            <Ionicons name="search-outline" size={18} color={colors.onBrandTertiary} />
          </Pressable>
          <Pressable
            style={[styles.iconControlButton, showNotesPanel && styles.iconControlButtonActive]}
            onPress={() => setShowNotesPanel((prev) => !prev)}
            testID="apartments-notes-toggle"
          >
            <Ionicons name="journal-outline" size={18} color={colors.onBrandTertiary} />
          </Pressable>
          {!isViewingMyListings ? (
            <View style={styles.viewToggle} testID="apartments-view-toggle">
              <Pressable
                style={[styles.viewToggleOption, activeTab === "all" && styles.viewToggleOptionActive]}
                onPress={() => setActiveTab("all")}
                testID="apartments-view-all"
              >
                <Text style={[styles.viewToggleText, activeTab === "all" && styles.viewToggleTextActive]}>{t("apartments.all")}</Text>
              </Pressable>
              <Pressable
                style={[styles.viewToggleOption, activeTab === "liked" && styles.viewToggleOptionActive]}
                onPress={() => setActiveTab("liked")}
                testID="apartments-view-liked"
              >
                <Text
                  style={[styles.viewToggleText, activeTab === "liked" && styles.viewToggleTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t("apartments.liked")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.viewToggle} testID="apartments-view-toggle">
              <Pressable
                style={[styles.viewToggleOption, viewMode === "grid" && styles.viewToggleOptionActive]}
                onPress={() => setViewMode("grid")}
                testID="apartments-view-grid"
              >
                <Ionicons
                  name={viewMode === "grid" ? "grid" : "grid-outline"}
                  size={19}
                  color={viewMode === "grid" ? colors.onBrand : colors.onBrandTertiary}
                />
              </Pressable>
              <Pressable
                style={[styles.viewToggleOption, viewMode === "compact" && styles.viewToggleOptionActive]}
                onPress={() => setViewMode("compact")}
                testID="apartments-view-compact"
              >
                <Ionicons
                  name={viewMode === "compact" ? "list" : "contract-outline"}
                  size={19}
                  color={viewMode === "compact" ? colors.onBrand : colors.onBrandTertiary}
                />
              </Pressable>
            </View>
          )}
        </View>
        {showSearch && (
          <View style={styles.searchPanel} testID="apartments-search-panel">
            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={18} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  void handlePersistedSearch(searchQuery);
                }}
                placeholder="Αναζήτηση τίτλου, περιοχής, amenities..."
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="apartments-search-input"
              />
              <View style={styles.searchActionsWrap}>
                <Pressable
                  onPress={() => setShowRecentSearches((prev) => !prev)}
                  style={[styles.searchHistoryBtn, showRecentSearches && styles.searchHistoryBtnActive]}
                  testID="apartments-search-history-toggle"
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={showRecentSearches ? colors.onBrand : colors.onSurfaceTertiary}
                  />
                </Pressable>
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")} style={styles.searchClearBtn} testID="apartments-search-clear">
                    <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
                  </Pressable>
                )}
              </View>
            </View>
            {showRecentSearches ? (
              <View style={styles.recentSearchesPanel} testID="apartments-recent-searches-panel">
                <ScrollView
                  style={styles.recentSearchesScroll}
                  contentContainerStyle={styles.recentSearchesContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {recentSearches.length === 0 ? (
                    <View style={styles.recentSearchEmptyRow}>
                      <Text style={styles.recentSearchEmptyText}>Δεν υπάρχουν πρόσφατες αναζητήσεις</Text>
                    </View>
                  ) : (
                    recentSearches.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.recentSearchRow}
                        onPress={() => {
                          setSearchQuery(item);
                          void handlePersistedSearch(item);
                        }}
                        testID={`apartments-recent-search-${item}`}
                      >
                        <Ionicons name="time-outline" size={16} color={colors.onSurfaceTertiary} />
                        <Text style={styles.recentSearchText} numberOfLines={1}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}
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
      <View {...contentPanResponder.panHandlers} style={styles.flexOne}>
      <ScrollView
        contentContainerStyle={[styles.list, isCompactActive && styles.compactList, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {isCompactActive && filteredApartments.length > 0 && (
          <View style={styles.compactHeaderRow}>
            <View style={styles.compactThumbSpacer} />
            <View style={[styles.compactCol, styles.compactAreaCol]}>
              <Text style={styles.compactHeaderPill}>Περιοχή</Text>
            </View>
            <View style={[styles.compactCol, styles.compactSqmCol]}>
              <Text style={styles.compactHeaderPill}>Τ.μ.</Text>
            </View>
            <View style={[styles.compactCol, styles.compactAvailCol]}>
              <Text style={styles.compactHeaderPill}>Διαθ.</Text>
            </View>
            <View style={[styles.compactCol, styles.compactRentCol]}>
              <Text style={styles.compactHeaderPill}>Νοίκιο</Text>
            </View>
          </View>
        )}

        {filteredApartments.map((apt) => {
          const isLiked = likedApartmentIds.has(apt.id);
          const isMyListingsView = isViewingMyListings;
          const chatMeta = hostChatByApartmentId[apt.id];
          const canShowQuickChat =
            !!chatMeta &&
            !!auth.userId &&
            apt.hostId !== auth.userId &&
            (chatMeta.initiatedByCurrentUser || apt.hostId !== auth.userId);
          const quickChatMeta = canShowQuickChat ? chatMeta : undefined;

          if (isCompactActive) {
            return (
              <TouchableOpacity
                key={apt.id}
                style={styles.compactRowCard}
                activeOpacity={0.86}
                onPress={() =>
                  router.push({
                    pathname: "/apartment-detail",
                    params: { data: JSON.stringify(apt) },
                  } as any)
                }
                testID={`apartment-compact-row-${apt.id}`}
              >
                {apt.image ? (
                  <Image source={{ uri: apt.image }} style={styles.compactThumb} contentFit="cover" transition={100} />
                ) : (
                  <View style={[styles.compactThumb, styles.compactThumbPlaceholder]}>
                    <Ionicons name="home" size={16} color={colors.brand} />
                  </View>
                )}

                <View style={[styles.compactCol, styles.compactAreaCol]}>
                  <Text style={styles.compactNeutralPill} numberOfLines={1}>
                    {apt.area}
                  </Text>
                </View>

                <View style={[styles.compactCol, styles.compactSqmCol]}>
                  <Text style={styles.compactCellText} numberOfLines={1}>
                    {apt.size}
                  </Text>
                </View>

                <View style={[styles.compactCol, styles.compactAvailCol]}>
                  <View style={[styles.availabilityBadge, apt.available ? styles.availabilityOn : styles.availabilityOff]}>
                    <Ionicons name={apt.available ? "checkmark" : "close"} size={12} color={apt.available ? colors.onBrand : colors.onSurfaceTertiary} />
                  </View>
                </View>

                <View style={[styles.compactCol, styles.compactRentCol]}>
                  <Text style={styles.compactRentPill} numberOfLines={1}>
                    {`${apt.rent}${CURRENCY}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <ApartmentGridCard
              key={apt.id}
              apt={apt}
              styles={styles}
              colors={colors}
              isLiked={isLiked}
              isMyListingsView={isMyListingsView}
              quickChatMeta={quickChatMeta}
              onOpen={() =>
                router.push({
                  pathname: "/apartment-detail",
                  params: { data: JSON.stringify(apt) },
                } as any)
              }
              onToggleLike={() => handleToggleLike(apt.id)}
            />
          );
        })}
        {filteredApartments.length === 0 && (
          <View style={styles.emptyState} testID="apartments-empty-state">
            <Text style={styles.emptyTitle}>
              {isViewingMyListings
                ? t("apartments.emptyMine")
                : activeTab === "liked"
                ? t("apartments.emptyLiked")
                : t("apartments.emptyFiltered")}
            </Text>
            {!isViewingMyListings && activeTab !== "liked" && (
              <Text style={styles.emptySub}>{t("apartments.emptyHint")}</Text>
            )}
          </View>
        )}
      </ScrollView>
      </View>
      {showCreateFab && (
        <View style={[styles.fabCluster, { bottom: TAB_BAR_SPACE + insets.bottom + spacing.md }]}>
          {showHostInboxFab && (
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

      <CenteredActionModal
        visible={likeErrorModalVisible}
        title={t("apartments.likeUpdateTitle")}
        description={t("apartments.likeUpdateMessage")}
        onDismiss={() => setLikeErrorModalVisible(false)}
        actions={[
          {
            label: t("common.actions.gotIt"),
            iconName: "checkmark-circle-outline",
            onPress: () => setLikeErrorModalVisible(false),
          },
        ]}
        testID="apartments-like-error-modal"
      />

      <Modal
        visible={showNotesPanel}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotesPanel(false)}
      >
        <View style={styles.notesBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowNotesPanel(false)}
            testID="apartments-notes-backdrop"
          />

          <View style={styles.notesPanel}>
            <View style={styles.notesHeaderRow}>
              <Text style={styles.notesPanelTitle}>Σημειώσεις Διαμερισμάτων</Text>
              <Pressable
                style={styles.notesCloseBtn}
                onPress={() => setShowNotesPanel(false)}
                testID="apartments-notes-close"
              >
                <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {loadingNotes ? (
              <View style={styles.notesStateWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : notesList.length === 0 ? (
              <View style={styles.notesStateWrap}>
                <Text style={styles.notesStateText}>Δεν υπάρχουν αποθηκευμένες σημειώσεις ακόμα.</Text>
              </View>
            ) : (
              <DraggableFlatList
                data={notesList}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.notesListContent}
                showsVerticalScrollIndicator={false}
                activationDistance={12}
                onDragEnd={({ data }) => {
                  setNotesList(data);
                  if (!auth.userId) return;
                  const orderedIds = data.map((item) => item.id);
                  setNotesOrderSaving(true);
                  void updateNotesOrder(auth.userId, orderedIds)
                    .catch(() => {
                      // Keep UX responsive; data already reordered locally.
                    })
                    .finally(() => {
                      setNotesOrderSaving(false);
                    });
                }}
                renderItem={({ item, getIndex, drag, isActive }) => (
                  <ScaleDecorator>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        router.push({
                          pathname: "/apartment-note",
                          params: {
                            data: JSON.stringify(item.apartmentData),
                            fromList: "true",
                          },
                        } as any)
                      }
                      onLongPress={drag}
                      delayLongPress={140}
                      style={[styles.noteRow, isActive && styles.noteRowActive]}
                      testID={`apartments-note-row-${item.id}`}
                    >
                      <View style={styles.noteIndexBadge}>
                        <Text style={styles.noteIndexText}>{(getIndex?.() ?? 0) + 1}</Text>
                      </View>

                      {item.apartmentData.image ? (
                        <Image source={{ uri: item.apartmentData.image }} style={styles.noteThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.noteThumb, styles.noteThumbPlaceholder]}>
                          <Ionicons name="home-outline" size={18} color={colors.onSurfaceTertiary} />
                        </View>
                      )}

                      <View style={styles.noteMainTextWrap}>
                        <Text style={styles.noteTitleText} numberOfLines={1}>
                          {item.apartmentData.title || t("apartments.unknownListing")}
                        </Text>
                        <View style={styles.noteRentPill}>
                          <Text style={styles.noteRentText}>{`${CURRENCY}${item.apartmentData.rent}`}</Text>
                        </View>
                      </View>

                      <Ionicons name="reorder-two-outline" size={20} color={colors.onSurfaceTertiary} />
                    </TouchableOpacity>
                  </ScaleDecorator>
                )}
              />
            )}

            {notesOrderSaving ? <Text style={styles.notesSavingText}>Αποθήκευση νέας σειράς...</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flexOne: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  titleRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  myListingsPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  myListingsPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  myListingsPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  myListingsPillTextActive: {
    color: colors.onBrand,
  },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  headerControlsRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconControlButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D9F0FF",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#A8D9FF",
  },
  iconControlButtonActive: { backgroundColor: "#C8E9FF" },
  notesBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,33,40,0.44)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  notesPanel: {
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  notesPanelTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  notesCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesListContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  noteRowActive: {
    opacity: 0.92,
    borderColor: colors.brand,
  },
  noteIndexBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noteIndexText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
  },
  noteThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  noteThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteMainTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  noteTitleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  noteRentPill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  noteRentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrandTertiary,
  },
  notesStateWrap: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
  },
  notesStateText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  notesSavingText: {
    alignSelf: "flex-end",
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.brand,
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
    includeFontPadding: false,
    textAlignVertical: "center",
    transform: [{ translateY: -1 }],
  },
  viewToggleTextActive: {
    color: colors.onBrand,
  },
  searchPanel: {
    marginTop: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchActionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  searchHistoryBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchHistoryBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  searchClearBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentSearchesPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  recentSearchesScroll: {
    maxHeight: 290,
  },
  recentSearchesContent: {
    paddingVertical: 4,
  },
  recentSearchRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recentSearchEmptyRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recentSearchText: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  recentSearchEmptyText: {
    flex: 1,
    color: colors.onSurfaceTertiary,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
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
  compactList: { gap: spacing.sm },
  compactHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  compactThumbSpacer: {
    width: 44,
    height: 1,
  },
  compactCol: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  compactAreaCol: { flex: 2.2, alignItems: "flex-start" },
  compactSqmCol: { flex: 0.85 },
  compactAvailCol: { flex: 0.75 },
  compactRentCol: { flex: 1.1, alignItems: "flex-end" },
  compactHeaderPill: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: "hidden",
  },
  compactRowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  compactThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  compactThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactNeutralPill: {
    maxWidth: "100%",
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    overflow: "hidden",
  },
  compactCellText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  availabilityBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  availabilityOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  availabilityOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  compactRentPill: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onBrand,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    overflow: "hidden",
  },
  cardWrap: { position: "relative" },
  card: {
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  carouselArrowButton: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  carouselArrowLeft: {
    left: 10,
    top: "50%",
    transform: [{ translateY: -18 }],
  },
  carouselArrowRight: {
    right: 10,
    top: "50%",
    transform: [{ translateY: -18 }],
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
  quickChatBtn: {
    right: spacing.md + 42 + spacing.sm,
    backgroundColor: colors.brand,
    borderColor: colors.brand,
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
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  fabCluster: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.brand,
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
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
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
  cardPlaceholder: {
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    transform: [{ translateY: -20 }],
  },
  cardPlaceholderText: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.base,
    color: colors.brand,
    letterSpacing: 1,
  },
});
