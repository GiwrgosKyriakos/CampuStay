import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { darkColors, lightColors, type ThemeColors } from "@/src/theme";

const THEME_MODE_STORAGE_KEY = "@campustay_theme_mode";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  colors: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const storedMode = await AsyncStorage.getItem(THEME_MODE_STORAGE_KEY);
        if (!mounted || !isThemeMode(storedMode)) return;
        setThemeModeState(storedMode);
      } catch (error) {
        console.warn("[Theme] Failed to read persisted theme mode:", error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.warn("[Theme] Failed to persist theme mode:", error);
    }
  }, []);

  const isDark = themeMode === "system" ? deviceColorScheme === "dark" : themeMode === "dark";
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, themeMode, setThemeMode, isDark }),
    [colors, themeMode, setThemeMode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
