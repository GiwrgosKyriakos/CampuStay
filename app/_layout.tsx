import * as Notifications from "expo-notifications";
import { Stack, useRootNavigationState, useRouter, useSegments, type Href } from "expo-router";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogBox, Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import type { ThemeColors } from "@/src/theme";
import { AuthProvider, useAuth } from "@/src/context/auth";
import { LocaleProvider, useLocale } from "@/src/context/locale";
import { ThemeProvider, useTheme } from "@/src/context/ThemeContext";
import { TourProvider } from "@/src/context/TourContext";
import { TourSpotlightOverlay } from "@/src/components/tour/TourSpotlightOverlay";
import { getRoleHomeTab } from "@/src/utils/roles";
import type { RoleHomeTab } from "@/src/utils/roles";
import { configureNotificationChannels, handleNotificationResponse, registerFcmTokenForUser, registerNotificationCategories } from "@/src/services/notifications";
import BrandedAuthLoader from "@/src/components/BrandedAuthLoader";

LogBox.ignoreAllLogs(true);

type AuthRoute = "/auth-landing" | "/edit-profile" | "/(tabs)/roommates" | `/(tabs)/${RoleHomeTab}`;
type NavigationRoute = AuthRoute | "/language-select";

function AppNavigator({ surfaceColor }: { surfaceColor: string }) {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: surfaceColor } }} />;
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const { isLanguageReady, hasSelectedInitialLanguage } = useLocale();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const pendingRouteRef = useRef<NavigationRoute | null>(null);
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
  const appReady = fontsReady && authReady && isLanguageReady;
  const topSegment = (segments[0] ?? "") as string;
  const isAuthRoute = ["auth-landing", "auth-email", "privacy-policy", "agency-onboarding", "language-select"].includes(topSegment);
  const isUnauthenticated = auth.user === null && !auth.isGuest;
  const isAuthenticated = auth.isLoggedIn;
  const defaultHomeRoute = `/(tabs)/${getRoleHomeTab(auth)}` as `/(tabs)/${RoleHomeTab}`;
  const shouldForceProfileSetup = isAuthenticated && auth.needsProfileSetup;
  const routeKey = segments.join("/");
  const isIndexRoute = topSegment === "" || topSegment === "index";
  const isAuthEntryRoute = topSegment === "auth-landing" || topSegment === "auth-email";
  const destination: AuthRoute | null = isUnauthenticated && !isAuthRoute
    ? "/auth-landing"
    : auth.isGuest && (isIndexRoute || isAuthEntryRoute)
      ? "/(tabs)/roommates"
      : isAuthenticated && shouldForceProfileSetup && topSegment !== "edit-profile"
        ? "/edit-profile"
        : isAuthenticated && (isIndexRoute || isAuthEntryRoute)
          ? (shouldForceProfileSetup ? "/edit-profile" : defaultHomeRoute)
          : null;
  const destinationKey = destination?.slice(1) ?? null;

  useEffect(() => {
    if (!auth.userId || auth.isGuest) return;
    void registerFcmTokenForUser(auth.userId).catch((error) => console.warn("[Notifications] Token registration failed:", error));
  }, [auth.isGuest, auth.userId]);

  useEffect(() => {
    void Promise.all([registerNotificationCategories(), configureNotificationChannels()]).catch((error) => console.warn("[Notifications] Native setup failed:", error));
  }, []);

  useEffect(() => {
    if (fontsError) console.warn("[App] Custom font error:", fontsError);
    if (iconsError) console.warn("[App] Icon font error:", iconsError);
  }, [fontsError, iconsError]);

  useEffect(() => {
    if (!appReady) return;
    void SplashScreen.hideAsync().catch((error) => console.warn("[App] Splash screen hide failed:", error));
    if (Platform.OS === "android") {
      void NavigationBar.setPositionAsync("absolute");
      void NavigationBar.setBackgroundColorAsync("transparent");
      void NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
    }
  }, [appReady, isDark]);

  useEffect(() => {
    if (!appReady || !rootNavigationState?.key) return;
    let active = true;

    if (!hasSelectedInitialLanguage && topSegment !== "language-select") {
      const languageRoute: NavigationRoute = "/language-select";
      if (active && pendingRouteRef.current !== languageRoute) {
        pendingRouteRef.current = languageRoute;
        router.replace(languageRoute as Href);
      }
      return () => {
        active = false;
      };
    }

    if (!hasSelectedInitialLanguage) return;

    if (destination && routeKey !== destinationKey) {
      if (pendingRouteRef.current === destination) return () => {
        active = false;
      };
      pendingRouteRef.current = destination;
      if (active) router.replace(destination);
    } else {
      pendingRouteRef.current = null;
      if (auth.authTransition && destination && routeKey === destinationKey) {
        auth.clearAuthTransition();
      }
    }

    return () => {
      active = false;
    };
  }, [appReady, auth, destination, destinationKey, hasSelectedInitialLanguage, rootNavigationState?.key, routeKey, router, topSegment]);

  const isRedirectingProtectedRoute = Boolean(destination && routeKey !== destinationKey);

  if (!fontsReady || !authReady || !isLanguageReady) {
    return <BrandedAuthLoader style={styles.bootLoaderWrap} transition={auth.authTransition} />;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style={isDark ? "light" : "dark"} />
            <TourProvider>
              <AppNavigator surfaceColor={colors.surface} />
              <TourSpotlightOverlay />
              {isRedirectingProtectedRoute || auth.authTransition ? (
                <BrandedAuthLoader style={styles.routeGateOverlay} transition={auth.authTransition} />
              ) : null}
            </TourProvider>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [splashReady, setSplashReady] = useState(false);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [pendingNotificationResponse, setPendingNotificationResponse] = useState<Notifications.NotificationResponse | null>(null);
  const queuedNotificationKeyRef = useRef<string | null>(null);

  const queueNotificationResponse = (response: Notifications.NotificationResponse) => {
    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (queuedNotificationKeyRef.current === responseKey) return;
    queuedNotificationKeyRef.current = responseKey;
    setPendingNotificationResponse(response);
  };

  useEffect(() => {
    let mounted = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (mounted && response) queueNotificationResponse(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(queueNotificationResponse);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingNotificationResponse || !rootNavigationState?.key) return;
    const response = pendingNotificationResponse;
    setPendingNotificationResponse(null);
    void handleNotificationResponse(response, router).catch((error) => console.warn("[Notifications] Response handling failed:", error));
  }, [pendingNotificationResponse, rootNavigationState?.key, router]);

  useEffect(() => {
    void SplashScreen.preventAutoHideAsync()
      .then(async () => {
        if (Platform.OS === "android") {
          await NavigationBar.setPositionAsync("absolute");
          await NavigationBar.setBackgroundColorAsync("#00000000");
          await NavigationBar.setButtonStyleAsync("light");
        }
        setSplashReady(true);
      })
      .catch((error) => {
        console.warn("[App] preventAutoHideAsync failed:", error);
        setSplashReady(true);
      });
  }, []);

  if (!splashReady) return null;

  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    bootLoaderWrap: { flex: 1, backgroundColor: colors.surface },
    routeGateOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, zIndex: 50 },
  });
}
