jest.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  query: (ref: { path: string }, ...constraints: unknown[]) => ({ ...ref, constraints }),
  where: jest.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock("@/src/config/firebase", () => ({ db: {}, firebaseAuth: {} }));

import { getCandidateMatchRecords } from "@/src/api/discover";

const { getDocs: mockGetDocs, getDoc: mockGetDoc, where: mockWhere } = jest.requireMock("firebase/firestore") as {
  getDocs: jest.Mock;
  getDoc: jest.Mock;
  where: jest.Mock;
};

function makeSnapshot(documents: Array<{ id: string; data: () => Record<string, unknown> }>) {
  return {
    docs: documents,
    empty: documents.length === 0,
    size: documents.length,
    forEach: (callback: (document: typeof documents[number]) => void) => documents.forEach(callback),
  };
}

describe("getCandidateMatchRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocs.mockImplementation(async (target: { path: string }) => {
      if (target.path === "users") {
        return makeSnapshot([
          {
            id: "viewer",
            data: () => ({ city: "Athens", blockedUserIds: [] }),
          },
          {
            id: "candidate-without-readable-quiz",
            data: () => ({ name: "Candidate", age: 24, city: "Athens", gender: "Female", budget: 500 }),
          },
        ]);
      }

      return makeSnapshot([]);
    });
    mockGetDoc.mockImplementation(async (target: { path: string; id: string }) => {
      if (target.path === "users" && target.id === "viewer") {
        return { exists: () => true, data: () => ({ city: "Athens", blockedUserIds: [] }) };
      }
      if (target.path === "settings" && target.id === "viewer") {
        return { exists: () => false, data: () => ({}) };
      }
      if (target.path === "quiz_answers") {
        throw new Error("permission-denied");
      }
      return { exists: () => false, data: () => ({}) };
    });
  });

  it("retains profile cards when candidate quiz reads are denied", async () => {
    const records = await getCandidateMatchRecords("viewer", "Athens");

    expect(records.map((record) => record.profile.id)).toEqual(["candidate-without-readable-quiz"]);
    expect(records[0]?.quizAnswers).toEqual({});
    expect(mockWhere).not.toHaveBeenCalledWith("toUid", "==", "viewer");
  });
});