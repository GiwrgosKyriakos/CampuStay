import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { DEFAULT_AGENCY_PIPELINE_CONFIG, type AgencyPipelineConfig } from "@/src/constants/pipeline";

const CONFIG_KEYS = [
  "stageProbabilities.inquiry",
  "stageProbabilities.showing_scheduled",
  "stageProbabilities.showing_completed",
  "stageProbabilities.offer_made",
  "stageProbabilities.docs_review",
  "stageProbabilities.preliminary_signed_90",
  "stageProbabilities.contract_completed_100",
  "benchmarks.targetMonthlyRevenue",
  "benchmarks.targetDaysOnMarket",
  "benchmarks.targetWinRate",
] as const;

function boundedProbability(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function probability(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value >= 0 && value <= 1 ? value : value >= 0 && value <= 100 ? value / 100 : fallback;
}

export function normalizeAgencyPipelineConfig(value: unknown): AgencyPipelineConfig {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const stageProbabilities = data.stageProbabilities && typeof data.stageProbabilities === "object" ? data.stageProbabilities as Record<string, unknown> : {};
  const benchmarks = data.benchmarks && typeof data.benchmarks === "object" ? data.benchmarks as Record<string, unknown> : {};
  return {
    stageProbabilities: {
      inquiry: boundedProbability(stageProbabilities.inquiry, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.inquiry),
      showing_scheduled: boundedProbability(stageProbabilities.showing_scheduled, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.showing_scheduled),
      showing_completed: boundedProbability(stageProbabilities.showing_completed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.showing_completed),
      offer_made: boundedProbability(stageProbabilities.offer_made, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.offer_made),
      docs_review: boundedProbability(stageProbabilities.docs_review, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.docs_review),
      preliminary_signed_90: boundedProbability(stageProbabilities.preliminary_signed_90 ?? stageProbabilities.preliminary_signed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.preliminary_signed_90),
      contract_completed_100: boundedProbability(stageProbabilities.contract_completed_100 ?? stageProbabilities.contract_completed, DEFAULT_AGENCY_PIPELINE_CONFIG.stageProbabilities.contract_completed_100),
    },
    benchmarks: {
      targetMonthlyRevenue: nonNegativeNumber(benchmarks.targetMonthlyRevenue, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetMonthlyRevenue),
      targetDaysOnMarket: nonNegativeNumber(benchmarks.targetDaysOnMarket, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetDaysOnMarket),
      targetWinRate: probability(benchmarks.targetWinRate, DEFAULT_AGENCY_PIPELINE_CONFIG.benchmarks.targetWinRate),
    },
    defaultSplits: DEFAULT_AGENCY_PIPELINE_CONFIG.defaultSplits,
  };
}

export async function getAgencyPipelineConfig(agencyId: string): Promise<AgencyPipelineConfig> {
  if (!agencyId.trim()) return DEFAULT_AGENCY_PIPELINE_CONFIG;
  const snapshot = await getDoc(doc(db, "agencies", agencyId, "settings", "pipeline_config"));
  return snapshot.exists() ? normalizeAgencyPipelineConfig(snapshot.data()) : DEFAULT_AGENCY_PIPELINE_CONFIG;
}

export async function saveAgencyPipelineConfig(agencyId: string, config: AgencyPipelineConfig): Promise<void> {
  if (!agencyId.trim()) throw new Error("agencyId is required.");
  const normalized = normalizeAgencyPipelineConfig(config);
  await setDoc(doc(db, "agencies", agencyId, "settings", "pipeline_config"), {
    ...normalized,
    updatedAt: Date.now(),
  }, { merge: true });
}

export function subscribeAgencyPipelineConfig(agencyId: string, onChange: (config: AgencyPipelineConfig) => void, onError?: (error: Error) => void): Unsubscribe {
  if (!agencyId.trim()) {
    onChange(DEFAULT_AGENCY_PIPELINE_CONFIG);
    return () => undefined;
  }
  return onSnapshot(doc(db, "agencies", agencyId, "settings", "pipeline_config"), (snapshot) => {
    onChange(snapshot.exists() ? normalizeAgencyPipelineConfig(snapshot.data()) : DEFAULT_AGENCY_PIPELINE_CONFIG);
  }, (error) => onError?.(error));
}

export { CONFIG_KEYS };
