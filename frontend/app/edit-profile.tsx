import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import Dropdown from "@/src/components/Dropdown";
import { getUserId } from "@/src/utils/userId";
import { getUserProfile, saveUserProfile, UserProfile } from "@/src/api/userProfile";
import { useAuth } from "@/src/context/auth";

const CITIES = ["Thessaloniki", "Athens", "Patras", "Heraklion", "Ioannina", "Larissa", "Rethymno"];
const UNIVERSITIES = [
  "Aristotle University of Thessaloniki",
  "National Technical University of Athens",
  "National & Kapodistrian University of Athens",
  "University of Patras",
  "University of Crete",
  "University of Ioannina",
  "University of Macedonia",
];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Master/PhD"];
const GENDERS = ["Male", "Female", "Prefer Not To Say"];
const ABOUT_LIMIT = 250;

const MOVE_IN_OPTIONS = (() => {
  const out: string[] = ["As soon as possible"];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(d.toLocaleString("en-US", { month: "long", year: "numeric" }));
  }
  return out;
})();

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permBlocked, setPermBlocked] = useState(false);

  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [about, setAbout] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [hasPlace, setHasPlace] = useState(false);
  const [university, setUniversity] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const guestLocked = auth.isGuest;

  useEffect(() => {
    if (guestLocked) {
      setUserId(null);
      setName("");
      setPhotos([]);
      setAge("");
      setAbout("");
      setGender(null);
      setCity(null);
      setHasPlace(false);
      setUniversity(null);
      setYear(null);
      setBudget("");
      setMoveIn(null);
      setInstagram("");
      setFacebook("");
      setLinkedin("");
      setTwitter("");
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const id = await getUserId();
        const p = await getUserProfile(id);
        if (mounted) {
          setUserId(id);
          if (p) {
            setName(p.name ?? auth.user?.name ?? "");
            setPhotos(p.photos ?? []);
            setAge(p.age != null ? String(p.age) : "");
            setAbout(p.about ?? "");
            setGender(p.gender ?? null);
            setCity(p.city ?? null);
            setHasPlace(!!p.has_place);
            setUniversity(p.university ?? null);
            setYear(p.year_of_study ?? null);
            setBudget(p.budget != null ? String(p.budget) : "");
            setMoveIn(p.move_in ?? null);
            setInstagram(p.instagram ?? "");
            setFacebook(p.facebook ?? "");
            setLinkedin(p.linkedin ?? "");
            setTwitter(p.twitter ?? "");
          }
        }
      } catch {
        // start fresh on failure
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [auth.user?.name, guestLocked]);

  const addPhotos = useCallback(async () => {
    if (photos.length >= 3) return;
    setPermBlocked(false);
    try {
      if (Platform.OS !== "web") {
        const current = await ImagePicker.getMediaLibraryPermissionsAsync();
        let status = current.status;
        if (status !== "granted") {
          if (current.canAskAgain) {
            const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
            status = req.status;
          }
        }
        if (status !== "granted") {
          setPermBlocked(true);
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 3 - photos.length,
        base64: true,
        quality: 0.5,
      });
      if (!result.canceled) {
        const picked = result.assets
          .filter((a) => a.base64)
          .map((a) => `data:image/jpeg;base64,${a.base64}`);
        setPhotos((prev) => [...prev, ...picked].slice(0, 3));
        setError(null);
      }
    } catch {
      setError("Could not open the photo library. Please try again.");
    }
  }, [photos.length]);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (photos.length < 1) {
      setError("Please upload at least 1 photo.");
      return;
    }
    if (about.length > ABOUT_LIMIT) {
      setError(`About You must be ${ABOUT_LIMIT} characters or less.`);
      return;
    }
    const hasSocial = [instagram, facebook, linkedin, twitter].some((s) => s.trim().length > 0);
    if (!hasSocial) {
      setError("Please add at least 1 social media link.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      console.log("[EditProfile] → Saving user profile...");
      const profile: UserProfile = {
        name: name.trim() || auth.user?.name || "",
        photos,
        age: age ? parseInt(age, 10) : null,
        about,
        gender,
        city,
        has_place: hasPlace,
        university,
        year_of_study: year,
        budget: budget ? parseInt(budget, 10) : null,
        move_in: moveIn,
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        linkedin: linkedin.trim(),
        twitter: twitter.trim(),
      };
      if (userId) {
        console.log(`[EditProfile] → Calling saveUserProfile for user: ${userId.substring(0, 8)}...`);
        await saveUserProfile(userId, profile);
        console.log("[EditProfile] ✓ Profile saved successfully");
      }
      
      // Clear profile setup flag if this was a post-login flow
      if (auth.needsProfileSetup) {
        console.log("[EditProfile] → Clearing profile setup flag");
        auth.clearProfileSetup();
        console.log("[EditProfile] ✓ Profile setup flag cleared");
        console.log("[EditProfile] → Navigating to roommates...");
        router.replace("/(tabs)/roommates");
      } else {
        console.log("[EditProfile] → Returning to previous screen...");
        router.back();
      }
    } catch (err) {
      console.error("[EditProfile] ✗ Error saving profile:", err);
      setError("Failed to save your profile. Please try again.");
      setSubmitting(false);
    }
  }, [
    submitting,
    name,
    photos,
    about,
    instagram,
    facebook,
    linkedin,
    twitter,
    age,
    gender,
    city,
    hasPlace,
    university,
    year,
    budget,
    moveIn,
    userId,
    router,
    auth,
  ]);

  const photosError = !!error && photos.length < 1;
  const socialError =
    !!error && ![instagram, facebook, linkedin, twitter].some((s) => s.trim().length > 0);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]} testID="edit-profile-screen">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="edit-profile-screen">
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          style={[styles.iconBtn, auth.needsProfileSetup && styles.iconBtnDisabled]}
          onPress={() => {
            if (!auth.needsProfileSetup) {
              router.back();
            }
          }}
          disabled={auth.needsProfileSetup}
          testID="edit-back-button"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete Your Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        bottomOffset={120}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {guestLocked && (
          <View style={styles.guestNotice} testID="guest-edit-notice">
            <View style={{ flex: 1 }}>
              <Text style={styles.guestNoticeTitle}>Sign up first</Text>
              <Text style={styles.guestNoticeText}>
                Guest Mode keeps this screen read-only. Sign in to edit your profile, upload photos, and save changes.
              </Text>
            </View>
            <Pressable style={styles.guestNoticeButton} onPress={() => router.push("/auth-landing")} testID="guest-edit-signin-button">
              <Text style={styles.guestNoticeButtonText}>Sign Up / Log In</Text>
            </Pressable>
          </View>
        )}

        {/* SECTION 1: Profile Photos */}
        <View style={[styles.card, guestLocked && styles.cardLocked]} pointerEvents={guestLocked ? "none" : "auto"}>
          <View style={styles.cardHeader}>
            <Ionicons name="image-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>Profile Photos</Text>
          </View>
          <Text style={styles.subtitle}>Upload Photos * (1-3 photos)</Text>

          {photos.length > 0 && (
            <View style={styles.photoRow}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removePhoto(idx)}
                    testID={`remove-photo-${idx}`}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={14} color={colors.onSurfaceInverse} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {photos.length < 3 && (
            <Pressable onPress={addPhotos} testID="add-photos-button">
              <LinearGradient
                colors={[colors.brand, colors.brandSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBtn}
              >
                <Text style={styles.gradientBtnText}>✨ Add Photos</Text>
              </LinearGradient>
            </Pressable>
          )}

          <Text style={[styles.footnote, photosError && styles.footnoteError]}>
            At least 1 photo is required
          </Text>

          {permBlocked && (
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="open-settings-button">
              <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
              <Text style={styles.settingsText}>Photo access is off — Open Settings</Text>
            </Pressable>
          )}
        </View>

        {/* SECTION 2: Basic Information */}
        <View style={[styles.card, guestLocked && styles.cardLocked]} pointerEvents={guestLocked ? "none" : "auto"}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>Basic Information</Text>
          </View>

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={auth.user?.name || "Your name"}
            placeholderTextColor={colors.onSurfaceTertiary}
            editable={!guestLocked}
            testID="name-input"
          />

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 22"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            maxLength={2}
            editable={!guestLocked}
            testID="age-input"
          />

          <Text style={styles.label}>About You</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={about}
            onChangeText={setAbout}
            placeholder="Tell us about yourself, your interests, and what you're looking for in a roommate."
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            maxLength={ABOUT_LIMIT}
            editable={!guestLocked}
            testID="about-input"
          />
          <Text style={styles.counter}>
            {about.length}/{ABOUT_LIMIT}
          </Text>

          <Text style={styles.label}>Gender</Text>
          <View style={styles.radioRow}>
            {GENDERS.map((g) => {
              const active = gender === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.radioPill, active && styles.radioPillActive]}
                  onPress={() => setGender(g)}
                  testID={`gender-${g}`}
                >
                  <View style={[styles.radioDot, active && styles.radioDotActive]}>
                    {active && <View style={styles.radioDotInner} />}
                  </View>
                  <Text style={[styles.radioText, active && styles.radioTextActive]}>{g}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>City</Text>
          <Dropdown value={city} options={CITIES} placeholder="Select your city" onSelect={setCity} testID="city-dropdown" disabled={guestLocked} />

          <Pressable
            style={[styles.checkboxRow, hasPlace && styles.checkboxRowActive]}
            onPress={() => setHasPlace((v) => !v)}
            testID="has-place-checkbox"
            disabled={guestLocked}
          >
            <View style={[styles.checkbox, hasPlace && styles.checkboxActive]}>
              {hasPlace && <Ionicons name="checkmark" size={16} color={colors.onBrand} />}
            </View>
            <Text style={styles.checkboxText}>I have a house/apartment to share 🏠</Text>
          </Pressable>
        </View>

        {/* SECTION 3: Education & Living */}
        <View style={[styles.card, guestLocked && styles.cardLocked]} pointerEvents={guestLocked ? "none" : "auto"}>
          <View style={styles.cardHeader}>
            <Ionicons name="book-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>Education & Living</Text>
          </View>

          <Text style={styles.label}>University</Text>
          <Dropdown
            value={university}
            options={UNIVERSITIES}
            placeholder="Select your university"
            onSelect={setUniversity}
            disabled={guestLocked}
            testID="university-dropdown"
          />

          <Text style={styles.label}>Year of Study</Text>
          <Dropdown value={year} options={YEARS} placeholder="Select your year" onSelect={setYear} disabled={guestLocked} testID="year-dropdown" />

          <Text style={styles.label}>Monthly Budget (€)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 600"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            maxLength={5}
            editable={!guestLocked}
            testID="budget-input"
          />

          <Text style={styles.label}>Preferred Move-in Date</Text>
          <Dropdown
            value={moveIn}
            options={MOVE_IN_OPTIONS}
            placeholder="Select move-in date"
            onSelect={setMoveIn}
            disabled={guestLocked}
            testID="movein-dropdown"
          />
        </View>

        {/* SECTION 4: Social Media */}
        <View style={[styles.card, guestLocked && styles.cardLocked]} pointerEvents={guestLocked ? "none" : "auto"}>
          <View style={styles.cardHeader}>
            <Ionicons name="link-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>Social Media</Text>
          </View>
          <Text style={[styles.subtitle, socialError && styles.footnoteError]}>At least 1 link is required</Text>

          <Text style={styles.label}>Instagram Username</Text>
          <TextInput
            style={styles.input}
            value={instagram}
            onChangeText={setInstagram}
            placeholder="your_instagram"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            editable={!guestLocked}
            testID="instagram-input"
          />

          <Text style={styles.label}>Facebook Profile</Text>
          <TextInput
            style={styles.input}
            value={facebook}
            onChangeText={setFacebook}
            placeholder="https://facebook.com/yourprofile"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            keyboardType="url"
            editable={!guestLocked}
            testID="facebook-input"
          />

          <Text style={styles.label}>LinkedIn Profile</Text>
          <TextInput
            style={styles.input}
            value={linkedin}
            onChangeText={setLinkedin}
            placeholder="https://linkedin.com/in/yourprofile"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            keyboardType="url"
            editable={!guestLocked}
            testID="linkedin-input"
          />

          <Text style={styles.label}>Twitter/X Username</Text>
          <TextInput
            style={styles.input}
            value={twitter}
            onChangeText={setTwitter}
            placeholder="your_twitter"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            editable={!guestLocked}
            testID="twitter-input"
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={styles.infoText}>
              Social media profiles help potential roommates get to know you better. You can always update or
              remove these later in your profile settings.
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky footer */}
      <KeyboardStickyView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {error && (
            <View style={styles.errorBanner} testID="form-error-banner">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {guestLocked ? (
            <Pressable onPress={() => router.push("/auth-landing")} testID="guest-edit-footer-button">
              <LinearGradient
                colors={[colors.brand, colors.brandSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                <Text style={styles.submitText}>Sign Up / Log In</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={submit} disabled={submitting} testID="complete-profile-button">
              <LinearGradient
                colors={[colors.brand, colors.brandSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <Text style={styles.submitText}>✨ Complete Profile ✨</Text>
                )}
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },
  headerTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLocked: { opacity: 0.5 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  label: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.onSurface,
  },
  textArea: { minHeight: 110, textAlignVertical: "top", paddingTop: spacing.md },
  counter: {
    alignSelf: "flex-end",
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onSurfaceTertiary,
    marginTop: 4,
  },
  photoRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  photoThumb: { width: 90, height: 90, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  photoImg: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(26,26,26,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  gradientBtnText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  footnoteError: { color: colors.error, fontFamily: fonts.semibold },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignSelf: "flex-start",
  },
  settingsText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  radioRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  radioPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radioPillActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.onSurfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDotActive: { borderColor: colors.onBrandTertiary },
  radioDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onBrandTertiary },
  radioText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  radioTextActive: { color: colors.onBrandTertiary },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkboxRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.onSurfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkboxText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  infoBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  guestNotice: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  guestNoticeTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onSurface },
  guestNoticeText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 4, lineHeight: 18 },
  guestNoticeButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  guestNoticeButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255,23,68,0.1)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.error },
  submitBtn: { borderRadius: radius.pill, paddingVertical: spacing.lg, alignItems: "center", justifyContent: "center" },
  submitText: { fontFamily: fonts.displayExtra, fontSize: fontSize.lg, color: colors.onBrand },
});
