import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { getUserId } from "@/src/utils/userId";
import { getUserProfile, saveUserProfile, UserProfile } from "@/src/api/userProfile";
import { db } from "@/src/config/firebase";
import { TOTAL_QUESTIONS } from "@/src/data/quiz";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { uploadProfileImageAsync } from "@/src/api/imageUpload";
import { t } from "@/src/locales";
import { useLocale } from "@/src/context/locale";
import { useTheme } from "@/src/context/ThemeContext";

const CURRENCY = "€";
const TAB_BAR_SPACE = 84;
function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return 0;

  const ts = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof ts.toMillis === "function") {
    const millis = ts.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  if (typeof ts.seconds === "number") {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
  }
  return 0;
}

const NAV_SETTINGS: { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; testID?: string }[] = [
  { icon: "sparkles", label: "common.labels.compatibilityQuiz", route: "/roomie-profile", testID: "setting-compatibility-quiz" },
  { icon: "create-outline", label: "common.labels.editProfile", route: "/edit-profile" },
  { icon: "notifications-outline", label: "common.labels.notifications", route: "/notifications" },
  { icon: "shield-checkmark-outline", label: "common.labels.privacySafety", route: "/privacy-safety" },
  { icon: "help-circle-outline", label: "common.labels.helpSupport", route: "/help-support" },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { locale, setLocale } = useLocale();
  const { colors, themeMode, setThemeMode, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [quizAnsweredCount, setQuizAnsweredCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false); // ΠΡΟΣΘΗΚΗ: Κλειδώνει το UI κατά το logout

  React.useEffect(() => {
    if (auth.isGuest) {
      setProfile(null);
      setMatchCount(0);
    }
  }, [auth.isGuest]);

  useFocusEffect(
    useCallback(() => {
      if (auth.isGuest) return;
      (async () => {
        try {
          const uid = await getUserId();
          const [p, chatsSnap, quizDoc] = await Promise.all([
            getUserProfile(uid).catch(() => null),
            getDocs(query(collection(db, "chats"), where("users", "array-contains", uid))).catch(() => null),
            getDoc(doc(db, "quiz_answers", uid)).catch(() => null),
          ]);
          const quizData = quizDoc?.exists() ? (quizDoc.data() as { answers?: Record<string, string> }) : null;
          const answeredCount = Object.keys(quizData?.answers || {}).length;
          const activeRoommateChatCount = chatsSnap
            ? chatsSnap.docs.filter((chatDoc) => {
                const chatData = chatDoc.data() as {
                  type?: string;
                  status?: string;
                  lastMessageTimestamp?: unknown;
                  clearedAt?: Record<string, unknown>;
                };
                if ((chatData.type ?? "roommate") === "host" || chatData.status !== "active") return false;

                const clearedAtMap =
                  chatData.clearedAt && typeof chatData.clearedAt === "object"
                    ? (chatData.clearedAt as Record<string, unknown>)
                    : {};
                const myClearedAt = Object.prototype.hasOwnProperty.call(clearedAtMap, uid)
                  ? toMillis(clearedAtMap[uid])
                  : 0;
                if (!myClearedAt) return true;

                const lastMessageAt = toMillis(chatData.lastMessageTimestamp);
                return lastMessageAt > myClearedAt;
              }).length
            : 0;
          setProfile(p);
          setMatchCount(activeRoommateChatCount);
          setQuizAnsweredCount(answeredCount);
        } catch {
          /* keep placeholders */
        }
      })();
    }, [auth.isGuest]),
  );

  const displayName = auth.isGuest ? t("profile.guestName") : profile?.name || auth.user?.name || t("profile.fallbackName");
  const photoUri = auth.isGuest ? "" : profile?.photos?.[0] || "";
  const hasPhoto = !!photoUri.trim();
  const university = auth.isGuest ? "" : profile?.university || "";
  const program = auth.isGuest ? t("profile.fallbackProgram") : profile?.year_of_study || t("profile.fallbackProgram");
  const age = auth.isGuest ? null : profile?.age ?? null;
  const budget = profile?.budget ?? null;
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  const subInfoParts = [age != null ? t("common.format.ageLabel", { age }) : "", program, university].filter(Boolean);
  const effectiveMode = themeMode === "system" ? (isDark ? "dark" : "light") : themeMode;
  const themeTitle = locale === "el" ? "Εμφάνιση" : "Theme";
  const visibleNavSettings = auth.isBroker
    ? NAV_SETTINGS.filter((setting) => setting.route !== "/roomie-profile")
    : NAV_SETTINGS;
  const canManageAgency = (profile?.agencyRole === "ceo" || profile?.agencyRole === "secretary") && !!profile.agencyId;
  const modeLabels = {
    system: locale === "el" ? "Σύστημα" : "System",
    light: locale === "el" ? "Φωτεινό" : "Light",
    dark: locale === "el" ? "Σκούρο" : "Dark",
  } as const;

  const updatePhoto = useCallback(async () => {
    if (auth.isGuest) return;

    if (!profile) {
      router.push("/edit-profile");
      return;
    }

    try {
      setUpdatingPhoto(true);
      const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = permission.status;
      if (status !== "granted" && permission.canAskAgain) {
        const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = requested.status;
      }
      if (status !== "granted") {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;

      const uid = await getUserId();
      const uploadedPhoto = await uploadProfileImageAsync(asset.uri, uid, 0);
      const nextProfile: UserProfile = {
        ...(profile as UserProfile),
        name: profile.name ?? auth.user?.name ?? "",
        photos: [
          uploadedPhoto,
          ...(profile.photos ?? []).slice(1),
        ],
      };

      await saveUserProfile(uid, nextProfile, { email: auth.user?.email ?? null });
      setProfile(nextProfile);
    } finally {
      setUpdatingPhoto(false);
    }
  }, [auth.isGuest, auth.user?.email, auth.user?.name, profile, router]);

  return (
    <View style={styles.container} testID="profile-screen">
      {auth.isBroker ? (
        <View style={[styles.brokerHeaderRow, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => router.back()}
            testID="broker-settings-back-btn"
            accessibilityRole="button"
            accessibilityLabel="Επιστροφή"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: spacing.xl }]}> 
          <View style={styles.avatarWrap}>
            <Pressable
              onPress={
                auth.isGuest
                  ? () => {
                      router.push("/auth-landing"); // ΔΙΟΡΘΩΣΗ: Πλοήγηση στην οθόνη εισόδου
                    }
                  : updatePhoto
              }
              disabled={updatingPhoto && !auth.isGuest}
              testID="profile-avatar-button"
              style={({ pressed }) => [styles.avatarButton, pressed && !auth.isGuest && styles.avatarButtonPressed]}
            >
              {auth.isGuest || !hasPhoto ? (
                <DefaultProfileAvatar size={112} iconSize={56} style={styles.guestAvatar} />
              ) : (
                <Image source={{ uri: photoUri }} style={styles.avatar} contentFit="cover" />
              )}
              <View style={styles.editBadge}>
                <Ionicons
                  name={auth.isGuest ? "log-in-outline" : updatingPhoto ? "cloud-upload-outline" : "pencil"}
                  size={14}
                  color={colors.onBrand}
                />
              </View>
            </Pressable>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.subInfoWrap}>
            <Text style={styles.subInfoText}>{subInfoParts.join(" · ")}</Text>
          </View>
        </View>

        {!auth.isGuest && !auth.isBroker && !notLookingForRoommate ? (
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{auth.isGuest ? "—" : matchCount}</Text>
              <Text style={styles.statLabel}>{t("profile.statsMatches")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>
                {budget != null ? `${CURRENCY}${budget}` : t("common.values.emptyDash")}
              </Text>
              <Text style={styles.statLabel}>{t("profile.statsBudget")}</Text>
            </View>
          </View>
        ) : null}

        {auth.isGuest ? (
          <View style={styles.guestBanner}>
            <Ionicons name="eye-off-outline" size={36} color={colors.onSurfaceTertiary} />
            <Text style={styles.guestTitle}>{t("profile.guestTitle")}</Text>
            <Text style={styles.guestText}>{t("common.guest.disabledProfileDescription")}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          {canManageAgency ? (
            <Pressable style={[styles.row, styles.rowBorder]} onPress={() => router.push("/agency-management")} testID="agency-management-link">
              <View style={styles.rowIcon}><Ionicons name="business-outline" size={20} color={colors.onSurface} /></View>
              <Text style={styles.rowLabel}>Διαχείριση μεσιτικού γραφείου</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null}
          {visibleNavSettings.map((s, i) => {
            if (s.route === "/roomie-profile" && notLookingForRoommate) {
              return null;
            }

            return (
              <View key={s.label}>
                <Pressable
                  style={[styles.row, i < visibleNavSettings.length - 1 && styles.rowBorder]}
                  testID={s.testID}
                  onPress={() => router.push(s.route as any)}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={s.icon} size={20} color={colors.onSurface} />
                  </View>
                  <Text style={styles.rowLabel}>{t(s.label)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>

                {!notLookingForRoommate && (
                  <>
                    {!auth.isBroker && s.route === "/roomie-profile" && (
                      <View style={styles.quizProgressWrap} testID="quiz-progress-wrap">
                        <View style={styles.quizProgressTrack}>
                          <View
                            style={[
                              styles.quizProgressFill,
                              { width: `${Math.min(100, Math.round((quizAnsweredCount / TOTAL_QUESTIONS) * 100))}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.quizProgressText}>{t("profile.quizAnswered", { answered: quizAnsweredCount, total: TOTAL_QUESTIONS })}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.languageHeader}>
            <Text style={styles.rowLabel}>{t("profile.languageTitle")}</Text>
            <Text style={styles.languageSubtitle}>{t("profile.languageSubtitle")}</Text>
          </View>
          <View style={styles.languageOptions}>
            {([
              { key: "en", label: t("common.languages.english") },
              { key: "el", label: t("common.languages.greek") },
            ] as const).map((option) => {
              const active = locale === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.languageChip, active && styles.languageChipActive]}
                  onPress={() => void setLocale(option.key)}
                  testID={`language-${option.key}`}
                >
                  <Text style={[styles.languageChipText, active && styles.languageChipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.themeCard,
            {
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.themeInfoRow}>
            <View style={[styles.themeIconWrap, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="color-palette-outline" size={18} color={colors.onSurface} />
            </View>
            <View style={styles.themeTextWrap}>
              <Text style={[styles.themeTitle, { color: colors.onSurface }]}>{themeTitle}</Text>
              <Pressable
                onPress={() => {
                  void setThemeMode("system");
                }}
                style={[styles.themeStatusBadge, { backgroundColor: colors.surfaceTertiary }]}
                testID="theme-mode-system"
              >
                <Text style={[styles.themeStatusText, { color: colors.onSurfaceTertiary }]}>{modeLabels[themeMode]}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.themeButtonsRow}>
            <Pressable
              onPress={() => {
                void setThemeMode("light");
              }}
              onLongPress={() => {
                void setThemeMode("system");
              }}
              style={[
                styles.themeModeButton,
                {
                  backgroundColor: effectiveMode === "light" ? colors.brand : colors.surfaceTertiary,
                  borderColor: effectiveMode === "light" ? colors.brand : colors.border,
                },
              ]}
              testID="theme-mode-light"
            >
              <Ionicons
                name="sunny-outline"
                size={17}
                color={effectiveMode === "light" ? colors.onBrand : colors.onSurfaceTertiary}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                void setThemeMode("dark");
              }}
              onLongPress={() => {
                void setThemeMode("system");
              }}
              style={[
                styles.themeModeButton,
                {
                  backgroundColor: effectiveMode === "dark" ? colors.brand : colors.surfaceTertiary,
                  borderColor: effectiveMode === "dark" ? colors.brand : colors.border,
                },
              ]}
              testID="theme-mode-dark"
            >
              <Ionicons
                name="moon-outline"
                size={17}
                color={effectiveMode === "dark" ? colors.onBrand : colors.onSurfaceTertiary}
              />
            </Pressable>
          </View>
        </View>

        {!auth.isGuest ? (
          <>
            <Pressable
              style={styles.logout}
              testID="logout-button"
              onPress={async () => {
                setIsLoggingOut(true); // Ενεργοποιούμε το loading screen αμέσως
                await auth.logout();
                setTimeout(() => {
                  router.replace("/guest"); 
                }, 100);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.logoutText}>{t("profile.logout")}</Text>
            </Pressable>

            <Pressable
              style={styles.deleteAccount}
              testID="delete-account-button"
              onPress={() => router.push("/delete-account")}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={styles.deleteAccountText}>{t("profile.deleteAccount")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={styles.guestSignUpButton}
            testID="guest-signup-button"
            onPress={() => {
              router.push("/auth-landing"); // ΔΙΟΡΘΩΣΗ: Πλοήγηση στην οθόνη εισόδου
            }}
          >
            <Text style={styles.guestSignUpText}>{t("common.cta.signInOrRegister")}</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ΠΡΟΣΘΗΚΗ: Απόλυτο loading overlay που κρύβει το φλασάρισμα των guest στοιχείων */}
      {isLoggingOut && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  brokerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { alignItems: "center", paddingTop: spacing["3xl"], paddingBottom: spacing.xl, gap: spacing.sm },
  avatarWrap: { marginTop: spacing.lg, marginBottom: spacing.sm },
  avatarButton: { alignItems: "center", justifyContent: "center" },
  avatarButtonPressed: { transform: [{ scale: 0.98 }] },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.brand,
  },
  guestAvatar: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.surface,
  },
  name: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  subInfoWrap: {
    width: "100%",
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 2,
  },
  subInfoText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    flexWrap: "wrap",
    lineHeight: 20,
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  statLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textAlign: "center" },
  statDivider: { width: 1, height: 36, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  section: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  languageHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  languageSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  languageOptions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  languageChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  languageChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  languageChipText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  languageChipTextActive: {
    color: colors.onBrand,
  },
  themeCard: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  themeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  themeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  themeTextWrap: {
    gap: spacing.xs,
    flex: 1,
  },
  themeTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
  },
  themeStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  themeStatusText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
  themeButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  themeModeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quizProgressWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  quizProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  quizProgressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  quizProgressText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "right",
  },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  logoutText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.error },
  guestBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  guestTitle: { fontFamily: fonts.semibold, fontSize: fontSize.xl, color: colors.onSurface },
  guestText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  deleteAccount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: "rgba(255,23,68,0.08)",
  },
  deleteAccountText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.error },
  disabledAction: { opacity: 0.5 },
  guestSignUpButton: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  guestSignUpText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface, // Καλύπτει το υπόβαθρο με το χρώμα της εφαρμογής
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
