export interface UserRoleData {
  is_broker?: boolean;
  role?: string | null;
  agencyId?: string | null;
  agencyRole?: "ceo" | "broker" | "agent" | string | null;
  is_agency_ceo?: boolean;
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
}

export function isBrokerOrAgencyUser(user?: UserRoleData | null): boolean {
  if (!user) return false;

  return Boolean(
    user.is_broker === true ||
    user.role === "broker" ||
      (typeof user.agencyId === "string" && user.agencyId.trim().length > 0) ||
      user.agencyRole === "ceo" ||
      user.is_agency_ceo === true,
  );
}
