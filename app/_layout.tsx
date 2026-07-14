import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect, useState } from "react";
import { Animated, Easing, LogBox, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { colors } from "@/src/theme";
import { AuthProvider, useAuth } from "@/src/context/auth";
import { LocaleProvider, useLocale } from "@/src/context/locale";
import { AppLocale } from "@/src/locales";
import { storage } from "@/src/utils/storage";

const HAS_SELECTED_LANGUAGE_KEY = "has_selected_language";
const SELECTED_LANGUAGE_KEY = "selected_language";

// Disable logbox errors so the app startup logs remain visible.
LogBox.ignoreAllLogs(true);

function AppNavigator() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    />
  );
}

function AppContent() {
  const auth = useAuth();
  const { setLocale } = useLocale();
  const segments = useSegments();
  const router = useRouter();
  const [isLanguagePromptVisible, setIsLanguagePromptVisible] = useState(false);
  const [languagePromptResolved, setLanguagePromptResolved] = useState(false);
  const [isPersistingLanguage, setIsPersistingLanguage] = useState(false);
  const languagePromptOpacity = useState(() => new Animated.Value(0))[0];
  const languagePromptScale = useState(() => new Animated.Value(0.95))[0];
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Bricolage-Bold": require("../assets/fonts/BricolageGrotesque-Bold.ttf"),
    "Bricolage-ExtraBold": require("../assets/fonts/BricolageGrotesque-ExtraBold.ttf"),
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
  });

  const fontsReady = (iconsLoaded || !!iconsError) && (fontsLoaded || !!fontsError);
  const authReady = !auth.isLoading;
  const appReady = fontsReady && authReady;
  const topSegment = segments[0] ?? "";
  const isAuthRoute =
    topSegment === "auth-landing" ||
    topSegment === "auth-email" ||
    topSegment === "privacy-policy";
  const isUnauthenticated = auth.user === null && !auth.isGuest;

  useEffect(() => {
    let mounted = true;

    (async () => {
      const hasSelectedLanguage = await storage.getItem(HAS_SELECTED_LANGUAGE_KEY, false);
      if (!mounted) return;

      if (hasSelectedLanguage) {
        setLanguagePromptResolved(true);
        return;
      }

      setIsLanguagePromptVisible(true);
      setLanguagePromptResolved(true);
      Animated.parallel([
        Animated.timing(languagePromptOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(languagePromptScale, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 4,
          speed: 18,
        }),
      ]).start();
    })();

    return () => {
      mounted = false;
    };
  }, [languagePromptOpacity, languagePromptScale]);

  const handleSelectLanguage = async (nextLocale: AppLocale) => {
    if (isPersistingLanguage) return;
    setIsPersistingLanguage(true);

    await setLocale(nextLocale);
    await Promise.all([
      storage.setItem(HAS_SELECTED_LANGUAGE_KEY, true),
      storage.setItem(SELECTED_LANGUAGE_KEY, nextLocale),
    ]);

    Animated.parallel([
      Animated.timing(languagePromptOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(languagePromptScale, {
        toValue: 0.96,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsLanguagePromptVisible(false);
      setIsPersistingLanguage(false);
    });
  };

  useEffect(() => {
    console.log("[App] Loading fonts and icons...");
    console.log("[App] Fonts loaded:", fontsLoaded, "Icons loaded:", iconsLoaded);
    if (fontsError) console.warn("[App] Custom font error:", fontsError);
    if (iconsError) console.warn("[App] Icon font error:", iconsError);
  }, [fontsLoaded, iconsLoaded, fontsError, iconsError]);

  useEffect(() => {
    console.log("[App] Checking auth state...", {
      isLoading: auth.isLoading,
      isLoggedIn: auth.isLoggedIn,
      isGuestMode: auth.isGuestMode,
      needsProfileSetup: auth.needsProfileSetup,
    });
  }, [auth.isLoading, auth.isLoggedIn, auth.isGuestMode, auth.needsProfileSetup]);

  useEffect(() => {
    if (appReady) {
      console.log("[App] App is ready, hiding splash screen");
      SplashScreen.hideAsync().catch((err) => {
        console.warn("[App] Splash screen hide failed:", err);
      });
      if (Platform.OS === 'android') {
        NavigationBar.setBackgroundColorAsync("transparent");
        NavigationBar.setButtonStyleAsync("light");
      }
    }
  }, [appReady]);

  useEffect(() => {
  if (!authReady) return;

  if (isUnauthenticated && !isAuthRoute) {
    router.replace("/auth-landing");
  }
}, [authReady, isUnauthenticated, isAuthRoute, router, segments]);
  
  if (!fontsReady || !authReady || !languagePromptResolved) {
    console.log("[App] Waiting for app readiness...", { fontsReady, authReady });
    return null;
  }

  if (isUnauthenticated && !isAuthRoute) {
    // Block protected navigator mounting until redirect lands on auth gateway.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <AppNavigator />
            <Modal
              transparent
              animationType="none"
              visible={isLanguagePromptVisible}
              statusBarTranslucent
              onRequestClose={() => {}}
            >
              <View style={styles.languageModalRoot} pointerEvents="box-none">
                <BlurView tint="dark" intensity={42} style={styles.languageModalBlur} />
                <Animated.View
                  style={[
                    styles.languageModalCard,
                    {
                      opacity: languagePromptOpacity,
                      transform: [{ scale: languagePromptScale }],
                    },
                  ]}
                >
                  <Text style={styles.languageModalTitle}>Welcome to CampuStay</Text>
                  <Text style={styles.languageModalTitleGreek}>Καλωσορίσατε στο CampuStay</Text>
                  <Text style={styles.languageModalSubtitle}>
                    Select your preferred language to personalize your app experience.
                  </Text>
                  <Text style={styles.languageModalSubtitleGreek}>
                    Επιλέξτε τη γλώσσα σας για μια εξατομικευμένη εμπειρία εφαρμογής.
                  </Text>

                  <View style={styles.languageButtonRow}>
                    <Pressable
                      style={[styles.languageButton, styles.languageButtonPrimary]}
                      onPress={() => {
                        void handleSelectLanguage("en");
                      }}
                      disabled={isPersistingLanguage}
                      testID="first-launch-language-english"
                    >
                      <Text style={styles.languageButtonPrimaryText}>English</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.languageButton, styles.languageButtonSecondary]}
                      onPress={() => {
                        void handleSelectLanguage("el");
                      }}
                      disabled={isPersistingLanguage}
                      testID="first-launch-language-greek"
                    >
                      <Text style={styles.languageButtonSecondaryText}>Ελληνικά</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              </View>
            </Modal>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [splashReady, setSplashReady] = useState(false);

  //useEffect(() => {
  //  SplashScreen.preventAutoHideAsync()
  //    .then(() => {
  //      console.log("[App] Splash screen preventAutoHideAsync called");
  //      setSplashReady(true);
  //    })
  //    .catch((err) => {
  //      console.warn("[App] preventAutoHideAsync failed:", err);
  //      setSplashReady(true);
  //    });
  //}, []);

  useEffect(() => {
    SplashScreen.preventAutoHideAsync()
      // 1. SOS: Προσθέτουμε το async πριν το () για να μπορούμε να χρησιμοποιήσουμε await
      .then(async () => { 
        console.log("[App] Splash screen preventAutoHideAsync called");
        
        // 2. ΕΔΩ ΜΠΑΙΝΕΙ Η ΡΥΘΜΙΣΗ ΤΗΣ ΜΠΑΡΑΣ ΓΙΑ ANDROID
        if (Platform.OS === 'android') {
          try {
            // Σπρώχνει την εφαρμογή να απλωθεί πίσω από τη μπάρα
            // await NavigationBar.setPositionAsync('absolute');
            // Κάνει τη μπάρα 100% διάφανη
            // await NavigationBar.setBackgroundColorAsync('#ffffffff');
            // Κάνει τα κουμπιά της μπάρας λευκά για να φαίνονται στο σκούρο φόντο σου
            await NavigationBar.setButtonStyleAsync('light');
          } catch (navError) {
            console.warn("[App] NavigationBar setup failed:", navError);
          }
        }

        // 3. Αφού γίνουν όλα, ενημερώνουμε ότι η splash screen είναι έτοιμη
        setSplashReady(true);
      })
      .catch((err) => {
        console.warn("[App] preventAutoHideAsync failed:", err);
        setSplashReady(true);
      });
  }, []);

  if (!splashReady) return null;

  return (
    <LocaleProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LocaleProvider>
  );
}

const styles = StyleSheet.create({
  languageModalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  languageModalBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  languageModalCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    backgroundColor: "rgba(20, 23, 28, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  languageModalTitle: {
    color: colors.onSurface,
    fontSize: 26,
    fontFamily: "Bricolage-ExtraBold",
    textAlign: "center",
  },
  languageModalTitleGreek: {
    marginTop: 6,
    color: colors.onSurface,
    opacity: 0.92,
    fontSize: 21,
    fontFamily: "Bricolage-Bold",
    textAlign: "center",
  },
  languageModalSubtitle: {
    marginTop: 14,
    color: colors.onSurface,
    opacity: 0.92,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Jakarta-Regular",
    textAlign: "center",
  },
  languageModalSubtitleGreek: {
    marginTop: 8,
    color: colors.onSurface,
    opacity: 0.84,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Jakarta-Regular",
    textAlign: "center",
  },
  languageButtonRow: {
    marginTop: 20,
    flexDirection: "row",
    gap: 10,
  },
  languageButton: {
    flex: 1,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  languageButtonPrimary: {
    backgroundColor: colors.brand,
  },
  languageButtonSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  languageButtonPrimaryText: {
    color: colors.onBrand,
    fontSize: 16,
    fontFamily: "Jakarta-Bold",
  },
  languageButtonSecondaryText: {
    color: colors.onSurface,
    fontSize: 16,
    fontFamily: "Jakarta-SemiBold",
  },
});
