import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { useAuth } from "@/src/context/auth";
import { t } from "@/src/locales";

const STICKY_FOOTER_PADDING = 152;

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqItems = [
    { question: t("helpSupport.faq.matchesQuestion"), answer: t("helpSupport.faq.matchesAnswer") },
    { question: t("helpSupport.faq.socialQuestion"), answer: t("helpSupport.faq.socialAnswer") },
    { question: t("helpSupport.faq.reportQuestion"), answer: t("helpSupport.faq.reportAnswer") },
  ];

  const openEmailSupport = async () => {
    await Linking.openURL(`mailto:gkiriakos92@gmail.com?subject=${encodeURIComponent(t("helpSupport.supportSubject"))}`);
  };

  const openInstagram = async () => {
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

  if (auth.isLoading) return null;

  const navigationSource = auth.isGuest ? "/guest" : "/roommates";

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + (auth.isGuest ? STICKY_FOOTER_PADDING : spacing.xl) },
        ]}
        showsVerticalScrollIndicator={false}
        testID="help-support-screen"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("helpSupport.title")}</Text>
          <Text style={styles.subtitle}>{t("helpSupport.subtitle")}</Text>
        </View>

        {auth.isGuest && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="help-guest-readonly-banner"
            buttonTestID="help-guest-top-signin-button"
            style={styles.guestBannerSpacing}
          />
        )}

        {faqItems.map((item, index) => {
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
          onPress={() => Linking.openURL(`mailto:support@unimates.com?subject=${encodeURIComponent(t("helpSupport.supportRequestSubject"))}`)}
          testID="contact-support-button"
        >
          <Text style={styles.contactButtonText}>{t("common.cta.contactSupport")}</Text>
        </Pressable>

        <View style={styles.linksSection}>
          <Pressable
            style={styles.linkRow}
            onPress={openEmailSupport}
            testID="help-email-support"
          >
            <View style={styles.linkIconWrap}>
              <Ionicons name="mail-outline" size={20} color={colors.onSurface} />
            </View>
            <Text style={styles.linkLabel}>{t("helpSupport.emailSupport")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>

          <Pressable
            style={styles.linkRow}
            onPress={openInstagram}
            testID="help-instagram-link"
          >
            <View style={styles.linkIconWrap}>
              <Ionicons name="logo-instagram" size={20} color={colors.onSurface} />
            </View>
            <Text style={styles.linkLabel}>{t("helpSupport.instagram")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <Pressable style={styles.backButton} onPress={() => router.replace(navigationSource)}>
          <Text style={styles.backText}>{t("common.cta.backHome")}</Text>
        </Pressable>
      </ScrollView>

      {auth.isGuest && (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="help-guest-footer-signin-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
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
  guestBannerSpacing: {
    marginBottom: spacing.md,
  },
  contactButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
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
