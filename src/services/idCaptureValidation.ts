import type { IdCaptureSideMetadata } from "@/src/types/esignature";

export const ID_CAPTURE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ID_CAPTURE_MIN_SHORT_SIDE = 600;
export const ID_CAPTURE_MIN_LONG_SIDE = 1000;
export const ID_CAPTURE_MIN_ASPECT_RATIO = 1.2;
export const ID_CAPTURE_MAX_ASPECT_RATIO = 2;

export function validateIdCaptureMetadata(metadata: IdCaptureSideMetadata): void {
  const longSide = Math.max(metadata.width, metadata.height);
  const shortSide = Math.min(metadata.width, metadata.height);
  const aspectRatio = longSide / shortSide;
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || longSide < ID_CAPTURE_MIN_LONG_SIDE || shortSide < ID_CAPTURE_MIN_SHORT_SIDE) {
    throw new Error("The identification image has insufficient resolution.");
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio < ID_CAPTURE_MIN_ASPECT_RATIO || aspectRatio > ID_CAPTURE_MAX_ASPECT_RATIO) {
    throw new Error("The identification image must have a document aspect ratio.");
  }
  if (!Number.isInteger(metadata.fileSizeBytes) || metadata.fileSizeBytes <= 0 || metadata.fileSizeBytes >= ID_CAPTURE_MAX_FILE_SIZE_BYTES) {
    throw new Error("The identification image must be smaller than 10 MB.");
  }
}
