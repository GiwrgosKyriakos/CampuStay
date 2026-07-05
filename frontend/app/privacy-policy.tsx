import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, fonts, fontSize } from "@/src/theme";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        testID="privacy-policy-screen"
      >
        <Pressable style={styles.backButton} onPress={() => router.back()} testID="privacy-policy-back-button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: July 2026</Text>

        <Text style={styles.paragraph}>
          CampuStay respects your privacy. We collect only the data needed to provide roommate matching,
          messaging, and account functionality.
        </Text>

        <Text style={styles.sectionTitle}>What We Collect</Text>
        <Text style={styles.paragraph}>
          We may store profile information you provide, account credentials, interaction preferences,
          and in-app activity required to deliver app features.
        </Text>

        <Text style={styles.sectionTitle}>How We Use Data</Text>
        <Text style={styles.paragraph}>
          Your data is used to personalize match recommendations, keep your account secure, and improve app
          reliability and user safety.
        </Text>

        <Text style={styles.sectionTitle}>Your Controls</Text>
        <Text style={styles.paragraph}>
          You can edit profile details, adjust visibility settings, and request account deletion from inside
          the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["3xl"],
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  updated: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 22,
  },
});
