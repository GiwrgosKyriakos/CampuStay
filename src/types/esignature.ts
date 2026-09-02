export type ContractType =
  | "viewing_order"
  | "property_assignment"
  | "roommate_agreement"
  | "holding_deposit_viewing";

export type ContractStatus = "draft" | "pending_signatures" | "signed" | "cancelled";

export type ContractSignerRole = "client" | "owner" | "roommate" | "broker";

export interface SignatureSignerEvidence {
  signerId: string;
  signerName: string;
  signerRole: ContractSignerRole;
  signerAfm?: string;
  signerIdCardNumber?: string;
  signerPhone: string;
  signerEmail: string;
  signatureBase64: string;
  signedAt: number;
  locationCoords: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
  };
  otpVerified: boolean;
  otpVerifiedAt?: number;
  idCardPhotoUrl?: string;
  idCardBackPhotoUrl?: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface DigitalContractDocument {
  id: string;
  agencyId: string;
  contractType: ContractType;
  title: string;
  apartmentId?: string;
  apartmentAddress?: string;
  dealId?: string;
  clientId?: string;
  ownerId?: string;
  brokerId?: string;
  createdByUserId?: string;
  clientProfileId?: string;
  chatRoomId?: string;
  status: ContractStatus;
  contractPayload: {
    commissionRatePercentage?: number;
    commissionAmountCalculated?: number;
    customTerms?: string[];
    monthlyRentOrPrice?: number;
    houseRulesConfig?: Record<string, unknown>;
    holdingDepositAmount?: number;
    assignmentMode?: "simple" | "exclusive";
    [key: string]: unknown;
  };
  signers: SignatureSignerEvidence[];
  requiredSignerIds: string[];
  pdfStoragePath?: string;
  pdfStorageUrl?: string;
  pdfSha256Hash?: string;
  finalPdfStoragePath?: string;
  createdAt: number;
  completedAt?: number;
  updatedAt?: number;
  archivedAt?: number;
  emailDispatchedAt?: number;
}

export interface ContractParticipant {
  id: string;
  fullName: string;
  role: ContractSignerRole;
  afm?: string;
  idCardNumber?: string;
  phone: string;
  email: string;
  avatarUrl?: string;
}

export interface ContractPropertyData {
  id?: string;
  title: string;
  code?: string;
  exactAddress: string;
  price?: number;
  monthlyRentOrPrice?: number;
}

export interface ContractAgencyData {
  id: string;
  name: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
}

export interface ContractTemplateData {
  document: Pick<DigitalContractDocument, "id" | "contractType" | "title" | "contractPayload" | "signers" | "createdAt">;
  agency: ContractAgencyData;
  property?: ContractPropertyData;
  participants: ContractParticipant[];
  locale?: "el" | "en";
}

export interface CreateContractInput {
  agencyId: string;
  contractType: ContractType;
  title: string;
  createdByUserId: string;
  brokerId?: string;
  clientId?: string;
  ownerId?: string;
  clientProfileId?: string;
  chatRoomId?: string;
  apartmentId?: string;
  apartmentAddress?: string;
  dealId?: string;
  contractPayload?: DigitalContractDocument["contractPayload"];
  signers: SignatureSignerEvidence[];
  requiredSignerIds: string[];
}

export interface ContractDocumentReference {
  contractId: string;
  contractType: ContractType;
  title: string;
  url?: string;
  sha256Hash?: string;
  createdAt: number;
  idCardPhotoUrls?: string[];
}

export interface ContractDraftContext {
  agencyId: string;
  createdByUserId: string;
  contractType: ContractType;
  title?: string;
  brokerId?: string;
  clientId?: string;
  ownerId?: string;
  clientProfileId?: string;
  chatRoomId?: string;
  apartmentId?: string;
  apartmentAddress?: string;
  dealId?: string;
  participantIds: { id: string; role: ContractSignerRole }[];
  participants?: ContractParticipant[];
  contractPayload?: DigitalContractDocument["contractPayload"];
}