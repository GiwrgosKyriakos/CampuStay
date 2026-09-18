jest.mock("@/src/config/firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));

import { deduplicateBrokerNotes, type BrokerNote } from "@/src/api/brokerCalendar";

const createNote = (overrides: Partial<BrokerNote> = {}): BrokerNote => ({
  id: "note-1",
  brokerId: "broker-1",
  calendarOwnerId: "broker-1",
  date: "2026-09-17",
  time: "10:00",
  category: "showing",
  title: "Viewing",
  notesText: "Check the apartment",
  done: false,
  createdAt: {} as BrokerNote["createdAt"],
  ...overrides,
});

describe("broker note deduplication", () => {
  it("removes legacy duplicate content while keeping distinct notes", () => {
    const notes = [
      createNote({ id: "legacy-1" }),
      createNote({ id: "legacy-2" }),
      createNote({ id: "distinct", time: "11:00" }),
    ];

    expect(deduplicateBrokerNotes(notes).map((note) => note.id)).toEqual(["legacy-1", "distinct"]);
  });

  it("collapses covering copies linked to the same primary note", () => {
    const notes = [
      createNote({ id: "primary" }),
      createNote({ id: "covering", primaryNoteId: "primary", calendarOwnerId: "covering-broker" }),
    ];

    expect(deduplicateBrokerNotes(notes)).toHaveLength(1);
  });
});
