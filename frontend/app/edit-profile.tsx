import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Animated,
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import Dropdown from "@/src/components/Dropdown";
import { GuestModeStickyFooter, GuestModeTopBanner } from "@/src/components/GuestModeLayout";
import { getUserId } from "@/src/utils/userId";
import { getUserProfile, saveUserProfile, UserProfile } from "@/src/api/userProfile";
import { useAuth } from "@/src/context/auth";
import { uploadProfileImageAsync } from "@/src/api/imageUpload";
import { formatMonthYear, t } from "@/src/locales";

const ABOUT_LIMIT = 250;
const STICKY_FOOTER_PADDING = 152;

const MOVE_IN_OPTIONS = (() => {
  const out: string[] = [t("editProfile.options.moveInAsap")];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(formatMonthYear(d));
  }
  return out;
})();

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const scrollRef = useRef<KeyboardAwareScrollView | null>(null);

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
  const [lookingForApartment, setLookingForApartment] = useState(false);
  const [university, setUniversity] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const [cityError, setCityError] = useState(false);
  const guestLocked = auth.isGuest;
  const housingPromptAnim = useRef(new Animated.Value(0)).current;
  const [cityOffsetY, setCityOffsetY] = useState(0);
  const cities = t("editProfile.options.cities") as unknown as string[];
  const universities = t("editProfile.options.universities") as unknown as string[];
  const years = t("editProfile.options.years") as unknown as string[];
  const genders = t("editProfile.options.genders") as unknown as string[];

  useEffect(() => {
    Animated.timing(housingPromptAnim, {
      toValue: hasPlace ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [hasPlace, housingPromptAnim]);

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
      setLookingForApartment(false);
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
            setLookingForApartment(!!p.looking_for_apartment);
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
        quality: 0.5,
      });
      if (!result.canceled) {
        const picked = result.assets
          .map((asset) => asset.uri)
          .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);
        setPhotos((prev) => [...prev, ...picked].slice(0, 3));
        setError(null);
      }
    } catch {
      setError(t("editProfile.errors.photoLibrary"));
    }
  }, [photos.length]);

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const selectHousingOption = useCallback((option: "has_place" | "looking") => {
    if (option === "has_place") {
      setHasPlace(true);
      setLookingForApartment(false);
      return;
    }
    setLookingForApartment(true);
    setHasPlace(false);
  }, []);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (about.length > ABOUT_LIMIT) {
      setError(t("editProfile.errors.aboutTooLong", { limit: ABOUT_LIMIT }));
      return;
    }
    if (!city || !city.trim()) {
      setCityError(true);
      setError(null);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToPosition?.(0, Math.max(0, cityOffsetY - spacing.lg * 2), true);
      });
      return;
    }
    setCityError(false);
    setError(null);
    setSubmitting(true);
    try {
      console.log("[EditProfile] → Saving user profile...");
      const uploadedPhotos = userId
        ? await Promise.all(photos.map((uri, index) => uploadProfileImageAsync(uri, userId, index)))
        : photos.filter((p) => p.trim().length > 0);
      const profile: UserProfile = {
        name: name.trim() || auth.user?.name || "",
        photos: uploadedPhotos.filter((p) => p.trim().length > 0),
        age: age ? parseInt(age, 10) : null,
        about,
        gender,
        city,
        has_place: hasPlace,
        already_have_apartment_to_share: hasPlace,
        looking_for_apartment: lookingForApartment,
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
        await saveUserProfile(userId, profile, { email: auth.user?.email ?? null });
        setPhotos(profile.photos);
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
      setError(t("editProfile.errors.saveFailed"));
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
    lookingForApartment,
    university,
    year,
    budget,
    moveIn,
    userId,
    router,
    auth,
    cityOffsetY,
  ]);

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
        <Text style={styles.headerTitle}>{t("editProfile.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        bottomOffset={120}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + STICKY_FOOTER_PADDING }]}
        showsVerticalScrollIndicator={false}
      >
        {guestLocked && (
          <GuestModeTopBanner
            onPress={() => router.push("/auth-landing")}
            testID="guest-edit-notice"
            buttonTestID="guest-edit-signin-button"
          />
        )}

        {/* SECTION 1: Profile Photos */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="image-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("editProfile.photosTitle")}</Text>
          </View>
          <Text style={styles.subtitle}>{t("editProfile.photosSubtitle")}</Text>

          {guestLocked && (
            <View style={styles.guestAvatarPlaceholder} testID="guest-profile-photo-placeholder">
              <Ionicons name="person" size={48} color={colors.onSurfaceTertiary} />
            </View>
          )}

          {photos.length > 0 && (
            <View style={styles.photoRow}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removePhoto(idx)}
                    disabled={guestLocked}
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
            <Pressable onPress={addPhotos} disabled={guestLocked} testID="add-photos-button">
              <LinearGradient
                colors={[colors.brand, colors.brandSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.gradientBtn, guestLocked && styles.guestReadOnlyControl]}
              >
                <Text style={styles.gradientBtnText}>{t("editProfile.addPhotos")}</Text>
              </LinearGradient>
            </Pressable>
          )}

          <Text style={styles.footnote}>{t("editProfile.photoFootnote")}</Text>

          {permBlocked && (
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()} testID="open-settings-button">
              <Ionicons name="settings-outline" size={16} color={colors.onSurface} />
              <Text style={styles.settingsText}>{t("common.media.photoAccessOffOpenSettings")}</Text>
            </Pressable>
          )}
        </View>

        {/* SECTION 2: Basic Information */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("editProfile.basicTitle")}</Text>
          </View>

          <Text style={styles.label}>{t("editProfile.displayName")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={name}
            onChangeText={setName}
            placeholder={auth.user?.name || t("editProfile.namePlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            editable={!guestLocked}
            testID="name-input"
          />

          <Text style={styles.label}>{t("editProfile.age")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={age}
            onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ""))}
            placeholder={t("editProfile.agePlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            maxLength={2}
            editable={!guestLocked}
            testID="age-input"
          />

          <Text style={styles.label}>{t("editProfile.about")}</Text>
          <TextInput
            style={[styles.input, styles.textArea, guestLocked && styles.guestReadOnlyControl]}
            value={about}
            onChangeText={setAbout}
            placeholder={t("editProfile.aboutPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            maxLength={ABOUT_LIMIT}
            editable={!guestLocked}
            testID="about-input"
          />
          <Text style={styles.counter}>
            {about.length}/{ABOUT_LIMIT}
          </Text>

          <Text style={styles.label}>{t("editProfile.gender")}</Text>
          <View style={styles.radioRow}>
            {genders.map((g) => {
              const active = gender === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.radioPill, active && styles.radioPillActive, guestLocked && styles.guestReadOnlyControl]}
                  onPress={() => setGender(g)}
                  disabled={guestLocked}
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

          <Text style={styles.label}>{t("editProfile.city")}</Text>
          <View
            collapsable={false}
            onLayout={(event) => setCityOffsetY(event.nativeEvent.layout.y)}
            style={guestLocked ? styles.guestReadOnlyControl : undefined}
          >
            <Dropdown
              value={city}
              options={cities}
              placeholder={t("editProfile.cityPlaceholder")}
              onSelect={(nextCity) => {
                setCity(nextCity);
                setCityError(false);
              }}
              testID="city-dropdown"
              disabled={guestLocked}
            />
            {cityError && !guestLocked && (
              <Text style={styles.cityErrorText}>Παρακαλώ επιλέξτε την πόλη σας / Please select your city</Text>
            )}
          </View>

          <Pressable
            style={[styles.checkboxRow, hasPlace && styles.checkboxRowActive, guestLocked && styles.guestReadOnlyControl]}
            onPress={() => selectHousingOption("has_place")}
            testID="has-place-checkbox"
            disabled={guestLocked}
          >
            <View style={[styles.checkbox, hasPlace && styles.checkboxActive]}>
              {hasPlace && <Ionicons name="checkmark" size={16} color={colors.onBrand} />}
            </View>
            <Text style={styles.checkboxText}>{t("editProfile.hasPlace")}</Text>
          </Pressable>

          <Animated.View
            style={[
              styles.housingPromptWrap,
              {
                opacity: housingPromptAnim,
                maxHeight: housingPromptAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 180],
                }),
                transform: [
                  {
                    translateY: housingPromptAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={hasPlace ? "auto" : "none"}
            testID="housing-listing-prompt"
          >
            <Pressable
              style={({ pressed }) => [styles.housingPromptCard, pressed && styles.housingPromptCardPressed]}
              onPress={() => router.push("/create-listing" as any)}
              testID="housing-listing-prompt-button"
            >
              <Text style={styles.housingPromptText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.95}>
                {t("editProfile.housingPrompt")}
              </Text>
            </Pressable>
          </Animated.View>

          <Pressable
            style={[styles.checkboxRow, lookingForApartment && styles.checkboxRowActive, guestLocked && styles.guestReadOnlyControl]}
            onPress={() => selectHousingOption("looking")}
            testID="looking-apartment-checkbox"
            disabled={guestLocked}
          >
            <View style={[styles.checkbox, lookingForApartment && styles.checkboxActive]}>
              {lookingForApartment && <Ionicons name="checkmark" size={16} color={colors.onBrand} />}
            </View>
            <Text style={styles.checkboxText}>{t("editProfile.lookingForApartment")}</Text>
          </Pressable>
        </View>

        {/* SECTION 3: Education & Living */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="book-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("editProfile.educationTitle")}</Text>
          </View>

          <Text style={styles.label}>{t("editProfile.university")}</Text>
          <View style={guestLocked ? styles.guestReadOnlyControl : undefined}>
            <Dropdown
              value={university}
              options={universities}
              placeholder={t("editProfile.universityPlaceholder")}
              onSelect={setUniversity}
              disabled={guestLocked}
              testID="university-dropdown"
            />
          </View>

          <Text style={styles.label}>{t("editProfile.year")}</Text>
          <View style={guestLocked ? styles.guestReadOnlyControl : undefined}>
            <Dropdown value={year} options={years} placeholder={t("editProfile.yearPlaceholder")} onSelect={setYear} disabled={guestLocked} testID="year-dropdown" />
          </View>

          <Text style={styles.label}>{t("editProfile.budget", { currency: "€" })}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={budget}
            onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ""))}
            placeholder={t("editProfile.budgetPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad"
            maxLength={5}
            editable={!guestLocked}
            testID="budget-input"
          />

          <Text style={styles.label}>{t("editProfile.moveIn")}</Text>
          <View style={guestLocked ? styles.guestReadOnlyControl : undefined}>
            <Dropdown
              value={moveIn}
              options={MOVE_IN_OPTIONS}
              placeholder={t("editProfile.moveInPlaceholder")}
              onSelect={setMoveIn}
              disabled={guestLocked}
              testID="movein-dropdown"
            />
          </View>
        </View>

        {/* SECTION 4: Social Media */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="link-outline" size={22} color={colors.onSurface} />
            <Text style={styles.cardTitle}>{t("editProfile.socialTitle")}</Text>
          </View>
          <Text style={styles.subtitle}>{t("editProfile.socialSubtitle")}</Text>

          <Text style={styles.label}>{t("editProfile.instagram")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={instagram}
            onChangeText={setInstagram}
            placeholder={t("editProfile.instagramPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            editable={!guestLocked}
            testID="instagram-input"
          />

          <Text style={styles.label}>{t("editProfile.facebook")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={facebook}
            onChangeText={setFacebook}
            placeholder={t("editProfile.facebookPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            keyboardType="url"
            editable={!guestLocked}
            testID="facebook-input"
          />

          <Text style={styles.label}>{t("editProfile.linkedin")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={linkedin}
            onChangeText={setLinkedin}
            placeholder={t("editProfile.linkedinPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            keyboardType="url"
            editable={!guestLocked}
            testID="linkedin-input"
          />

          <Text style={styles.label}>{t("editProfile.twitter")}</Text>
          <TextInput
            style={[styles.input, guestLocked && styles.guestReadOnlyControl]}
            value={twitter}
            onChangeText={setTwitter}
            placeholder={t("editProfile.twitterPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            editable={!guestLocked}
            testID="twitter-input"
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={styles.infoText}>{t("editProfile.socialInfo")}</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky footer */}
      {guestLocked ? (
        <GuestModeStickyFooter
          onPress={() => router.push("/auth-landing")}
          bottomInset={insets.bottom}
          buttonTestID="guest-edit-footer-button"
        />
      ) : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}> 
          {error && (
            <View style={styles.errorBanner} testID="form-error-banner">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
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
                <Text style={styles.submitText}>{t("common.cta.completeProfile")}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      )}
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
  cityErrorText: {
    marginTop: spacing.xs,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.brand,
  },
  guestReadOnlyControl: { opacity: 0.45 },
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
  guestAvatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
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
  housingPromptWrap: {
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  housingPromptCard: {
    backgroundColor: "#FF8A1E",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  housingPromptCardPressed: {
    opacity: 0.88,
  },
  housingPromptText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.onBrand,
    lineHeight: 20,
    textAlign: "center",
  },
  infoBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: "rgba(17,17,17,0.9)",
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
