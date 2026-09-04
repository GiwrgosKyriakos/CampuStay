"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTRACT_TEMPLATE_VERSION = void 0;
exports.validateContractTemplate = validateContractTemplate;
const https_1 = require("firebase-functions/v2/https");
exports.CONTRACT_TEMPLATE_VERSION = "v1.0-el";
function requiredText(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} is required for ${exports.CONTRACT_TEMPLATE_VERSION}.`);
    }
    return value.trim();
}
function optionalText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function positiveNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} must be a positive number.`);
    }
    return value;
}
function signerFor(signers, role) {
    const signer = signers.find((entry) => entry.signerRole === role);
    if (!signer)
        throw new https_1.HttpsError("invalid-argument", `A ${role} signer is required for ${exports.CONTRACT_TEMPLATE_VERSION}.`);
    return signer;
}
function validateIdentity(signer, label) {
    requiredText(signer.signerName, `${label} name`);
    requiredText(signer.signerAfm, `${label} AFM`);
    requiredText(signer.signerIdCardNumber, `${label} ID number`);
}
function objectValue(value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new https_1.HttpsError("invalid-argument", `${field} is required and must be an object.`);
    }
    return value;
}
function stringArray(value, field) {
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
        throw new https_1.HttpsError("invalid-argument", `${field} must contain at least one non-empty rule.`);
    }
    return value.map((entry) => entry.trim());
}
function validateUtilitySplit(value) {
    const split = objectValue(value, "Shared utility split percentages");
    const entries = Object.entries(split);
    if (entries.length === 0)
        throw new https_1.HttpsError("invalid-argument", "Shared utility split percentages are required.");
    const normalized = entries.map(([key, entry]) => {
        if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 100) {
            throw new https_1.HttpsError("invalid-argument", `Utility split percentage for ${key} must be between 0 and 100.`);
        }
        return [key, entry];
    });
    const total = normalized.reduce((sum, [, entry]) => sum + entry, 0);
    if (Math.abs(total - 100) > 0.01)
        throw new https_1.HttpsError("invalid-argument", "Shared utility split percentages must total 100.");
    return Object.fromEntries(normalized);
}
function validateContractTemplate(contract) {
    if (contract.templateVersion !== exports.CONTRACT_TEMPLATE_VERSION) {
        throw new https_1.HttpsError("failed-precondition", `Contract template version must be ${exports.CONTRACT_TEMPLATE_VERSION}.`);
    }
    const contractType = requiredText(contract.contractType, "Contract type");
    const payload = objectValue(contract.contractPayload, "Contract payload");
    const signers = Array.isArray(contract.signers) ? contract.signers.filter((entry) => Boolean(entry && typeof entry === "object")) : [];
    if (contractType === "viewing_order") {
        const client = signerFor(signers, "client");
        validateIdentity(client, "Client");
        requiredText(contract.propertyCode, "Property code");
        requiredText(contract.apartmentAddress, "Listing address");
        const commissionRatePercentage = payload.commissionRatePercentage === undefined ? 2 : positiveNumber(payload.commissionRatePercentage, "Commission percentage");
        if (commissionRatePercentage > 100)
            throw new https_1.HttpsError("invalid-argument", "Commission percentage must not exceed 100.");
        positiveNumber(payload.monthlyRentOrPrice, "Property price or rent");
        return { payload: { ...payload, commissionRatePercentage } };
    }
    if (contractType === "property_assignment") {
        const owner = signerFor(signers, "owner");
        validateIdentity(owner, "Owner");
        if (payload.assignmentMode !== "simple" && payload.assignmentMode !== "exclusive") {
            throw new https_1.HttpsError("invalid-argument", "Assignment mode must be simple or exclusive.");
        }
        if (typeof payload.durationMonths !== "number" || !Number.isInteger(payload.durationMonths) || payload.durationMonths <= 0) {
            throw new https_1.HttpsError("invalid-argument", "Agreed duration in months is required.");
        }
        positiveNumber(payload.agreedListingPrice ?? payload.monthlyRentOrPrice, "Agreed listing price");
        const commissionRatePercentage = payload.commissionRatePercentage === undefined ? 2 : positiveNumber(payload.commissionRatePercentage, "Commission percentage");
        if (commissionRatePercentage > 100)
            throw new https_1.HttpsError("invalid-argument", "Commission percentage must not exceed 100.");
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
            throw new https_1.HttpsError("invalid-argument", "Bank reference or cash receipt note is required.");
        }
        requiredText(payload.refundabilityConditions, "Refundability conditions");
        return { payload };
    }
    throw new https_1.HttpsError("invalid-argument", `Unsupported contract type: ${contractType}.`);
}
//# sourceMappingURL=contractTemplates.js.map