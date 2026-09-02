export interface RealEstateAgency {
  id: string;
  name: string;
  nameLower: string;
  passcode: string;
  ceoId: string;
  ceoEmail: string;
  logoUrl?: string | null;
  activeBrokerIds: string[];
  pendingBrokerIds: string[];
  pendingSecretaryIds?: string[];
  createdAt: unknown;
  updatedAt: unknown;
}