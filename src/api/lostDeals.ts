import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import type { LostDealReason } from "@/src/types/analytics";

export async function recordLostDeal(params: {
  agencyId: string;
  dealId: string;
  apartmentId: string;
  brokerId: string;
  clientId: string;
  reason: LostDealReason;
  notes?: string;
  stageBeforeLoss: number;
  potentialRevenueLoss: number;
}): Promise<string> {
  const reference = await addDoc(collection(db, "lost_deals"), {
    ...params,
    lostAt: Date.now(),
    createdAt: serverTimestamp(),
  });
  return reference.id;
}