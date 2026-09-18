import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";

export interface ResolvedApartmentPrice {
  displayPrice: number;
  isAcceptedOffer: boolean;
  originalPrice: number;
}

interface DealPriceRecord {
  status?: string;
  acceptedOfferPrice?: number;
  updatedAt?: { toMillis?: () => number };
}

export function useApartmentResolvedPrice(apartmentId: string, basePrice: number): ResolvedApartmentPrice {
  const auth = useAuth();
  const originalPrice = Number.isFinite(basePrice) ? basePrice : 0;
  const [acceptedOfferPrice, setAcceptedOfferPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!apartmentId.trim() || !auth.userId || auth.isGuest) {
      setAcceptedOfferPrice(null);
      return;
    }

    let active = true;
    const dealsQuery = query(
      collection(db, "deals"),
      where("apartmentId", "==", apartmentId),
      where("clientId", "==", auth.userId),
    );
    const unsubscribe = onSnapshot(dealsQuery, (snapshot) => {
      if (!active) return;
      const accepted = snapshot.docs
        .map((entry) => entry.data() as DealPriceRecord)
        .filter((deal) => deal.status === "offer_accepted" || typeof deal.acceptedOfferPrice === "number")
        .sort((left, right) => (right.updatedAt?.toMillis?.() ?? 0) - (left.updatedAt?.toMillis?.() ?? 0))[0];
      const nextPrice = typeof accepted?.acceptedOfferPrice === "number" && accepted.acceptedOfferPrice > 0 ? accepted.acceptedOfferPrice : null;
      setAcceptedOfferPrice(nextPrice);
    }, () => {
      if (active) setAcceptedOfferPrice(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [apartmentId, auth.isGuest, auth.userId]);

  const isAcceptedOffer = acceptedOfferPrice !== null;
  return {
    displayPrice: isAcceptedOffer ? acceptedOfferPrice : originalPrice,
    isAcceptedOffer,
    originalPrice,
  };
}
