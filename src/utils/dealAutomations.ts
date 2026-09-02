import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { sendPushNotification } from "@/src/utils/notificationService";

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
    const totalCommission = params.dealAmount * (params.commissionRate ?? 1);
    const listingBrokerId = params.listingBrokerId || params.brokerId;
    const buyerBrokerId = params.buyerBrokerId || params.brokerId;
    const dealId = `${params.apartmentId}_${params.clientId}`;
    const listingBrokerSnapshot = listingBrokerId !== params.brokerId ? await getDoc(doc(db, "users", listingBrokerId)) : brokerSnapshot;
    const buyerBrokerSnapshot = buyerBrokerId !== params.brokerId ? await getDoc(doc(db, "users", buyerBrokerId)) : null;
    const listingBrokerName = listingBrokerSnapshot.exists() ? String(listingBrokerSnapshot.data()?.name || "Listing broker") : params.brokerName;
    const buyerBrokerName = buyerBrokerSnapshot?.exists() ? String(buyerBrokerSnapshot.data()?.name || "Buyer broker") : params.brokerName;
    await setDoc(doc(db, "deals", dealId), {
      apartmentId: params.apartmentId,
      apartmentTitle: params.apartmentTitle,
      clientId: params.clientId,
      clientName: params.clientName,
      agencyId,
      listingBrokerId,
      buyerBrokerId,
      ...(params.coveringBrokerId ? { coveringBrokerId: params.coveringBrokerId } : {}),
      stage: 100,
      totalDealAmount: params.dealAmount,
      dealAmount: params.dealAmount,
      commissionTotal: totalCommission,
      agencyCutPercentage: 50,
      agencyCutAmount: totalCommission * 0.5,
      brokerSplits: [
        { brokerId: listingBrokerId, brokerName: listingBrokerName, role: "listing_agent", percentage: listingBrokerId === buyerBrokerId ? 100 : 50, amount: listingBrokerId === buyerBrokerId ? totalCommission : totalCommission * 0.5 },
        ...(listingBrokerId !== buyerBrokerId ? [{ brokerId: buyerBrokerId, brokerName: buyerBrokerName, role: "buyer_agent", percentage: 50, amount: totalCommission * 0.5 }] : []),
        ...(params.coveringBrokerId ? [{ brokerId: params.coveringBrokerId, brokerName: "Covering broker", role: "covering_agent", percentage: 0, amount: 0 }] : []),
      ],
      status: "closed",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, "agencies", agencyId, "commission_settlements", dealId), {
      apartmentId: params.apartmentId,
      apartmentTitle: params.apartmentTitle,
      dealAmount: params.dealAmount,
      brokerId: params.brokerId,
      brokerName: params.brokerName,
      clientId: params.clientId,
      clientName: params.clientName,
      calculatedCommission: totalCommission,
      dealId,
      status: "pending_invoice",
      createdAt: serverTimestamp(),
    }, { merge: true });

    const secretariat = await getDocs(query(collection(db, "users"), where("agencyId", "==", agencyId)));
    const alert = {
      type: "commission_invoice_required",
      apartmentId: params.apartmentId,
      apartmentTitle: params.apartmentTitle,
      createdAt: serverTimestamp(),
      read: false,
    };
    await Promise.all(secretariat.docs.map(async (account) => {
      const data = account.data();
      if (data.agencyRole !== "ceo" && data.role !== "secretariat" && data.role !== "secretary") return;
      await addDoc(collection(db, "agencies", agencyId, "alerts"), { ...alert, recipientId: account.id });
      if (typeof data.expoPushToken === "string" && data.expoPushToken.trim()) {
        await sendPushNotification(data.expoPushToken, "Έκδοση Τιμολογίου Προμήθειας", `Το deal για το "${params.apartmentTitle}" ολοκληρώθηκε (100%). Απαιτείται έκδοση τιμολογίου.`, { screen: "agency", apartmentId: params.apartmentId });
      }
    }));
  }

  if (params.ownerId) {
    const ownerSnapshot = await getDoc(doc(db, "users", params.ownerId));
    const ownerData = ownerSnapshot.exists() ? ownerSnapshot.data() : {};
    if (typeof ownerData.expoPushToken === "string" && ownerData.expoPushToken.trim()) {
      await sendPushNotification(ownerData.expoPushToken, "Το ακίνητό σας έκλεισε!", `Η συμφωνία για το ${params.apartmentTitle} ολοκληρώθηκε.`, { apartmentId: params.apartmentId, action: "deal_closed" });
    }

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
