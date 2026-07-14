import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "@/src/config/firebase";

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export async function uploadImageAsync(uri: string, path: string): Promise<string> {
  if (isRemoteUrl(uri)) {
    return uri;
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  const imageRef = ref(storage, path);

  try {
    await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });
  } finally {
    if (typeof (blob as Blob & { close?: () => void }).close === "function") {
      (blob as Blob & { close?: () => void }).close?.();
    }
  }

  return getDownloadURL(imageRef);
}

export async function uploadProfileImageAsync(uri: string, userId: string, index: number): Promise<string> {
  return uploadImageAsync(uri, `profile-photos/${userId}/${Date.now()}-${index}.jpg`);
}

export async function uploadListingImageAsync(uri: string, userId: string, index: number): Promise<string> {
  return uploadImageAsync(uri, `listings/${userId}/${Date.now()}-${index}.jpg`);
}