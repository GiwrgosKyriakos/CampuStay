import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";

import { claimApartmentFromPool, subscribeAgencyPoolApartments } from "@/src/api/agencyCollaboration";
import { FadeInView } from "@/src/components/ui/FadeInView";
import { SkeletonBox } from "@/src/components/ui/SkeletonBox";
import { getUserProfile } from "@/src/api/userProfile";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { db } from "@/src/config/firebase";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { isBrokerOrSecretariat } from "@/src/utils/roles";

const TAB_BAR_BOTTOM_SPACE = 90;
const CURRENCY = "€";

type PoolApartment = Record<string, unknown> & {
  id: string;
  title?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  size?: number;
  rooms?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  assignmentStatus?: "unassigned_pool" | "claim_pending" | "assigned";
  pendingClaimBrokerId?: string;
  rejectedBrokerIds?: string[];
};

export default function ApartmentPoolScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [apartments, setApartments] = useState<PoolApartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canAccessPool = isBrokerOrSecretariat(auth);
  const isExecutive = ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  const loadAgencyData = useCallback(async () => {
    if (!auth.userId || !canAccessPool) {
      setApartments([]);
      setLoading(false);
      return;
    }

    setErrorMessage(null);
    try {
      const profile = await getUserProfile(auth.userId);
      const resolvedAgencyId = profile?.agencyId?.trim() || "";
      setAgencyId(resolvedAgencyId || null);

      if (!resolvedAgencyId) {
        setAgencyName(null);
        setApartments([]);
        return;
      }

      const agencySnapshot = await getDoc(doc(db, "agencies", resolvedAgencyId));
      const agencyData = agencySnapshot.data();

      const resolvedAgencyName =
        typeof auth.user?.agencyName === "string" && auth.user.agencyName.trim().length > 0
          ? auth.user.agencyName.trim()
          : typeof agencyData?.name === "string" && agencyData.name.trim().length > 0
          ? agencyData.name.trim()
          : typeof agencyData?.agencyName === "string" && agencyData.agencyName.trim().length > 0
          ? agencyData.agencyName.trim()
          : null;

      setAgencyName(resolvedAgencyName);
    } catch {
      setErrorMessage("Δεν ήταν δυνατή η ανάκτηση των στοιχείων του γραφείου.");
      setApartments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.user?.agencyName, auth.userId, canAccessPool]);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;

    void loadAgencyData().then(() => {
      if (!agencyId || !auth.userId) return;
      unsubscribe = subscribeAgencyPoolApartments(agencyId, auth.userId, (rows) => {
        setApartments(rows as PoolApartment[]);
      });
    });

    return () => unsubscribe();
  }, [agencyId, auth.userId, loadAgencyData]);

  const titleParts = useMemo(() => {
    const baseName = agencyName?.trim() || "Apartment Pool";
    const words = baseName.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return { leftWords: "Apartment", rightWords: "Pool" };
    }
    const leftCount = Math.floor(words.length / 2);
    return {
      leftWords: words.slice(0, leftCount).join(" "),
      rightWords: words.slice(leftCount).join(" "),
    };
  }, [agencyName]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadAgencyData();
  }, [loadAgencyData]);

  const handleClaim = async (apartment: PoolApartment) => {
    if (!auth.userId || !agencyId || claimingId) return;

    const brokerId = auth.userId;
    const isRejected = apartment.rejectedBrokerIds?.includes(brokerId);
    const isPendingForOther = !!apartment.pendingClaimBrokerId && apartment.pendingClaimBrokerId !== brokerId;
    const isPendingForMe = apartment.pendingClaimBrokerId === brokerId;

    if (isRejected || isPendingForOther || isPendingForMe) return;

    const previousApartments = [...apartments];
    setClaimingId(apartment.id);

    setApartments((current) =>
      current.map((item) =>
        item.id === apartment.id
          ? { ...item, assignmentStatus: "claim_pending", pendingClaimBrokerId: brokerId }
          : item
      )
    );

    try {
      await claimApartmentFromPool({ apartmentId: apartment.id, brokerId });
    } catch (err) {
      setApartments(previousApartments);
      Alert.alert(
        "Ανεπιτυχής Ανάληψη",
        err instanceof Error ? err.message : "Παρουσιάστηκε σφάλμα κατά την ανάληψη του ακινήτου."
      );
    } finally {
      setClaimingId(null);
    }
  };

  const handleOpenDetail = (apartment: PoolApartment) => {
    router.push({
      pathname: "/apartment-detail",
      params: { data: JSON.stringify(apartment) },
    } as never);
  };

  if (!canAccessPool) {
    return (
      <View style={styles.stateCenter}>
        <View style={styles.iconCircleMuted}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Περιορισμένη Πρόσβαση</Text>
        <Text style={styles.emptySubtitle}>
          Το Apartment Pool είναι διαθέσιμο αποκλειστικά σε πιστοποιημένους μεσίτες με ενεργή ομάδα.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="apartment-pool-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleWrap}>
            {titleParts.leftWords && titleParts.rightWords ? (
              <Text style={styles.title} numberOfLines={2}>
                <Text style={[styles.titlePart, { color: colors.onSurface }]}>{titleParts.leftWords}</Text>
                <Text style={[styles.titlePart, { color: colors.brand }]}>{` ${titleParts.rightWords}`}</Text>
              </Text>
            ) : (
              <Text style={[styles.title, { color: colors.brand }]} numberOfLines={2}>
                {titleParts.rightWords}
              </Text>
            )}
            <Text style={styles.subtitle}>Κοινό αποθετήριο αδιάθετων ακινήτων γραφείου</Text>
          </View>

          {isExecutive ? (
            <Pressable
              style={styles.headerIconButton}
              onPress={() => router.push("/profile" as never)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ρυθμίσεις γραφείου"
            >
              <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
            </Pressable>
          ) : (
            <View style={styles.headerRightSpacer} />
          )}
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <ApartmentPoolSkeleton styles={styles} insetsBottom={insets.bottom} />
      ) : apartments.length === 0 ? (
        <FadeInView style={{ flex: 1 }}>
          <View style={styles.stateCenter}>
            <View style={styles.iconCircleMuted}>
              <Ionicons name="business-outline" size={34} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>Όλα τα ακίνητα έχουν ανατεθεί</Text>
            <Text style={styles.emptySubtitle}>
              Δεν υπάρχουν διαθέσιμα ακίνητα στο pool αυτή τη στιγμή. Μόλις αναρτηθεί νέα αγγελία χωρίς αποκλειστικότητα, θα εμφανιστεί εδώ.
            </Text>
          </View>
        </FadeInView>
      ) : (
        <FadeInView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
          >
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              ΔΙΑΘΕΣΙΜΑ ΠΡΟΣ ΑΝΑΛΗΨΗ ({apartments.length})
            </Text>
          </View>

          {apartments.map((item) => {
            const thumbnail = item.image || item.imageUrl || item.images?.[0] || "";
            const isPendingForMe = item.pendingClaimBrokerId === auth.userId;
            const isPendingForOther = !!item.pendingClaimBrokerId && item.pendingClaimBrokerId !== auth.userId;
            const isRejected = !!auth.userId && item.rejectedBrokerIds?.includes(auth.userId);
            const isClaimingThis = claimingId === item.id;
            const isActionDisabled = isPendingForMe || isPendingForOther || isRejected || isClaimingThis;

            const rentValue = typeof item.rent === "number" ? item.rent : typeof item.price === "number" ? item.price : 0;

            return (
              <View key={item.id} style={styles.poolCard} testID={`pool-card-${item.id}`}>
                <Pressable
                  style={({ pressed }) => [styles.cardInteractiveArea, pressed && styles.cardPressed]}
                  onPress={() => handleOpenDetail(item)}
                >
                  {thumbnail ? (
                    <Image
                      source={{ uri: thumbnail }}
                      style={styles.cardThumb}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={styles.cardThumbPlaceholder}>
                      <Ionicons name="home-outline" size={24} color={colors.onSurfaceTertiary} />
                    </View>
                  )}

                  <View style={styles.cardDetailsColumn}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title?.trim() || "Ακίνητο χωρίς τίτλο"}
                    </Text>

                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={13} color={colors.onSurfaceTertiary} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {item.area || "Άγνωστη περιοχή"}{item.city ? `, ${item.city}` : ""}
                      </Text>
                    </View>

                    <View style={styles.metaBadgeRow}>
                      <View style={styles.rentBadge}>
                        <Text style={styles.rentBadgeText}>
                          {CURRENCY}{rentValue}/μήνα
                        </Text>
                      </View>

                      {typeof item.size === "number" && item.size > 0 && (
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeText}>{item.size} m²</Text>
                        </View>
                      )}
                    </View>

                    {isPendingForMe ? (
                      <View style={[styles.statusBadge, styles.statusBadgePending]}>
                        <Ionicons name="time-outline" size={12} color={colors.brand} />
                        <Text style={[styles.statusBadgeText, { color: colors.brand }]}>
                          Αναμονή έγκρισης
                        </Text>
                      </View>
                    ) : isPendingForOther ? (
                      <View style={[styles.statusBadge, styles.statusBadgeWarning]}>
                        <Ionicons name="hourglass-outline" size={12} color={colors.warning} />
                        <Text style={[styles.statusBadgeText, { color: colors.warning }]}>
                          Σε διεκδίκηση
                        </Text>
                      </View>
                    ) : isRejected ? (
                      <View style={[styles.statusBadge, styles.statusBadgeRejected]}>
                        <Ionicons name="close-circle-outline" size={12} color={colors.error} />
                        <Text style={[styles.statusBadgeText, { color: colors.error }]}>
                          Μη διαθέσιμο
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.claimActionBtn,
                    isActionDisabled && styles.claimActionBtnDisabled,
                    pressed && !isActionDisabled && styles.cardPressed,
                  ]}
                  onPress={() => void handleClaim(item)}
                  disabled={isActionDisabled}
                  hitSlop={8}
                  testID={`pool-claim-btn-${item.id}`}
                  accessibilityLabel="Ανάληψη διαχείρισης ακινήτου"
                >
                  {isClaimingThis ? (
                    <ActivityIndicator size="small" color={colors.onBrand} />
                  ) : (
                    <Ionicons
                      name={
                        isPendingForMe
                          ? "checkmark"
                          : isPendingForOther || isRejected
                          ? "lock-closed"
                          : "add"
                      }
                      size={20}
                      color={isActionDisabled ? colors.onSurfaceTertiary : colors.onBrand}
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
          </ScrollView>
        </FadeInView>
      )}
    </View>
  );
}

function ApartmentPoolSkeleton({
  styles,
  insetsBottom,
}: {
  styles: ReturnType<typeof createStyles>;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insetsBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.counterRow}>
        <SkeletonBox width="60%" height={12} borderRadius={radius.sm} />
      </View>
      {Array.from({ length: 4 }, (_item, index) => (
        <View key={`apartment-skeleton-${index}`} style={styles.poolCard}>
          <SkeletonBox width={82} height={82} borderRadius={radius.md} />
          <View style={[styles.cardDetailsColumn, styles.skeletonCardDetailsColumn]}>
            <SkeletonBox width="75%" height={16} borderRadius={radius.sm} />
            <SkeletonBox width="50%" height={12} borderRadius={radius.sm} style={{ marginTop: 6 }} />
            <View style={styles.metaBadgeRow}>
              <SkeletonBox width={65} height={20} borderRadius={radius.pill} />
              <SkeletonBox width={65} height={20} borderRadius={radius.pill} />
            </View>
          </View>
          <SkeletonBox width={40} height={40} borderRadius={radius.pill} />
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
      zIndex: 2,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      letterSpacing: -0.5,
    },
    titlePart: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
    },
    subtitle: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    headerIconButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRightSpacer: {
      width: 40,
    },
    errorBanner: {
      margin: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
      borderRadius: radius.md,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    errorBannerText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.error,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    counterRow: {
      paddingVertical: spacing.xs,
      paddingHorizontal: 2,
    },
    counterText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      letterSpacing: 0.8,
    },
    poolCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    cardInteractiveArea: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    cardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    cardThumb: {
      width: 82,
      height: 82,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTertiary,
    },
    cardThumbPlaceholder: {
      width: 82,
      height: 82,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    cardDetailsColumn: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    skeletonCardDetailsColumn: {
      gap: 6,
    },
    cardTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    locationText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    metaBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: 2,
    },
    rentBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
    },
    rentBadgeText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    specBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    specBadgeText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    statusBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 1,
      borderRadius: radius.sm,
      marginTop: 2,
    },
    statusBadgePending: {
      backgroundColor: colors.brandTertiary,
    },
    statusBadgeWarning: {
      backgroundColor: "rgba(234, 179, 8, 0.12)",
    },
    statusBadgeRejected: {
      backgroundColor: "rgba(239, 68, 68, 0.12)",
    },
    statusBadgeText: {
      fontFamily: fonts.semibold,
      fontSize: 10,
    },
    claimActionBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    claimActionBtnDisabled: {
      backgroundColor: colors.surfaceTertiary,
      elevation: 0,
      shadowOpacity: 0,
    },
    stateCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing["2xl"],
      gap: spacing.sm,
    },
    iconCircleMuted: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    emptyTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
      lineHeight: 19,
    },
    loadingText: {
      marginTop: spacing.xs,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
  });
}