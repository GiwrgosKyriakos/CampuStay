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

  if (!auth.loaded) return null;

  const navigationSource = auth.isGuest ? "/guest" : "/roommates";

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
      testID="help-support-screen"
    >
      <Text style={styles.title}>Help & Support</Text>
      <Text style={styles.subtitle}>Browse frequently asked questions or contact the support team directly.</Text>

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
        style={styles.contactButton}
        onPress={() => Linking.openURL("mailto:support@unimates.com?subject=Support%20Request")}
        testID="contact-support-button"
      >
        <Text style={styles.contactButtonText}>Contact Support Team</Text>
      </Pressable>

      <Pressable style={styles.backButton} onPress={() => router.replace(navigationSource)}>
        <Text style={styles.backText}>Back to home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  contactButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  contactButtonText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
  backButton: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  backText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
});
