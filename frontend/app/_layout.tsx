import { Stack } from "expo-router";
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

// Disable logbox errors so the app startup logs remain visible.
LogBox.ignoreAllLogs(true);

function AppNavigator() {
  const auth = useAuth();

  useEffect(() => {
    if (auth.isLoggedIn && auth.needsProfileSetup) {
      const timer = setTimeout(() => {
        console.log("[App] 🔄 Profile setup required, preserving stack navigation.");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [auth.isLoggedIn, auth.needsProfileSetup]);

  // Log route transitions
  useEffect(() => {
    if (auth.isLoading) {
      console.log("[App] 📊 Route: SPLASH (loading)");
    } else if (!auth.isLoggedIn && !auth.isGuestMode) {
      console.log("[App] 📊 Route: AUTH (login/register)");
    } else if (auth.isLoggedIn && auth.needsProfileSetup) {
      console.log("[App] 📊 Route: EDIT_PROFILE (setup required)");
    } else if (auth.isLoggedIn) {
      console.log("[App] 📊 Route: MAIN_TABS (home)");
    } else if (auth.isGuestMode) {
      console.log("[App] 📊 Route: MAIN_TABS (guest mode)");
    }
  }, [auth.isLoading, auth.isLoggedIn, auth.isGuestMode, auth.needsProfileSetup]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      {auth.isLoading ? (
        <Stack.Screen name="splash" />
      ) : !auth.isLoggedIn && !auth.isGuestMode ? (
        <>
          <Stack.Screen name="auth-landing" />
          <Stack.Screen name="auth-email" />
        </>
      ) : (
        <>
          {auth.isLoggedIn && auth.needsProfileSetup ? (
            <Stack.Screen
              name="edit-profile"
              options={{
                gestureEnabled: false,
                headerLeft: () => null,
              }}
            />
          ) : (
            <Stack.Screen name="(tabs)" />
          )}

          <Stack.Screen name="auth-landing" />
          <Stack.Screen name="auth-email" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="roomie-profile" />
          <Stack.Screen name="delete-account" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="privacy-safety" />
          <Stack.Screen name="help-support" />
          <Stack.Screen name="chat/[id]" />
        </>
      )}
    </Stack>
  );
}

function AppContent() {
  const auth = useAuth();
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

  if (!fontsReady || !authReady) {
    console.log("[App] Waiting for app readiness...", { fontsReady, authReady });
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
