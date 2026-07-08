import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { colors } from "@/src/theme";
import { AuthProvider, useAuth } from "@/src/context/auth";
import { LocaleProvider } from "@/src/context/locale";

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
  const segments = useSegments();
  const router = useRouter();
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
    }
  }, [appReady]);

  useEffect(() => {
    // Αν ακόμα φορτώνουν τα fonts ή το auth state από το Firebase, περιμένουμε
    if (!authReady) return;

    // Βοηθητικές μεταβλητές για να ξέρουμε σε ποιο "γκρουπ" σελίδων βρίσκεται ο χρήστης τώρα
    const inTabs = topSegment === "(tabs)";
    const inEditProfile = topSegment === "edit-profile";

    if (isUnauthenticated) {
      // Σενάριο 1: Δεν είναι συνδεδεμένος και δεν είναι guest -> Πάει στην Auth οθόνη
      if (!isAuthRoute) {
        router.replace("/auth-landing");
      }
    } else if (auth.isLoggedIn) {
      // Σενάριο 2: Είναι κανονικά συνδεδεμένος (Mail, Google, Τηλέφωνο)
      if (auth.needsProfileSetup) {
        // Πρέπει να φτιάξει προφίλ για πρώτη φορά -> Πάει στο edit-profile
        if (!inEditProfile) {
          router.replace("/edit-profile");
        }
      } else {
        // Έχει έτοιμο προφίλ -> Πάει στην αρχική (Roommates)
        if (!inTabs) {
          router.replace("/(tabs)/roommates");
        }
      }
    } else if (auth.isGuestMode) {
      // Σενάριο 3: Συνεχίζει ως Guest -> Πάει κατευθείαν στην αρχική (Roommates)
      if (!inTabs) {
        router.replace("/(tabs)/roommates");
      }
    }
  }, [authReady, isUnauthenticated, isAuthRoute, topSegment, auth.isLoggedIn, auth.isGuestMode, auth.needsProfileSetup, router]);
  
  if (!fontsReady || !authReady) {
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
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    SplashScreen.preventAutoHideAsync()
      .then(() => {
        console.log("[App] Splash screen preventAutoHideAsync called");
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
