export type UnifiedNotificationType =
  | "visit_request"
  | "appointment_proposal"
  | "appointment_accepted"
  | "visit_confirmed"
  | "visit_cancelled"
  | "visit_reminder"
  | "visit_navigation"
  | "post_visit_rating"
  | "high_match"
  | "price_drop"
  | "deal_stage_update"
  | "closed_deal"
  | "broker_registration"
  | "broker_approved"
  | "new_offer"
  | "price_offer"
  | "price_offer_accepted"
  | "document_required"
  | "document_rejected"
  | "document_verified"
  | "notary_ready"
  | "chat_message";

export interface UnifiedNotificationPayload {
  type: UnifiedNotificationType;
  title: string;
  body: string;
  screen: string;
  params: Record<string, any>;
  entityId?: string;
  action?: string;
}
