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

export const CANONICAL_DEAL_STAGES = [
  "new_lead",
  "contacted",
  "showing_scheduled",
  "offer_made",
  "under_contract",
  "closed_won",
  "closed_lost",
] as const;

export type CanonicalDealStage = (typeof CANONICAL_DEAL_STAGES)[number];

export interface CanonicalDealStageConfig {
  key: CanonicalDealStage;
  labelKey: string;
  shortLabelKey: string;
  percentage: number;
  probability: number;
}

export const CANONICAL_DEAL_STAGE_CONFIGS: readonly CanonicalDealStageConfig[] = [
  { key: "new_lead", labelKey: "deals.stages.newLead", shortLabelKey: "deals.stages.newLeadShort", percentage: 5, probability: 0.05 },
  { key: "contacted", labelKey: "deals.stages.contacted", shortLabelKey: "deals.stages.contactedShort", percentage: 10, probability: 0.10 },
  { key: "showing_scheduled", labelKey: "deals.stages.showingScheduled", shortLabelKey: "deals.stages.showingScheduledShort", percentage: 35, probability: 0.35 },
  { key: "offer_made", labelKey: "deals.stages.offerMade", shortLabelKey: "deals.stages.offerMadeShort", percentage: 65, probability: 0.65 },
  { key: "under_contract", labelKey: "deals.stages.underContract", shortLabelKey: "deals.stages.underContractShort", percentage: 90, probability: 0.90 },
  { key: "closed_won", labelKey: "deals.stages.closedWon", shortLabelKey: "deals.stages.closedWonShort", percentage: 100, probability: 1 },
  { key: "closed_lost", labelKey: "deals.stages.closedLost", shortLabelKey: "deals.stages.closedLostShort", percentage: 0, probability: 0 },
];

export function normalizeCanonicalDealStage(value: unknown): CanonicalDealStage {
  switch (value) {
    case "contacted":
      return "contacted";
    case "showing_scheduled":
    case "showing_planned":
    case "showing_completed":
      return "showing_scheduled";
    case "offer_made":
    case "offer":
      return "offer_made";
    case "under_contract":
    case "negotiation_agreement":
      return "under_contract";
    case "closed_won":
    case "deal_closed":
      return "closed_won";
    case "closed_lost":
    case "lost":
      return "closed_lost";
    case "new_lead":
    case "liked":
    case "lead":
    default:
      return "new_lead";
  }
}

export function getCanonicalDealStageConfig(stage: unknown): CanonicalDealStageConfig {
  const normalizedStage = normalizeCanonicalDealStage(stage);
  return CANONICAL_DEAL_STAGE_CONFIGS.find((config) => config.key === normalizedStage) ?? CANONICAL_DEAL_STAGE_CONFIGS[0];
}

export function canonicalDealStageFromPercentage(percentage: number, fallback: CanonicalDealStage = "new_lead"): CanonicalDealStage {
  if (percentage >= 100) return "closed_won";
  if (percentage >= 90) return "under_contract";
  if (percentage >= 65) return "offer_made";
  if (percentage >= 35) return "showing_scheduled";
  if (percentage >= 10) return "contacted";
  return fallback;
}

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