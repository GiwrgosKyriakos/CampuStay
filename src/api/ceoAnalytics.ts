import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Query,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import {
  calculateCEOAnalyticsSummary,
  normalizeLeadSource,
  normalizeLostDealReason,
  isExecutiveAnalyticsRole,
} from "@/src/utils/analyticsEngine";
import type {
  AnalyticsAgentRecord,
  AnalyticsApartmentRecord,
  AnalyticsDealRecord,
  AnalyticsInteractionRecord,
  AnalyticsLeadRecord,
  AnalyticsRoommateMatchRecord,
  AnalyticsRoommateSeekerRecord,
  CEOAnalyticsDataset,
  CEOAnalyticsSummary,
  AnalyticsTimeWindow,
  LostDealRecord,
  MarketingCampaignSpend,
} from "@/src/types/analytics";

type UserRecord = Record<string, unknown>;

async function safeGetDocs<T = DocumentData>(reference: Query<T>): Promise<T[] | null> {
  try {
    const snapshot = await getDocs(reference);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapUser(id: string, data: UserRecord): AnalyticsAgentRecord {
  return {
    id,
    name: stringValue(data.name) || "Συνεργάτης",
    ...(stringValue(data.photoUrl) ? { photoUrl: stringValue(data.photoUrl) } : {}),
    ...(stringValue(data.avatar) ? { avatar: stringValue(data.avatar) } : {}),
    ...(Array.isArray(data.photos) ? { photos: data.photos.filter((photo): photo is string => typeof photo === "string") } : {}),
    is_broker: data.is_broker === true,
    ...(stringValue(data.agencyRole) ? { agencyRole: stringValue(data.agencyRole) } : {}),
    ...(stringValue(data.role) ? { role: stringValue(data.role) } : {}),
  };
}

function mapApartment(id: string, data: UserRecord): AnalyticsApartmentRecord {
  return {
    id,
    ...data,
    ...(stringValue(data.agencyId) ? { agencyId: stringValue(data.agencyId) } : {}),
    ...(Array.isArray(data.assignedBrokerIds) ? { assignedBrokerIds: data.assignedBrokerIds.filter((brokerId): brokerId is string => typeof brokerId === "string") } : {}),
    ...(numberValue(data.views) !== undefined ? { views: numberValue(data.views) } : {}),
    ...(numberValue(data.viewCount) !== undefined ? { viewCount: numberValue(data.viewCount) } : {}),
    ...(numberValue(data.inquiries) !== undefined ? { inquiries: numberValue(data.inquiries) } : {}),
    ...(numberValue(data.inquiryCount) !== undefined ? { inquiryCount: numberValue(data.inquiryCount) } : {}),
  };
}

function mapDeal(id: string, data: UserRecord, fallbackBrokerId?: string): AnalyticsDealRecord {
  return {
    id,
    ...data,
    ...(fallbackBrokerId ? { brokerId: fallbackBrokerId } : {}),
  };
}

function mapLead(id: string, data: UserRecord): AnalyticsLeadRecord {
  return { id, ...data } as AnalyticsLeadRecord;
}

function mapLostDeal(id: string, data: UserRecord): LostDealRecord | null {
  const lostAt = numberValue(data.lostAt);
  if (!lostAt) return null;
  const dealId = stringValue(data.dealId) || id;
  const apartmentId = stringValue(data.apartmentId);
  const brokerId = stringValue(data.brokerId);
  const clientId = stringValue(data.clientId);
  if (!apartmentId || !brokerId || !clientId) return null;
  return {
    dealId,
    apartmentId,
    ...(stringValue(data.agencyId) ? { agencyId: stringValue(data.agencyId) } : {}),
    brokerId,
    clientId,
    lostAt,
    reason: normalizeLostDealReason(data.reason),
    ...(stringValue(data.notes) ? { notes: stringValue(data.notes) } : {}),
    stageBeforeLoss: numberValue(data.stageBeforeLoss) ?? 0,
    potentialRevenueLoss: numberValue(data.potentialRevenueLoss) ?? numberValue(data.commissionTotal) ?? numberValue(data.dealCommission) ?? 0,
  };
}

function mapCampaignSpend(id: string, data: UserRecord, agencyId: string): MarketingCampaignSpend {
  return {
    id,
    agencyId,
    source: normalizeLeadSource(data.source ?? data.leadSource),
    period: stringValue(data.period),
    spentAmount: numberValue(data.spentAmount) ?? numberValue(data.amount) ?? 0,
  };
}

function mapRoommateSeeker(id: string, data: UserRecord): AnalyticsRoommateSeekerRecord {
  return {
    id,
    area: stringValue(data.area),
    city: stringValue(data.city),
    ...(typeof data.looking_for_roommate === "boolean" ? { looking_for_roommate: data.looking_for_roommate } : {}),
    ...(typeof data.isLookingForRoommate === "boolean" ? { isLookingForRoommate: data.isLookingForRoommate } : {}),
    not_looking_for_roommate: data.not_looking_for_roommate === true,
  };
}

function mapRoommateMatch(id: string, data: UserRecord): AnalyticsRoommateMatchRecord {
  return {
    id,
    ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
    ...(data.matchedAt !== undefined ? { matchedAt: data.matchedAt } : {}),
    ...(typeof data.successful === "boolean" ? { successful: data.successful } : {}),
    ...(stringValue(data.status) ? { status: stringValue(data.status) } : {}),
  };
}

export async function loadCEOAnalyticsDataset(userId: string, agencyIdOverride?: string): Promise<CEOAnalyticsDataset> {
  const userSnapshot = await getDoc(doc(db, "users", userId));
  if (!userSnapshot.exists()) throw new Error("Ο χρήστης δεν βρέθηκε.");
  const userData = userSnapshot.data() as UserRecord;
  const role = stringValue(userData.agencyRole) || stringValue(userData.role);
  if (!isExecutiveAnalyticsRole(role)) throw new Error("Δεν υπάρχει πρόσβαση στις αναφορές.");
  const agencyId = agencyIdOverride?.trim() || stringValue(userData.agencyId);
  if (!agencyId) throw new Error("Δεν βρέθηκε agency για τις αναφορές.");

  const [usersRows, apartmentsRows, topLevelDealsRows, leadsRows, spendRows, lostRows, roommateRows, roommateMatchRows] = await Promise.all([
    safeGetDocs(query(collection(db, "users"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "apartments"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "deals"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "leads"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "campaign_spends"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "lost_deals"), where("agencyId", "==", agencyId))),
    safeGetDocs(query(collection(db, "users"), where("looking_for_roommate", "==", true))),
    safeGetDocs(query(collection(db, "roommateMatches"), where("agencyId", "==", agencyId))),
  ]);

  const userRows = usersRows ?? [];
  const usersById = new Map<string, UserRecord>();
  usersById.set(userId, userData);
  userRows.forEach((row) => {
    const data = row as UserRecord & { id?: string };
    if (typeof data.id === "string") usersById.set(data.id, data);
  });
  const agents = [...usersById.entries()]
    .filter(([, data]) => data.is_broker === true || ["ceo", "secretary", "broker", "member"].includes(stringValue(data.agencyRole) || stringValue(data.role)))
    .map(([id, data]) => mapUser(id, data));

  const apartmentRows = (apartmentsRows ?? []) as (UserRecord & { id: string })[];
  const apartments = apartmentRows.map((row) => mapApartment(row.id, row));
  const nestedDealRows = await Promise.all(agents.map(async (agent) => {
    const profiles = await safeGetDocs(query(collection(db, "brokerClientProfiles"), where("brokerId", "==", agent.id)));
    if (!profiles) return [] as AnalyticsDealRecord[];
    const deals = await Promise.all(profiles.map(async (profile) => {
      const profileData = profile as UserRecord & { id?: string };
      if (!profileData.id) return [] as AnalyticsDealRecord[];
      const rows = await safeGetDocs(collection(db, "brokerClientProfiles", profileData.id, "deals"));
      return (rows ?? []).map((row) => mapDeal(String((row as { id?: string }).id ?? "deal"), row as UserRecord, agent.id));
    }));
    return deals.flat();
  }));
  const topLevelDeals = (topLevelDealsRows ?? []).map((row) => mapDeal(String((row as { id?: string }).id ?? "deal"), row as UserRecord));
  const dealMap = new Map(topLevelDeals.map((deal) => [deal.id, deal]));
  nestedDealRows.flat().forEach((deal) => {
    if (!dealMap.has(deal.id)) dealMap.set(deal.id, deal);
  });

  const interactionRows = await Promise.all(apartments.map(async (apartment) => {
    const rows = await safeGetDocs(collection(db, "apartments", apartment.id, "interactions"));
    return (rows ?? []).map((row) => ({ id: String((row as { id?: string }).id ?? "interaction"), ...(row as UserRecord) } as AnalyticsInteractionRecord));
  }));

  const lostDeals = (lostRows ?? []).map((row) => mapLostDeal(String((row as { id?: string }).id ?? "lost"), row as UserRecord)).filter((row): row is LostDealRecord => row !== null);
  const roommateSeekers = (roommateRows ?? []).map((row) => {
    const typed = row as UserRecord & { id?: string };
    return mapRoommateSeeker(typed.id ?? "seeker", typed);
  }).filter((seeker) => seeker.not_looking_for_roommate !== true);

  return {
    apartments,
    deals: [...dealMap.values()].map((deal) => ({ ...deal, agencyId: deal.agencyId || agencyId })),
    agents,
    leads: (leadsRows ?? []).map((row) => mapLead(String((row as { id?: string }).id ?? "lead"), row as UserRecord)),
    campaignSpends: (spendRows ?? []).map((row) => mapCampaignSpend(String((row as { id?: string }).id ?? "spend"), row as UserRecord, agencyId)),
    lostDeals,
    interactions: interactionRows.flat(),
    roommateSeekers,
    roommateMatches: (roommateMatchRows ?? []).map((row) => mapRoommateMatch(String((row as { id?: string }).id ?? "match"), row as UserRecord)),
  };
}

export async function loadCEOAnalyticsSummary(params: { userId: string; agencyId?: string | null; window?: AnalyticsTimeWindow; now?: number }): Promise<CEOAnalyticsSummary> {
  const dataset = await loadCEOAnalyticsDataset(params.userId, params.agencyId ?? undefined);
  return calculateCEOAnalyticsSummary(dataset, { window: params.window, now: params.now });
}