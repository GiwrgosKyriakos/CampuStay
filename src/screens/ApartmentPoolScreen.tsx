import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { claimApartmentFromPool, subscribeAgencyPoolApartments } from "@/src/api/agencyCollaboration";
import { getUserProfile } from "@/src/api/userProfile";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

type PoolApartment = Record<string, unknown> & {
  id: string;
  title?: string;
  area?: string;
  city?: string;
  rent?: number;
  price?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  assignmentStatus?: "unassigned_pool" | "claim_pending" | "assigned";
  pendingClaimBrokerId?: string;
  rejectedBrokerIds?: string[];
};

function money(apartment: PoolApartment): string {
  const value = typeof apartment.rent === "number" ? apartment.rent : typeof apartment.price === "number" ? apartment.price : 0;
  return `€${value}/μήνα`;
}

export default function ApartmentPoolScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [apartments, setApartments] = useState<PoolApartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.userId || !auth.isBroker) {
      setApartments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const profile = await getUserProfile(auth.userId);
      const resolvedAgencyId = profile?.agencyId?.trim() || "";
      setAgencyId(resolvedAgencyId || null);
      if (!resolvedAgencyId) {
        setApartments([]);
        return;
      }
      setApartments([]);
    } catch {
      setErrorText("Δεν ήταν δυνατή η φόρτωση του Apartment Pool.");
      setApartments([]);
    } finally {
      setLoading(false);
    }
  }, [auth.isBroker, auth.userId]);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    void load().then(() => {
      if (!agencyId || !auth.userId) return;
      unsubscribe = subscribeAgencyPoolApartments(agencyId, auth.userId, (rows) => setApartments(rows as PoolApartment[]));
    });
    return () => unsubscribe();
  }, [agencyId, auth.userId, load]);

  const claim = async (apartment: PoolApartment) => {
    if (!auth.userId || !agencyId || claimingId) return;
    const brokerId = auth.userId;
    const rejected = apartment.rejectedBrokerIds?.includes(brokerId);
    const pendingForAnother = apartment.pendingClaimBrokerId && apartment.pendingClaimBrokerId !== brokerId;
    if (rejected || pendingForAnother || apartment.pendingClaimBrokerId === brokerId) return;
    const previous = apartments;
    setClaimingId(apartment.id);
    setApartments((current) => current.map((item) => item.id === apartment.id ? { ...item, assignmentStatus: "claim_pending", pendingClaimBrokerId: brokerId } : item));
    try {
      await claimApartmentFromPool({ apartmentId: apartment.id, brokerId });
    } catch (error) {
      setApartments(previous);
      Alert.alert("Η ανάληψη απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setClaimingId(null);
    }
  };

  if (!auth.isBroker) return <View style={styles.center}><Ionicons name="lock-closed-outline" size={34} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Το Apartment Pool είναι διαθέσιμο μόνο σε συνεργάτες agency.</Text></View>;

  return <View style={styles.container} testID="apartment-pool-screen">
    <View style={styles.header}><View><Text style={styles.title}>Apartment Pool</Text><Text style={styles.subtitle}>Ακίνητα διαθέσιμα για ανάληψη από το γραφείο</Text></View><Pressable onPress={() => void load()} hitSlop={8}><Ionicons name="refresh-outline" size={23} color={colors.onSurface} /></Pressable></View>
    {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> : apartments.length === 0 ? <View style={styles.center}><Ionicons name="business-outline" size={38} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Δεν υπάρχουν διαθέσιμα ακίνητα στο pool.</Text></View> : <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>{apartments.map((apartment) => {
      const image = apartment.image || apartment.imageUrl || apartment.images?.[0] || "";
      const rejected = !!auth.userId && apartment.rejectedBrokerIds?.includes(auth.userId);
      const pendingForAnother = !!apartment.pendingClaimBrokerId && apartment.pendingClaimBrokerId !== auth.userId;
      const pendingForCurrent = apartment.pendingClaimBrokerId === auth.userId;
      return <View key={apartment.id} style={styles.card} testID={`pool-apartment-${apartment.id}`}><Pressable style={styles.cardMain} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}>{image ? <Image source={{ uri: image }} style={styles.image} /> : <View style={styles.imageFallback}><Ionicons name="home-outline" size={28} color={colors.onSurfaceTertiary} /></View>}<View style={styles.copy}><Text style={styles.cardTitle} numberOfLines={1}>{apartment.title || "Ακίνητο"}</Text><Text style={styles.meta} numberOfLines={1}>{apartment.area || ""}{apartment.city ? `, ${apartment.city}` : ""}</Text><Text style={styles.price}>{money(apartment)}</Text>{pendingForAnother ? <Text style={styles.pendingBadge}>Σε διαπραγμάτευση ανάθεσης</Text> : rejected ? <Text style={styles.rejectedBadge}>Μη διαθέσιμο προς ανάθεση</Text> : pendingForCurrent ? <Text style={styles.pendingBadge}>Το αίτημά σας αναμένει έγκριση</Text> : null}</View></Pressable><Pressable style={[styles.claimButton, (pendingForAnother || rejected || pendingForCurrent) && styles.claimButtonDisabled]} disabled={pendingForAnother || rejected || pendingForCurrent || claimingId === apartment.id} onPress={() => void claim(apartment)} testID={`pool-claim-${apartment.id}`}><Ionicons name={pendingForCurrent ? "time-outline" : rejected || pendingForAnother ? "lock-closed-outline" : "add"} size={22} color={pendingForAnother || rejected || pendingForCurrent ? colors.onSurfaceTertiary : colors.onBrand} /></Pressable></View>;
    })}</ScrollView>}
  </View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  card: { minHeight: 108, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", padding: spacing.sm, gap: spacing.sm },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  image: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  imageFallback: { width: 88, height: 88, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  copy: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  price: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
  pendingBadge: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.warning },
  rejectedBadge: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.error },
  claimButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  claimButtonDisabled: { backgroundColor: colors.surfaceTertiary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  empty: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  error: { marginHorizontal: spacing.lg, marginBottom: spacing.md, color: colors.error, fontFamily: fonts.semibold },
});