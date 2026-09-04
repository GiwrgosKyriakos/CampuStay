import type { VirtualTourData } from "@/src/types/apartment";
import {
  buildSwitchSceneCommand,
  buildTourSceneStoragePath,
  filterVirtualTourHotspots,
  getNextActiveSceneId,
  getPannellumConfig,
  isValidEquirectangularDimensions,
  parseVirtualTourBridgeMessage,
  serializePannellumConfig,
} from "@/src/utils/virtualTour";

function createTour(overrides: Partial<VirtualTourData> = {}): VirtualTourData {
  return {
    enabled: true,
    defaultSceneId: "living-room",
    scenes: [
      {
        id: "living-room",
        title: "Living Room",
        imageUrl: "https://example.test/living-room.jpg",
        hotspots: [
          { pitch: 2, yaw: 18, type: "scene", text: "Bedroom", targetSceneId: "bedroom" },
          { pitch: 0, yaw: -30, type: "scene", text: "Deleted Room", targetSceneId: "deleted-room" },
        ],
      },
      {
        id: "bedroom",
        title: "Bedroom",
        imageUrl: "https://example.test/bedroom.jpg",
        hotspots: [],
      },
    ],
    ...overrides,
  };
}

describe("360 degree virtual tour pipeline", () => {
  describe("schema and fallback serialization", () => {
    it("serializes a valid Pannellum config with the designated default scene", () => {
      const tour = createTour();
      const serialized = serializePannellumConfig(tour);
      const parsed = JSON.parse(serialized) as ReturnType<typeof getPannellumConfig>;

      expect(parsed.default.firstScene).toBe("living-room");
      expect(parsed.scenes["living-room"].panorama).toContain("living-room.jpg");
    });

    it("falls back to the first scene when the default scene is missing or invalid", () => {
      expect(getPannellumConfig(createTour({ defaultSceneId: "" })).default.firstScene).toBe("living-room");
      expect(getPannellumConfig(createTour({ defaultSceneId: "missing-room" })).default.firstScene).toBe("living-room");
    });
  });

  describe("equirectangular aspect validation", () => {
    it("accepts a 4000x2000 panorama", () => {
      expect(isValidEquirectangularDimensions(4000, 2000)).toBe(true);
    });

    it.each([
      [1920, 1080],
      [1080, 1080],
    ])("rejects a %sx%s standard photo", (width, height) => {
      expect(isValidEquirectangularDimensions(width, height)).toBe(false);
    });
  });

  describe("WebView bridge communication", () => {
    it("generates the room-switch JavaScript command", () => {
      expect(buildSwitchSceneCommand("bedroom")).toBe("window.switchScene('bedroom')");
    });

    it("updates the active scene from a SCENE_CHANGED postMessage", () => {
      const message = parseVirtualTourBridgeMessage(JSON.stringify({ type: "SCENE_CHANGED", sceneId: "bedroom" }));
      const availableSceneIds = new Set(["living-room", "bedroom"]);

      expect(message).toEqual({ type: "SCENE_CHANGED", sceneId: "bedroom" });
      expect(getNextActiveSceneId("living-room", message!, availableSceneIds)).toBe("bedroom");
    });
  });

  describe("hotspot navigation", () => {
    it("keeps links to existing scenes and filters broken links", () => {
      const tour = createTour();
      const availableSceneIds = new Set(tour.scenes.map((scene) => scene.id));
      const hotspots = filterVirtualTourHotspots(tour.scenes[0], availableSceneIds);

      expect(hotspots).toHaveLength(1);
      expect(hotspots[0].targetSceneId).toBe("bedroom");
      expect(getPannellumConfig(tour).scenes["living-room"].hotSpots).toHaveLength(1);
    });
  });

  describe("Storage paths", () => {
    it("uses the canonical panorama Storage path", () => {
      expect(buildTourSceneStoragePath("apartment-42", "bedroom")).toBe("apartments/apartment-42/360_scenes/bedroom.jpg");
    });
  });
});
