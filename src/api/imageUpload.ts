import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db, storage } from "@/src/config/firebase";

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function buildApartmentImageFileName(uri: string, index: number): string {
  const withoutQuery = uri.split("?")[0];
  const rawName = withoutQuery.split("/").pop() || "image";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(safeName);
  const baseName = hasExtension ? safeName.replace(/\.[a-zA-Z0-9]+$/, "") : safeName;
  const extension = hasExtension ? safeName.slice(safeName.lastIndexOf(".")) : ".jpg";
  return `${Date.now()}-${index}-${baseName}${extension}`;
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

export async function uploadApartmentImages(imageUris: string[], apartmentId: string): Promise<string[]> {
  const validUris = imageUris
    .map((uri) => uri?.trim())
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);

  if (!apartmentId || validUris.length === 0) {
    await setDoc(
      doc(db, "apartments", apartmentId),
      {
        photos: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return [];
  }

  const downloadUrls = await Promise.all(
    validUris.map(async (uri, index) => {
      if (isRemoteUrl(uri)) return uri;

      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = buildApartmentImageFileName(uri, index);
      const imageRef = ref(storage, `apartments/${apartmentId}/${fileName}`);

      try {
        await uploadBytes(imageRef, blob);
      } finally {
        if (typeof (blob as Blob & { close?: () => void }).close === "function") {
          (blob as Blob & { close?: () => void }).close?.();
        }
      }

      return getDownloadURL(imageRef);
    }),
  );

  await setDoc(
    doc(db, "apartments", apartmentId),
    {
      photos: downloadUrls,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return downloadUrls;
}