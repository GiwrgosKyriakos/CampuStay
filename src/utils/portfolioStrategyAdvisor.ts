import { t } from "@/src/locales";

export interface StrategyClientInsight {
  clientId: string;
  recommendationType: "PRIORITY_TARGET" | "CROSS_SELL_OPPORTUNITY" | "STANDARD";
  alternativeMatchesCount: number;
  badgeLabel: string;
  advisoryText: string;
}

export interface ClientDealContext {
  clientId: string;
  clientName: string;
  createdAt: number;
  currentApartmentScore: number;
  currentApartmentStagePercent: number;
  portfolioInteractions: {
    apartmentId: string;
    apartmentTitle: string;
    compatibilityScore: number;
    stagePercent: number;
  }[];
}

export const SCORE_THRESHOLD = 85;
export const STAGE_THRESHOLD = 10;
export const MIN_TENURE_MS = 2 * 24 * 60 * 60 * 1000;

export function evaluateCompetingClientsStrategy(
  competingClients: ClientDealContext[],
  currentApartmentId: string,
): Map<string, StrategyClientInsight> {
  const insights = new Map<string, StrategyClientInsight>();
  const eligibleClients = competingClients.filter(
    (client) => client.currentApartmentScore > SCORE_THRESHOLD && client.currentApartmentStagePercent > STAGE_THRESHOLD,
  );

  if (eligibleClients.length < 2) return insights;

  const evaluatedClients = eligibleClients.map((client) => {
    const alternativeViableDeals = client.portfolioInteractions.filter(
      (deal) => deal.apartmentId !== currentApartmentId && deal.compatibilityScore > SCORE_THRESHOLD && deal.stagePercent > STAGE_THRESHOLD,
    );
    return {
      client,
      alternativeViableDeals,
      hasViableAlternatives: alternativeViableDeals.length > 0,
      isTenureMet: Date.now() - (client.createdAt || Date.now()) >= MIN_TENURE_MS,
    };
  });

  const hasConstrainedClient = evaluatedClients.some((item) => !item.hasViableAlternatives && item.isTenureMet);
  const hasFlexibleClient = evaluatedClients.some((item) => item.hasViableAlternatives);
  if (!hasConstrainedClient || !hasFlexibleClient) return insights;

  for (const item of evaluatedClients) {
    const { client, alternativeViableDeals, hasViableAlternatives, isTenureMet } = item;
    if (!hasViableAlternatives && isTenureMet) {
      insights.set(client.clientId, {
        clientId: client.clientId,
        recommendationType: "PRIORITY_TARGET",
        alternativeMatchesCount: 0,
        badgeLabel: t("crm.strategy.priorityBadge"),
        advisoryText: t("crm.strategy.priorityDesc"),
      });
    } else if (hasViableAlternatives) {
      const alternativeTitles = alternativeViableDeals.map((deal) => `«${deal.apartmentTitle}»`).slice(0, 2).join(", ");
      insights.set(client.clientId, {
        clientId: client.clientId,
        recommendationType: "CROSS_SELL_OPPORTUNITY",
        alternativeMatchesCount: alternativeViableDeals.length,
        badgeLabel: t("crm.strategy.crossSellBadge"),
        advisoryText: t("crm.strategy.crossSellDesc", { count: alternativeViableDeals.length, titles: alternativeTitles }),
      });
    }
  }

  return insights;
}
