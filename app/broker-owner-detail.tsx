import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import type { BrokerApartment } from "./(tabs)/broker-hub";

export default function BrokerOwnerDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ownerName?: string; ownerMotivation?: string; apartmentIds?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [apartments, setApartments] = useState<BrokerApartment[]>([]);
  const [loading, setLoading] = useState(true);
  const apartmentIds = useMemo(() => { try { return JSON.parse(params.apartmentIds ?? "[]") as string[]; } catch { return []; } }, [params.apartmentIds]);

  useEffect(() => {
    let active = true;
    void Promise.all(apartmentIds.map(async (id) => {
      const snapshot = await getDoc(doc(db, "apartments", id));
      if (!snapshot.exists()) return null;
      const data = snapshot.data() as Record<string, unknown>;
      return { ...data, id, title: String(data.title ?? "Ακίνητο"), rent: Number(data.rent ?? data.price ?? 0), area: String(data.area ?? ""), city: String(data.city ?? ""), size: Number(data.size ?? 0), image: String(data.image ?? data.imageUrl ?? (Array.isArray(data.images) ? data.images[0] ?? "" : "")), tags: Array.isArray(data.tags) ? data.tags.map(String) : [] } as BrokerApartment;
    })).then((items) => { if (active) setApartments(items.filter((item): item is BrokerApartment => item !== null)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apartmentIds]);

  return <View style={[styles.container, { paddingTop: insets.top }]} testID="broker-owner-detail-screen">
    <View style={styles.header}><Pressable style={styles.iconButton} onPress={() => router.back()} testID="broker-owner-back-btn"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><Text style={styles.headerTitle}>Στοιχεία Ιδιοκτήτη</Text><View style={styles.iconSpacer} /></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}><Text style={styles.ownerName}>{params.ownerName || "Ιδιοκτήτης"}</Text><View style={styles.motivationCard}><Text style={styles.label}>Κίνητρο πώλησης / ενοικίασης</Text><Text style={styles.body}>{params.ownerMotivation || "Δεν έχει δηλωθεί κίνητρο."}</Text></View></View>
      <Text style={styles.sectionTitle}>Ακίνητα Ιδιοκτήτη</Text>
      {loading ? <ActivityIndicator color={colors.brand} /> : apartments.map((apartment) => <Pressable key={apartment.id} style={styles.apartmentCard} testID={`broker-owner-apartment-${apartment.id}`} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}>{apartment.image ? <Image source={{ uri: apartment.image }} style={styles.apartmentImage} contentFit="cover" /> : <View style={[styles.apartmentImage, styles.imagePlaceholder]}><Ionicons name="home-outline" size={28} color={colors.brand} /></View>}<View style={styles.apartmentInfo}><Text style={styles.cardTitle} numberOfLines={1}>{apartment.title}</Text><Text style={styles.body}>{apartment.city}{apartment.area ? ` · ${apartment.area}` : ""}</Text><Text style={styles.price}>{apartment.rent} € · {apartment.size} m²</Text></View></Pressable>)}
      {!loading && apartments.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν ακίνητα.</Text> : null}
    </ScrollView>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({ container: { flex: 1, backgroundColor: colors.surface }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, iconSpacer: { width: 40 }, headerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface }, content: { padding: spacing.lg, paddingBottom: spacing["3xl"] }, profileCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, ownerName: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface }, motivationCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }, label: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }, body: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs }, sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface }, apartmentCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, apartmentImage: { width: 88, height: 76, borderRadius: radius.lg }, imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }, apartmentInfo: { flex: 1 }, cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface }, price: { marginTop: spacing.xs, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand }, emptyHint: { textAlign: "center", padding: spacing.xl, color: colors.onSurfaceTertiary } });
