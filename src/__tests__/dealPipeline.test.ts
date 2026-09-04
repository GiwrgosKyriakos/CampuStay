import {
  advanceDealStageCallable,
  finalizeChecklistDocumentUploadCallable,
  reviewChecklistDocumentCallable,
} from "../../functions/src/callables/dealPipeline";

const mockDocuments = new Map<string, Record<string, unknown>>();
const mockServerTimestamp = Symbol("serverTimestamp");
const mockDeleteField = Symbol("deleteField");

function mockReference(path: string): Record<string, unknown> {
  return {
    path,
    id: path.split("/").pop() ?? path,
    get: async () => mockSnapshot(path),
    create: async (data: Record<string, unknown>) => { mockDocuments.set(path, data); },
  };
}

function mockSnapshot(path: string): Record<string, unknown> {
  const data = mockDocuments.get(path);
  return {
    exists: mockDocuments.has(path),
    data: () => data,
    id: path.split("/").pop() ?? path,
    ref: mockReference(path),
  };
}

function mockCollection(path: string): Record<string, unknown> {
  return {
    path,
    get: async () => ({
      docs: [...mockDocuments.entries()]
        .filter(([documentPath]) => documentPath.startsWith(`${path}/`) && !documentPath.slice(path.length + 1).includes("/"))
        .map(([documentPath]) => mockSnapshot(documentPath)),
    }),
  };
}

function mockApplyUpdate(path: string, data: Record<string, unknown>): void {
  const next = { ...(mockDocuments.get(path) ?? {}), ...data };
  Object.entries(data).forEach(([key, value]) => {
    if (value === mockDeleteField) delete next[key];
  });
  mockDocuments.set(path, next);
}

jest.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: jest.fn() }), { virtual: true });
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => mockServerTimestamp, delete: () => mockDeleteField },
  getFirestore: () => ({
    doc: (path: string) => mockReference(path),
    collection: mockCollection,
    runTransaction: async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => callback({
      get: async (target: { path?: string; get?: () => Promise<unknown> }) => target.get ? target.get() : target.path ? mockSnapshot(target.path) : { docs: [] },
      update: async (target: { path: string }, data: Record<string, unknown>) => mockApplyUpdate(target.path, data),
      set: async (target: { path: string }, data: Record<string, unknown>) => mockDocuments.set(target.path, data),
    }),
  }),
}), { virtual: true });
jest.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ delete: jest.fn(async () => undefined) }) }) }),
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

function request(uid: string, data: Record<string, unknown>) {
  return { auth: { uid }, data };
}

function seedUser(uid: string, data: Record<string, unknown> = {}): void {
  mockDocuments.set(`users/${uid}`, { agencyId: "agency-1", is_broker: true, agencyStatus: "approved", ...data });
}

function seedDeal(stage = 0): void {
  mockDocuments.set("deals/apt-1_client-1", {
    agencyId: "agency-1",
    listingBrokerId: "broker-1",
    buyerBrokerId: "broker-1",
    clientId: "client-1",
    ownerId: "owner-1",
    stage,
  });
}

function seedChecklist(statusById: Record<string, string> = {}): void {
  [
    "engineering-1",
    "engineering-2",
    "engineering-3",
    "legal-1",
    "legal-2",
    "legal-3",
    "tax-1",
    "tax-2",
    "tax-3",
    "tax-4",
    "closing-1",
  ].forEach((itemId, index) => {
    mockDocuments.set(`deals/apt-1_client-1/checklist/${itemId}`, {
      requiredForStage: index < 6 ? 90 : 100,
      status: statusById[itemId] ?? "pending",
    });
  });
}

beforeEach(() => {
  mockDocuments.clear();
  seedUser("broker-1");
  seedUser("secretariat", { is_broker: false, agencyRole: "secretariat" });
  seedUser("client-1", { is_broker: false });
  seedUser("owner-1", { is_broker: false });
  seedDeal();
  seedChecklist();
});

describe("deal pipeline stage gates", () => {
  it("blocks Stage 90 while a required document is pending", async () => {
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 90 }))).rejects.toThrow("Missing verified technical or legal documents");
  });

  it("requires an approved lostReason for loss transitions", async () => {
    seedChecklist({});
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 40, status: "lost" }))).rejects.toThrow("valid lostReason is required");
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 40, status: "lost", lostReason: "unknown" }))).rejects.toThrow("valid lostReason is required");
  });

  it("allows Stage 90 only when all Stage 90 documents are verified", async () => {
    seedChecklist(Object.fromEntries(["engineering-1", "engineering-2", "engineering-3", "legal-1", "legal-2", "legal-3"].map((id) => [id, "verified"])));
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 90 }))).resolves.toEqual({ dealId: "apt-1_client-1", stage: 90 });
  });

  it("blocks Stage 100 until every checklist item is verified, then allows it", async () => {
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 100 }))).rejects.toThrow("All checklist documents must be verified");
    const allIds = [...mockDocuments.keys()].filter((path) => path.startsWith("deals/apt-1_client-1/checklist/")).map((path) => path.split("/").pop() as string);
    seedChecklist(Object.fromEntries(allIds.map((id) => [id, "verified"])));
    await expect((advanceDealStageCallable as any)(request("broker-1", { dealId: "apt-1_client-1", targetStage: 100 }))).resolves.toEqual({ dealId: "apt-1_client-1", stage: 100 });
  });

  it.each(["client-1", "owner-1"])("denies %s from advancing a review stage", async (uid) => {
    await expect((advanceDealStageCallable as any)(request(uid, { dealId: "apt-1_client-1", targetStage: 90 }))).rejects.toThrow("Only a deal broker, Secretariat, or administrator can review documents");
  });
});

describe("checklist review audit fields", () => {
  beforeEach(() => {
    mockDocuments.set("deals/apt-1_client-1/checklist/item-1", { status: "uploaded", fileUrl: "https://example.test/file.pdf" });
  });

  it("allows a broker and records verifiedBy and verifiedAt", async () => {
    await expect((reviewChecklistDocumentCallable as any)(request("broker-1", { dealId: "apt-1_client-1", itemId: "item-1", action: "verify" }))).resolves.toEqual({ dealId: "apt-1_client-1", itemId: "item-1", status: "verified" });
    expect(mockDocuments.get("deals/apt-1_client-1/checklist/item-1")).toEqual(expect.objectContaining({ status: "verified", verifiedBy: "broker-1", verifiedAt: mockServerTimestamp }));
  });

  it("allows Secretariat to reject only with a reason and records it", async () => {
    await expect((reviewChecklistDocumentCallable as any)(request("secretariat", { dealId: "apt-1_client-1", itemId: "item-1", action: "reject" }))).rejects.toThrow("rejectionReason is required");
    await expect((reviewChecklistDocumentCallable as any)(request("secretariat", { dealId: "apt-1_client-1", itemId: "item-1", action: "reject", rejectionReason: "Λείπει υπογραφή" }))).resolves.toEqual({ dealId: "apt-1_client-1", itemId: "item-1", status: "rejected" });
    expect(mockDocuments.get("deals/apt-1_client-1/checklist/item-1")).toEqual(expect.objectContaining({ status: "rejected", rejectionReason: "Λείπει υπογραφή" }));
  });

  it.each(["client-1", "owner-1"])("denies %s from reviewing", async (uid) => {
    await expect((reviewChecklistDocumentCallable as any)(request(uid, { dealId: "apt-1_client-1", itemId: "item-1", action: "verify" }))).rejects.toThrow("Only a deal broker, Secretariat, or administrator can review documents");
  });
});

describe("document replacement protection", () => {
  it("records the storage path and refuses replacement of a verified document", async () => {
    mockDocuments.set("deals/apt-1_client-1/checklist/item-1", { status: "uploaded", storagePath: "deals/apt-1_client-1/item-1/old.pdf" });
    await expect((finalizeChecklistDocumentUploadCallable as any)(request("client-1", {
      dealId: "apt-1_client-1",
      itemId: "item-1",
      fileUrl: "https://example.test/new.pdf",
      fileName: "new.pdf",
      storagePath: "deals/apt-1_client-1/item-1/new.pdf",
    }))).resolves.toEqual({ dealId: "apt-1_client-1", itemId: "item-1", status: "uploaded" });
    expect(mockDocuments.get("deals/apt-1_client-1/checklist/item-1")).toEqual(expect.objectContaining({ storagePath: "deals/apt-1_client-1/item-1/new.pdf", uploadedBy: "client-1" }));

    mockDocuments.set("deals/apt-1_client-1/checklist/item-1", { status: "verified" });
    await expect((finalizeChecklistDocumentUploadCallable as any)(request("client-1", {
      dealId: "apt-1_client-1", itemId: "item-1", fileUrl: "https://example.test/again.pdf", fileName: "again.pdf", storagePath: "deals/apt-1_client-1/item-1/again.pdf",
    }))).rejects.toThrow("Verified documents cannot be replaced");
  });
});
