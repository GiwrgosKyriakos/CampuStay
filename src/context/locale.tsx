import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { storage } from "@/src/utils/storage";
import { AppLocale, getCurrentLocale, isSupportedLocale, setI18nLocale } from "@/src/locales";

const LOCALE_STORAGE_KEY = "app_locale";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(getCurrentLocale());

  useEffect(() => {
    setI18nLocale(locale);
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const stored = await storage.getItem(LOCALE_STORAGE_KEY, locale);
      if (!mounted || typeof stored !== "string" || !isSupportedLocale(stored)) return;
      setLocaleState(stored);
    })();

    return () => {
      mounted = false;
    };
  }, [locale]);

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    await storage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

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