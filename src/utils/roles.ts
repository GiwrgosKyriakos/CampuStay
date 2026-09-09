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

export type RoleHomeTab = "apartments" | "calendar" | "roommates";

export interface RoleAuthState {
  isBroker?: boolean;
  agencyId?: string | null;
  agencyRole?: string | null;
  notLookingForRoommate?: boolean;
  looking_for_roommate?: boolean;
}

export function isAgencyExecutive(user: RoleAuthState): boolean {
  return Boolean(
    user.agencyId &&
    ["ceo", "secretary", "secretariat"].includes(user.agencyRole ?? ""),
  );
}

export function getRoleHomeTab(auth: RoleAuthState): RoleHomeTab {
  if (isAgencyExecutive(auth)) return "apartments";
  if (auth.isBroker) return "calendar";
  if (auth.notLookingForRoommate === true || auth.looking_for_roommate === false) return "calendar";
  return "roommates";
}

export function isBrokerOrSecretariat(user: { isBroker?: boolean; agencyRole?: string | null }): boolean {
  return Boolean(
    user.isBroker ||
    isAgencyExecutive(user),
  );
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
