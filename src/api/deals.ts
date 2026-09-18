import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";

export interface AcceptedOfferInput {
  apartmentId: string;
  clientId: string;
  listingBrokerId: string;
  acceptedOfferPrice: number;
  leadId?: string;
}

export async function recordAcceptedOffer(input: AcceptedOfferInput): Promise<string> {
  if (!input.apartmentId.trim() || !input.clientId.trim() || !input.listingBrokerId.trim()) {
    throw new Error("Accepted offer requires apartment, client, and broker identifiers.");
  }
  if (!Number.isFinite(input.acceptedOfferPrice) || input.acceptedOfferPrice <= 0) throw new Error("Accepted offer price must be positive.");

  const callable = httpsCallable<AcceptedOfferInput, { dealId: string; offerId: string }>(firebaseFunctions, "recordAcceptedOfferCallable");
  const result = await callable(input);
  return result.data.dealId;
}

export interface AcceptedOfferDealSnapshot {
  acceptedOfferPrice?: number;
  dealValue?: number;
  status?: string;
}

export async function getAcceptedOfferDeal(apartmentId: string, clientId: string): Promise<AcceptedOfferDealSnapshot | null> {
  if (!apartmentId.trim() || !clientId.trim()) return null;
  const snapshot = await getDocs(query(collection(db, "deals"), where("apartmentId", "==", apartmentId), where("clientId", "==", clientId)));
  const accepted = snapshot.docs.map((entry) => entry.data() as AcceptedOfferDealSnapshot).find((deal) => deal.status === "offer_accepted" || typeof deal.acceptedOfferPrice === "number");
  return accepted ?? null;
}
