import { buildContractHtml, buildContractTemplateVariables } from "@/src/services/contractTemplates";
import type { ContractTemplateData, SignatureSignerEvidence } from "@/src/types/esignature";

function signer(signerId: string, signerRole: "broker" | "client", signerAfm: string): SignatureSignerEvidence {
  return {
    signerId,
    signerName: signerRole === "broker" ? "Broker Example" : "Client Example",
    signerRole,
    signerAfm,
    signerPhone: "+306900000000",
    signerEmail: `${signerId}@example.test`,
    signatureBase64: "",
    signedAt: 0,
    locationCoords: { latitude: 37.98, longitude: 23.72, accuracyMeters: 5 },
    otpVerified: false,
  };
}

function contractData(): ContractTemplateData {
  return {
    document: {
      id: "contract-afm-1",
      contractType: "viewing_order",
      title: "Viewing order",
      templateVersion: "v1.0-el",
      propertyCode: "APT-1",
      apartmentAddress: "1 Example Street",
      contractPayload: {
        brokerAfm: "123456789",
        agencyAfm: "987654321",
        monthlyRentOrPrice: 900,
        commissionRatePercentage: 2,
      },
      signers: [signer("broker-1", "broker", "123456789"), signer("client-1", "client", "111111111")],
      createdAt: 1_700_000_000_000,
    },
    agency: { id: "agency-1", name: "Example Agency", afm: "987654321" },
    property: { title: "Apartment", exactAddress: "1 Example Street", code: "APT-1", price: 900 },
    participants: [
      { id: "broker-1", fullName: "Broker Example", role: "broker", afm: "123456789", phone: "+306900000000", email: "broker-1@example.test" },
      { id: "client-1", fullName: "Client Example", role: "client", afm: "111111111", phone: "+306900000001", email: "client-1@example.test" },
    ],
  };
}

describe("contract AFM hydration variables", () => {
  it("maps personal broker and agency AFMs into legal document variables", () => {
    const variables = buildContractTemplateVariables(contractData());
    expect(variables).toMatchObject({ brokerAfm: "123456789", agencyAfm: "987654321" });
    expect(buildContractHtml(contractData())).toContain("123456789");
    expect(buildContractHtml(contractData())).toContain("987654321");
  });
});