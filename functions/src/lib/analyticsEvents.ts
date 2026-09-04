import { getFirestore } from "firebase-admin/firestore";

export type AnalyticsEventType =
  | "listing_view"
  | "lead_inquiry"
  | "showing_conducted"
  | "offer_submitted"
  | "deal_stage_changed"
  | "deal_closed"
  | "deal_lost";

export type StandardLeadSource =
  | "spitogatos"
  | "xe_gr"
  | "meta_ads"
  | "google_ads"
  | "agency_website"
  | "referral"
  | "walk_in"
  | "signboard"
  | "other";

export interface AnalyticsEventPayload {
  agencyId: string;
  eventType: AnalyticsEventType;
  timestamp: number;
  listingId?: string;
  leadId?: string;
  brokerId?: string;
  source?: StandardLeadSource;
  transactionType?: "sale" | "rent";
  amount?: number;
  stageFrom?: number;
  stageTo?: number;
  lostReason?: string;
  metadata?: Record<string, unknown>;
}

export async function logAnalyticsEvent(event: AnalyticsEventPayload, idempotencyKey?: string): Promise<string> {
  const eventId = idempotencyKey || `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const reference = getFirestore().doc(`analytics_events/${eventId}`);
  try {
    await reference.create({ id: reference.id, ...event });
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
  return reference.id;
}
