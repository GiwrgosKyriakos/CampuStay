import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { arrayUnion, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { db, firebaseAuth } from "@/src/config/firebase";
import { notifyCeoOfNewApplicant } from "@/src/api/agency";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

type AgencyRole = "ceo" | "member" | "secretary";
type Agency = { id: string; name: string; nameLower: string; passcode: string; ceoId: string };

export default function AgencyOnboardingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ role?: string; email?: string; password?: string }>();
  const role: AgencyRole = params.role === "member" ? "member" : "ceo";
  const email = String(params.email ?? "");
  const password = String(params.password ?? "");
  const [agencyName, setAgencyName] = useState("");
  const [agencyCode, setAgencyCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [noMatch, setNoMatch] = useState(false);

  useEffect(() => {
    if (role !== "member") return;
    setLoadingAgencies(true);
    getDocs(query(collection(db, "agencies")))
      .then((snapshot) => setAgencies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Agency))))
      .catch(() => setError(t("agency.onboarding.loadFailed")))
      .finally(() => setLoadingAgencies(false));
  }, [role]);

  useEffect(() => {
    if (role !== "member") return;
    const timer = setTimeout(() => {
      const value = agencyName.trim().toLowerCase();
      setNoMatch(value.length > 2 && !agencies.some((agency) => agency.nameLower === value));
    }, 3000);
    return () => clearTimeout(timer);
  }, [agencyName, agencies, role]);

  const selectedAgency = agencies.find((agency) => agency.nameLower === agencyName.trim().toLowerCase());
  const secretariatSuffix = "$csb$sec";
  const isSecretariatInvite = agencyCode.trim().toLowerCase().includes(secretariatSuffix);
  const secretariatMarkerIndex = agencyCode.toLowerCase().indexOf(secretariatSuffix);
  const secretariatCode = secretariatMarkerIndex >= 0 ? agencyCode.slice(0, secretariatMarkerIndex).trim() : agencyCode.trim();
  const joinedAgency = selectedAgency ?? agencies.find((agency) => agency.passcode === secretariatCode);

  const submit = async () => {
    setError("");
    if (!email || !password || (!isSecretariatInvite && !displayName.trim()) || !agencyName.trim() || !agencyCode.trim()) {
      setError(t("agency.onboarding.requiredFields"));
      return;
    }
    if (role === "member" && !isSecretariatInvite && (!selectedAgency || selectedAgency.passcode !== agencyCode.trim())) {
      setError(t("agency.onboarding.invalidPasscode"));
      return;
    }

    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await updateProfile(credential.user, { displayName: displayName.trim() });
      if (role === "ceo" && !isSecretariatInvite) {
        const agencyRef = doc(collection(db, "agencies"));
        await setDoc(agencyRef, {
          id: agencyRef.id, name: agencyName.trim(), nameLower: agencyName.trim().toLowerCase(), passcode: agencyCode.trim(),
          ceoId: credential.user.uid, ceoEmail: email.trim(), activeBrokerIds: [credential.user.uid], pendingBrokerIds: [],
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, "users", credential.user.uid), {
          name: displayName.trim(), email: email.trim(), is_broker: true, agencyId: agencyRef.id, agencyRole: "ceo", agencyStatus: "approved", agencyJoinedAt: serverTimestamp(), needsProfileSetup: true, updatedAt: serverTimestamp(),
        }, { merge: true });
      } else if (isSecretariatInvite) {
        if (!joinedAgency || joinedAgency.passcode !== secretariatCode) {
          throw new Error("invalid-secretariat-code");
        }
        const secretariatName = `Γραμματεία ${joinedAgency.name}`;
        await updateProfile(credential.user, { displayName: secretariatName });
        await setDoc(doc(db, "users", credential.user.uid), {
          name: secretariatName,
          email: email.trim(),
          is_broker: true,
          agencyId: joinedAgency.id,
          agencyRole: "secretary",
          agencyStatus: "pending",
          agencyRequestedAt: serverTimestamp(),
          needsProfileSetup: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await updateDoc(doc(db, "agencies", joinedAgency.id), {
          pendingSecretaryIds: arrayUnion(credential.user.uid),
          updatedAt: serverTimestamp(),
        });
        await notifyCeoOfNewApplicant(joinedAgency.id, secretariatName, email.trim());
      } else {
        await setDoc(doc(db, "users", credential.user.uid), {
          name: displayName.trim(), email: email.trim(), is_broker: true, agencyId: selectedAgency!.id, agencyRole: "member", agencyStatus: "pending", agencyRequestedAt: serverTimestamp(), needsProfileSetup: true, updatedAt: serverTimestamp(),
        }, { merge: true });
        await updateDoc(doc(db, "agencies", selectedAgency!.id), { pendingBrokerIds: arrayUnion(credential.user.uid), updatedAt: serverTimestamp() });
        await notifyCeoOfNewApplicant(selectedAgency!.id, displayName.trim(), email.trim());
      }
      auth.updateRoleStates(true, true);
      router.replace("/edit-profile");
    } catch (submissionError: unknown) {
      const code = submissionError instanceof Error && "code" in submissionError ? submissionError.code : undefined;
      setError(code === "auth/email-already-in-use" ? t("agency.onboarding.emailInUse") : t("agency.onboarding.registrationFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={28} color={colors.onSurface} /></Pressable><Text style={styles.title}>{role === "ceo" ? t("agency.onboarding.registerAgencyTitle") : t("agency.onboarding.registerBrokerTitle")}</Text><View style={{ width: 28 }} /></View>
      <FlatList data={[]} renderItem={null} contentContainerStyle={styles.content} ListHeaderComponent={<>
        <Text style={styles.subtitle}>{t("agency.onboarding.subtitle")}</Text>
        <View style={styles.badges}><Text style={styles.badge}>{email}</Text><Text style={styles.badge}>{t("agency.onboarding.passwordProtected")}</Text></View>
        <Text style={styles.label}>{role === "ceo" ? t("agency.onboarding.agencyNameLabel") : t("agency.onboarding.agencyLabel")}</Text>
        <View style={styles.inputWrapper}><Ionicons name="business-outline" size={20} color={colors.onSurfaceTertiary} /><TextInput style={styles.input} value={agencyName} onChangeText={(value) => { setAgencyName(value); setError(""); }} placeholder={t("agency.onboarding.agencyNamePlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} /><Pressable onPress={() => setModalVisible(true)}><Ionicons name="chevron-down" size={22} color={colors.onSurfaceTertiary} /></Pressable></View>
        {noMatch ? <Text style={styles.noMatch}>{t("agency.onboarding.agencyNotFound")}</Text> : null}
        <Text style={styles.label}>{t("agency.onboarding.agencyCodeLabel")}</Text>
        <View style={styles.inputWrapper}><Ionicons name="key-outline" size={20} color={colors.onSurfaceTertiary} /><TextInput style={styles.input} value={agencyCode} onChangeText={setAgencyCode} secureTextEntry={role === "member"} placeholder={t("agency.onboarding.agencyCodePlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} /></View>
        <Text style={styles.label}>{t("agency.onboarding.displayNameLabel")}</Text><View style={styles.inputWrapper}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /><TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder={t("agency.onboarding.displayNamePlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} /></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.info}><Ionicons name="information-circle-outline" size={22} color={colors.brand} /><Text style={styles.infoText}>{t("agency.onboarding.googleAuthNotice")}</Text></View>
        <Pressable style={styles.submit} onPress={() => void submit()} disabled={submitting}>{submitting ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.submitText}>{t("agency.onboarding.completeButton")}</Text>}</Pressable>
      </>} />
      <BaseBottomSheet visible={modalVisible} onClose={() => setModalVisible(false)} maxHeight="78%"><View style={styles.modal}><Text style={styles.modalTitle}>{t("agency.onboarding.selectAgency")}</Text>{loadingAgencies ? <ActivityIndicator color={colors.brand} /> : agencies.map((agency) => <Pressable key={agency.id} style={styles.agencyOption} onPress={() => { setAgencyName(agency.name); setModalVisible(false); }}><Text style={styles.agencyOptionText}>{agency.name}</Text></Pressable>)}<Pressable onPress={() => setModalVisible(false)}><Text style={styles.closeText}>{t("common.actions.cancel")}</Text></Pressable></View></BaseBottomSheet>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg }, title: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface }, content: { padding: spacing.lg, gap: spacing.md }, subtitle: { fontFamily: fonts.regular, color: colors.onSurfaceTertiary, textAlign: "center", marginBottom: spacing.md }, badges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }, badge: { color: colors.onSurfaceTertiary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm }, label: { fontFamily: fonts.semibold, color: colors.onSurface, marginTop: spacing.sm }, inputWrapper: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md }, input: { flex: 1, color: colors.onSurface, fontFamily: fonts.regular, fontSize: fontSize.base, paddingVertical: spacing.md }, noMatch: { color: colors.error, fontFamily: fonts.regular, fontSize: fontSize.sm }, error: { color: colors.error, fontFamily: fonts.semibold, textAlign: "center" }, info: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginTop: spacing.md }, infoText: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 18 }, submit: { minHeight: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.md, marginTop: spacing.md }, submitText: { color: colors.onBrand, fontFamily: fonts.bold, fontSize: fontSize.base }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }, modal: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md }, modalTitle: { color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.lg }, agencyOption: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, agencyOptionText: { color: colors.onSurface, fontFamily: fonts.regular }, closeText: { color: colors.brand, fontFamily: fonts.semibold, textAlign: "center", paddingVertical: spacing.md },
});