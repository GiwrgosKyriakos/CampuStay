import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";

import en from "@/src/locales/en.json";
import el from "@/src/locales/el.json";

const i18n = new I18n({ en, el });

export type AppLocale = "en" | "el";

function resolveDeviceLocale(): AppLocale {
  const preferredLocales = getLocales();

  const prefersGreek = preferredLocales.some((locale) => {
    const languageCode = locale.languageCode?.toLowerCase();
    const languageTag = locale.languageTag?.toLowerCase();

    return languageCode === "el" || languageTag?.startsWith("el-") || languageTag === "el";
  });

  return prefersGreek ? "el" : "en";
}

i18n.enableFallback = true;
i18n.defaultLocale = "en";
i18n.locale = resolveDeviceLocale();

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

export function getCurrentLocale(): string {
  return i18n.locale || i18n.defaultLocale || "en";
}

export function isSupportedLocale(value: string): value is AppLocale {
  return value === "en" || value === "el";
}

export function setI18nLocale(locale: AppLocale) {
  i18n.locale = locale;
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: "long",
    year: "numeric",
  }).format(date);
}

export { i18n, resolveDeviceLocale };