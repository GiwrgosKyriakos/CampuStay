import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { sendPasswordResetEmail } from "firebase/auth";

import * as WebBrowser from "expo-web-browser";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useAuth } from "@/src/context/auth";
import { firebaseAuth } from "@/src/config/firebase";

type Mode = "login" | "register";
type NoticeTone = "error" | "success";

type AuthNotice = {
  tone: NoticeTone;
  message: string;
};

function mapFirebaseAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/invalid-credential":
      return "Incorrect email or password. Please try again.";
    case "auth/email-already-in-use":
      return "This email is already registered.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

function mapPasswordResetError(code?: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "No account found with this email address.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    default:
      return "We could not send a reset email right now. Please try again.";
  }
}

export default function AuthEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);

  const handleBack = () => {
    router.back();
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setAuthNotice(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const handlePrivacyPolicyPress = () => {
    router.push("/privacy-policy");
  };

  const handleLogin = async () => {
    setAuthNotice(null);

    if (!email.trim() || !password.trim()) {
      setAuthNotice({ tone: "error", message: "Please fill in all fields." });
      return;
    }

    try {
      setLoading(true);
      await auth.loginEmail(email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      setAuthNotice({ tone: "error", message: mapFirebaseAuthError(err?.code) });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setAuthNotice(null);

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setAuthNotice({ tone: "error", message: "Please fill in all fields." });
      return;
    }

    if (password !== confirmPassword) {
      setAuthNotice({ tone: "error", message: "Passwords do not match." });
      return;
    }

    if (password.length < 6) {
      setAuthNotice({ tone: "error", message: "Password should be at least 6 characters long." });
      return;
    }

    try {
      setLoading(true);
      await auth.registerEmail(email.trim(), password, name.trim());
      router.replace("/");
    } catch (err: any) {
      setAuthNotice({ tone: "error", message: mapFirebaseAuthError(err?.code) });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthNotice(null);

    if (!email.trim()) {
      setAuthNotice({
        tone: "error",
        message: "Please enter your email address first so we can send you a reset link.",
      });
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setAuthNotice({
        tone: "success",
        message: "Password reset email sent successfully! Please check your inbox.",
      });
    } catch (err: any) {
      setAuthNotice({ tone: "error", message: mapPasswordResetError(err?.code) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
      testID={`auth-email-${mode}`}
    >
      <View style={styles.header}>
        <Pressable onPress={handleBack} testID="back-button">
          <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Sign In</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Access CampuStay with your email and password.</Text>

        <View style={styles.tabBar} testID="auth-mode-tabs">
          <Pressable
            style={[styles.tabButton, mode === "login" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => switchMode("login")}
            testID="auth-tab-login"
          >
            <Text style={[styles.tabButtonText, mode === "login" ? styles.tabButtonTextActive : styles.tabButtonTextInactive]}>
              Log In
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, mode === "register" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => switchMode("register")}
            testID="auth-tab-register"
          >
            <Text style={[styles.tabButtonText, mode === "register" ? styles.tabButtonTextActive : styles.tabButtonTextInactive]}>
              Sign Up
            </Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inlineSwitchRow}>
            <Text style={styles.inlineSwitchText}>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            </Text>
            <Pressable
              onPress={() => switchMode(mode === "login" ? "register" : "login")}
              testID={mode === "login" ? "login-register-link" : "register-login-link"}
            >
              <Text style={styles.inlineSwitchLink}>{mode === "login" ? "Create one." : "Log In."}</Text>
            </Pressable>
          </View>

          {authNotice ? (
            <View
              style={[
                styles.noticeContainer,
                authNotice.tone === "success" ? styles.noticeContainerSuccess : styles.noticeContainerError,
              ]}
              testID="auth-inline-error"
            >
              <Text style={styles.noticeText}>{authNotice.message}</Text>
            </View>
          ) : null}

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} />
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setAuthNotice(null);
                  }}
                  editable={!loading}
                  autoCapitalize="words"
                  testID="name-input"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.onSurfaceTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setAuthNotice(null);
                }}
                editable={!loading}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="email-input"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.input}
                placeholder={mode === "login" ? "Enter password" : "Create password"}
                placeholderTextColor={colors.onSurfaceTertiary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setAuthNotice(null);
                }}
                secureTextEntry={!showPassword}
                editable={!loading}
                testID="password-input"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            </View>
            {mode === "register" && <Text style={styles.helperText}>At least 6 characters</Text>}
          </View>

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setAuthNotice(null);
                  }}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  testID="confirm-password-input"
                />
              </View>
            </View>
          )}

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={mode === "login" ? handleLogin : handleRegister}
            disabled={loading}
            testID="submit-button"
          >
            {loading ? (
              <ActivityIndicator color={colors.onSurface} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === "login" ? "Log In" : "Sign Up"}</Text>
            )}
          </Pressable>

          {mode === "login" && (
            <Pressable onPress={handleForgotPassword} disabled={loading} testID="forgot-password-button">
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </Pressable>
          )}
        </View>

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
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.onSurface,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 6,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: colors.brand,
  },
  tabButtonInactive: {
    backgroundColor: colors.surfaceTertiary,
  },
  tabButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
  },
  tabButtonTextActive: {
    color: colors.onSurface,
  },
  tabButtonTextInactive: {
    color: colors.onSurfaceTertiary,
  },
  formCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  inlineSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  inlineSwitchText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurfaceTertiary,
  },
  inlineSwitchLink: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.brand,
    textDecorationLine: "underline",
  },
  noticeContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noticeContainerError: {
    backgroundColor: "rgba(176, 82, 36, 0.35)",
    borderColor: "rgba(224, 122, 47, 0.45)",
  },
  noticeContainerSuccess: {
    backgroundColor: "rgba(86, 168, 120, 0.22)",
    borderColor: "rgba(122, 214, 158, 0.4)",
  },
  noticeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurface,
    textAlign: "center",
  },
  methodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: "rgba(224, 122, 47, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  methodContent: {
    flex: 1,
  },
  methodTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  methodDesc: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xs,
  },
  inputGroup: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  helperText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
  },
  submitButton: {
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: 56,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  forgotText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.brand,
    textAlign: "center",
    marginTop: spacing.md,
    textDecorationLine: "underline",
  },
  footerRow: {
    marginTop: spacing.xl,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  footerLinkText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    textDecorationLine: "underline",
  },
});
