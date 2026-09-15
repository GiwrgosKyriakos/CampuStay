export const CITY_CANONICAL_MAP: Record<string, string> = {
  thessaloniki: "thessaloniki",
  thessalonica: "thessaloniki",
  salonica: "thessaloniki",
  θεσσαλονικη: "thessaloniki",
  athens: "athens",
  athina: "athens",
  αθηνα: "athens",
  patra: "patras",
  patras: "patras",
  patrai: "patras",
  πατρα: "patras",
  heraklion: "heraklion",
  heraklio: "heraklion",
  iraklio: "heraklion",
  ηρακλειο: "heraklion",
  larissa: "larissa",
  larisa: "larissa",
  λαρισα: "larissa",
  ioannina: "ioannina",
  yannena: "ioannina",
  ιωαννινα: "ioannina",
  chania: "chania",
  hαnia: "chania",
  χανια: "chania",
  rethymno: "rethymno",
  rethimno: "rethymno",
  ρεθυμνο: "rethymno",
};

export function normalizeCityKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function toCanonicalCity(value?: string | null): string {
  if (!value) return "";
  const normalized = normalizeCityKey(value);
  return CITY_CANONICAL_MAP[normalized] || normalized;
}

export function areCanonicalCitiesEquivalent(left?: string | null, right?: string | null): boolean {
  const leftKey = toCanonicalCity(left);
  const rightKey = toCanonicalCity(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
