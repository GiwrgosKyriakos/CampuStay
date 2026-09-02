import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { calculateTenantCompatibilityScore, type ListingFormData } from "@/src/utils/compatibilityScore";
import type { FilterSetPayload } from "@/src/types/filters";
import { db } from "@/src/config/firebase";
import { sendPushNotification } from "@/src/utils/notificationService";

interface BrokerAutomationApartment extends ListingFormData {
  id: string;
  title: string;
  hostId?: string;
  assignedBrokerIds?: string[];
  status?: string;
  isOffMarket?: boolean;
  isDeleted?: boolean;
}

function toListingData(id: string, data: Record<string, unknown>): BrokerAutomationApartment {
  return {
    id,
    title: typeof data.title === "string" && data.title.trim() ? data.title : "Ακίνητο",
    city: typeof data.city === "string" ? data.city : "",
    area: typeof data.area === "string" ? data.area : "",
    latitude: typeof data.latitude === "number" ? data.latitude : undefined,
    longitude: typeof data.longitude === "number" ? data.longitude : undefined,
    rent: typeof data.rent === "number" ? data.rent : typeof data.price === "number" ? data.price : undefined,
    size: typeof data.size === "number" ? data.size : typeof data.sqft === "number" ? data.sqft : undefined,
    floor: typeof data.floor === "string" || typeof data.floor === "number" ? data.floor : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    amenities: Array.isArray(data.amenities) ? data.amenities.map(String) : [],
    petFriendly: data.petFriendly === true,
    nearMetro: data.nearMetro === true,
    propertyType: typeof data.propertyType === "string" ? data.propertyType : undefined,
    propertyCategory: typeof data.propertyCategory === "string" ? data.propertyCategory : undefined,
    hostId: typeof data.hostId === "string" ? data.hostId : undefined,
    assignedBrokerIds: Array.isArray(data.assignedBrokerIds) ? data.assignedBrokerIds.filter((value): value is string => typeof value === "string") : [],
    status: typeof data.status === "string" ? data.status : undefined,
    isOffMarket: data.isOffMarket === true,
    isDeleted: data.isDeleted === true,
  };
}

function filterData(raw: Record<string, unknown>): FilterSetPayload {
  const nested = raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : raw;
  return nested as FilterSetPayload;
}

async function getBrokerListings(brokerId: string): Promise<BrokerAutomationApartment[]> {
  const [owned, assigned] = await Promise.all([
    getDocs(query(collection(db, "apartments"), where("hostId", "==", brokerId))),
    getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", brokerId))),
  ]);
  const docs = new Map([...owned.docs, ...assigned.docs].map((snapshot) => [snapshot.id, snapshot]));
  return [...docs.values()]
    .map((snapshot) => toListingData(snapshot.id, snapshot.data() as Record<string, unknown>))
    .filter((apartment) => apartment.status !== "closed_deal" && apartment.status !== "under_negotiation" && !apartment.isOffMarket && !apartment.isDeleted);
}

async function notifyBrokerOfHighMatch(brokerId: string, clientId: string, clientName: string, apartment: BrokerAutomationApartment, score: number): Promise<void> {
  const brokerSnapshot = await getDoc(doc(db, "users", brokerId));
  const token = brokerSnapshot.exists() ? brokerSnapshot.data().expoPushToken : null;
  if (typeof token !== "string" || !token.trim()) return;
  await sendPushNotification(
    token,
    `Εξαιρετική Συμβατότητα (${score}%)!`,
    `Το ακίνητο "${apartment.title}" ταιριάζει απόλυτα με τα κριτήρια του πελάτη ${clientName}.`,
    { screen: "broker-client-detail", profileId: `${brokerId}_${clientId}`, clientId, scrollTo: "suggested_properties" },
  );
}

export async function scanHighMatchForBrokerClient(brokerId: string, clientId: string, clientName = "Πελάτης"): Promise<void> {
  if (!brokerId || !clientId || brokerId === clientId) return;
  const [filterSnapshot, apartments] = await Promise.all([
    getDocs(collection(db, "users", clientId, "savedFilterSets")),
    getBrokerListings(brokerId),
  ]);
  const filters = filterSnapshot.docs.map((snapshot) => filterData(snapshot.data() as Record<string, unknown>));
  const bestByApartment = new Map<string, number>();
  for (const apartment of apartments) {
    for (const filter of filters) {
      const score = Math.round(calculateTenantCompatibilityScore(apartment, filter));
      if (score > 90 && score > (bestByApartment.get(apartment.id) ?? 0)) bestByApartment.set(apartment.id, score);
    }
  }
  await Promise.all([...bestByApartment.entries()].map(async ([apartmentId, score]) => {
    const apartment = apartments.find((item) => item.id === apartmentId);
    if (apartment) await notifyBrokerOfHighMatch(brokerId, clientId, clientName, apartment, score);
  }));
}

export async function scanHighMatchForBrokerListing(brokerId: string, apartmentId: string): Promise<void> {
  const apartmentSnapshot = await getDoc(doc(db, "apartments", apartmentId));
  if (!apartmentSnapshot.exists()) return;
  const apartment = toListingData(apartmentId, apartmentSnapshot.data() as Record<string, unknown>);
  if (apartment.status === "closed_deal" || apartment.status === "under_negotiation" || apartment.isOffMarket || apartment.isDeleted) return;

  const profiles = await getDocs(query(collection(db, "brokerClientProfiles"), where("brokerId", "==", brokerId), where("role", "==", "client")));
  await Promise.all(profiles.docs.map(async (profileSnapshot) => {
    const data = profileSnapshot.data() as { clientId?: string; clientUserId?: string; clientName?: string };
    const clientId = data.clientId ?? data.clientUserId;
    if (clientId) await scanHighMatchForBrokerClient(brokerId, clientId, data.clientName ?? "Πελάτης");
  }));
}

function listingIsUnavailable(data: Record<string, unknown>): boolean {
  return data.isDeleted === true || data.isArchived === true || data.isOffMarket === true || data.status === "under_negotiation" || data.status === "closed_deal";
}

export async function notifyFavoriteClientsOfListingWithdrawal(apartmentId: string, apartmentTitle: string): Promise<void> {
  const likes = await getDocs(query(collection(db, "liked_apartments"), where("apartmentId", "==", apartmentId)));
  await Promise.all(likes.docs.map(async (likeSnapshot) => {
    const userId = likeSnapshot.data().userId;
    if (typeof userId !== "string" || !userId) return;
    const userSnapshot = await getDoc(doc(db, "users", userId));
    const token = userSnapshot.exists() ? userSnapshot.data().expoPushToken : null;
    if (typeof token !== "string" || !token.trim()) return;
    await sendPushNotification(token, "Αλλαγή Κατάστασης Ακινήτου", `Το ακίνητο "${apartmentTitle}" που έχετε στα αγαπημένα σας δεν είναι πλέον διαθέσιμο.`, { apartmentId, action: "listing_withdrawn" });
  }));
}

export async function notifyListingStatusChange(apartmentId: string, previous: Record<string, unknown> | null, next: Record<string, unknown>): Promise<void> {
  if (!listingIsUnavailable(next) || (previous && listingIsUnavailable(previous))) return;
  const title = typeof next.title === "string" && next.title.trim() ? next.title : "Ακίνητο";
  await notifyFavoriteClientsOfListingWithdrawal(apartmentId, title);
}

export async function markListingWithdrawalForDeletion(apartmentId: string, apartmentTitle: string): Promise<void> {
  await notifyFavoriteClientsOfListingWithdrawal(apartmentId, apartmentTitle);
}
