import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { firebaseAuth } from '../src/config/firebase';

GoogleSignin.configure({
  webClientId: '311068327323-cmdkalllbaojgsf9dq2bp6fpjs5c9ut6.apps.googleusercontent.com',
});

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as WebBrowser from "expo-web-browser";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useAuth } from "@/src/context/auth";

export default function AuthLandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
  try {
    setGoogleLoading(true);
    console.log("[AuthLanding] -> User tapped Google Sign-In button");
    
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;
    if (!idToken) throw new Error("No ID Token found");
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(firebaseAuth, credential);
    if (userCredential.user) {
      console.log("[AuthLanding] ✓ Google Sign-In successful, resolving post-login route...");
      router.replace("/");
    } else {
      console.warn("[AuthLanding] ⚠ Google Sign-In returned null user");
    }
  } catch (err: any) {
    console.error("[AuthLanding] X Google login error:", err);
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
          Campu<Text style={styles.logoAccent}>Stay</Text>
        </Text>
        <Text style={styles.tagline}>Find your perfect roommate</Text>
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
                <Text style={styles.buttonGoogleText}>Continue with Google</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email/Phone Button */}
        <Pressable
          style={styles.buttonEmail}
          onPress={handleEmailFlow}
          testID="email-login-button"
        >
          <Ionicons name="mail-outline" size={20} color={colors.onSurface} />
          <Text style={styles.buttonEmailText}>Phone or Email</Text>
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
          <Text style={styles.buttonGuestText}>Continue as Guest</Text>
        </Pressable>

        {/* Footer Text */}
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>By continuing, you agree to our </Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync("https://giwrgoskyriakos.github.io/CampuStay/terms_of_service.html")} testID="terms-of-service-email-link">
            <Text style={styles.footerLinkText}>Terms of Service</Text>
          </Pressable>
          <Text style={styles.footerText}> and </Text>
          <Pressable onPress={handlePrivacyPolicyPress} testID="privacy-policy-email-link">
            <Text style={styles.footerLinkText}>Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
