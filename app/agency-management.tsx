import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { deleteObject, ref } from "firebase/storage";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  return Number.isNaN(date.getTime()) || date.getTime() === 0 ? "" : date.toLocaleDateString("el-GR");
}

export default function AgencyManagementScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Broker));
        setPending(users.filter((user) => user.agencyStatus === "pending"));
        setActive(users.filter((user) => user.agencyStatus === "approved"));
        setLoading(false);
      },
      () => setLoading(false)
    );
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

  if (loading || !agencyId) {
    return (
      <View style={[styles.center, styles.container]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const renderBrokerRow = (broker: Broker, isPending: boolean) => (
    <View key={broker.id} style={styles.personRow}>
      {broker.photos?.[0] ? (
        <Image source={{ uri: broker.photos[0] }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Ionicons name="person" size={20} color={colors.onSurfaceTertiary} />
        </View>
      )}
      <View style={styles.personInfo}>
        <Text style={styles.personName} numberOfLines={1}>
          {broker.name || t("agency.management.unnamed")}
        </Text>
        <Text style={styles.personEmail} numberOfLines={1}>
          {broker.email || ""}
        </Text>
        <Text style={styles.personDate}>
          {isPending
            ? t("agency.management.requestLabel", { date: formatDate(broker.agencyRequestedAt) })
            : t("agency.management.memberSince", { date: formatDate(broker.agencyJoinedAt) })}
        </Text>
      </View>
      {isPending ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.approveBtn]}
            disabled={workingId === broker.id}
            onPress={() => void handleApproval(broker, true)}
            hitSlop={6}
          >
            <Ionicons name="checkmark" size={18} color={colors.onBrand} />
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.rejectBtn]}
            disabled={workingId === broker.id}
            onPress={() => void handleApproval(broker, false)}
            hitSlop={6}
          >
            <Ionicons name="close" size={18} color={colors.onError} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Curved Elevated Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Διαχείριση Γραφείου
            </Text>
            <Text style={styles.subtitleAgency} numberOfLines={1}>
              {agency?.name || "Ρυθμίσεις & Συνεργάτες"}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: spacing["3xl"] + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {message ? (
          <View style={styles.messageBanner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        {/* Section: Agency Logo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Λογότυπο Γραφείου</Text>
          {agency?.logoUrl ? (
            <Image source={{ uri: agency.logoUrl }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="image-outline" size={32} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyText}>Δεν έχει οριστεί λογότυπο.</Text>
            </View>
          )}
          <View style={styles.logoActions}>
            <Pressable
              style={[styles.button, styles.primaryButton, { flex: 1 }]}
              disabled={logoSaving}
              onPress={() => void manageLogo()}
            >
              {logoSaving ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.onBrand} />
                  <Text style={styles.primaryButtonText}>
                    {agency?.logoUrl ? "Αντικατάσταση" : "Προσθήκη Λογοτύπου"}
                  </Text>
                </>
              )}
            </Pressable>
            {agency?.logoUrl ? (
              <Pressable
                style={[styles.button, styles.removeButton]}
                disabled={logoSaving}
                onPress={() => void removeLogo()}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={styles.removeButtonText}>Αφαίρεση</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Section: Pending Broker Requests */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Αιτήματα Συνεργατών</Text>
          <View style={[styles.countBadge, pending.length > 0 && styles.countBadgeActive]}>
            <Text style={[styles.countBadgeText, pending.length > 0 && styles.countBadgeTextActive]}>
              {pending.length}
            </Text>
          </View>
        </View>

        {pending.length ? (
          pending.map((broker) => renderBrokerRow(broker, true))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle-outline" size={24} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Δεν υπάρχουν εκκρεμή αιτήματα συνεργασίας.</Text>
          </View>
        )}

        {/* Section: Active Brokers */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Ενεργοί Συνεργάτες</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{active.length}</Text>
          </View>
        </View>

        {active.length ? (
          active.map((broker) => renderBrokerRow(broker, false))
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={24} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Δεν υπάρχουν εγγεγραμμένοι συνεργάτες.</Text>
          </View>
        )}

        {/* Section: Passcode Management */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Κωδικός Γραφείου</Text>
          <Text style={styles.cardSubtitle}>
            Ο κωδικός αυτός χρησιμοποιείται από νέους μεσίτες κατά την εγγραφή τους για να συνδεθούν στο γραφείο σας.
          </Text>
          <TextInput
            style={styles.input}
            value={newPasscode}
            onChangeText={setNewPasscode}
            placeholder="Νέος κωδικός γραφείου"
            placeholderTextColor={colors.onSurfaceTertiary}
            secureTextEntry
          />
          <Pressable
            style={[
              styles.button,
              styles.primaryButton,
              (!newPasscode.trim() || passcodeSaving) && styles.buttonDisabled,
            ]}
            disabled={!newPasscode.trim() || passcodeSaving}
            onPress={() => void changePasscode()}
          >
            {passcodeSaving ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryButtonText}>Αλλαγή Κωδικού</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
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
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    subtitleAgency: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
    messageBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.brandTertiary,
      borderRadius: radius.md,
    },
    messageText: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.brand,
    },
    card: {
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      gap: spacing.sm,
    },
    cardTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    cardSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      lineHeight: 18,
    },
    logoPreview: {
      width: "100%",
      height: 120,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginVertical: spacing.xs,
    },
    logoPlaceholder: {
      height: 120,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      marginVertical: spacing.xs,
    },
    logoActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
      marginBottom: 2,
    },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    countBadge: {
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countBadgeActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    countBadgeText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    countBadgeTextActive: {
      color: colors.brand,
    },
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      gap: spacing.md,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
    },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    personInfo: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    personName: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    personEmail: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    personDate: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
      marginTop: 2,
    },
    actions: {
      flexDirection: "row",
      gap: spacing.xs,
    },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    approveBtn: {
      backgroundColor: colors.brand,
    },
    rejectBtn: {
      backgroundColor: colors.error,
    },
    emptyCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      padding: spacing.lg,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      color: colors.onSurface,
      paddingHorizontal: spacing.lg,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      marginTop: spacing.xs,
    },
    button: {
      minHeight: 46,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
    },
    primaryButton: {
      backgroundColor: colors.brand,
    },
    primaryButtonText: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
    },
    removeButton: {
      borderWidth: 1,
      borderColor: colors.error,
      backgroundColor: "transparent",
    },
    removeButtonText: {
      color: colors.error,
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });
}