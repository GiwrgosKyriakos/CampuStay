import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { useAuth } from "@/src/context/auth";
import { getUserSettings, saveUserPrivacy, PrivacyPreferences } from "@/src/api/accountSettings";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import ScreenHeader from "@/src/components/ScreenHeader";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal, { type CenteredModalAction } from "@/src/components/CenteredActionModal";
import { db } from "@/src/config/firebase";
import { t } from "@/src/locales";

const STICKY_FOOTER_PADDING = 152;

interface FirestoreBlockedUserDoc {
  name?: string | null;
  photoUrl?: string;
  photos?: string[];
}

interface BlockedAccountRow {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

export default function PrivacySafetyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isGuest = auth.isGuest;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacyPreferences>({
    is_visible: true,
    blocked_profiles: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [blockedSheetVisible, setBlockedSheetVisible] = useState(false);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedRows, setBlockedRows] = useState<BlockedAccountRow[]>([]);
  const [activeBlockedMenuId, setActiveBlockedMenuId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description?: string;
    actions: CenteredModalAction[];
  } | null>(null);

  const handleBack = useCallback(() => {
    const routerWithCanGoBack = router as { canGoBack?: () => boolean };
    if (routerWithCanGoBack.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/profile");
  }, [router]);

  useEffect(() => {
    let active = true;
    if (isGuest) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const settings = await getUserSettings(auth.userId ?? "");
        if (!active) return;
        setPrivacy(settings.privacy);
      } catch {
        if (!active) return;
        setError(t("privacySafety.errors.load"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isGuest, auth.userId]);

  const persistPrivacy = useCallback(
    async (nextPrivacy: PrivacyPreferences): Promise<boolean> => {
      if (isGuest) return false;
      setPrivacy(nextPrivacy);
      setSaving(true);
      setError(null);
      try {
        if (!auth.userId) return false;
        await saveUserPrivacy(auth.userId, nextPrivacy);
        return true;
      } catch {
        setError(t("privacySafety.errors.save"));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [isGuest, auth.userId],
  );

  const toggleVisibility = useCallback(
    (value: boolean) => {
      if (isGuest) return;
      void persistPrivacy({ ...privacy, is_visible: value });
    },
    [isGuest, privacy, persistPrivacy],
  );

  useEffect(() => {
    if (!blockedSheetVisible || isGuest || !auth.userId) return;

    let active = true;
    setBlockedLoading(true);
    void (async () => {
      try {
        const mapped = await Promise.all(
          privacy.blocked_profiles.map(async (blockedProfile) => {
            const userSnap = await getDoc(doc(db, "users", blockedProfile.id));
            const userData = userSnap.exists() ? (userSnap.data() as FirestoreBlockedUserDoc) : null;
            const photoCandidates = Array.isArray(userData?.photos) ? userData?.photos : [];
            return {
              id: blockedProfile.id,
              displayName: userData?.name?.trim() || blockedProfile.name || t("common.values.unknown"),
              photoUrl: userData?.photoUrl || photoCandidates[0] || null,
            } satisfies BlockedAccountRow;
          }),
        );

        if (!active) return;
        setBlockedRows(mapped);
      } catch {
        if (!active) return;
        setBlockedRows(
          privacy.blocked_profiles.map((blockedProfile) => ({
            id: blockedProfile.id,
            displayName: blockedProfile.name || t("common.values.unknown"),
            photoUrl: null,
          })),
        );
      } finally {
        if (active) setBlockedLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, blockedSheetVisible, isGuest, privacy.blocked_profiles]);

  const addBackToMatches = useCallback(
    async (targetUserId: string) => {
      if (isGuest || !auth.userId) return;

      try {
        const chatRoomId = [auth.userId, targetUserId].sort().join("_");
        await setDoc(
          doc(db, "chats", chatRoomId),
          {
            users: [auth.userId, targetUserId],
            type: "roommate",
            status: "pending",
            initiatedBy: auth.userId,
            lastMessage: "",
            lastMessageTimestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setActionModal({
          title: t("privacySafety.modals.addedTitle"),
          description: t("privacySafety.modals.addedMessage"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "checkmark-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
      } catch {
        setActionModal({
          title: t("privacySafety.modals.addFailedTitle"),
          description: t("privacySafety.modals.addFailedMessage"),
          actions: [
            {
              label: t("common.actions.gotIt"),
              iconName: "alert-circle-outline",
              onPress: () => setActionModal(null),
            },
          ],
        });
      }
    },
    [auth.userId, isGuest],
  );

  const handleUnblockProfile = useCallback(
    async (targetUserId: string) => {
      if (isGuest) return;
      setActiveBlockedMenuId(null);

      const nextPrivacy = {
        ...privacy,
        blocked_profiles: privacy.blocked_profiles.filter((p) => p.id !== targetUserId),
      };
      const persisted = await persistPrivacy(nextPrivacy);
      if (!persisted) return;

      setActionModal({
        title: t("privacySafety.modals.rematchPromptTitle"),
        actions: [
          {
            label: t("common.actions.no"),
            variant: "outline",
            iconName: "close-outline",
            onPress: () => setActionModal(null),
          },
          {
            label: t("common.actions.add"),
            iconName: "person-add-outline",
            onPress: () => {
              setActionModal(null);
              void addBackToMatches(targetUserId);
            },
          },
        ],
      });
    },
    [addBackToMatches, isGuest, persistPrivacy, privacy],
  );

  if (auth.isLoading || loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("privacySafety.title")}
        onBackPress={handleBack}
        backButtonTestID="privacy-safety-back-button"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 100 + (auth.isGuest ? STICKY_FOOTER_PADDING : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        testID="privacy-safety-screen"
      >
        {auth.isGuest && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="privacy-guest-readonly-banner"
            buttonTestID="privacy-guest-top-signin-button"
            style={styles.guestBannerSpacing}
          />
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <Ionicons name="eye-outline" size={20} color={colors.onSurface} />
            </View>
            <View style={styles.cardHeaderTextWrap}>
              <Text style={styles.cardTitle}>{t("privacySafety.visibilityTitle")}</Text>
              <Text style={styles.subtitle}>{t("privacySafety.visibilityHelp")}</Text>
            </View>
          </View>
          <View style={isGuest ? styles.disabledControl : undefined}>
            <Switch
              value={privacy.is_visible}
              onValueChange={toggleVisibility}
              disabled={isGuest}
              trackColor={{ false: isGuest ? colors.border : colors.muted, true: isGuest ? colors.onSurfaceTertiary : colors.brand }}
              thumbColor={isGuest ? colors.surface : privacy.is_visible ? colors.surface : colors.surface}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("privacySafety.subtitle")}</Text>
          </View>

          <View style={styles.settingsList}>
            <Pressable
              style={styles.settingsRow}
              onPress={() => WebBrowser.openBrowserAsync("https://giwrgoskyriakos.github.io/CampuStay/privacy.html")}
              testID="privacy-policy-link"
            >
              <View style={styles.settingsRowIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.onSurface} />
              </View>
              <Text style={styles.settingsRowLabel}>{t("common.labels.privacyPolicy")}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="ban-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("privacySafety.blockedTitle")}</Text>
          </View>

          <View style={styles.settingsList}>
            <Pressable
              style={[styles.settingsRow, isGuest && styles.unblockButtonDisabled]}
              onPress={() => {
                if (isGuest) return;
                setBlockedSheetVisible((prev) => !prev);
                setActiveBlockedMenuId(null);
              }}
              disabled={isGuest}
              testID="privacy-blocked-accounts-link"
            >
              <View style={styles.settingsRowIcon}>
                <Ionicons name="ban-outline" size={20} color={colors.onSurface} />
              </View>
              <Text style={styles.settingsRowLabel}>{t("privacySafety.blockedTitle")}</Text>
              <Ionicons
                name={blockedSheetVisible ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>
          </View>

          {blockedSheetVisible ? (
            <View style={styles.inlineSheetContainer} testID="blocked-sheet-inline">
              <View style={styles.sheetHandle} />
              {blockedLoading ? (
                <View style={styles.sheetLoadingWrap}>
                  <ActivityIndicator size="small" color={colors.brand} />
                </View>
              ) : blockedRows.length === 0 ? (
                <View style={styles.sheetEmptyWrap}>
                  <Text style={styles.blockedEmpty}>{t("privacySafety.blockedEmpty")}</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.sheetList}
                  contentContainerStyle={styles.sheetListContent}
                  showsVerticalScrollIndicator={false}
                  testID="blocked-sheet-list"
                >
                  {blockedRows.map((profileRow) => (
                    <View key={profileRow.id} style={styles.blockedRow} testID={`blocked-profile-${profileRow.id}`}>
                      <View style={styles.blockedLeftSection}>
                        {profileRow.photoUrl ? (
                          <Image source={{ uri: profileRow.photoUrl }} style={styles.blockedAvatar} contentFit="cover" />
                        ) : (
                          <DefaultProfileAvatar size={42} iconSize={20} />
                        )}
                        <View style={styles.blockedTextWrap}>
                          <Text style={styles.blockedName} numberOfLines={1}>{profileRow.displayName}</Text>
                          <Text style={styles.blockedId} numberOfLines={1}>{profileRow.id}</Text>
                        </View>
                      </View>

                      <View>
                        <Pressable
                          style={styles.rowMenuButton}
                          onPress={() => setActiveBlockedMenuId((prev) => (prev === profileRow.id ? null : profileRow.id))}
                          testID={`blocked-row-menu-${profileRow.id}`}
                        >
                          <Ionicons name="ellipsis-vertical" size={18} color={colors.onSurfaceTertiary} />
                        </Pressable>

                        {activeBlockedMenuId === profileRow.id ? (
                          <View style={styles.rowMenuPopover}>
                            <Pressable
                              onPress={() => {
                                void handleUnblockProfile(profileRow.id);
                              }}
                              style={styles.rowMenuItem}
                              testID={`unblock-${profileRow.id}`}
                            >
                              <Text style={styles.unblockText}>{t("common.actions.unblock")}</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
        </View>
        {saving && <Text style={styles.saveText}>{t("privacySafety.saving")}</Text>}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {auth.isGuest && (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="privacy-guest-footer-signin-button"
        />
      )}

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={actionModal?.actions ?? []}
        testID="privacy-action-modal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardHeaderTextWrap: { flex: 1 },
  cardTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsList: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  settingsRowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  blockedEmpty: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  blockedLeftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  blockedAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceTertiary,
  },
  blockedTextWrap: { flex: 1 },
  blockedName: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  blockedId: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  rowMenuButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMenuPopover: {
    position: "absolute",
    top: 30,
    right: 0,
    minWidth: 110,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  rowMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  unblockButtonDisabled: {
    opacity: 0.45,
  },
  disabledControl: { opacity: 0.6 },
  unblockText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  inlineSheetContainer: {
    marginTop: spacing.sm,
    maxHeight: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetListContent: {
    paddingBottom: spacing.lg,
  },
  sheetLoadingWrap: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  sheetEmptyWrap: {
    paddingVertical: spacing.lg,
  },
  saveText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brand, marginTop: spacing.sm, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginTop: spacing.sm, textAlign: "center" },
  guestBannerSpacing: {
    marginBottom: spacing.xs,
  },
});
