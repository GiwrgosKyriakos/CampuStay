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
import { AUTH, LOGIN, REGISTER } from "@/constants/testIds";
import { t } from "@/src/locales";

type Mode = "login" | "register";
type NoticeTone = "error" | "success";

type AuthNotice = {
  tone: NoticeTone;
  message: string;
};

function mapFirebaseAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-email":
      return t("auth.errors.invalidEmail");
    case "auth/invalid-credential":
      return t("auth.errors.invalidCredential");
    case "auth/email-already-in-use":
      return t("auth.errors.emailInUse");
    case "auth/weak-password":
      return t("auth.errors.weakPassword");
    default:
      return t("auth.errors.unexpected");
  }
}

function mapPasswordResetError(code?: string): string {
  switch (code) {
    case "auth/user-not-found":
      return t("auth.errors.userNotFound");
    case "auth/invalid-email":
      return t("auth.errors.invalidEmail");
    default:
      return t("auth.errors.resetFailed");
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
  const activeFieldIds = mode === "login" ? LOGIN : REGISTER;

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
      setAuthNotice({ tone: "error", message: t("auth.email.fillAllFields") });
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
      setAuthNotice({ tone: "error", message: t("auth.email.fillAllFields") });
      return;
    }

    if (password !== confirmPassword) {
      setAuthNotice({ tone: "error", message: t("auth.email.passwordsDoNotMatch") });
      return;
    }

    if (password.length < 6) {
      setAuthNotice({ tone: "error", message: t("auth.errors.weakPassword") });
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
        message: t("auth.email.passwordResetIntro"),
      });
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setAuthNotice({
        tone: "success",
        message: t("auth.email.passwordResetSent"),
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
        <Pressable onPress={handleBack} testID={AUTH.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("auth.email.header")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>{t("auth.email.subtitle")}</Text>

        <View style={styles.tabBar} testID={AUTH.modeTabs}>
          <Pressable
            style={[styles.tabButton, mode === "login" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => switchMode("login")}
            testID={AUTH.loginTab}
          >
            <Text style={[styles.tabButtonText, mode === "login" ? styles.tabButtonTextActive : styles.tabButtonTextInactive]}>
              {t("auth.email.logIn")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, mode === "register" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => switchMode("register")}
            testID={AUTH.registerTab}
          >
            <Text style={[styles.tabButtonText, mode === "register" ? styles.tabButtonTextActive : styles.tabButtonTextInactive]}>
              {t("auth.email.signUp")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inlineSwitchRow}>
            <Text style={styles.inlineSwitchText}>
              {mode === "login" ? t("auth.email.noAccount") : t("auth.email.alreadyHaveAccount")}
            </Text>
            <Pressable
              onPress={() => switchMode(mode === "login" ? "register" : "login")}
              testID={mode === "login" ? LOGIN.registerLink : REGISTER.loginLink}
            >
              <Text style={styles.inlineSwitchLink}>{mode === "login" ? t("auth.email.createOne") : t("auth.email.logIn")}</Text>
            </Pressable>
          </View>

          {authNotice ? (
            <View
              style={[
                styles.noticeContainer,
                authNotice.tone === "success" ? styles.noticeContainerSuccess : styles.noticeContainerError,
              ]}
              testID={AUTH.notice}
            >
              <Text style={styles.noticeText}>{authNotice.message}</Text>
            </View>
          ) : null}

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("auth.email.fullName")}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} />
                <TextInput
                  style={styles.input}
                  placeholder={t("auth.email.fullNamePlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setAuthNotice(null);
                  }}
                  editable={!loading}
                  autoCapitalize="words"
                  testID={REGISTER.nameInput}
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.email.emailAddress")}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.email.emailPlaceholder")}
                placeholderTextColor={colors.onSurfaceTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setAuthNotice(null);
                }}
                editable={!loading}
                autoCapitalize="none"
                keyboardType="email-address"
                testID={activeFieldIds.emailInput}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.email.password")}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} />
              <TextInput
                style={styles.input}
                placeholder={mode === "login" ? t("auth.email.enterPassword") : t("auth.email.createPassword")}
                placeholderTextColor={colors.onSurfaceTertiary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setAuthNotice(null);
                }}
                secureTextEntry={!showPassword}
                editable={!loading}
                testID={activeFieldIds.passwordInput}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            </View>
            {mode === "register" && <Text style={styles.helperText}>{t("auth.email.passwordHelper")}</Text>}
          </View>

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("auth.email.confirmPassword")}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} />
                <TextInput
                  style={styles.input}
                  placeholder={t("auth.email.confirmPasswordPlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setAuthNotice(null);
                  }}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  testID={REGISTER.passwordConfirmInput}
                />
              </View>
            </View>
          )}

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={mode === "login" ? handleLogin : handleRegister}
            disabled={loading}
            testID={activeFieldIds.submitButton}
          >
            {loading ? (
              <ActivityIndicator color={colors.onSurface} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === "login" ? t("auth.email.logIn") : t("auth.email.signUp")}</Text>
            )}
          </Pressable>

          {mode === "login" && (
            <Pressable onPress={handleForgotPassword} disabled={loading} testID={LOGIN.forgotPasswordLink}>
              <Text style={styles.forgotText}>{t("auth.email.forgotPassword")}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{t("auth.email.agreementPrefix")}</Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync("https://giwrgoskyriakos.github.io/CampuStay/terms_of_service.html")} testID="terms-of-service-email-link">
            <Text style={styles.footerLinkText}>{t("auth.email.terms")}</Text>
          </Pressable>
          <Text style={styles.footerText}>{t("auth.email.agreementAnd")}</Text>
          <Pressable onPress={handlePrivacyPolicyPress} testID="privacy-policy-email-link">
            <Text style={styles.footerLinkText}>{t("auth.email.privacy")}</Text>
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
