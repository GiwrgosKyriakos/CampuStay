import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
//import * as NavigationBar from "expo-navigation-bar";
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
      // NavigationBar.setBackgroundColorAsync("transparent");
      // NavigationBar.setButtonStyleAsync("light");
    }
  }, [appReady]);

  useEffect(() => {
  if (!authReady) return;

  if (isUnauthenticated && !isAuthRoute) {
    router.replace("/auth-landing");
  }
}, [authReady, isUnauthenticated, isAuthRoute, router, segments]);
  
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
