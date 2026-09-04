import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";

export async function settleClosedDeal(params: {
  apartmentId: string;
  apartmentTitle: string;
  dealAmount: number;
  commissionRate?: number;
  brokerId: string;
  brokerName: string;
  clientId: string;
  clientName: string;
  ownerId?: string;
  listingBrokerId?: string;
  buyerBrokerId?: string;
  coveringBrokerId?: string;
}): Promise<void> {
  const brokerSnapshot = await getDoc(doc(db, "users", params.brokerId));
  const brokerData = brokerSnapshot.exists() ? brokerSnapshot.data() : {};
  const agencyId = typeof brokerData.agencyId === "string" ? brokerData.agencyId : "";
  if (agencyId) {
    const listingBrokerId = params.listingBrokerId || params.brokerId;
    const buyerBrokerId = params.buyerBrokerId || params.brokerId;
    const submitSettlement = httpsCallable<Record<string, unknown>, { status: string; dealId: string }>(firebaseFunctions, "finalizeCommissionSettlementCallable");
    await submitSettlement({
      action: "submit",
      agencyId,
      apartmentId: params.apartmentId,
      apartmentTitle: params.apartmentTitle,
      dealAmount: params.dealAmount,
      commissionRate: params.commissionRate ?? 1,
      listingBrokerId,
      buyerBrokerId,
      ...(params.coveringBrokerId ? { coveringBrokerId: params.coveringBrokerId } : {}),
      clientId: params.clientId,
      clientName: params.clientName,
    });
  }

  if (params.ownerId) {
    const chats = await getDocs(query(collection(db, "chats"), where("users", "array-contains", params.ownerId)));
    const ownerChat = chats.docs.find((chat) => {
      const data = chat.data();
      return data.type === "host" && Array.isArray(data.users) && data.users.includes(params.brokerId);
    });
    if (ownerChat) {
      await addDoc(collection(db, "chats", ownerChat.id, "messages"), {
        senderId: "system",
        type: "system_notice",
        text: `Το ακίνητο ${params.apartmentTitle} έκλεισε. Η συμφωνία ολοκληρώθηκε.`,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      await setDoc(doc(db, "chats", ownerChat.id), { lastMessage: `Το deal για ${params.apartmentTitle} ολοκληρώθηκε.`, updatedAt: Date.now() }, { merge: true });
    }
  }
}
