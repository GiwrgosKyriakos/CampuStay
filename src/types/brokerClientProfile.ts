import type { Timestamp } from "firebase/firestore";

export type BrokerContactRole = "client" | "owner";

export type CanonicalBrokerPipelineStage =
  | "new_lead"
  | "contacted"
  | "showing_scheduled"
  | "offer_made"
  | "under_contract"
  | "closed_won"
  | "closed_lost";

export type BrokerPipelineStage = CanonicalBrokerPipelineStage | "showing_planned" | "showing_completed" | "offer" | "negotiation_agreement";

export interface BrokerClientProfile {
  id: string;
  brokerId: string;
  contactUserId: string;
  contactRole: BrokerContactRole;
  agencyId: string | null;
  displayName: string;
  phone?: string;
  email?: string;
  leadIds: string[];
  activeLeadId: string | null;
  chatRoomIds: string[];
  appointmentIds: string[];
  dealIds: string[];
  contractIds: string[];
  listingIds: string[];
  pipelineStage: CanonicalBrokerPipelineStage;
  leadReadiness?: "cold" | "warm" | "hot" | null;
  activeApartmentId?: string | null;
  activeApartmentTitle?: string | null;
  dealCommission?: number | null;
  lastContactAt: Timestamp | Date;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  clientId: string;
  clientUserId: string;
  clientName?: string;
  clientAvatar?: string;
  role?: BrokerContactRole;
  chatRoomId?: string;
  apartmentIds: string[];
}