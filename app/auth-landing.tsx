import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { t } from "@/src/locales";

export default function AuthLandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  React.useEffect(() => {
    if (!auth.isLoading && auth.isLoggedIn) {
      router.replace("/(tabs)/roommates");
    }
  }, [auth.isLoading, auth.isLoggedIn, router]);

  if (auth.isLoading || auth.isLoggedIn) {
    return (
      <View style={styles.loadingContainer} testID="auth-landing-loading">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      console.log("[AuthLanding] -> User tapped Google Sign-In button");
      await auth.signInWithGoogle();
    } catch (err: any) {
      console.error("[AuthLanding] X Google sign-in initialization failed:", err);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailFlow = () => {
    router.push("/auth-email");
  };

  const handlePrivacyPolicyPress = () => {
    router.push("/privacy-policy");
  };

  return (
    <View style={styles.container} testID="auth-landing-screen">
      {/* Hero Section */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        {/* Logo/Branding */}
        <View style={styles.logoWrap}>
          <Image source={require("@/assets/campuStayLogo.png")} style={styles.logoImage} resizeMode="contain" />
        </View>
        <Text style={styles.logo}>
          {t("common.brandPrefix")}<Text style={styles.logoAccent}>{t("common.brandSuffix")}</Text>
        </Text>
        <Text style={styles.tagline}>{t("auth.landing.tagline")}</Text>
      </View>

      {/* Buttons Section */}
      <View style={[styles.buttonsContainer, { paddingBottom: insets.bottom + spacing.xl }]}>
        {/* Google Login Button */}
        <Pressable
          style={[styles.buttonGoogle, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
          testID="google-login-button"
        >
          <LinearGradient
            colors={[colors.brand, colors.brandSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.googleGradient}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.onBrand} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={colors.onBrand} />
                <Text style={styles.buttonGoogleText}>{t("auth.landing.continueWithGoogle")}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("auth.landing.divider")}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email/Phone Button */}
        <Pressable
          style={styles.buttonEmail}
          onPress={handleEmailFlow}
          testID="email-login-button"
        >
          <Ionicons name="mail-outline" size={20} color={colors.onSurface} />
          <Text style={styles.buttonEmailText}>{t("auth.landing.phoneOrEmail")}</Text>
        </Pressable>

        {/* Guest Mode Button */}
        <Pressable
          style={styles.buttonGuest}
          onPress={async () => {
            await auth.continueAsGuest();
            router.replace("/(tabs)/roommates");
          }}
          testID="guest-mode-button"
        >
          <Text style={styles.buttonGuestText}>{t("auth.landing.continueAsGuest")}</Text>
        </Pressable>

        {/* Footer Text */}
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{t("auth.landing.agreementPrefix")}</Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync("https://giwrgoskyriakos.github.io/CampuStay/terms_of_service.html")} testID="terms-of-service-email-link">
            <Text style={styles.footerLinkText}>{t("auth.landing.terms")}</Text>
          </Pressable>
          <Text style={styles.footerText}>{t("auth.landing.agreementAnd")}</Text>
          <Pressable onPress={handlePrivacyPolicyPress} testID="privacy-policy-email-link">
            <Text style={styles.footerLinkText}>{t("auth.landing.privacy")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: "space-between",
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  logoWrap: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderRadius: 28,
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  logo: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["4xl"],
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  logoAccent: {
    color: colors.brand,
  },
  tagline: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  buttonsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  buttonGoogle: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  googleGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  buttonGoogleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
  },
  buttonEmail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.muted,
    backgroundColor: "rgba(139, 180, 185, 0.15)",
  },
  buttonEmailText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  buttonGuest: {
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonGuestText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textDecorationLine: "underline",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  footerRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  footerLinkText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textDecorationLine: "underline",
  },
});
