import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { storage } from "@/src/utils/storage";
import { AppLocale, getCurrentLocale, isSupportedLocale, setI18nLocale } from "@/src/locales";

export const LOCALE_STORAGE_KEY = "app_locale";
export const HAS_SELECTED_LANGUAGE_KEY = "has_selected_language";
export const SELECTED_LANGUAGE_KEY = "selected_language";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
  isLanguageReady: boolean;
  hasSelectedInitialLanguage: boolean;
  completeInitialLanguage: () => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    const current = getCurrentLocale();
    return isSupportedLocale(current) ? current : "en";
  });
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const [hasSelectedInitialLanguage, setHasSelectedInitialLanguage] = useState(false);

  useEffect(() => {
    setI18nLocale(locale);
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [storedLocale, storedFlag, selectedLocale] = await Promise.all([
        storage.getItem(LOCALE_STORAGE_KEY, locale),
        storage.getItem(HAS_SELECTED_LANGUAGE_KEY, false),
        storage.getItem(SELECTED_LANGUAGE_KEY, ""),
      ]);
      if (!mounted) return;
      if (typeof storedLocale === "string" && isSupportedLocale(storedLocale)) setLocaleState(storedLocale);
      setHasSelectedInitialLanguage(
        Boolean(storedFlag) ||
          (typeof storedLocale === "string" && isSupportedLocale(storedLocale)) ||
          (typeof selectedLocale === "string" && isSupportedLocale(selectedLocale)),
      );
      setIsLanguageReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, [locale]);

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    await storage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, [locale]);

  const completeInitialLanguage = useCallback(async () => {
    await Promise.all([
      storage.setItem(HAS_SELECTED_LANGUAGE_KEY, true),
      storage.setItem(SELECTED_LANGUAGE_KEY, locale),
    ]);
    setHasSelectedInitialLanguage(true);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, isLanguageReady, hasSelectedInitialLanguage, completeInitialLanguage }),
    [completeInitialLanguage, hasSelectedInitialLanguage, isLanguageReady, locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <React.Fragment key={locale}>{children}</React.Fragment>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}