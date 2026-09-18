import type { ListingPhotoItem } from "@/src/types/apartment";

export function calculateGridSlotCount(currentCount: number, minSlots: number = 3, maxSlots: number = 15): number {
  if (currentCount >= maxSlots) return maxSlots;
  return Math.min(maxSlots, Math.max(minSlots, currentCount + 1));
}

export function normalizeListingPhotoItems(value: unknown): ListingPhotoItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index): ListingPhotoItem | null => {
      if (typeof entry === "string" && entry.trim().length > 0) {
        return {
          id: `photo-${index}-${entry}`,
          url: entry.trim(),
          orderIndex: index,
        };
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const raw = entry as { id?: unknown; url?: unknown; caption?: unknown; orderIndex?: unknown };
      if (typeof raw.url !== "string" || raw.url.trim().length === 0) return null;

      return {
        id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : `photo-${index}-${raw.url}`,
        url: raw.url.trim(),
        caption: typeof raw.caption === "string" && raw.caption.trim().length > 0 ? raw.caption.trim() : null,
        orderIndex: typeof raw.orderIndex === "number" && Number.isFinite(raw.orderIndex) ? Math.trunc(raw.orderIndex) : index,
      };
    })
    .filter((entry): entry is ListingPhotoItem => entry !== null)
    .map((entry, index) => ({ ...entry, orderIndex: index }));
}

export function photoItemsToUrls(items: readonly ListingPhotoItem[]): string[] {
  return items.map((item) => item.url).filter((url) => url.trim().length > 0);
}

export function photoItemsToCaptionMap(items: readonly ListingPhotoItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((captions, item) => {
    const caption = item.caption?.trim();
    if (caption) captions[item.id] = caption;
    return captions;
  }, {});
}

export function applyPhotoCaptions(items: readonly ListingPhotoItem[], captions: Record<string, string> | undefined): ListingPhotoItem[] {
  return items.map((item) => ({
    ...item,
    caption: item.caption?.trim() || captions?.[item.id]?.trim() || captions?.[item.url]?.trim() || null,
  }));
}

export function reindexListingPhotoItems(items: readonly ListingPhotoItem[]): ListingPhotoItem[] {
  return items.map((item, index) => ({ ...item, orderIndex: index }));
}
