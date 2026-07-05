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

import * as WebBrowser from "expo-web-browser";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import { useAuth } from "@/src/context/auth";

type Mode = "initial" | "login" | "register";

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

export default function AuthEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<Mode>("initial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleBack = () => {
    if (mode === "initial") {
      router.back();
    } else {
      setMode("initial");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setAuthError(null);
    }
  };

  const handlePrivacyPolicyPress = () => {
    router.push("/privacy-policy");
  };

  const handleLogin = async () => {
    setAuthError(null);

    if (!email.trim() || !password.trim()) {
      setAuthError("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      await auth.loginEmail(email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setAuthError(null);

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setAuthError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password should be at least 6 characters long.");
      return;
    }

    try {
      setLoading(true);
      await auth.registerEmail(email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      setAuthError(mapFirebaseAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  };

  if (mode === "initial") {
    return (
      <View style={styles.container} testID="auth-email-initial">
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={handleBack} testID="back-button">
            <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Sign In</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.content}>
          <Text style={styles.subtitle}>Choose your preferred method</Text>

          <Pressable
            style={styles.methodButton}
            onPress={() => {
              setAuthError(null);
              setMode("login");
            }}
            testID="email-login-option"
          >
            <View style={styles.methodIcon}>
              <Ionicons name="mail-outline" size={24} color={colors.brand} />
            </View>
            <View style={styles.methodContent}>
              <Text style={styles.methodTitle}>Email Login</Text>
              <Text style={styles.methodDesc}>Sign in with your email and password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>

          <Pressable
            style={styles.methodButton}
            onPress={() => {
              setAuthError(null);
              setMode("register");
            }}
            testID="email-register-option"
          >
            <View style={styles.methodIcon}>
              <Ionicons name="person-add-outline" size={24} color={colors.brand} />
            </View>
            <View style={styles.methodContent}>
              <Text style={styles.methodTitle}>Create Account</Text>
              <Text style={styles.methodDesc}>Register with email and password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top }}
      keyboardShouldPersistTaps="handled"
      testID={`auth-email-${mode}`}
    >
      <View style={styles.header}>
        <Pressable onPress={handleBack} testID="back-button">
          <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{mode === "login" ? "Sign In" : "Create Account"}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          {mode === "login" ? "Enter your credentials" : "Set up your account"}
        </Text>

        {authError ? (
          <View style={styles.errorContainer} testID="auth-inline-error">
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        ) : null}

        {/* Email Input */}
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
                setAuthError(null);
              }}
              editable={!loading}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="email-input"
            />
          </View>
        </View>

        {/* Password Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} />
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setAuthError(null);
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
          {mode === "register" && (
            <Text style={styles.helperText}>At least 6 characters</Text>
          )}
        </View>

        {/* Confirm Password Input (Register Only) */}
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
                  setAuthError(null);
                }}
                secureTextEntry={!showPassword}
                editable={!loading}
                testID="confirm-password-input"
              />
            </View>
          </View>
        )}

        {/* Submit Button */}
        <Pressable
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={mode === "login" ? handleLogin : handleRegister}
          disabled={loading}
          testID="submit-button"
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrand} size="small" />
          ) : (
            <Text style={styles.submitButtonText}>
              {mode === "login" ? "Sign In" : "Create Account"}
            </Text>
          )}
        </Pressable>

        {mode === "login" && (
          <Pressable testID="forgot-password-button">
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        )}

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
    marginBottom: spacing.md,
  },
  errorContainer: {
    borderRadius: 12,
    backgroundColor: "rgba(176, 82, 36, 0.35)",
    borderWidth: 1,
    borderColor: "rgba(224, 122, 47, 0.45)",
    padding: 12,
  },
  errorText: {
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
    marginTop: spacing.lg,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
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
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.onBrand,
  },
  forgotText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.brand,
    textAlign: "center",
    marginTop: spacing.lg,
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
