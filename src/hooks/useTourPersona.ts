import { useAuth } from "@/src/context/auth";
import type { TourPersonaKey } from "@/src/types/tour";

export interface TourPersonaClaims {
  isGuest: boolean;
  isLoggedIn: boolean;
  agencyRole: string | null;
  isBroker: boolean;
  agencyId: string | null;
  isHost: boolean;
  hasCreatedListings: boolean;
  wantsRoommate: boolean;
  lookingForRoommate: boolean;
}

export function resolveTourPersona(claims: TourPersonaClaims): TourPersonaKey {
  if (claims.isGuest || !claims.isLoggedIn) return "guest";
  if (claims.agencyRole === "ceo" || claims.agencyRole === "secretary" || claims.agencyRole === "secretariat") {
    return "agency_management";
  }
  if (claims.isBroker && claims.agencyId) return "broker_agency";
  if (claims.isBroker) return "broker_independent";
  if (claims.isHost || claims.hasCreatedListings) return "listing_host";
  if (claims.wantsRoommate !== false && claims.lookingForRoommate !== false) return "roommate_seeker";
  return "solo_tenant";
}

export function useTourPersona(): TourPersonaKey {
  const auth = useAuth();
  return resolveTourPersona({
    isGuest: auth.isGuest,
    isLoggedIn: auth.isLoggedIn,
    agencyRole: auth.agencyRole,
    isBroker: auth.isBroker,
    agencyId: auth.agencyId,
    isHost: auth.isHost,
    hasCreatedListings: auth.hasCreatedListings,
    wantsRoommate: auth.wantsRoommate,
    lookingForRoommate: auth.lookingForRoommate,
  });
}