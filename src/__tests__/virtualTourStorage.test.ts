jest.mock("firebase/storage", () => ({
  deleteObject: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(),
  listAll: jest.fn(() => Promise.resolve({ items: [], prefixes: [] })),
  ref: jest.fn((storage, path) => ({ storage, path })),
  uploadBytes: jest.fn(),
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock("@/src/config/firebase", () => ({
  db: {},
  storage: { name: "test-storage" },
}));

import { deleteObject, listAll, ref } from "firebase/storage";
import { deleteListingTourScenesAsync, deleteStorageFileAsync } from "@/src/api/imageUpload";

const mockedDeleteObject = jest.mocked(deleteObject);
const mockedListAll = jest.mocked(listAll);
const mockedRef = jest.mocked(ref);

describe("virtual tour Storage cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes a removed remote scene asset", async () => {
    const imageUrl = "https://firebasestorage.googleapis.com/v0/b/test/o/apartments%2Fapt-1%2F360_scenes%2Fscene-1.jpg?alt=media";

    await deleteStorageFileAsync(imageUrl);

    expect(mockedRef).toHaveBeenCalledWith({ name: "test-storage" }, imageUrl);
    expect(mockedDeleteObject).toHaveBeenCalledTimes(1);
  });

  it("removes every object under a listing's 360 scene folder", async () => {
    const sceneRef = { fullPath: "apartments/apt-1/360_scenes/scene-1.jpg" };
    mockedListAll.mockResolvedValueOnce({ items: [sceneRef as never], prefixes: [] });

    await deleteListingTourScenesAsync("apt-1");

    expect(mockedRef).toHaveBeenCalledWith({ name: "test-storage" }, "apartments/apt-1/360_scenes");
    expect(mockedDeleteObject).toHaveBeenCalledWith(sceneRef);
  });
});
