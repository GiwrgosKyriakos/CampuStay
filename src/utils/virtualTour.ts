import type { VirtualTourData, VirtualTourHotspot, VirtualTourScene } from "@/src/types/apartment";

export const TOUR_ASPECT_RATIO_MIN = 1.9;
export const TOUR_ASPECT_RATIO_MAX = 2.1;

export interface PannellumConfig {
  default: {
    firstScene?: string;
    autoLoad: boolean;
    showControls: boolean;
    compass: boolean;
    hfov: number;
    minHfov: number;
    maxHfov: number;
  };
  scenes: Record<string, {
    title: string;
    type: "equirectangular";
    panorama: string;
    hotSpots: Array<{
      pitch: number;
      yaw: number;
      type: "scene";
      text: string;
      sceneId: string;
    }>;
  }>;
}

export function isValidEquirectangularDimensions(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= TOUR_ASPECT_RATIO_MIN && ratio <= TOUR_ASPECT_RATIO_MAX;
}

export function resolveDefaultSceneId(tourData: VirtualTourData): string | undefined {
  const hasConfiguredScene = tourData.scenes.some((scene) => scene.id === tourData.defaultSceneId);
  return hasConfiguredScene ? tourData.defaultSceneId : tourData.scenes[0]?.id;
}

export function filterVirtualTourHotspots(scene: VirtualTourScene, availableSceneIds: ReadonlySet<string>): VirtualTourHotspot[] {
  return (scene.hotspots ?? []).filter((hotspot) => availableSceneIds.has(hotspot.targetSceneId));
}

export function getPannellumConfig(tourData: VirtualTourData): PannellumConfig {
  const availableSceneIds = new Set(tourData.scenes.map((scene) => scene.id));
  return {
    default: {
      firstScene: resolveDefaultSceneId(tourData),
      autoLoad: true,
      showControls: false,
      compass: false,
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
    },
    scenes: Object.fromEntries(tourData.scenes.map((scene) => [scene.id, {
      title: scene.title,
      type: "equirectangular",
      panorama: scene.imageUrl,
      hotSpots: filterVirtualTourHotspots(scene, availableSceneIds).map((hotspot) => ({
        pitch: hotspot.pitch,
        yaw: hotspot.yaw,
        type: "scene" as const,
        text: hotspot.text,
        sceneId: hotspot.targetSceneId,
      })),
    }])),
  };
}

export function serializePannellumConfig(tourData: VirtualTourData): string {
  return JSON.stringify(getPannellumConfig(tourData));
}

export function buildSwitchSceneCommand(sceneId: string): string {
  const safeSceneId = sceneId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `window.switchScene('${safeSceneId}')`;
}

export interface VirtualTourBridgeMessage {
  type?: string;
  sceneId?: string;
  error?: string;
}

export function parseVirtualTourBridgeMessage(serializedMessage: string): VirtualTourBridgeMessage | null {
  try {
    const message = JSON.parse(serializedMessage) as unknown;
    if (!message || typeof message !== "object") return null;
    return message as VirtualTourBridgeMessage;
  } catch {
    return null;
  }
}

export function getNextActiveSceneId(currentSceneId: string, message: VirtualTourBridgeMessage, availableSceneIds: ReadonlySet<string>): string {
  if (message.type === "SCENE_CHANGED" && message.sceneId && availableSceneIds.has(message.sceneId)) return message.sceneId;
  return currentSceneId;
}

export function buildTourSceneStoragePath(apartmentId: string, sceneId: string): string {
  return `apartments/${apartmentId}/360_scenes/${sceneId}.jpg`;
}
