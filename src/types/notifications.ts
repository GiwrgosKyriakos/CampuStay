export type UnifiedNotificationType =
  | "visit_request"
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
