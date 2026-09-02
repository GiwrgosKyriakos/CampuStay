export interface DynamicDealStageInput {
  isLead: boolean;
  hasVisitRequest: boolean;
  isVisitCompleted: boolean;
  hasPriceProposal: boolean;
  isUnderNegotiation: boolean;
  isDealClosed: boolean;
  proposalTimestamp?: number;
  visitCompletedTimestamp?: number;
}

export interface DynamicDealStage {
  stageLabel: string;
  stagePercent: number;
}

export function calculateDynamicDealStage(deal: DynamicDealStageInput): DynamicDealStage {
  if (deal.isDealClosed) return { stageLabel: "Ολοκληρωμένη Συμφωνία", stagePercent: 100 };
  if (deal.isUnderNegotiation) return { stageLabel: "Προσύμφωνο", stagePercent: 90 };

  const proposalFirst = deal.hasPriceProposal && (
    !deal.isVisitCompleted || (
      typeof deal.proposalTimestamp === "number" &&
      typeof deal.visitCompletedTimestamp === "number" &&
      deal.proposalTimestamp < deal.visitCompletedTimestamp
    )
  );

  if (proposalFirst) {
    if (deal.isVisitCompleted) return { stageLabel: "Πραγματοποίηση Υπόδειξης", stagePercent: 65 };
    return { stageLabel: "Υποβολή Πρότασης Τιμής", stagePercent: 35 };
  }

  if (deal.hasPriceProposal) return { stageLabel: "Υποβολή Πρότασης Τιμής", stagePercent: 65 };
  if (deal.isVisitCompleted) return { stageLabel: "Πραγματοποίηση Υπόδειξης", stagePercent: 35 };
  if (deal.hasVisitRequest) return { stageLabel: "Αίτημα Επίσκεψης", stagePercent: 20 };
  return { stageLabel: "Νέο Lead", stagePercent: deal.isLead ? 10 : 0 };
}
