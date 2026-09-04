import { DEFAULT_AGENCY_CONFIG, type AgencyPipelineConfig } from "./agencyConfig";

export type { AgencyPipelineConfig } from "./agencyConfig";

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
  stagnationAlertIntervalMinutes: 15,
};

export interface PipelineStageConfig {
  key: PipelineStageKey;
  label: string;
  shortLabel: string;
  probability: number;
  badgeColor?: string;
}

export const DEFAULT_AGENCY_PIPELINE_CONFIG = DEFAULT_AGENCY_CONFIG;

export type AgencyPipelineProbabilityStage = string;

export function getPipelineProbabilityStage(key?: unknown): AgencyPipelineProbabilityStage {
  if (key === "showing_scheduled") return "showing_scheduled";
  if (key === "showing_completed" || key === "showing_planned") return "showing_completed";
  if (key === "offer" || key === "offer_made") return "offer_made";
  if (key === "docs_review") return "docs_review";
  if (key === "negotiation_agreement" || key === "preliminary_signed" || key === "preliminary_signed_90") return "preliminary_signed_90";
  if (key === "closed_won" || key === "deal_closed" || key === "contract_completed" || key === "contract_completed_100") return "contract_completed_100";
  return "inquiry";
}

export function getPipelineStageProbability(key?: unknown, config: AgencyPipelineConfig = DEFAULT_AGENCY_PIPELINE_CONFIG): number {
  return config.stageProbabilities[getPipelineProbabilityStage(key)];
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { key: "new_lead", label: "Νέο Lead / Like", shortLabel: "Lead", probability: getPipelineStageProbability("new_lead") },
  { key: "showing_scheduled", label: "Προγραμματισμένη υπόδειξη", shortLabel: "Υπόδειξη (Προγρ.)", probability: getPipelineStageProbability("showing_scheduled") },
  { key: "offer_made", label: "Πρόταση τιμής", shortLabel: "Πρόταση τιμής", probability: getPipelineStageProbability("offer_made") },
  { key: "showing_planned", label: "Υπόδειξη (Showing) Προγραμματισμός", shortLabel: "Υπόδειξη (Προγρ.)", probability: getPipelineStageProbability("showing_planned") },
  { key: "showing_completed", label: "Υπόδειξη (Showing) Πραγματοποίηση", shortLabel: "Υπόδειξη (Ολοκλ.)", probability: getPipelineStageProbability("showing_completed") },
  { key: "offer", label: "Προσφορά (Offer)", shortLabel: "Προσφορά", probability: getPipelineStageProbability("offer") },
  { key: "negotiation_agreement", label: "Διαπραγμάτευση / Προσύμφωνο (Έλεγχος τίτλων, προκαταβολή)", shortLabel: "Προσύμφωνο", probability: getPipelineStageProbability("negotiation_agreement") },
  { key: "closed_won", label: "Συμβόλαιο (Closed Won: Ολοκλήρωση μεταβίβασης / ενοικίασης)", shortLabel: "Συμβόλαιο", probability: getPipelineStageProbability("closed_won") },
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
  clientId?: string;
  clientUserId?: string;
  clientName?: string;
  clientAvatar?: string;
  role?: "client" | "owner";
  chatRoomId?: string;
  createdAt?: unknown;
  apartmentIds?: string[];
}