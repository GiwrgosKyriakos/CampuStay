import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { deleteAccountDeep } from "@/src/api/accountDeletion";

export default function DeleteAccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (auth.isGuest) {
      router.replace("/auth-landing");
      return;
    }
    if (!auth.userId) {
      setError("Unable to delete account - user ID not found.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteAccountDeep(auth.userId);
      await auth.logout();
      router.replace("/guest");
    } catch {
      setError("Failed to delete your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const userEmail = auth.user?.email ?? "Not available";

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
            <Text style={styles.heading}>Sign up first</Text>
            <Text style={styles.warning}>
              Guest Mode cannot delete an account because there is no signed-in profile to remove.
            </Text>
          </View>
        ) : (
        <View style={styles.content}>
          <Text style={styles.heading}>Are you sure you want to delete your account?</Text>
          <Text style={styles.warning}>
            This action is permanent. Your profile data, quiz responses, likes, and swipes will be permanently removed.
            Existing chats remain visible to your conversation partners as "Deleted Account".
          </Text>
          <View style={styles.credentialBox}>
            <Text style={styles.credentialLabel}>Registered Email</Text>
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
            loading && styles.disabled,
          ]}
          onPress={handleDelete}
          disabled={loading}
          testID="delete-permanently-button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onError} />
          ) : (
            <Text style={styles.deleteText}>Delete Permanently</Text>
          )}
        </Pressable>
      )}
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
