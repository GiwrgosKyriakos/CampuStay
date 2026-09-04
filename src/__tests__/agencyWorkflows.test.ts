import {
  calculateCommissionSplits,
  issueCommissionSettlement,
} from "@/src/api/agencyCollaboration";
import {
  claimPropertyCallable,
  delegateShowingCallable,
  recordKeySafeActionCallable,
  recordShowingFeedbackCallable,
  reviewClaimCallable,
} from "../../functions/src/callables/agencyCollaboration";
import { processLeadInactivityDispatch } from "../../functions/src/cron/leadInactivityDispatch";

const mockDocuments = new Map<string, Record<string, any>>();
const mockPushes: { userId: string; payload: Record<string, any> }[] = [];
const mockCallable = jest.fn();
const mockServerTimestamp = Symbol("serverTimestamp");
const mockDeleteField = Symbol("deleteField");

function refFor(path: string): any {
  return {
    path,
    id: path.split("/").pop() ?? path,
    get: async () => snapshotFor(path),
    create: async (data: Record<string, any>) => {
      if (mockDocuments.has(path)) {
        const error = new Error("already exists") as Error & { code?: number };
        error.code = 6;
        throw error;
      }
      mockDocuments.set(path, applySentinels(data));
    },
    set: async (data: Record<string, any>, options?: { merge?: boolean }) => {
      const current = mockDocuments.get(path) ?? {};
      mockDocuments.set(path, options?.merge ? { ...current, ...applySentinels(data) } : applySentinels(data));
    },
    update: async (data: Record<string, any>) => {
      updateDocument(path, data);
    },
    delete: async () => mockDocuments.delete(path),
    collection: (name: string) => collectionFor(`${path}/${name}`),
  };
}

function snapshotFor(path: string): any {
  const data = mockDocuments.get(path);
  return {
    exists: Boolean(data),
    data: () => data,
    ref: refFor(path),
    id: path.split("/").pop() ?? path,
  };
}

function applySentinels(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  Object.entries(result).forEach(([key, value]) => {
    if (value === mockDeleteField) delete result[key];
  });
  return result;
}

function updateDocument(path: string, data: Record<string, any>) {
  const next = { ...(mockDocuments.get(path) ?? {}), ...data };
  Object.entries(data).forEach(([key, value]) => {
    if (value === mockDeleteField) delete next[key];
  });
  mockDocuments.set(path, next);
}

function collectionDocs(pathPrefix: string, conditions: [string, string, any][] = []): any[] {
  return [...mockDocuments.entries()]
    .filter(([path]) => path.startsWith(`${pathPrefix}/`) && !path.slice(pathPrefix.length + 1).includes("/"))
    .map(([path]) => snapshotFor(path))
    .filter((snapshot) => conditions.every(([field, operator, expected]) => {
      const actual = snapshot.data()?.[field];
      if (operator === "==") return actual === expected;
      return false;
    }));
}

function collectionFor(path: string): any {
  const conditions: [string, string, any][] = [];
  const query = {
    where: (field: string, operator: string, value: any) => {
      conditions.push([field, operator, value]);
      return query;
    },
    get: async () => ({ docs: collectionDocs(path, conditions) }),
  };
  return {
    doc: (id?: string) => refFor(`${path}/${id ?? `generated-${mockDocuments.size}`}`),
    where: query.where,
    get: query.get,
  };
}

const mockDb = {
  doc: jest.fn((path: string) => refFor(path)),
  collection: jest.fn((path: string) => collectionFor(path)),
  collectionGroup: jest.fn((path: string) => collectionFor(path)),
  runTransaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => callback({
    get: async (ref: any) => snapshotFor(ref.path),
    update: async (ref: any, data: Record<string, any>) => {
      updateDocument(ref.path, data);
    },
    set: async (ref: any, data: Record<string, any>, options?: { merge?: boolean }) => {
      const current = mockDocuments.get(ref.path) ?? {};
      mockDocuments.set(ref.path, options?.merge ? { ...current, ...applySentinels(data) } : applySentinels(data));
    },
  })),
};

jest.mock("firebase-admin/app", () => ({
  getApps: () => [],
  initializeApp: jest.fn(),
}), { virtual: true });

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => mockServerTimestamp,
    delete: () => mockDeleteField,
    arrayUnion: (...values: any[]) => values,
  },
  getFirestore: () => ({
    doc: (path: string) => mockDb.doc(path),
    collection: (path: string) => mockDb.collection(path),
    collectionGroup: (path: string) => mockDb.collectionGroup(path),
    runTransaction: (callback: (transaction: any) => Promise<unknown>) => mockDb.runTransaction(callback),
  }),
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

jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_schedule: string, handler: unknown) => handler,
}), { virtual: true });

jest.mock("../../functions/src/lib/push", () => ({
  sendPushToUser: jest.fn(async (userId: string, payload: Record<string, any>) => {
    mockPushes.push({ userId, payload });
  }),
}));

jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));

jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock("@/src/config/firebase", () => ({ db: {}, firebaseAuth: {} }));
jest.mock("@/src/config/functions", () => ({ firebaseFunctions: {} }));

type CallableRequest = { auth: { uid: string }; data: Record<string, any> };

function request(uid: string, data: Record<string, any>): CallableRequest {
  return { auth: { uid }, data };
}

function invokeCallable(callable: unknown, input: CallableRequest): Promise<any> {
  return (callable as any)(input);
}

const runScheduled = processLeadInactivityDispatch as unknown as () => Promise<void>;

function seedUser(id: string, data: Record<string, any> = {}) {
  mockDocuments.set(`users/${id}`, {
    agencyId: "agency-1",
    agencyStatus: "approved",
    is_broker: true,
    name: id,
    ...data,
  });
}

function seedApartment(id: string, data: Record<string, any> = {}) {
  mockDocuments.set(`apartments/${id}`, {
    agencyId: "agency-1",
    title: "Apartment One",
    assignmentStatus: "pool",
    assignedBrokerIds: [],
    ...data,
  });
}

beforeEach(() => {
  mockDocuments.clear();
  mockPushes.length = 0;
  mockCallable.mockReset();
});

describe("agency property claims", () => {
  it("atomically leaves a pending claim and blocks a concurrent broker", async () => {
    seedUser("broker-1");
    seedUser("broker-2");
    seedUser("secretary", { agencyRole: "secretary", is_broker: false });
    seedApartment("apt-1");

    const first = await invokeCallable(claimPropertyCallable, request("broker-1", { apartmentId: "apt-1" }));
    expect(first).toEqual(expect.objectContaining({ status: "claim_pending" }));
    expect(mockDocuments.get("apartments/apt-1")).toEqual(expect.objectContaining({
      assignmentStatus: "claim_pending",
      pendingClaimBrokerId: "broker-1",
    }));

    await expect(invokeCallable(claimPropertyCallable, request("broker-2", { apartmentId: "apt-1" }))).rejects.toThrow("Another claim is already under review");
  });

  it("approves only the requesting broker and adds the owner client after approval", async () => {
    seedUser("broker-1");
    seedUser("secretary", { agencyRole: "secretary", is_broker: false });
    seedApartment("apt-1", { assignmentStatus: "claim_pending", pendingClaimBrokerId: "broker-1", ownerId: "owner-1", ownerDetails: { name: "Owner" } });
    mockDocuments.set("agency_claims/claim-1", { agencyId: "agency-1", apartmentId: "apt-1", apartmentTitle: "Apartment One", brokerId: "broker-1", status: "pending" });

    expect(mockDocuments.has("brokerClientProfiles/broker-1_owner-1")).toBe(false);
    await invokeCallable(reviewClaimCallable, request("secretary", { claimId: "claim-1", approved: true }));

    expect(mockDocuments.get("apartments/apt-1")).toEqual(expect.objectContaining({ assignmentStatus: "assigned", assignedBrokerIds: ["broker-1"] }));
    expect(mockDocuments.get("agency_claims/claim-1")).toEqual(expect.objectContaining({ status: "approved" }));
    expect(mockDocuments.get("brokerClientProfiles/broker-1_owner-1")).toEqual(expect.objectContaining({ role: "owner" }));
    expect(mockPushes).toContainEqual(expect.objectContaining({ userId: "broker-1", payload: expect.objectContaining({ action: "claim_approved", title: expect.stringContaining("Apartment One") }) }));
  });

  it("rejects a claim by rolling the apartment back and recording the broker", async () => {
    seedUser("broker-1");
    seedUser("secretary", { agencyRole: "secretary", is_broker: false });
    seedApartment("apt-1", { assignmentStatus: "claim_pending", pendingClaimBrokerId: "broker-1", ownerId: "owner-1" });
    mockDocuments.set("agency_claims/claim-1", { agencyId: "agency-1", apartmentId: "apt-1", apartmentTitle: "Apartment One", brokerId: "broker-1", status: "pending" });

    await invokeCallable(reviewClaimCallable, request("secretary", { claimId: "claim-1", approved: false }));

    expect(mockDocuments.get("apartments/apt-1")).toEqual(expect.objectContaining({ assignmentStatus: "unassigned_pool", rejectedBrokerIds: ["broker-1"] }));
    expect(mockDocuments.get("apartments/apt-1")).not.toHaveProperty("pendingClaimBrokerId");
    expect(mockDocuments.has("brokerClientProfiles/broker-1_owner-1")).toBe(false);
    expect(mockDocuments.get("agency_claims/claim-1")).toEqual(expect.objectContaining({ status: "rejected" }));
  });
});

describe("commission settlement", () => {
  it("rejects split percentages that do not total 100%", () => {
    expect(() => calculateCommissionSplits({
      totalCommission: 1000,
      agencyCutPercentage: 50,
      listingPercentage: 20,
      buyerPercentage: 20,
      listingBroker: { id: "listing", name: "Listing" },
      buyerBroker: { id: "buyer", name: "Buyer" },
    })).toThrow();
  });

  it("calculates office, listing, and selling amounts from total commission", () => {
    const result = calculateCommissionSplits({
      totalCommission: 2400,
      agencyCutPercentage: 50,
      listingPercentage: 25,
      buyerPercentage: 25,
      listingBroker: { id: "listing", name: "Listing" },
      buyerBroker: { id: "buyer", name: "Buyer" },
    });
    expect(result.agencyAmount).toBe(1200);
    expect(result.brokerSplits.map((split) => split.amount)).toEqual([600, 600]);
  });

  it("advances settlement through pending review, approval, issue, and settled", async () => {
    seedUser("secretary", { agencyRole: "secretary", is_broker: false });
    mockDocuments.set("deals/deal-1", { agencyId: "agency-1", settlementStatus: "pending_review", commissionTotal: 2400, agencyCutPercentage: 50, listingBrokerId: "listing", buyerBrokerId: "buyer" });
    mockDocuments.set("agencies/agency-1/commission_settlements/deal-1", { invoiceStatus: "pending_review" });

    const statuses: string[] = [];
    mockCallable.mockImplementation(async (payload: Record<string, any>) => {
      statuses.push(payload.action);
      return { data: { status: payload.action === "approve" ? "approved" : payload.action === "issue" ? "issued" : "settled", dealId: "deal-1" } };
    });

    await issueCommissionSettlement({
      agencyId: "agency-1",
      deal: { id: "deal-1", agencyId: "agency-1", apartmentId: "apt-1", clientId: "client-1", dealAmount: 24000, commissionTotal: 2400, agencyCutPercentage: 50, agencyCutAmount: 1200, listingBrokerId: "listing", buyerBrokerId: "buyer", brokerSplits: [], status: "closed", stage: 100, createdAt: 0 } as any,
      agencyShare: 1200,
      agencyCutPercentage: 50,
      brokerSplits: [
        { brokerId: "listing", brokerName: "Listing", role: "listing_agent", percentage: 25, amount: 600 },
        { brokerId: "buyer", brokerName: "Buyer", role: "buyer_agent", percentage: 25, amount: 600 },
      ],
    });
    expect(statuses).toEqual(["approve", "issue", "settle"]);
  });
});

describe("showings and key safe", () => {
  it("keeps listing and selling participants and attributes delegated feedback", async () => {
    seedUser("listing");
    seedUser("buyer");
    seedUser("covering");
    mockDocuments.set("appointments/appointment-1", { agencyId: "agency-1", brokerId: "buyer", listingBrokerId: "listing", buyerBrokerId: "buyer", clientId: "client-1", status: "confirmed" });

    await invokeCallable(delegateShowingCallable, request("buyer", { appointmentId: "appointment-1", coveringBrokerId: "covering" }));
    expect(mockDocuments.get("appointments/appointment-1")).toEqual(expect.objectContaining({ listingBrokerId: "listing", buyerBrokerId: "buyer", coveringBrokerId: "covering" }));
    await invokeCallable(recordShowingFeedbackCallable, request("covering", { appointmentId: "appointment-1" }));
    expect(mockDocuments.get("appointments/appointment-1")).toEqual(expect.objectContaining({ status: "completed", feedbackSubmittedBy: { covering: true } }));
  });

  it("prevents a second checkout and records broker and timestamps", async () => {
    seedUser("broker-1");
    seedUser("broker-2");
    seedApartment("apt-1", { assignmentStatus: "assigned" });

    await invokeCallable(recordKeySafeActionCallable, request("broker-1", { apartmentId: "apt-1", action: "checkout", notes: "Front door" }));
    await expect(invokeCallable(recordKeySafeActionCallable, request("broker-2", { apartmentId: "apt-1", action: "checkout" }))).rejects.toThrow("already checked out");
    const apartment = mockDocuments.get("apartments/apt-1") ?? {};
    expect(apartment.currentKeyHolderId).toBe("broker-1");
    expect(apartment.keySafeLogs?.[0]).toEqual(expect.objectContaining({ brokerId: "broker-1", action: "checkout", notes: "Front door" }));
    expect(typeof apartment.keySafeLogs?.[0]?.timestamp).toBe("number");
  });
});

describe("lead inactivity", () => {
  it("does not reallocate a lead that has recorded outbound contact", async () => {
    seedUser("broker-1");
    mockDocuments.set("leads/lead-1", { agencyId: "agency-1", clientName: "Client", status: "assigned", assignedBrokerId: "broker-1", assignedAt: Date.now() - 25 * 60 * 60 * 1000, lastContactTimestamp: Date.now() - 60 * 60 * 1000 });

    await runScheduled();
    expect(mockDocuments.get("leads/lead-1")).toEqual(expect.objectContaining({ status: "assigned", assignedBrokerId: "broker-1" }));
    expect(mockPushes).toHaveLength(0);
  });

  it("reallocates an untouched lead and notifies the forfeited broker", async () => {
    seedUser("broker-1");
    mockDocuments.set("leads/lead-1", { agencyId: "agency-1", clientName: "Client One", status: "assigned", assignedBrokerId: "broker-1", assignedAt: Date.now() - 25 * 60 * 60 * 1000, lastContactTimestamp: null });

    await runScheduled();
    expect(mockDocuments.get("leads/lead-1")).toEqual(expect.objectContaining({ status: "unassigned_pool", assignedBrokerId: null, reallocationReason: "24h_inactivity" }));
    expect(mockPushes).toContainEqual(expect.objectContaining({
      userId: "broker-1",
      payload: expect.objectContaining({
        action: "lead_inactivity_reallocated",
        body: expect.stringContaining("Client One"),
      }),
    }));
  });
});
