import { HttpsError } from "firebase-functions/v2/https";

export const CONTRACT_TEMPLATE_VERSION = "v1.0-el" as const;

type ContractSigner = {
  signerId?: unknown;
  signerName?: unknown;
  signerRole?: unknown;
  signerAfm?: unknown;
  signerIdCardNumber?: unknown;
};

type ContractRecord = {
  contractType?: unknown;
  templateVersion?: unknown;
  propertyCode?: unknown;
  apartmentAddress?: unknown;
  signers?: unknown;
  contractPayload?: unknown;
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} is required for ${CONTRACT_TEMPLATE_VERSION}.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new HttpsError("invalid-argument", `${field} must be a positive number.`);
  }
  return value;
}

function signerFor(signers: ContractSigner[], role: string): ContractSigner {
  const signer = signers.find((entry) => entry.signerRole === role);
  if (!signer) throw new HttpsError("invalid-argument", `A ${role} signer is required for ${CONTRACT_TEMPLATE_VERSION}.`);
  return signer;
}

function validateIdentity(signer: ContractSigner, label: string): void {
  requiredText(signer.signerName, `${label} name`);
  requiredText(signer.signerAfm, `${label} AFM`);
  requiredText(signer.signerIdCardNumber, `${label} ID number`);
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${field} is required and must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new HttpsError("invalid-argument", `${field} must contain at least one non-empty rule.`);
  }
  return value.map((entry) => (entry as string).trim());
}

function validateUtilitySplit(value: unknown): Record<string, number> {
  const split = objectValue(value, "Shared utility split percentages");
  const entries = Object.entries(split);
  if (entries.length === 0) throw new HttpsError("invalid-argument", "Shared utility split percentages are required.");
  const normalized = entries.map(([key, entry]) => {
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 100) {
      throw new HttpsError("invalid-argument", `Utility split percentage for ${key} must be between 0 and 100.`);
    }
    return [key, entry] as const;
  });
  const total = normalized.reduce((sum, [, entry]) => sum + entry, 0);
  if (Math.abs(total - 100) > 0.01) throw new HttpsError("invalid-argument", "Shared utility split percentages must total 100.");
  return Object.fromEntries(normalized);
}

export function validateContractTemplate(contract: ContractRecord): { payload: Record<string, unknown> } {
  if (contract.templateVersion !== CONTRACT_TEMPLATE_VERSION) {
    throw new HttpsError("failed-precondition", `Contract template version must be ${CONTRACT_TEMPLATE_VERSION}.`);
  }
  const contractType = requiredText(contract.contractType, "Contract type");
  const payload = objectValue(contract.contractPayload, "Contract payload");
  const signers = Array.isArray(contract.signers) ? contract.signers.filter((entry): entry is ContractSigner => Boolean(entry && typeof entry === "object")) : [];

  if (contractType === "viewing_order") {
    const client = signerFor(signers, "client");
    validateIdentity(client, "Client");
    requiredText(contract.propertyCode, "Property code");
    requiredText(contract.apartmentAddress, "Listing address");
    const commissionRatePercentage = payload.commissionRatePercentage === undefined ? 2 : positiveNumber(payload.commissionRatePercentage, "Commission percentage");
    if (commissionRatePercentage > 100) throw new HttpsError("invalid-argument", "Commission percentage must not exceed 100.");
    positiveNumber(payload.monthlyRentOrPrice, "Property price or rent");
    return { payload: { ...payload, commissionRatePercentage } };
  }

  if (contractType === "property_assignment") {
    const owner = signerFor(signers, "owner");
    validateIdentity(owner, "Owner");
    if (payload.assignmentMode !== "simple" && payload.assignmentMode !== "exclusive") {
      throw new HttpsError("invalid-argument", "Assignment mode must be simple or exclusive.");
    }
    if (typeof payload.durationMonths !== "number" || !Number.isInteger(payload.durationMonths) || payload.durationMonths <= 0) {
      throw new HttpsError("invalid-argument", "Agreed duration in months is required.");
    }
    positiveNumber(payload.agreedListingPrice ?? payload.monthlyRentOrPrice, "Agreed listing price");
    const commissionRatePercentage = payload.commissionRatePercentage === undefined ? 2 : positiveNumber(payload.commissionRatePercentage, "Commission percentage");
    if (commissionRatePercentage > 100) throw new HttpsError("invalid-argument", "Commission percentage must not exceed 100.");
    return { payload: { ...payload, commissionRatePercentage } };
  }

  if (contractType === "roommate_agreement") {
    const rules = objectValue(payload.houseRulesConfig, "House rules");
    const houseRules = stringArray(rules.houseRules, "House rules");
    const utilitySplitPercentages = validateUtilitySplit(payload.utilitySplitPercentages);
    const holdingDepositTerms = objectValue(payload.holdingDepositTerms, "Holding deposit terms");
    positiveNumber(holdingDepositTerms.amount, "Holding deposit amount");
    requiredText(holdingDepositTerms.refundabilityConditions, "Holding deposit refundability conditions");
    return { payload: { ...payload, houseRulesConfig: { ...rules, houseRules }, utilitySplitPercentages, holdingDepositTerms } };
  }

  if (contractType === "holding_deposit_viewing") {
    positiveNumber(payload.holdingDepositAmount, "Holding deposit amount");
    if (!optionalText(payload.bankReference) && !optionalText(payload.cashReceiptNote)) {
      throw new HttpsError("invalid-argument", "Bank reference or cash receipt note is required.");
    }
    requiredText(payload.refundabilityConditions, "Refundability conditions");
    return { payload };
  }

  throw new HttpsError("invalid-argument", `Unsupported contract type: ${contractType}.`);
}
