import { collection, doc, getDoc, query, setDoc, where, getDocs, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface AcceptedOfferInput {
  apartmentId: string;
  clientId: string;
  listingBrokerId: string;
  acceptedOfferPrice: number;
}

interface DealRecord {
  agencyId?: unknown;
  commissionRate?: unknown;
  commissionRatePercentage?: unknown;
  commissionTotal?: unknown;
  dealValue?: unknown;
  dealAmount?: unknown;
  agencyCutPercentage?: unknown;
  listingBrokerId?: unknown;
  buyerBrokerId?: unknown;
  brokerSplits?: unknown;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function recordAcceptedOffer(input: AcceptedOfferInput): Promise<string> {
  if (!input.apartmentId.trim() || !input.clientId.trim() || !input.listingBrokerId.trim()) {
    throw new Error("Accepted offer requires apartment, client, and broker identifiers.");
  }
  const acceptedOfferPrice = finitePositive(input.acceptedOfferPrice);
  if (acceptedOfferPrice === null) throw new Error("Accepted offer price must be positive.");

  const dealId = `${input.apartmentId}_${input.clientId}`;
  const dealRef = doc(db, "deals", dealId);
  const apartmentRef = doc(db, "apartments", input.apartmentId);
  const [dealSnapshot, apartmentSnapshot] = await Promise.all([getDoc(dealRef), getDoc(apartmentRef)]);
  const current = dealSnapshot.exists() ? dealSnapshot.data() as DealRecord : {};
  const apartment = apartmentSnapshot.exists() ? apartmentSnapshot.data() as Record<string, unknown> : {};
  const currentValue = finitePositive(current.dealValue) ?? finitePositive(current.dealAmount) ?? finitePositive(apartment.rent) ?? acceptedOfferPrice;
  const currentCommission = finitePositive(current.commissionTotal);
  const configuredRate = finitePositive(current.commissionRatePercentage) ?? finitePositive(current.commissionRate);
  const commissionRate = configuredRate ?? (currentCommission && currentValue > 0 ? currentCommission / currentValue * 100 : 2);
  const commissionTotal = Math.round(acceptedOfferPrice * commissionRate) / 100;
  const listingBrokerId = typeof current.listingBrokerId === "string" && current.listingBrokerId.trim() ? current.listingBrokerId : input.listingBrokerId;
  const buyerBrokerId = typeof current.buyerBrokerId === "string" && current.buyerBrokerId.trim() ? current.buyerBrokerId : input.listingBrokerId;
  const agencyCutPercentage = 50;
  const brokerPercentage = 25;

  await setDoc(dealRef, {
    apartmentId: input.apartmentId,
    clientId: input.clientId,
    listingBrokerId,
    buyerBrokerId,
    ...(typeof current.agencyId === "string" ? { agencyId: current.agencyId } : typeof apartment.agencyId === "string" ? { agencyId: apartment.agencyId } : {}),
    acceptedOfferPrice,
    dealValue: acceptedOfferPrice,
    dealAmount: acceptedOfferPrice,
    offerAcceptedAt: serverTimestamp(),
    status: "offer_accepted",
    commissionRatePercentage: commissionRate,
    commissionTotal,
    agencyCutPercentage,
    agencyCutAmount: Math.round(commissionTotal * agencyCutPercentage) / 100,
    brokerSplits: [
      { brokerId: listingBrokerId, brokerName: "Listing broker", role: "listing_agent", percentage: brokerPercentage, amount: Math.round(commissionTotal * brokerPercentage) / 100 },
      { brokerId: buyerBrokerId, brokerName: "Buyer broker", role: "buyer_agent", percentage: brokerPercentage, amount: Math.round(commissionTotal * brokerPercentage) / 100 },
    ],
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return dealId;
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
