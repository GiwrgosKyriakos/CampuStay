export type ContractType =
  | "viewing_order"
  | "property_assignment"
  | "roommate_agreement"
  | "holding_deposit_viewing";

export type ContractStatus = "draft" | "pending_signatures" | "signed" | "cancelled";

export type ContractSignerRole = "client" | "owner" | "roommate" | "broker";
export type IdDocumentType = "national_id" | "passport";

export interface IdCaptureSideMetadata {
  width: number;
  height: number;
  fileSizeBytes: number;
  idCaptureTimestamp: number;
  idDocumentType: IdDocumentType;
}

export interface IdCaptureMetadata {
  front?: IdCaptureSideMetadata;
  back?: IdCaptureSideMetadata;
}

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
  otpVerificationId?: string;
  otpVerifiedAt?: number;
  idCardPhotoUrl?: string;
  idCardBackPhotoUrl?: string;
  idCaptureTimestamp?: number;
  idDocumentType?: IdDocumentType;
  idCaptureMetadata?: IdCaptureMetadata;
  ipAddress?: string;
  deviceInfo?: string;
  evidenceId?: string;
  serverTimestamp?: number;
  deviceAttestation?: string;
}

export interface DigitalContractDocument {
  id: string;
  agencyId: string;
  contractType: ContractType;
  title: string;
  templateVersion?: string;
  propertyCode?: string;
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
    durationMonths?: number;
    agreedListingPrice?: number;
    utilitySplitPercentages?: Record<string, number>;
    holdingDepositTerms?: { amount: number; refundabilityConditions: string; [key: string]: unknown };
    bankReference?: string;
    cashReceiptNote?: string;
    refundabilityConditions?: string;
    [key: string]: unknown;
  };
  signers: SignatureSignerEvidence[];
  requiredSignerIds: string[];
  pdfStoragePath?: string;
  pdfStorageUrl?: string;
  pdfSha256Hash?: string;
  finalDocumentHash?: string;
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
  document: Pick<DigitalContractDocument, "id" | "contractType" | "title" | "templateVersion" | "propertyCode" | "apartmentAddress" | "contractPayload" | "signers" | "createdAt" | "pdfSha256Hash" | "finalDocumentHash">;
  agency: ContractAgencyData;
  property?: ContractPropertyData;
  participants: ContractParticipant[];
  locale?: "el" | "en";
}

export interface CreateContractInput {
  agencyId: string;
  contractType: ContractType;
  title: string;
  templateVersion?: string;
  propertyCode?: string;
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
  type?: ContractType;
  signedAt?: number;
  documentUrl?: string;
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