import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useAuth } from "@/src/context/auth";

const FAQ_ITEMS = [
  {
    question: "How do Matches work?",
    answer: "When you both swipe right on each other, a chat room opens in your Matches tab.",
  },
  {
    question: "Is my social media visible to everyone?",
    answer: "Only your confirmed Matches can see your linked social media profiles.",
  },
  {
    question: "How do I report a fake profile?",
    answer: "You can report or block a user directly from their profile card or within your chat room.",
  },
];

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const openEmailSupport = async () => {
    if (auth.isGuest) return;
    await Linking.openURL("mailto:gkiriakos92@gmail.com?subject=CampuStay%20Support%20Inquiry");
  };

  const openInstagram = async () => {
    if (auth.isGuest) return;
    try {
      const supported = await Linking.canOpenURL("instagram://user?username=g1wrgos.k");
      if (supported) {
        await Linking.openURL("instagram://user?username=g1wrgos.k");
        return;
      }
    } catch {
      // Fall back to web URL below.
    }
    await Linking.openURL("https://instagram.com/g1wrgos.k");
  };
  
  const openWebsite = async () => {
    if (auth.isGuest) return;
    await Linking.openURL("https://www.campustay.com");
  };

  if (auth.isLoading) return null;

  const navigationSource = auth.isGuest ? "/guest" : "/roommates";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      testID="help-support-screen"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Help & Support</Text>
        <Text style={styles.subtitle}>Browse frequently asked questions or contact the support team directly.</Text>
      </View>

      {auth.isGuest && (
        <View style={styles.guestReadOnlyBanner} testID="help-guest-readonly-banner">
          <Text style={styles.guestReadOnlyTitle}>Guest Mode: Read-only</Text>
          <Text style={styles.guestReadOnlyText}>
            You can browse help content, but contacting support requires signing in.
          </Text>
        </View>
      )}

      {FAQ_ITEMS.map((item, index) => {
        const open = openIndex === index;
        return (
          <Pressable
            key={item.question}
            style={[styles.accordion, open && styles.accordionOpen]}
            onPress={() => setOpenIndex(open ? null : index)}
            testID={`faq-${index}`}
          >
            <View style={styles.accordionHeader}>
              <Text style={styles.question}>{item.question}</Text>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurfaceTertiary} />
            </View>
            {open && <Text style={styles.answer}>{item.answer}</Text>}
          </Pressable>
        );
      })}

      <Pressable
        style={[styles.contactButton, auth.isGuest && styles.contactButtonDisabled]}
        onPress={() => !auth.isGuest && Linking.openURL("mailto:support@unimates.com?subject=Support%20Request")}
        disabled={auth.isGuest}
        testID="contact-support-button"
      >
        <Text style={styles.contactButtonText}>Contact Support Team</Text>
      </Pressable>

      <View style={styles.linksSection}>
        <Pressable
          style={[styles.linkRow, auth.isGuest && styles.linkRowDisabled]}
          onPress={openEmailSupport}
          disabled={auth.isGuest}
          testID="help-email-support"
        >
          <View style={styles.linkIconWrap}>
            <Ionicons name="mail-outline" size={20} color={colors.onSurface} />
          </View>
          <Text style={styles.linkLabel}>Email Support</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>

        <Pressable
          style={[styles.linkRow, auth.isGuest && styles.linkRowDisabled]}
          onPress={openInstagram}
          disabled={auth.isGuest}
          testID="help-instagram-link"
        >
          <View style={styles.linkIconWrap}>
            <Ionicons name="logo-instagram" size={20} color={colors.onSurface} />
          </View>
          <Text style={styles.linkLabel}>Follow us on Instagram</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>

        <Pressable
          style={[styles.linkRow, auth.isGuest && styles.linkRowDisabled]}
          onPress={openWebsite}
          disabled={auth.isGuest}
          testID="help-website-link"
        >
          <View style={styles.linkIconWrap}>
            <Ionicons name="globe-outline" size={20} color={colors.onSurface} />
          </View>
          <Text style={styles.linkLabel}>Visit Website</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <Pressable style={styles.backButton} onPress={() => router.replace(navigationSource)}>
        <Text style={styles.backText}>Back to home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  contentContainer: { minHeight: "100%", paddingHorizontal: spacing.lg },
  header: { marginBottom: spacing.xl },
  container: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, marginBottom: spacing.sm },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, marginBottom: spacing.lg },
  accordion: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  accordionOpen: { backgroundColor: colors.surface },
  accordionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  question: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  answer: { marginTop: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, lineHeight: 20 },
  guestReadOnlyBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  guestReadOnlyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onSurface },
  guestReadOnlyText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  contactButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  contactButtonDisabled: { opacity: 0.45 },
  contactButtonText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
  linksSection: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  linkRowDisabled: {
    opacity: 0.45,
  },
  linkIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  linkLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  backButton: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  backText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
});
