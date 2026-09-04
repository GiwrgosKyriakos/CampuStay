import { getFirestore, FieldValue, type DocumentData } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { type StandardLeadSource, type AnalyticsEventType } from "../lib/analyticsEvents";
import { getAgencyPipelineConfig, getProbabilityForStage } from "../lib/pipelineConfig";

const SOURCES: StandardLeadSource[] = ["spitogatos", "xe_gr", "meta_ads", "google_ads", "agency_website", "referral", "walk_in", "signboard", "other"];
const EVENT_TYPES: AnalyticsEventType[] = ["listing_view", "lead_inquiry", "showing_conducted", "offer_submitted", "deal_stage_changed", "deal_closed", "deal_lost"];
const LOST_REASONS = ["price_dispute", "legal_defect", "competitor_won", "buyer_withdrew", "owner_cancelled", "financial_issue"] as const;

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds)) return candidate.seconds * 1000;
  }
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dealForecastValue(deal: DocumentData, config: Awaited<ReturnType<typeof getAgencyPipelineConfig>>): number {
  const stage = stringValue(deal.pipelineStage || deal.status).toLowerCase();
  if (["closed", "closed_won", "deal_closed", "lost", "closed_lost", "cancelled", "canceled"].includes(stage)) return 0;
  const dealValue = numberValue(deal.dealValue ?? deal.dealAmount ?? deal.totalDealAmount);
  const rawRateValue = typeof deal.commissionRate === "number" ? deal.commissionRate : typeof deal.commissionPercent === "number" ? deal.commissionPercent : undefined;
  const commissionRate = rawRateValue === undefined ? 0 : rawRateValue > 1 ? rawRateValue / 100 : rawRateValue;
  const commission = dealValue > 0 && rawRateValue !== undefined ? dealValue * commissionRate : numberValue(deal.commissionTotal ?? deal.expectedCommission ?? deal.calculatedCommission ?? deal.dealCommission);
  const stageByPercent = numberValue(deal.stage ?? deal.stagePercent);
  const stageKey = stage || (stageByPercent >= 90 ? "negotiation_agreement" : stageByPercent >= 65 ? "offer_made" : stageByPercent >= 35 ? "showing_completed" : "new_lead");
  return Math.max(0, commission) * getProbabilityForStage(stageKey, config);
}

function sourceValue(value: unknown): StandardLeadSource {
  const source = stringValue(value).toLowerCase().replace(/[ -]/g, "_");
  const legacyMap: Record<string, StandardLeadSource> = { xe: "xe_gr", social_ads: "meta_ads", google: "google_ads", website: "agency_website", open_house: "other", openhouse: "other", yard_sign: "signboard" };
  const normalized = legacyMap[source] ?? source;
  return SOURCES.includes(normalized as StandardLeadSource) ? normalized as StandardLeadSource : "other";
}

function lostReasonValue(value: unknown): string {
  return LOST_REASONS.includes(stringValue(value) as typeof LOST_REASONS[number]) ? stringValue(value) : "other";
}

function periodDefinitions(now: Date): { id: string; start: number; end: number }[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const monthId = `${year}-${String(month + 1).padStart(2, "0")}`;
  return [
    { id: monthId, start: Date.UTC(year, month, 1), end: now.getTime() },
    { id: `${year}-Q${Math.floor(month / 3) + 1}`, start: Date.UTC(year, quarterStartMonth, 1), end: now.getTime() },
    { id: String(year), start: Date.UTC(year, 0, 1), end: now.getTime() },
    { id: "all", start: 0, end: now.getTime() },
  ];
}

function isInPeriod(timestamp: number, period: { start: number; end: number }): boolean {
  return timestamp > 0 && timestamp >= period.start && timestamp <= period.end;
}

function expectedCloseAt(deal: DocumentData, now: number): number {
  return toMillis(deal.expectedCloseAt ?? deal.expectedClosingDate ?? deal.targetCloseDate ?? deal.estimatedClosingDate) || now + 60 * 86_400_000;
}

function isActiveListing(data: DocumentData): boolean {
  return !["withdrawn", "rented", "sold", "closed_deal", "closed"].includes(stringValue(data.status).toLowerCase());
}

function eventKey(event: DocumentData): string {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
  return stringValue(metadata.dealId) || `${stringValue(event.leadId)}|${stringValue(event.listingId)}|${stringValue(event.brokerId)}`;
}

function metadataNumber(event: DocumentData, key: string): number {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
  return numberValue(metadata[key]);
}

function periodKey(timestamp: number, granularity: "month" | "quarter" | "year"): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  if (granularity === "year") return String(year);
  if (granularity === "quarter") return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRevenueSeries(events: DocumentData[], granularity: "month" | "quarter" | "year"): Record<string, DocumentData> {
  const result: Record<string, DocumentData> = {};
  events.filter((event) => event.eventType === "deal_closed").forEach((event) => {
    const timestamp = numberValue(event.timestamp);
    if (!timestamp) return;
    const key = periodKey(timestamp, granularity);
    const point = result[key] ?? { grossCommission: 0, saleCommission: 0, rentCommission: 0, agencyRetainedShare: 0, brokerSplitPayouts: 0 };
    const amount = Math.max(0, numberValue(event.amount));
    const agencyRetainedShare = metadataNumber(event, "agencyRetainedShare");
    point.grossCommission += amount;
    point.agencyRetainedShare += agencyRetainedShare;
    point.brokerSplitPayouts += Math.max(0, metadataNumber(event, "brokerSplitPayouts"));
    if (event.transactionType === "sale") point.saleCommission += amount;
    else point.rentCommission += amount;
    result[key] = point;
  });
  return result;
}

function buildFunnelAnalytics(funnel: { views: number; inquiries: number; showings: number; offers: number; closedDeals: number }): DocumentData {
  const steps = [funnel.views, funnel.inquiries, funnel.showings, funnel.offers, funnel.closedDeals];
  const rates = steps.slice(0, -1).map((step, index) => step > 0 ? Math.round(steps[index + 1] / step * 10000) / 100 : 0);
  const dropOffs = steps.slice(0, -1).map((step, index) => Math.max(0, step - steps[index + 1]));
  const frictionIndex = rates.reduce((lowestIndex, rate, index) => rate < rates[lowestIndex] ? index : lowestIndex, 0);
  return {
    viewsToInquiriesRate: rates[0], inquiriesToShowingsRate: rates[1], showingsToOffersRate: rates[2], offersToClosedRate: rates[3],
    viewsToInquiriesDropOff: dropOffs[0], inquiriesToShowingsDropOff: dropOffs[1], showingsToOffersDropOff: dropOffs[2], offersToClosedDropOff: dropOffs[3],
    frictionStage: ["views_to_inquiries", "inquiries_to_showings", "showings_to_offers", "offers_to_closed"][frictionIndex],
  };
}

function buildAgentMetrics(users: Array<{ id: string; data: DocumentData }>, apartments: DocumentData[], appointments: DocumentData[], allEvents: DocumentData[], period: { start: number; end: number }): DocumentData[] {
  return users.filter(({ data }) => data.is_broker === true).map(({ id, data }) => {
    const events = allEvents.filter((event) => isInPeriod(numberValue(event.timestamp), period) && event.brokerId === id);
    const closedEvents = events.filter((event) => event.eventType === "deal_closed");
    const negotiatedKeys = new Set(events.filter((event) => event.eventType === "offer_submitted" || event.eventType === "deal_closed" || event.eventType === "deal_lost" || (event.eventType === "deal_stage_changed" && numberValue(event.stageTo) >= 90)).map(eventKey));
    const velocity = closedEvents.map((closedEvent) => {
      const key = eventKey(closedEvent);
      const start = allEvents.filter((event) => eventKey(event) === key && numberValue(event.timestamp) <= numberValue(closedEvent.timestamp)).reduce((earliest, event) => Math.min(earliest, numberValue(event.timestamp) || earliest), numberValue(closedEvent.timestamp));
      return Math.max(0, (numberValue(closedEvent.timestamp) - start) / 86_400_000);
    }).filter((days) => days > 0);
    const assignedIds = apartments.filter((apartment) => isActiveListing(apartment) && Array.isArray(apartment.assignedBrokerIds) && apartment.assignedBrokerIds.includes(id));
    const newListings = apartments.filter((apartment) => Array.isArray(apartment.assignedBrokerIds) && apartment.assignedBrokerIds.includes(id) && isInPeriod(toMillis(apartment.publishedAt ?? apartment.createdAt), period)).length;
    const scheduledShowings = appointments.filter((appointment) => stringValue(appointment.brokerId || appointment.coveringBrokerId) === id && appointment.status === "confirmed" && isInPeriod(toMillis(appointment.appointmentDate), period)).length;
    return {
      brokerId: id,
      brokerName: stringValue(data.name) || "Συνεργάτης",
      activeListingsCount: assignedIds.length,
      showingsCount: events.filter((event) => event.eventType === "showing_conducted").length,
      callsCount: 0,
      scheduledShowingsCount: scheduledShowings,
      newListingsCount: newListings,
      dealsClosedCount: closedEvents.length,
      winRate: negotiatedKeys.size > 0 ? Math.round(closedEvents.length / negotiatedKeys.size * 10000) / 100 : 0,
      avgClosingTimeDays: velocity.length ? Math.round(velocity.reduce((sum, days) => sum + days, 0) / velocity.length * 100) / 100 : 0,
    };
  }).sort((first, second) => second.winRate - first.winRate || second.dealsClosedCount - first.dealsClosedCount);
}

function averageDomByAreaAndCategory(apartments: DocumentData[], period: { start: number; end: number }): Record<string, number> {
  const totals = new Map<string, { days: number; count: number }>();
  apartments.forEach((apartment) => {
    const publishedAt = toMillis(apartment.publishedAt);
    if (!publishedAt || publishedAt > period.end) return;
    const closedAt = toMillis(apartment.closedAt ?? apartment.rentedAt ?? apartment.statusChangeDate ?? apartment.statusChangedAt);
    if (!isActiveListing(apartment) && !isInPeriod(closedAt, period)) return;
    const end = isActiveListing(apartment) ? period.end : closedAt;
    const days = Math.max(0, (end - publishedAt) / 86_400_000);
    const area = stringValue(apartment.area || apartment.municipality || apartment.city) || "unknown";
    const category = stringValue(apartment.propertyCategory || apartment.propertyType) || "unknown";
    const transactionType = apartment.transactionType === "sale" || apartment.transactionType === "rent" ? apartment.transactionType : "unknown";
    const key = `${area}|${category}|${transactionType}`;
    const current = totals.get(key) ?? { days: 0, count: 0 };
    current.days += days;
    current.count += 1;
    totals.set(key, current);
  });
  return Object.fromEntries([...totals.entries()].map(([key, value]) => [key, Math.round(value.days / value.count * 100) / 100]));
}

async function aggregateAgency(agencyId: string, now: Date): Promise<void> {
  const db = getFirestore();
  const [eventsSnapshot, spendsSnapshot, apartmentsSnapshot, usersSnapshot, appointmentsSnapshot, settlementsSnapshot, dealsSnapshot, leadsSnapshot] = await Promise.all([
    db.collection("analytics_events").where("agencyId", "==", agencyId).get(),
    db.collection("agencies").doc(agencyId).collection("campaign_spends").get(),
    db.collection("apartments").where("agencyId", "==", agencyId).get(),
    db.collection("users").where("agencyId", "==", agencyId).get(),
    db.collection("appointments").where("agencyId", "==", agencyId).get(),
    db.collection(`agencies/${agencyId}/commission_settlements`).get(),
    db.collection("deals").where("agencyId", "==", agencyId).get(),
    db.collection("leads").where("agencyId", "==", agencyId).get(),
  ]);
  const pipelineConfig = await getAgencyPipelineConfig(agencyId);
  const events = eventsSnapshot.docs.map((document) => document.data()).filter((event) => EVENT_TYPES.includes(event.eventType as AnalyticsEventType));
  const spends = spendsSnapshot.docs.map((document) => document.data());
  const apartments = apartmentsSnapshot.docs.map((document) => document.data());
  const users = usersSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
  const appointments = appointmentsSnapshot.docs.map((document) => document.data());
  const settlements = settlementsSnapshot.docs.map((document) => document.data());
  const deals = dealsSnapshot.docs.map((document) => document.data());
  const leadsById = new Map(leadsSnapshot.docs.map((document) => [document.id, document.data()]));

  await Promise.all(periodDefinitions(now).map(async (period) => {
    const periodEvents = events.filter((event) => isInPeriod(numberValue(event.timestamp), period));
    const funnel = {
      views: periodEvents.filter((event) => event.eventType === "listing_view").length,
      inquiries: periodEvents.filter((event) => event.eventType === "lead_inquiry").length,
      showings: periodEvents.filter((event) => event.eventType === "showing_conducted").length,
      offers: periodEvents.filter((event) => event.eventType === "offer_submitted").length,
      closedDeals: periodEvents.filter((event) => event.eventType === "deal_closed").length,
      lostDeals: periodEvents.filter((event) => event.eventType === "deal_lost").length,
    };
    const leadSource = (event: DocumentData): StandardLeadSource => sourceValue(event.source ?? leadsById.get(stringValue(event.leadId))?.source ?? leadsById.get(stringValue(event.leadId))?.leadSource);
    const leadCountsBySource = Object.fromEntries(SOURCES.map((source) => [source, periodEvents.filter((event) => event.eventType === "lead_inquiry" && leadSource(event) === source).length])) as Record<StandardLeadSource, number>;
    const attributedRevenueBySource = Object.fromEntries(SOURCES.map((source) => [source, periodEvents.filter((event) => event.eventType === "deal_closed" && leadSource(event) === source).reduce((sum, event) => sum + Math.max(0, numberValue(event.amount)), 0)])) as Record<StandardLeadSource, number>;
    const campaignSpendBySource = Object.fromEntries(SOURCES.map((source) => [source, spends.filter((spend) => sourceValue(spend.source) === source && (period.id === "all" || (typeof (spend.month ?? spend.period) === "string" && (spend.month ?? spend.period) >= new Date(period.start).toISOString().slice(0, 7) && (spend.month ?? spend.period) <= new Date(period.end).toISOString().slice(0, 7)))).reduce((sum, spend) => sum + Math.max(0, numberValue(spend.spendAmount ?? spend.spentAmount ?? spend.amount)), 0)])) as Record<StandardLeadSource, number>;
    const roiPercentBySource = Object.fromEntries(SOURCES.map((source) => {
      const spend = campaignSpendBySource[source];
      const revenue = attributedRevenueBySource[source];
      return [source, spend > 0 ? Math.round((revenue - spend) / spend * 10000) / 100 : 0];
    })) as Record<StandardLeadSource, number>;
    const domByAreaAndCategory = averageDomByAreaAndCategory(apartments, period);
    const domValues = Object.values(domByAreaAndCategory);
    const lostReasonCounts = Object.fromEntries(LOST_REASONS.map((reason) => [reason, periodEvents.filter((event) => event.eventType === "deal_lost" && lostReasonValue(event.lostReason) === reason).length]));
    const revenueByMonth = buildRevenueSeries(events, "month");
    const revenueByQuarter = buildRevenueSeries(events, "quarter");
    const revenueByYear = buildRevenueSeries(events, "year");
    const agentMetrics = buildAgentMetrics(users, apartments, appointments, events, period);
    const weightedForecastRevenue = deals.reduce((sum, deal) => sum + dealForecastValue(deal, pipelineConfig), 0);
    const weightedForecast = deals.reduce((forecast, deal) => {
      const value = dealForecastValue(deal, pipelineConfig);
      const closeAt = expectedCloseAt(deal, now.getTime());
      if (closeAt <= now.getTime() + 30 * 86_400_000) forecast.next30Days += value;
      if (closeAt <= now.getTime() + 60 * 86_400_000) forecast.next60Days += value;
      return forecast;
    }, { next30Days: 0, next60Days: 0 });
    const negotiatedDeals = deals.filter((deal) => numberValue(deal.stage ?? deal.stagePercent) >= 65 || ["offer", "negotiation", "under_negotiation", "closed", "lost", "cancelled"].includes(stringValue(deal.pipelineStage || deal.status))).length;
    const realizedRevenue = periodEvents.filter((event) => event.eventType === "deal_closed").reduce((sum, event) => sum + Math.max(0, numberValue(event.amount)), 0);
    const settledInPeriod = settlements.filter((settlement) => stringValue(settlement.invoiceStatus || settlement.settlementStatus) === "settled" && isInPeriod(toMillis(settlement.settledAt ?? settlement.updatedAt ?? settlement.createdAt), period));
    const pendingInPeriod = settlements.filter((settlement) => stringValue(settlement.invoiceStatus || settlement.settlementStatus) !== "settled" && isInPeriod(toMillis(settlement.createdAt), period));
    const settlementAccounting = {
      grossCommission: periodEvents.filter((event) => event.eventType === "deal_closed").reduce((sum, event) => sum + Math.max(0, numberValue(event.amount)), 0),
      agencyRetainedShare: periodEvents.filter((event) => event.eventType === "deal_closed").reduce((sum, event) => sum + metadataNumber(event, "agencyRetainedShare"), 0),
      brokerSplitPayouts: periodEvents.filter((event) => event.eventType === "deal_closed").reduce((sum, event) => sum + Math.max(0, metadataNumber(event, "brokerSplitPayouts")), 0),
      pendingInvoices: pendingInPeriod.length,
      settledInvoices: settledInPeriod.length,
    };
    const summary = {
      periodId: period.id,
      periodStart: period.start,
      periodEnd: period.end,
      funnel,
      funnelAnalytics: buildFunnelAnalytics(funnel),
      totalActiveListings: apartments.filter(isActiveListing).length,
      totalViews: funnel.views,
      totalInquiries: funnel.inquiries,
      listingConversionRate: funnel.views > 0 ? Math.round(funnel.inquiries / funnel.views * 10000) / 100 : 0,
      averageDaysOnMarket: domValues.length ? Math.round(domValues.reduce((sum, value) => sum + value, 0) / domValues.length * 100) / 100 : 0,
      averageDomByAreaAndCategory: domByAreaAndCategory,
      leadCountsBySource,
      attributedRevenueBySource,
      attributedDealsBySource: Object.fromEntries(SOURCES.map((source) => [source, periodEvents.filter((event) => event.eventType === "deal_closed" && leadSource(event) === source).length])),
      campaignSpendBySource,
      roiPercentBySource,
      lostReasonCounts,
      realizedRevenue,
      weightedForecastRevenue: Math.round(weightedForecastRevenue * 100) / 100,
      weightedForecast: { next30Days: Math.round(weightedForecast.next30Days * 100) / 100, next60Days: Math.round(weightedForecast.next60Days * 100) / 100 },
      benchmarkMetrics: {
        targetMonthlyRevenue: pipelineConfig.benchmarks.targetMonthlyRevenue,
        revenueAchievementPercent: pipelineConfig.benchmarks.targetMonthlyRevenue > 0 ? Math.round(realizedRevenue / pipelineConfig.benchmarks.targetMonthlyRevenue * 10000) / 100 : 0,
        targetDaysOnMarket: pipelineConfig.benchmarks.targetDaysOnMarket,
        daysOnMarketDelta: Math.round(((domValues.length ? domValues.reduce((sum, value) => sum + value, 0) / domValues.length : 0) - pipelineConfig.benchmarks.targetDaysOnMarket) * 100) / 100,
        targetWinRate: pipelineConfig.benchmarks.targetWinRate,
        actualWinRate: negotiatedDeals > 0 ? Math.round(periodEvents.filter((event) => event.eventType === "deal_closed").length / negotiatedDeals * 10000) / 10000 : 0,
        winRateDelta: negotiatedDeals > 0 ? Math.round((periodEvents.filter((event) => event.eventType === "deal_closed").length / negotiatedDeals - pipelineConfig.benchmarks.targetWinRate) * 10000) / 10000 : -pipelineConfig.benchmarks.targetWinRate,
      },
      agentMetrics,
      revenueByMonth,
      revenueByQuarter,
      revenueByYear,
      settlementAccounting,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.doc(`agencies/${agencyId}/analytics_summaries/${period.id}`).set(summary, { merge: true });
  }));
}

export const aggregateAnalytics = onSchedule("every 1 hours", async () => {
  const snapshot = await getFirestore().collection("users").get();
  const agencyIds = new Set(snapshot.docs.map((document) => stringValue(document.data().agencyId)).filter(Boolean));
  const now = new Date();
  await Promise.all([...agencyIds].map((agencyId) => aggregateAgency(agencyId, now)));
});

export { aggregateAgency };
