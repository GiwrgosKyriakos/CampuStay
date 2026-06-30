import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";
import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { deleteAccount } from "@/src/api/accountSettings";

export default function DeleteAccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!auth.userId || !auth.credential) {
      setError("Unable to delete account without authenticated credentials.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteAccount(auth.userId, auth.credential);
      await auth.logout();
      router.replace("/guest");
    } catch {
      setError("Failed to delete your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]} testID="delete-account-screen">
      <View style={styles.content}>
        <Text style={styles.heading}>Are you sure you want to delete your account?</Text>
        <Text style={styles.warning}>
          This action is permanent. All your profile data, matches, quiz responses, and chats will be wiped from our databases forever.
        </Text>
        <View style={styles.credentialBox}>
          <Text style={styles.credentialLabel}>Registered Email/Phone</Text>
          <Text style={styles.credentialValue}>{auth.credential ?? "Not available"}</Text>
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable style={[styles.deleteButton, loading && styles.disabled]} onPress={handleDelete} disabled={loading} testID="delete-permanently-button">
        {loading ? (
          <ActivityIndicator size="small" color={colors.onError} />
        ) : (
          <Text style={styles.deleteText}>Delete Permanently</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1C", paddingHorizontal: spacing.lg, justifyContent: "space-between" },
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
});
