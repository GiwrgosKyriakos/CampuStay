export interface Agency {
  id: string;
  name: string;
  nameLower: string;
  passcode: string;
  ceoId: string;
  ceoEmail: string;
  afm?: string | null;
  logoUrl?: string | null;
  activeBrokerIds: string[];
  pendingBrokerIds: string[];
  pendingSecretaryIds?: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export type RealEstateAgency = Agency;