import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ID_CAPTURE_MAX_FILE_SIZE_BYTES,
  ID_CAPTURE_MIN_LONG_SIDE,
  ID_CAPTURE_MIN_SHORT_SIDE,
  validateIdCaptureMetadata,
} from "@/src/services/idCaptureValidation";
import { verifyContractSignatureAuditTrail } from "../../functions/src/lib/contractAudit";
import { recordSigningEvidence, sendSigningOtp, verifySigningOtp } from "../../functions/src/callables/signingOtp";
import { verifyContractSignatureAuditTrailCallable } from "../../functions/src/callables/contractAudit";
import { onContractCompleted } from "../../functions/src/triggers/onContractCompleted";
import type { IdCaptureMetadata, SignatureSignerEvidence } from "@/src/types/esignature";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";

const mockDocuments = new Map<string, Record<string, any>>();
const mockFiles = new Map<string, Buffer>();
const mockTimestamp = { toMillis: () => 1_700_000_000_000 };
const mockDispatchMailOutboxMessage = jest.fn(async (_outboxId?: string) => undefined);
let assertFails: typeof import("@firebase/rules-unit-testing").assertFails;
let assertSucceeds: typeof import("@firebase/rules-unit-testing").assertSucceeds;
let initializeTestEnvironment: typeof import("@firebase/rules-unit-testing").initializeTestEnvironment;

function mockSnapshotFor(path: string): any {
  return {
    exists: mockDocuments.has(path),
    data: () => mockDocuments.get(path),
    id: path.split("/").pop() ?? path,
    ref: mockReferenceFor(path),
  };
}

function mockReferenceFor(path: string): any {
  return {
    path,
    id: path.split("/").pop() ?? path,
    get: async () => mockSnapshotFor(path),
    set: async (data: Record<string, any>, options?: { merge?: boolean }) => {
      const current = mockDocuments.get(path) ?? {};
      mockDocuments.set(path, options?.merge ? { ...current, ...data } : data);
    },
    update: async (data: Record<string, any>) => {
      mockDocuments.set(path, { ...(mockDocuments.get(path) ?? {}), ...data });
    },
    create: async (data: Record<string, any>) => {
      if (mockDocuments.has(path)) throw new Error(`Document ${path} already exists`);
      mockDocuments.set(path, data);
    },
    collection: (name: string) => mockCollectionFor(`${path}/${name}`),
  };
}

function mockCollectionFor(path: string): any {
  return {
    path,
    doc: (id?: string) => mockReferenceFor(`${path}/${id ?? `generated-${mockDocuments.size}`}`),
    get: async () => ({
      docs: [...mockDocuments.keys()]
        .filter((documentPath) => documentPath.startsWith(`${path}/`) && !documentPath.slice(path.length + 1).includes("/"))
        .map(mockSnapshotFor),
    }),
  };
}

function applyUpdate(path: string, data: Record<string, any>): void {
  mockDocuments.set(path, { ...(mockDocuments.get(path) ?? {}), ...data });
}

function mockFile(path: string): any {
  return {
    exists: async () => [mockFiles.has(path)],
    download: async () => [mockFiles.get(path) ?? Buffer.alloc(0)],
    copy: async (target: any) => { mockFiles.set(target.name ?? target.path, mockFiles.get(path) ?? Buffer.alloc(0)); },
    setMetadata: jest.fn(async () => undefined),
    getSignedUrl: jest.fn(async () => [`https://storage.test/${encodeURIComponent(path)}`]),
  };
}

const mockDb = {
  doc: (path: string) => mockReferenceFor(path),
  collection: (path: string) => mockCollectionFor(path),
  runTransaction: async (callback: (transaction: any) => Promise<unknown>) => callback({
    get: async (target: any) => target.get(),
    update: async (target: any, data: Record<string, any>) => applyUpdate(target.path, data),
    create: async (target: any, data: Record<string, any>) => {
      if (mockDocuments.has(target.path)) throw new Error(`Document ${target.path} already exists`);
      mockDocuments.set(target.path, data);
    },
    set: async (target: any, data: Record<string, any>) => mockDocuments.set(target.path, data),
  }),
};

jest.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: jest.fn() }), { virtual: true });
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => Symbol("delete"),
    arrayUnion: (...values: any[]) => values,
  },
  Timestamp: { now: () => mockTimestamp },
  getFirestore: () => ({
    doc: (path: string) => mockReferenceFor(path),
    collection: (path: string) => mockCollectionFor(path),
    runTransaction: (callback: (transaction: any) => Promise<unknown>) => mockDb.runTransaction(callback),
  }),
}), { virtual: true });
jest.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: () => ({ file: (path: string) => ({ ...mockFile(path), name: path, path }) }) }),
}), { virtual: true });
jest.mock("firebase-functions/v2/https", () => ({
  onCall: (handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}), { virtual: true });
jest.mock("firebase-functions/v2/firestore", () => ({ onDocumentUpdated: (_path: unknown, handler: unknown) => handler }), { virtual: true });
jest.mock("firebase-functions", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }), { virtual: true });
jest.mock("../../functions/src/lib/mailOutbox", () => ({
  dispatchMailOutboxMessage: (outboxId: string) => mockDispatchMailOutboxMessage(outboxId),
  getShortLivedStorageUrl: jest.fn(async (path: string) => `https://storage.test/${encodeURIComponent(path)}`),
}), { virtual: true });

function request(uid: string | undefined, data: Record<string, any>): any {
  return { auth: uid ? { uid } : undefined, data, rawRequest: { ip: "198.51.100.42", headers: {} } };
}

function uploadTaskPromise(task: any): Promise<unknown> {
  return new Promise((resolve, reject) => task.on("state_changed", () => undefined, reject, resolve));
}

function imageMetadata(idDocumentType: "national_id" | "passport" = "national_id"): IdCaptureMetadata {
  return {
    front: { width: 1600, height: 1000, fileSizeBytes: 300_000, idCaptureTimestamp: 1_700_000_000_001, idDocumentType },
    back: { width: 1600, height: 1000, fileSizeBytes: 300_001, idCaptureTimestamp: 1_700_000_000_002, idDocumentType },
  };
}

function evidence(signerId: string, signerRole: "broker" | "client" = "broker"): SignatureSignerEvidence {
  return {
    signerId,
    signerName: signerId,
    signerRole,
    signerPhone: "+306900000000",
    signerEmail: `${signerId}@example.test`,
    signerAfm: "123456789",
    signerIdCardNumber: "AB123456",
    signatureBase64: "data:image/png;base64,signature",
    signedAt: 0,
    locationCoords: { latitude: 37.98, longitude: 23.72, accuracyMeters: 8 },
    otpVerified: signerRole === "broker",
    idCardPhotoUrl: `https://storage.test/front-${signerId}.jpg`,
    idCardBackPhotoUrl: `https://storage.test/back-${signerId}.jpg`,
    idCaptureTimestamp: 1_700_000_000_002,
    idDocumentType: "national_id",
    idCaptureMetadata: imageMetadata(),
  };
}

function seedContract(id: string, overrides: Record<string, any> = {}): void {
  mockDocuments.set(`contracts/${id}`, {
    agencyId: "agency-1",
    contractType: "holding_deposit_viewing",
    templateVersion: "v1.0-el",
    propertyCode: "APT-1",
    apartmentAddress: "1 Example Street",
    contractPayload: { holdingDepositAmount: 500, bankReference: "BANK-1", refundabilityConditions: "Refund under written terms" },
    status: "pending_signatures",
    signers: [],
    requiredSignerIds: [],
    ...overrides,
  });
}

function seedSourcePdf(contractId: string, contents = Buffer.from("contract-pdf")): string {
  const hash = createHash("sha256").update(contents).digest("hex");
  const path = `agencies/agency-1/contracts/${contractId}.pdf`;
  mockFiles.set(path, contents);
  return hash;
}

beforeEach(() => {
  mockDocuments.clear();
  mockFiles.clear();
  mockDispatchMailOutboxMessage.mockClear();
  process.env.FUNCTIONS_EMULATOR = "true";
});

describe("ID capture standards", () => {
  it("accepts a compliant ID image", () => {
    expect(() => validateIdCaptureMetadata({ width: ID_CAPTURE_MIN_LONG_SIDE, height: ID_CAPTURE_MIN_SHORT_SIDE, fileSizeBytes: 1000, idCaptureTimestamp: Date.now(), idDocumentType: "national_id" })).not.toThrow();
  });

  it("rejects images with insufficient dimensions or a 10 MB payload", () => {
    expect(() => validateIdCaptureMetadata({ width: 500, height: 400, fileSizeBytes: 1000, idCaptureTimestamp: Date.now(), idDocumentType: "national_id" })).toThrow();
    expect(() => validateIdCaptureMetadata({ width: 1600, height: 1000, fileSizeBytes: ID_CAPTURE_MAX_FILE_SIZE_BYTES, idCaptureTimestamp: Date.now(), idDocumentType: "passport" })).toThrow();
  });
});

describe("signing callable security and OTP", () => {
  it("denies an unrelated user from submitting evidence", async () => {
    seedContract("security-1", { signers: [evidence("signer-1")], requiredSignerIds: ["signer-1"] });
    await expect((recordSigningEvidence as any)(request("intruder", { contractId: "security-1", signerId: "signer-1", evidence: evidence("signer-1"), pdfStoragePath: "contracts/security-1/source/hash.pdf", pdfSha256Hash: "0".repeat(64) }))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("requires OTP verification for an external signer", async () => {
    seedContract("otp-required-1", { signers: [evidence("client-1", "client")], requiredSignerIds: ["client-1"] });
    const pdf = Buffer.from("otp-pdf");
    const hash = createHash("sha256").update(pdf).digest("hex");
    mockFiles.set(`contracts/otp-required-1/source/${hash}.pdf`, pdf);
    await expect((recordSigningEvidence as any)(request("client-1", { contractId: "otp-required-1", signerId: "client-1", evidence: { ...evidence("client-1", "client"), otpVerified: false }, pdfStoragePath: `contracts/otp-required-1/source/${hash}.pdf`, pdfSha256Hash: hash }))).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("locks OTP verification after the maximum attempts", async () => {
    seedContract("otp-lock-1", { signers: [evidence("client-1", "client")], requiredSignerIds: ["client-1"] });
    const sent = await (sendSigningOtp as any)(request("client-1", { contractId: "otp-lock-1", signerId: "client-1" }));
    expect(sent.debugCode).toHaveLength(6);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect((verifySigningOtp as any)(request("client-1", { contractId: "otp-lock-1", signerId: "client-1", code: "000000" }))).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await expect((verifySigningOtp as any)(request("client-1", { contractId: "otp-lock-1", signerId: "client-1", code: "000000" }))).rejects.toMatchObject({ code: "resource-exhausted" });
    await expect((verifySigningOtp as any)(request("client-1", { contractId: "otp-lock-1", signerId: "client-1", code: sent.debugCode }))).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("rejects expired OTP tokens", async () => {
    seedContract("otp-expired-1", { signers: [evidence("client-1", "client")], requiredSignerIds: ["client-1"] });
    mockDocuments.set("signingOtps/otp-expired-1_client-1", { expiresAt: Date.now() - 1, attempts: 0, codeHash: "expired" });
    await expect((verifySigningOtp as any)(request("client-1", { contractId: "otp-expired-1", signerId: "client-1", code: "000000" }))).rejects.toMatchObject({ code: "deadline-exceeded" });
  });
});

describe("signature audit verification", () => {
  it("returns invalid when one PDF byte changes", async () => {
    const original = Buffer.from("original-pdf");
    const hash = createHash("sha256").update(original).digest("hex");
    seedContract("hash-1", { status: "signed", finalDocumentHash: hash, finalPdfStoragePath: "agencies/agency-1/contracts/hash-1.pdf", requiredSignerIds: ["signer-1"] });
    mockDocuments.set("contracts/hash-1/signatures_ledger/evidence-1", { ...evidence("signer-1"), evidenceId: "evidence-1", serverTimestamp: mockTimestamp, ipAddress: "198.51.100.42" });
    mockFiles.set("agencies/agency-1/contracts/hash-1.pdf", Buffer.from("modified-pdf"));
    const result = await verifyContractSignatureAuditTrail("hash-1");
    expect(result.isValid).toBe(false);
    expect(result.auditTrail).toContainEqual(expect.objectContaining({ check: "pdf_hash", valid: false }));
  });

  it("accepts a signed contract with complete immutable ledger entries", async () => {
    const contents = Buffer.from("valid-pdf");
    const hash = createHash("sha256").update(contents).digest("hex");
    seedContract("audit-valid-1", { status: "signed", finalDocumentHash: hash, finalPdfStoragePath: "agencies/agency-1/contracts/audit-valid-1.pdf", requiredSignerIds: ["signer-1", "signer-2"] });
    mockDocuments.set("contracts/audit-valid-1/signatures_ledger/evidence-1", { ...evidence("signer-1"), evidenceId: "evidence-1", serverTimestamp: mockTimestamp, ipAddress: "198.51.100.42" });
    mockDocuments.set("contracts/audit-valid-1/signatures_ledger/evidence-2", { ...evidence("signer-2"), evidenceId: "evidence-2", serverTimestamp: mockTimestamp, ipAddress: "198.51.100.43" });
    mockFiles.set("agencies/agency-1/contracts/audit-valid-1.pdf", contents);
    const result = await verifyContractSignatureAuditTrail("audit-valid-1");
    expect(result.isValid).toBe(true);
    expect(result.auditTrail.filter((entry) => entry.check === "ledger_entry")).toHaveLength(2);
  });

  it("protects the audit callable from unrelated users", async () => {
    seedContract("audit-permission-1", { status: "signed", requiredSignerIds: ["signer-1"] });
    await expect((verifyContractSignatureAuditTrailCallable as any)(request("intruder", { contractId: "audit-permission-1" }))).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("multi-signer completion", () => {
  it("stays pending after the first signer and completes atomically after the second", async () => {
    const firstSigner = evidence("signer-1");
    const secondSigner = evidence("signer-2");
    const signerProfiles = [firstSigner, secondSigner].map(({ signatureBase64, ...profile }) => profile);
    seedContract("multi-1", { signers: signerProfiles, requiredSignerIds: ["signer-1", "signer-2"], pdfStoragePath: "contracts/multi-1/source/placeholder.pdf" });
    const firstPdf = Buffer.from("first-signed-pdf");
    const firstHash = createHash("sha256").update(firstPdf).digest("hex");
    mockFiles.set(`contracts/multi-1/source/${firstHash}.pdf`, firstPdf);
    const first = await (recordSigningEvidence as any)(request("signer-1", { contractId: "multi-1", signerId: "signer-1", evidence: firstSigner, pdfStoragePath: `contracts/multi-1/source/${firstHash}.pdf`, pdfSha256Hash: firstHash }));
    expect(first.status).toBe("pending_signatures");
    expect(mockDocuments.get("contracts/multi-1")).toEqual(expect.objectContaining({ status: "pending_signatures" }));

    const secondPdf = Buffer.from("second-signed-pdf");
    const secondHash = createHash("sha256").update(secondPdf).digest("hex");
    mockFiles.set(`contracts/multi-1/source/${secondHash}.pdf`, secondPdf);
    const second = await (recordSigningEvidence as any)(request("signer-2", { contractId: "multi-1", signerId: "signer-2", evidence: secondSigner, pdfStoragePath: `contracts/multi-1/source/${secondHash}.pdf`, pdfSha256Hash: secondHash }));
    expect(second.status).toBe("signed");
    expect(mockDocuments.get("contracts/multi-1")).toEqual(expect.objectContaining({ status: "signed", finalDocumentHash: secondHash }));

    const before = { status: "pending_signatures" };
    const after = mockDocuments.get("contracts/multi-1");
    const finalHash = seedSourcePdf("multi-1", secondPdf);
    mockDocuments.set("contracts/multi-1", { ...after, pdfStoragePath: "agencies/agency-1/contracts/multi-1.pdf", pdfSha256Hash: finalHash, finalDocumentHash: finalHash });
    await (onContractCompleted as any)({ params: { contractId: "multi-1" }, data: { before: { data: () => before }, after: { data: () => mockDocuments.get("contracts/multi-1"), ref: mockReferenceFor("contracts/multi-1") } } });
    expect(mockDocuments.get("mail_outbox/contract_multi-1")).toEqual(expect.objectContaining({ status: "pending", contractId: "multi-1" }));
    expect(mockDispatchMailOutboxMessage).toHaveBeenCalledWith("contract_multi-1");
  });
});

const emulatorDescribe = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST ? describe : describe.skip;

emulatorDescribe("Firebase Emulator Storage rules", () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    ({ assertFails, assertSucceeds, initializeTestEnvironment } = require("@firebase/rules-unit-testing"));
    testEnvironment = await initializeTestEnvironment({
      projectId: "campustay-phase3",
      firestore: { rules: readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf8") },
      storage: { rules: readFileSync(resolve(process.cwd(), "../storage.rules"), "utf8") },
    });
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
    await testEnvironment.clearStorage();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("contracts/emulator-contract").set({ agencyId: "agency-1", requiredSignerIds: ["client-1"] });
    });
  });

  it("allows one source PDF upload but rejects overwrite and non-PDF content", async () => {
    const clientStorage = testEnvironment.authenticatedContext("client-1").storage();
    const sourceRef = clientStorage.ref("contracts/emulator-contract/source/document.pdf");
    await assertSucceeds(uploadTaskPromise(sourceRef.put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" })));
    await assertFails(uploadTaskPromise(sourceRef.put(new Uint8Array([4, 5, 6]), { contentType: "application/pdf" })));
    await assertFails(uploadTaskPromise(clientStorage.ref("contracts/emulator-contract/source/not-a-pdf.jpg").put(new Uint8Array([1]), { contentType: "image/jpeg" })));
  });

  it("rejects ID images at or above 10 MB", async () => {
    const clientStorage = testEnvironment.authenticatedContext("client-1").storage();
    const oversized = new Uint8Array(ID_CAPTURE_MAX_FILE_SIZE_BYTES);
    await assertFails(uploadTaskPromise(clientStorage.ref("contracts/emulator-contract/id_verifications/client-1.jpg").put(oversized, { contentType: "image/jpeg" })));
  });
});
