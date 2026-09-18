import React, { useMemo, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import Dropdown from "@/src/components/Dropdown";
import { useLocale } from "@/src/context/locale";
import { AppLocale } from "@/src/locales";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

const LANGUAGE_OPTIONS: ReadonlyArray<{ code: AppLocale; label: string }> = [
  { code: "el", label: "Ελληνικά" },
  { code: "en", label: "English" },
];

export default function LanguageSelectScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { locale, setLocale, completeInitialLanguage } = useLocale();
  const router = useRouter();
  const [isContinuing, setIsContinuing] = useState(false);
  const selectedLanguage = LANGUAGE_OPTIONS.find((option) => option.code === locale) ?? LANGUAGE_OPTIONS[1];

  const handleLanguageChange = (label: string) => {
    const nextLanguage = LANGUAGE_OPTIONS.find((option) => option.label === label);
    if (nextLanguage) void setLocale(nextLanguage.code);
  };

  const handleContinue = async () => {
    if (isContinuing) return;
    setIsContinuing(true);
    await setLocale(selectedLanguage.code);
    await completeInitialLanguage();
    router.replace("/auth-landing");
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="language-select-screen">
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandGroup}>
            <Image source={require("@/assets/campuStayLogoTransparent.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandName}>{t("common.brandName")}</Text>
          </View>

          <View style={styles.copy}>
            <Text style={styles.title}>{t("common.languagePrompt.welcome")}</Text>
            <Text style={styles.prompt}>{t("common.languagePrompt.subtitle")}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("common.labels.language")}</Text>
            <Dropdown
              value={selectedLanguage.label}
              options={LANGUAGE_OPTIONS.map((option) => option.label)}
              placeholder={t("common.labels.language")}
              onSelect={handleLanguageChange}
              testID="language-select-dropdown"
              disabled={isContinuing}
            />
          </View>
        </ScrollView>

        <Pressable
          style={[styles.continueButton, isContinuing && styles.continueButtonDisabled]}
          onPress={() => void handleContinue()}
          disabled={isContinuing}
          testID="language-select-continue"
        >
          <Text style={styles.continueText}>{t("common.actions.continue")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    screen: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    content: { flexGrow: 1, justifyContent: "center", paddingVertical: spacing.xl, gap: spacing["2xl"] },
    brandGroup: { alignItems: "center", gap: spacing.sm },
    logo: { width: 156, height: 112 },
    brandName: { fontFamily: fonts.display, fontSize: fontSize["3xl"], color: colors.onSurface },
    copy: { gap: spacing.sm, alignItems: "center" },
    title: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, textAlign: "center" },
    prompt: { maxWidth: 360, fontFamily: fonts.regular, fontSize: fontSize.lg, lineHeight: 24, color: colors.onSurfaceTertiary, textAlign: "center" },
    fieldGroup: { gap: spacing.sm },
    label: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    continueButton: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.brand, paddingHorizontal: spacing.xl },
    continueButtonDisabled: { opacity: 0.55 },
    continueText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
  });
}