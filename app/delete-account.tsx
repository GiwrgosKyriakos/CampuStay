import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FirebaseError } from "firebase/app";
import { deleteUser } from "firebase/auth";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import CenteredActionModal, { type CenteredModalAction } from "@/src/components/CenteredActionModal";
import { firebaseAuth } from "@/src/config/firebase";
import { wipeUserFirestoreFootprint } from "@/src/services/firebase";
import { t } from "@/src/locales";

const RECENT_LOGIN_WINDOW_MS = 5 * 60 * 1000;

export default function DeleteAccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description?: string;
    actions: CenteredModalAction[];
  } | null>(null);

  const showRecentLoginModal = () => {
    setActionModal({
      title: t("deleteAccount.alerts.recentLoginTitle"),
      description: t("deleteAccount.alerts.recentLoginMessage"),
      actions: [
        {
          label: t("common.actions.gotIt"),
          iconName: "checkmark-circle-outline",
          onPress: () => setActionModal(null),
        },
      ],
    });
  };

  const executeDeleteAccount = async () => {
    if (auth.isGuest) {
      router.replace("/auth-landing");
      return;
    }
    if (!auth.userId) {
      setError(t("deleteAccount.errors.userIdMissing"));
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        throw new Error("Missing authenticated user for account deletion.");
      }

      const idTokenResult = await currentUser.getIdTokenResult();
      const authTimeMs = Date.parse(idTokenResult.authTime);
      if (Number.isFinite(authTimeMs) && Date.now() - authTimeMs > RECENT_LOGIN_WINDOW_MS) {
        showRecentLoginModal();
        return;
      }

      await wipeUserFirestoreFootprint(auth.userId);

      try {
        await deleteUser(currentUser);
      } catch (err: unknown) {
        if (err instanceof FirebaseError && err.code === "auth/requires-recent-login") {
          showRecentLoginModal();
          return;
        }
        throw err;
      }

      await auth.logout();
      router.replace("/auth-landing");
    } catch (err) {
      console.error("[Delete Account] Failed to permanently delete account:", err);
      setError(t("deleteAccount.errors.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = () => {
    setActionModal({
      title: t("deleteAccount.alerts.confirmDeleteTitle"),
      description: t("deleteAccount.alerts.confirmDeleteMessage"),
      actions: [
        {
          label: t("common.actions.cancel"),
          variant: "outline",
          iconName: "close-outline",
          onPress: () => setActionModal(null),
        },
        {
          label: t("deleteAccount.confirm"),
          iconName: "warning-outline",
          onPress: () => {
            setActionModal(null);
            void executeDeleteAccount();
          },
        },
      ],
    });
  };

  const userEmail = auth.user?.email ?? t("common.values.notAvailable");

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]} testID="delete-account-screen">
      <View style={styles.mainContent}>
        {auth.isGuest && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="delete-guest-banner"
            buttonTestID="delete-signin-button"
            style={styles.guestBannerSpacing}
          />
        )}

        {auth.isGuest ? (
          <View style={styles.content}>
            <Text style={styles.heading}>{t("deleteAccount.guestTitle")}</Text>
            <Text style={styles.warning}>{t("deleteAccount.guestBody")}</Text>
          </View>
        ) : (
        <View style={styles.content}>
          <Text style={styles.heading}>{t("deleteAccount.title")}</Text>
          <Text style={styles.warning}>{t("deleteAccount.warning", { deletedLabel: t("common.account.deleted") })}</Text>
          <View style={styles.credentialBox}>
            <Text style={styles.credentialLabel}>{t("deleteAccount.registeredEmail")}</Text>
            <Text style={styles.credentialValue}>{userEmail}</Text>
          </View>
        </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {auth.isGuest ? (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="delete-guest-footer-signin-button"
        />
      ) : (
        <Pressable
          style={[
            styles.deleteButton,
            { marginBottom: Math.max(insets.bottom + 34, 38) },
            isDeleting && styles.disabled,
          ]}
          onPress={handleDelete}
          disabled={isDeleting}
          testID="delete-permanently-button"
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.onError} />
          ) : (
            <Text style={styles.deleteText}>{t("deleteAccount.confirm")}</Text>
          )}
        </Pressable>
      )}

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={actionModal?.actions ?? []}
        testID="delete-account-action-modal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  mainContent: { flex: 1 },
  content: { gap: spacing.lg },
  guestBannerSpacing: { marginBottom: spacing.lg },
  heading: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  warning: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.brand, lineHeight: 22 },
  credentialBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  credentialLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface, marginBottom: spacing.sm },
  credentialValue: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurface, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, borderRadius: radius.md },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginBottom: spacing.sm },
  deleteButton: {
    backgroundColor: colors.error,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  deleteText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onError },
  disabled: { opacity: 0.7 },
});
