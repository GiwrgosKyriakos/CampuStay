import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";

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
      // TODO: Implement deleteAccount API call
      // await deleteAccount(auth.userId);
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
      {auth.isGuest ? (
        <View style={styles.content}>
          <Text style={styles.heading}>Sign up first</Text>
          <Text style={styles.warning}>
            Guest Mode cannot delete an account because there is no signed-in profile to remove.
          </Text>
          <Pressable style={styles.signInButton} onPress={() => router.push("/auth-landing")} testID="delete-signin-button">
            <Text style={styles.signInText}>Sign Up / Log In</Text>
          </Pressable>
        </View>
      ) : (
      <View style={styles.content}>
        <Text style={styles.heading}>Are you sure you want to delete your account?</Text>
        <Text style={styles.warning}>
          This action is permanent. All your profile data, matches, quiz responses, and chats will be wiped from our databases forever.
        </Text>
        <View style={styles.credentialBox}>
          <Text style={styles.credentialLabel}>Registered Email</Text>
          <Text style={styles.credentialValue}>{userEmail}</Text>
        </View>
      </View>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!auth.isGuest && (
        <Pressable style={[styles.deleteButton, loading && styles.disabled]} onPress={handleDelete} disabled={loading} testID="delete-permanently-button">
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
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, justifyContent: "space-between" },
  content: { gap: spacing.lg },
  heading: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  warning: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.surfaceSecondary, lineHeight: 22 },
  credentialBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  credentialLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.surfaceSecondary, marginBottom: spacing.sm },
  credentialValue: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurface, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, borderRadius: radius.md },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.error, marginBottom: spacing.sm },
  deleteButton: {
    backgroundColor: colors.error,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  deleteText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onError },
  disabled: { opacity: 0.7 },
  signInButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.md,
  },
  signInText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
