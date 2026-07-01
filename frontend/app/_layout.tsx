import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
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

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

console.log("[App] Starting app initialization...");

function RootLayoutNavigator() {
  const auth = useAuth();

  useEffect(() => {
    // Handle post-login redirect to edit profile
    if (auth.isLoggedIn && auth.needsProfileSetup) {
      // Use setTimeout to ensure navigation stack is ready
      const timer = setTimeout(() => {
        // Navigation will be handled by the Stack configuration
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [auth.isLoggedIn, auth.needsProfileSetup]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      {/* Auth Stack - shown when user is not logged in and not in guest mode */}
      {auth.isLoading ? (
        <Stack.Screen name="splash" />
      ) : !auth.isLoggedIn && !auth.isGuestMode ? (
        <>
          <Stack.Screen name="auth-landing" />
          <Stack.Screen name="auth-email" />
        </>
      ) : (
        <>
          {/* App Stack - shown when user is logged in or in guest mode */}
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

          {/* Non-tab screens accessible from both auth states */}
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

function RootLayoutContent() {
  const auth = useAuth();
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Bricolage-Bold": require("../assets/fonts/BricolageGrotesque-Bold.ttf"),
    "Bricolage-ExtraBold": require("../assets/fonts/BricolageGrotesque-ExtraBold.ttf"),
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
  });

  const fontsReady = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);
  const authReady = !auth.isLoading;
  const appReady = fontsReady && authReady;

  useEffect(() => {
    console.log("[App] Fonts ready:", fontsReady, "| Auth ready:", authReady, "| App ready:", appReady);
    if (fontsReady && !fontsLoaded && !iconsLoaded && iconsError) {
      console.warn("[App] Icon fonts failed to load, but app will proceed with fallback.");
    }
    if (fontsReady && !fontsLoaded && fontsError) {
      console.warn("[App] Custom fonts failed to load:", fontsError);
    }
  }, [fontsReady, fontsLoaded, iconsLoaded, iconsError, fontsError, authReady, appReady]);

  useEffect(() => {
    if (appReady) {
      console.log("[App] App ready! Hiding splash screen.");
      SplashScreen.hideAsync().catch((err) => {
        console.warn("[App] Failed to hide splash screen:", err);
      });
    }
  }, [appReady]);

  // If fonts aren't ready, show nothing (splash screen still visible)
  if (!fontsReady) {
    console.log("[App] Waiting for fonts to load...");
    return null;
  }

  // Fonts are ready but auth is still loading, show the splash screen through the Router
  // If fonts fail to load, we fall through and render the app anyway (icons will be missing but app works)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <RootLayoutNavigator />
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Bricolage-Bold": require("../assets/fonts/BricolageGrotesque-Bold.ttf"),
    "Bricolage-ExtraBold": require("../assets/fonts/BricolageGrotesque-ExtraBold.ttf"),
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
  });

  const fontsReady = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  // If fonts fail, log error but allow app to continue
  if (fontsError) {
    console.warn("[App] Font loading error (continuing with fallback):", fontsError);
  }
  if (iconsError) {
    console.warn("[App] Icon font error (continuing with fallback):", iconsError);
  }

  // Wait for fonts to load before rendering the app
  if (!fontsReady) {
    console.log("[App] Waiting for fonts to load...");
    return null;
  }

  console.log("[App] Fonts loaded! Rendering app with AuthProvider...");

  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}
