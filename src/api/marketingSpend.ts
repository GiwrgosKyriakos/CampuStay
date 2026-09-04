import { addDoc, collection } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import type { CampaignSpend, StandardLeadSource } from "@/src/types/analytics";

export async function saveCampaignSpend(input: { agencyId: string; source: StandardLeadSource; month: string; spendAmount: number; recordedBy: string }): Promise<CampaignSpend> {
  if (!input.agencyId.trim() || !input.recordedBy.trim()) throw new Error("Agency και χρήστης είναι υποχρεωτικά.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("Ο μήνας πρέπει να έχει μορφή YYYY-MM.");
  if (!Number.isFinite(input.spendAmount) || input.spendAmount < 0) throw new Error("Το ποσό πρέπει να είναι έγκυρο.");
  const recordedAt = Date.now();
  const reference = await addDoc(collection(db, "agencies", input.agencyId, "campaign_spends"), {
    agencyId: input.agencyId,
    source: input.source,
    month: input.month,
    spendAmount: input.spendAmount,
    currency: "EUR",
    recordedAt,
    recordedBy: input.recordedBy,
  });
  return { id: reference.id, agencyId: input.agencyId, source: input.source, month: input.month, spendAmount: input.spendAmount, currency: "EUR", recordedAt, recordedBy: input.recordedBy };
}