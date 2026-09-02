import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { deleteObject, ref } from "firebase/storage";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";

import { approveAgencyBroker, rejectAgencyBroker, updateAgencyPasscode } from "@/src/api/agency";
import { uploadImageAsync } from "@/src/api/imageUpload";
import { getUserProfile, type UserProfile } from "@/src/api/userProfile";
import { db, storage } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

type Agency = { name?: string; ceoEmail?: string; passcode?: string; logoUrl?: string | null };
type Broker = UserProfile & { id: string; email?: string | null; agencyJoinedAt?: unknown; agencyRequestedAt?: unknown };

function formatDate(value: unknown): string {
  if (!value) return "";
  const timestamp = value as { toDate?: () => Date };
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(typeof value === "number" ? value : 0);
  return Number.isNaN(date.getTime()) || date.getTime() === 0 ? "" : date.toLocaleDateString();
}

export default function AgencyManagementScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const router = useRouter();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [pending, setPending] = useState<Broker[]>([]);
  const [active, setActive] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [newPasscode, setNewPasscode] = useState("");
  const [passcodeSaving, setPasscodeSaving] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (auth.isLoading || !auth.userId) return;
    let mounted = true;
    void getUserProfile(auth.userId).then((profile) => {
      const authorized = (profile?.agencyRole === "ceo" || profile?.agencyRole === "secretary") && !!profile.agencyId;
      if (!mounted) return;
      if (!authorized) {
        router.replace("/profile");
        return;
      }
      setAgencyId(profile.agencyId!);
    }).catch(() => router.replace("/profile"));
    return () => { mounted = false; };
  }, [auth.isLoading, auth.userId, router]);

  useEffect(() => {
    if (!agencyId) return;
    let mounted = true;
    void getDoc(doc(db, "agencies", agencyId)).then((snapshot) => {
      if (mounted && snapshot.exists()) setAgency(snapshot.data() as Agency);
    });
    const usersQuery = query(collection(db, "users"), where("agencyId", "==", agencyId));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Broker));
      setPending(users.filter((user) => user.agencyStatus === "pending"));
      setActive(users.filter((user) => user.agencyStatus === "approved"));
      setLoading(false);
    }, () => setLoading(false));
    return () => { mounted = false; unsubscribe(); };
  }, [agencyId]);

  const handleApproval = async (broker: Broker, approved: boolean) => {
    if (!agencyId) return;
    setWorkingId(broker.id);
    setMessage("");
    try {
      if (approved) {
        await approveAgencyBroker(agencyId, broker.id);
        setMessage(t("agency.management.approveSuccess"));
      } else {
        await rejectAgencyBroker(agencyId, broker.id);
        setMessage(t("agency.management.rejected"));
      }
    } catch {
      setMessage(t("agency.management.actionFailed"));
    } finally {
      setWorkingId(null);
    }
  };

  const changePasscode = async () => {
    if (!agencyId || !agency?.ceoEmail || newPasscode.trim().length < 3) return;
    setPasscodeSaving(true);
    try {
      await updateAgencyPasscode(agencyId, newPasscode.trim(), agency.ceoEmail);
      setNewPasscode("");
      Alert.alert(t("agency.management.success"), t("agency.management.passcodeUpdated"));
    } catch {
      setMessage(t("agency.management.changeFailed"));
    } finally {
      setPasscodeSaving(false);
    }
  };

  const manageLogo = async () => {
    if (!agencyId || logoSaving) return;

    setLogoSaving(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets[0];
      const uri = asset?.uri || "";
      if (!uri) return;
      const mimeType = asset?.mimeType?.toLowerCase();
      const uriIsSupported = /\.(png|jpe?g)$/i.test(uri.split("?")[0]);
      if ((mimeType && mimeType !== "image/png" && mimeType !== "image/jpeg") || (!mimeType && !uriIsSupported)) {
        setMessage(t("agency.management.invalidLogo"));
        return;
      }

      const logoUrl = await uploadImageAsync(uri, `agencies/${agencyId}/logo.png`);
      await updateDoc(doc(db, "agencies", agencyId), { logoUrl });
      setAgency((previous) => (previous ? { ...previous, logoUrl } : previous));
    } catch {
      setMessage(t("agency.management.uploadFailed"));
    } finally {
      setLogoSaving(false);
    }
  };

  const removeLogo = async () => {
    if (!agencyId || logoSaving) return;

    setLogoSaving(true);
    try {
      await deleteObject(ref(storage, `agencies/${agencyId}/logo.png`)).catch(() => undefined);
      await updateDoc(doc(db, "agencies", agencyId), { logoUrl: null });
      setAgency((previous) => (previous ? { ...previous, logoUrl: null } : previous));
    } catch {
      setMessage(t("agency.management.removeFailed"));
    } finally {
      setLogoSaving(false);
    }
  };

  if (loading || !agencyId) return <View style={[styles.center, styles.container]}><ActivityIndicator size="large" color={colors.brand} /></View>;

  const brokerRow = (broker: Broker, isPending: boolean) => (
    <View key={broker.id} style={styles.personRow}>
      {broker.photos?.[0] ? <Image source={{ uri: broker.photos[0] }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Ionicons name="person" size={20} color={colors.onSurfaceTertiary} /></View>}
      <View style={styles.personInfo}><Text style={styles.personName}>{broker.name || t("agency.management.unnamed")}</Text><Text style={styles.personEmail}>{broker.email || ""}</Text><Text style={styles.personDate}>{isPending ? t("agency.management.requestLabel", { date: formatDate(broker.agencyRequestedAt) }) : t("agency.management.memberSince", { date: formatDate(broker.agencyJoinedAt) })}</Text></View>
      {isPending ? <View style={styles.actions}><Pressable style={styles.approve} disabled={workingId === broker.id} onPress={() => void handleApproval(broker, true)}><Ionicons name="checkmark" size={20} color={colors.onBrand} /></Pressable><Pressable style={styles.reject} disabled={workingId === broker.id} onPress={() => void handleApproval(broker, false)}><Ionicons name="close" size={20} color={colors.onError} /></Pressable></View> : null}
    </View>
  );

  return <View style={styles.container}><ScrollView contentContainerStyle={styles.content}><View style={styles.header}><Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable><Text style={styles.title}>Διαχείριση γραφείου</Text><View style={{ width: 28 }} /></View><Text style={styles.agencyName}>{agency?.name || "Μεσιτικό γραφείο"}</Text>{message ? <Text style={styles.message}>{message}</Text> : null}<View style={styles.logoCard}><Text style={styles.sectionTitle}>Λογότυπο γραφείου</Text>{agency?.logoUrl ? <Image source={{ uri: agency.logoUrl }} style={styles.logoPreview} resizeMode="contain" /> : <View style={styles.logoPlaceholder}><Ionicons name="image-outline" size={28} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Δεν έχει οριστεί λογότυπο.</Text></View>}<View style={styles.logoActions}><Pressable style={styles.primaryButton} disabled={logoSaving} onPress={() => void manageLogo()}>{logoSaving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>{agency?.logoUrl ? "Αντικατάσταση" : "Προσθήκη λογότυπου"}</Text>}</Pressable>{agency?.logoUrl ? <Pressable style={styles.removeButton} disabled={logoSaving} onPress={() => void removeLogo()}><Ionicons name="trash-outline" size={18} color={colors.error} /><Text style={styles.removeButtonText}>Αφαίρεση</Text></Pressable> : null}</View></View><Text style={styles.sectionTitle}>Αιτήματα συνεργατών ({pending.length})</Text>{pending.length ? pending.map((broker) => brokerRow(broker, true)) : <Text style={styles.empty}>Δεν υπάρχουν εκκρεμή αιτήματα.</Text>}<Text style={styles.sectionTitle}>Ενεργοί συνεργάτες ({active.length})</Text>{active.map((broker) => brokerRow(broker, false))}<View style={styles.passcodeCard}><Text style={styles.sectionTitle}>Κωδικός γραφείου</Text><TextInput style={styles.input} value={newPasscode} onChangeText={setNewPasscode} placeholder="Νέος κωδικός" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry /><Pressable style={styles.primaryButton} disabled={passcodeSaving} onPress={() => void changePasscode()}>{passcodeSaving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Αλλαγή Κωδικού Γραφείου</Text>}</Pressable></View></ScrollView></View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  logoCard: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }, logoPreview: { width: "100%", height: 120, borderRadius: radius.md, backgroundColor: colors.surface }, logoPlaceholder: { height: 120, alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md }, logoActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md }, removeButton: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, flexDirection: "row", alignItems: "center", gap: spacing.xs }, removeButtonText: { color: colors.error, fontFamily: fonts.bold },
  container: { flex: 1, backgroundColor: colors.surface }, center: { alignItems: "center", justifyContent: "center" }, content: { padding: spacing.lg, paddingBottom: spacing["3xl"] }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }, title: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.xl }, agencyName: { color: colors.brand, fontFamily: fonts.display, fontSize: fontSize["2xl"], marginBottom: spacing.lg }, message: { color: colors.success, fontFamily: fonts.semibold, marginBottom: spacing.md }, sectionTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.lg, marginTop: spacing.lg, marginBottom: spacing.md }, personRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary }, avatar: { width: 48, height: 48, borderRadius: radius.pill }, avatarFallback: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }, personInfo: { flex: 1, marginLeft: spacing.md }, personName: { color: colors.onSurface, fontFamily: fonts.semibold }, personEmail: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm, marginTop: 2 }, personDate: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.xs, marginTop: 4 }, actions: { flexDirection: "row", gap: spacing.sm }, approve: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }, reject: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" }, empty: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular }, passcodeCard: { marginTop: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.onSurface, paddingHorizontal: spacing.md, fontFamily: fonts.regular }, primaryButton: { minHeight: 52, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }, primaryText: { color: colors.onBrand, fontFamily: fonts.bold },
});