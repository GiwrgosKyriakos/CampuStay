const CITY_ALIAS_MAP: Record<string, string> = {
  "thessaloniki": "thessaloniki",
  "thessalonica": "thessaloniki",
  "θεσσαλονικη": "thessaloniki",
  "athens": "athens",
  "αθηνα": "athens",
  "patras": "patras",
  "πατρα": "patras",
  "heraklion": "heraklion",
  "ηρακλειο": "heraklion",
  "ioannina": "ioannina",
  "ιωαννινα": "ioannina",
  "larissa": "larissa",
  "λαρισα": "larissa",
  "rethymno": "rethymno",
  "ρεθυμνο": "rethymno",
};

function sanitizeCity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizeCity(value?: string | null): string {
  const sanitized = sanitizeCity(value ?? "");
  if (!sanitized) return "";
  return CITY_ALIAS_MAP[sanitized] ?? sanitized;
}

export function areCitiesEquivalent(a?: string | null, b?: string | null): boolean {
  const left = normalizeCity(a);
  const right = normalizeCity(b);
  if (!left || !right) return false;
  return left === right;
}
