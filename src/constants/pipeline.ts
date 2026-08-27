export type PipelineStageKey =
  | "new_lead"
  | "showing_scheduled"
  | "offer_made"
  | "showing_planned"
  | "showing_completed"
  | "offer"
  | "negotiation_agreement"
  | "closed_won"
  | "closed_lost";

export type LossReasonKey =
  | "high_price"
  | "loan_rejected"
  | "chose_another_property"
  | "owner_withdrew"
  | "other";

export interface BrokerStagnationSettings {
  stagnationAlertsEnabled: boolean;
  stagnationAlertStartTime: string;
  stagnationAlertIntervalMinutes: number;
}

export const DEFAULT_BROKER_STAGNATION_SETTINGS: BrokerStagnationSettings = {
  stagnationAlertsEnabled: true,
  stagnationAlertStartTime: "11:00",
  stagnationAlertIntervalMinutes: 10,
};

export interface PipelineStageConfig {
  key: PipelineStageKey;
  label: string;
  shortLabel: string;
  probability: number;
  badgeColor?: string;
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { key: "new_lead", label: "Νέο Lead / Like", shortLabel: "Lead", probability: 0.1 },
  { key: "showing_scheduled", label: "Προγραμματισμένη υπόδειξη", shortLabel: "Υπόδειξη (Προγρ.)", probability: 0.4 },
  { key: "offer_made", label: "Πρόταση τιμής", shortLabel: "Πρόταση τιμής", probability: 0.6 },
  { key: "showing_planned", label: "Υπόδειξη (Showing) Προγραμματισμός", shortLabel: "Υπόδειξη (Προγρ.)", probability: 0.25 },
  { key: "showing_completed", label: "Υπόδειξη (Showing) Πραγματοποίηση", shortLabel: "Υπόδειξη (Ολοκλ.)", probability: 0.4 },
  { key: "offer", label: "Προσφορά (Offer)", shortLabel: "Προσφορά", probability: 0.6 },
  { key: "negotiation_agreement", label: "Διαπραγμάτευση / Προσύμφωνο (Έλεγχος τίτλων, προκαταβολή)", shortLabel: "Προσύμφωνο", probability: 0.9 },
  { key: "closed_won", label: "Συμβόλαιο (Closed Won: Ολοκλήρωση μεταβίβασης / ενοικίασης)", shortLabel: "Συμβόλαιο", probability: 1 },
  { key: "closed_lost", label: "Απόρριψη (Closed Lost)", shortLabel: "Απόρριψη", probability: 0 },
];

export function getPipelineStageConfig(key?: unknown): PipelineStageConfig {
  return PIPELINE_STAGES.find((stage) => stage.key === key) ?? PIPELINE_STAGES[0];
}

export interface BrokerClientProfileDoc {
  pipelineStage: PipelineStageKey;
  stageUpdatedAt: number;
  dealCommission?: number;
  lossReason?: LossReasonKey;
  lossCustomReason?: string;
  lossApartmentId?: string;
  lossApartmentTitle?: string;
  lossReportedAt?: number;
  cashOnHand?: number | null;
  approvedMortgage?: number | null;
  moveInDeadline?: string;
  purchasePurpose?: string;
  updatedAt: number;
  brokerId?: string;
  clientUserId?: string;
  clientName?: string;
  chatRoomId?: string;
}