import {
  areCanonicalCitiesEquivalent,
  toCanonicalCity,
} from "@/src/utils/cityTypes";

export function getCanonicalCity(value?: string | null): string {
  return toCanonicalCity(value);
}

export function normalizeCity(value?: string | null): string {
  return getCanonicalCity(value);
}

export function areCitiesEquivalent(a?: string | null, b?: string | null): boolean {
  return areCanonicalCitiesEquivalent(a, b);
}
