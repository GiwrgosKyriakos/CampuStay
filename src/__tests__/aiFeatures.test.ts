const mockDocuments = new Map<string, Record<string, any>>();
const mockCallable = jest.fn();
const mockTimestamp = { toMillis: () => 1700000000000 };

function snapshotFor(path: string): any {
  const data = mockDocuments.get(path);
  return { exists: Boolean(data), data: () => data, id: path.split("/").pop() ?? path, ref: refFor(path) };
}

function refFor(path: string): any {
  return {
    path,
    id: path.split("/").pop() ?? path,
    get: async () => snapshotFor(path),
    set: async (data: Record<string, any>, options?: { merge?: boolean }) => {
      mockDocuments.set(path, options?.merge ? { ...(mockDocuments.get(path) ?? {}), ...data } : data);
    },
    collection: (name: string) => collectionFor(`${path}/${name}`),
  };
}

function collectionFor(path: string): any {
  const conditions: Array<[string, string, any]> = [];
  const query: any = {
    where: (field: string, operator: string, value: any) => {
      conditions.push([field, operator, value]);
      return query;
    },
    limit: () => query,
    orderBy: () => query,
    get: async () => ({ docs: [...mockDocuments.entries()]
      .filter(([documentPath]) => documentPath.startsWith(`${path}/`) && !documentPath.slice(path.length + 1).includes("/"))
      .map(([documentPath]) => ({ id: documentPath.split("/").pop(), data: () => mockDocuments.get(documentPath) }))
      .filter((document) => conditions.every(([field, operator, expected]) => operator === "==" && document.data()?.[field] === expected)) }),
    add: async (data: Record<string, any>) => {
      const id = `generated-${mockDocuments.size}`;
      mockDocuments.set(`${path}/${id}`, data);
      return { id };
    },
  };
  return { doc: (id?: string) => refFor(`${path}/${id ?? `generated-${mockDocuments.size}`}`), where: query.where, limit: query.limit, orderBy: query.orderBy, get: query.get, add: query.add };
}

const mockDb = {
  doc: (path: string) => refFor(path),
  collection: (path: string) => collectionFor(path),
  collectionGroup: (path: string) => collectionFor(path),
  runTransaction: async (callback: (transaction: any) => Promise<unknown>) => callback({
    get: async (ref: any) => snapshotFor(ref.path),
    set: async (ref: any, data: Record<string, any>, options?: { merge?: boolean }) => ref.set(data, options),
  }),
};

jest.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: jest.fn() }), { virtual: true });
jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    doc: (path: string) => mockDb.doc(path),
    collection: (path: string) => mockDb.collection(path),
    collectionGroup: (path: string) => mockDb.collectionGroup(path),
    runTransaction: (callback: (transaction: any) => Promise<unknown>) => mockDb.runTransaction(callback),
  }),
  Timestamp: { now: () => mockTimestamp },
}), { virtual: true });
jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error { code: string; constructor(codeValue: string, message: string) { super(message); this.code = codeValue; } },
}), { virtual: true });
jest.mock("firebase-functions/v2/firestore", () => ({ onDocumentCreated: (_path: string, handler: unknown) => handler, onDocumentUpdated: (_path: string, handler: unknown) => handler }), { virtual: true });
jest.mock("firebase-functions", () => ({ logger: { info: jest.fn(), error: jest.fn() } }), { virtual: true });

jest.mock("../../functions/src/cron/visitReminders", () => ({ processScheduledVisitReminders: jest.fn() }));
jest.mock("../../functions/src/cron/dealStagnation", () => ({ processDealStagnation: jest.fn() }));
jest.mock("../../functions/src/cron/leadInactivityDispatch", () => ({ processLeadInactivityDispatch: jest.fn() }));
jest.mock("../../functions/src/lib/push", () => ({ sendPushToUser: jest.fn() }));
jest.mock("../../functions/src/triggers/onNewChatMessage", () => ({ onNewChatMessage: jest.fn() }));
jest.mock("../../functions/src/triggers/onListingWithdrawal", () => ({ onListingWithdrawal: jest.fn(), onListingWithdrawalEventCreated: jest.fn() }));
jest.mock("../../functions/src/triggers/onContractCompleted", () => ({ onContractCompleted: jest.fn() }));
jest.mock("../../functions/src/callables/signingOtp", () => ({ recordSigningEvidence: jest.fn(), sendSigningOtp: jest.fn(), updateContractPayload: jest.fn(), verifySigningOtp: jest.fn() }));
jest.mock("../../functions/src/callables/agencyCollaboration", () => ({ claimLeadCallable: jest.fn(), claimPropertyCallable: jest.fn(), createCrossBrokerShowingCallable: jest.fn(), delegateShowingCallable: jest.fn(), finalizeCommissionSettlementCallable: jest.fn(), publishListingAssignmentCallable: jest.fn(), recordKeySafeActionCallable: jest.fn(), recordShowingFeedbackCallable: jest.fn(), reassignLeadCallable: jest.fn(), reviewClaimCallable: jest.fn() }));
jest.mock("../../functions/src/callables/dealPipeline", () => ({ advanceDealStageCallable: jest.fn(), finalizeChecklistDocumentUploadCallable: jest.fn(), initializeDealCallable: jest.fn(), reviewChecklistDocumentCallable: jest.fn() }));
jest.mock("../../functions/src/callables/dealMigration", () => ({ migrateLegacyDealsCallable: jest.fn() }));
jest.mock("../../functions/src/triggers/notificationLifecycle", () => ({ onAppointmentCreated: jest.fn(), onAppointmentUpdated: jest.fn(), onOfferCreated: jest.fn(), onOfferUpdated: jest.fn(), onApprovedOfferCreated: jest.fn(), onApprovedOfferUpdated: jest.fn(), onListingDocumentsUpdated: jest.fn(), onContractStatusUpdatedForNotification: jest.fn(), onBrokerApprovalUpdated: jest.fn(), onDealRecordCreated: jest.fn(), onChecklistItemUpdated: jest.fn(), onCanonicalDealStageUpdated: jest.fn() }));
jest.mock("../../functions/src/ai/geminiClient", () => ({ getGeminiModel: () => ({ generateContent: jest.fn(async () => ({ response: { text: () => "not valid json" }, responseUsageMetadata: { totalTokenCount: 3 } })) }), recordGeminiUsage: jest.fn() }));

import { generateOwnerPerformanceReport, getComparativeMarketAnalysis, getPropertyFeedbackSentiment } from "../../functions/src/index";
import { analyzeComparativeMarket } from "../../functions/src/ai/cmaService";
import { generatePropertyListingCopy } from "../../functions/src/ai/copywriterService";
import { analyzeShowingFeedbackSentiment } from "../../functions/src/ai/sentimentService";

type CallableRequest = { auth?: { uid: string }; data: Record<string, any> };

function request(uid: string, data: Record<string, any>): CallableRequest {
  return { auth: { uid }, data };
}

function seedApartment(id: string, data: Record<string, any> = {}) {
  mockDocuments.set(`apartments/${id}`, { ownerId: "owner-1", assignedBrokerIds: [], transactionType: "sale", area: "Center", sqm: 50, price: 100000, ...data });
}

beforeEach(() => {
  mockDocuments.clear();
  mockCallable.mockReset();
});

describe("AI authorization and report versioning", () => {
  it("rejects an unauthorized user before generating a report", async () => {
    seedApartment("apt-1");
    await expect((getComparativeMarketAnalysis as any)(request("outsider", { apartmentId: "apt-1", transactionType: "sale" }))).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockDocuments.has("apartments/apt-1/cma_history/generated-1")).toBe(false);
  });

  it("allows an owner and assigned broker and stores successful versions", async () => {
    seedApartment("apt-1", { assignedBrokerIds: ["broker-1"] });
    const ownerResult = await (generateOwnerPerformanceReport as any)(request("owner-1", { apartmentId: "apt-1", timeRangeDays: 30 }));
    const brokerResult = await (generateOwnerPerformanceReport as any)(request("broker-1", { apartmentId: "apt-1", timeRangeDays: 30 }));
    expect(ownerResult.reportId).toBeTruthy();
    expect(brokerResult.reportId).toBeTruthy();
    expect([...mockDocuments.keys()].filter((path) => path.includes("/owner_reports/")).length).toBe(2);
  });

  it("keeps sale and rental comparable queries isolated", async () => {
    seedApartment("target", { transactionType: "sale", price: 100000 });
    mockDocuments.set("apartments/sale-comp", { transactionType: "sale", area: "Center", sqm: 50, price: 120000 });
    mockDocuments.set("apartments/rent-comp", { transactionType: "rent", area: "Center", sqm: 50, rent: 500 });
    const sale = await analyzeComparativeMarket({ apartmentId: "target", transactionType: "sale", area: "Center", sqm: 50 });
    const rent = await analyzeComparativeMarket({ apartmentId: "target", transactionType: "rent", area: "Center", sqm: 50 });
    expect(sale.comparablesUsed).toBe(1);
    expect(rent.comparablesUsed).toBe(1);
  });

  it("uses deterministic fallbacks for malformed Gemini JSON", async () => {
    const copy = await generatePropertyListingCopy({ title: "Studio", area: "Center", sqm: 30, bedrooms: 1, price: 500, features: [] });
    mockDocuments.set("post_visit_feedbacks/feedback-1", { apartmentId: "apt-1", feedback: "Καλή τοποθεσία" });
    const sentiment = await analyzeShowingFeedbackSentiment("apt-1");
    expect(copy.portalTitle).toContain("Studio");
    expect(sentiment.overallSentiment).toBe("neutral");
    expect(sentiment.recurringPatterns).toEqual([]);
  });

  it("rejects the sixteenth AI call after the daily limit", async () => {
    seedApartment("apt-1");
    for (let index = 0; index < 15; index += 1) {
      await (getPropertyFeedbackSentiment as any)(request("owner-1", { apartmentId: "apt-1" }));
    }
    await expect((getPropertyFeedbackSentiment as any)(request("owner-1", { apartmentId: "apt-1" }))).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
