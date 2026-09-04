import { collection, doc, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import type { AnalyticsEvent } from "@/src/types/analytics";

export async function logAnalyticsEvent(event: Omit<AnalyticsEvent, "id">): Promise<string> {
  if (!event.agencyId.trim()) throw new Error("agencyId is required for analytics events.");
  if (!Number.isFinite(event.timestamp)) throw new Error("timestamp is required for analytics events.");
  const reference = doc(collection(db, "analytics_events"));
  await setDoc(reference, { id: reference.id, ...event });
  return reference.id;
}

export function recordListingView(params: { agencyId: string; listingId: string; viewerId?: string }): Promise<string> {
  return logAnalyticsEvent({
    agencyId: params.agencyId,
    eventType: "listing_view",
    timestamp: Date.now(),
    listingId: params.listingId,
    metadata: params.viewerId ? { viewerId: params.viewerId } : undefined,
  });
}