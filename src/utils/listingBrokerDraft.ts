import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ListingBrokerDraft } from "@/src/types/listingBroker";

const memoryDrafts = new Map<string, ListingBrokerDraft>();
const STORAGE_PREFIX = "listing-broker-draft:";

export function getListingBrokerDraft(key: string): ListingBrokerDraft | null {
  return memoryDrafts.get(key) ?? null;
}

export function saveListingBrokerDraft(key: string, draft: ListingBrokerDraft): void {
  memoryDrafts.set(key, draft);
  void AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(draft)).catch(() => undefined);
}

export async function hydrateListingBrokerDraft(key: string): Promise<ListingBrokerDraft | null> {
  const inMemory = memoryDrafts.get(key);
  if (inMemory) return inMemory;

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const draft = parsed as ListingBrokerDraft;
    memoryDrafts.set(key, draft);
    return draft;
  } catch {
    return null;
  }
}
