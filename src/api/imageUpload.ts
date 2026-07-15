import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, storage } from "@/src/config/firebase";

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//.test(uri);
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

function guessContentType(uri: string): string {
  const cleanUri = uri.split("?")[0].toLowerCase();
  if (cleanUri.endsWith(".png")) return "image/png";
  if (cleanUri.endsWith(".webp")) return "image/webp";
  if (cleanUri.endsWith(".heic") || cleanUri.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

// 🟢 Η ΔΙΟΡΘΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ: Μετατροπή τοπικού URI σε Blob με XMLHttpRequest
async function uriToBlob(uri: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      const blob = xhr.response as Blob;
      if (!blob || typeof blob.size !== "number" || blob.size <= 0) {
        reject(new Error("Fetched blob is empty"));
      } else {
        resolve(blob);
      }
    };
    xhr.onerror = function (e) {
      console.error("[ImageUpload] Failed to convert URI to Blob via XHR:", e);
      reject(new TypeError("Network request failed during local file conversion."));
    };
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

export async function uploadImageAsync(uri: string, path: string): Promise<string> {
  if (isRemoteUrl(uri)) {
    return uri;
  }

  if (!path?.trim()) {
    throw new Error("Storage upload path is required");
  }

  const blob = await uriToBlob(uri);
  const imageRef = ref(storage, path);

  try {
    await uploadBytes(imageRef, blob, { contentType: guessContentType(uri) });
    return await getDownloadURL(imageRef);
  } catch (error) {
    console.error("[ImageUpload] Firebase Storage upload failed", {
      path,
      uri,
      error,
    });
    throw error;
  } finally {
    // Ασφαλές κλείσιμο του blob για αποφυγή memory leaks
    if (blob && typeof (blob as any).close === "function") {
      (blob as any).close();
    }
  }
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

  if (!apartmentId?.trim()) {
    console.error("[ImageUpload] Missing apartmentId while uploading apartment images", {
      imageCount: validUris.length,
    });
    throw new Error("Apartment id is required for image uploads");
  }

  if (validUris.length === 0) {
    await setDoc(
      doc(db, "apartments", apartmentId),
      {
        photos: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return [];
  }

  const downloadUrls = await Promise.all(
    validUris.map(async (uri, index) => {
      if (isRemoteUrl(uri)) return uri;

      const blob = await uriToBlob(uri);
      const fileName = buildApartmentImageFileName(uri, index);
      const imageRef = ref(storage, `apartments/${apartmentId}/${fileName}`);

      try {
        await uploadBytes(imageRef, blob, { contentType: guessContentType(uri) });
        return await getDownloadURL(imageRef);
      } catch (error) {
        console.error("[ImageUpload] Failed apartment image upload", {
          apartmentId,
          fileName,
          uri,
          error,
        });
        throw error;
      } finally {
        if (blob && typeof (blob as any).close === "function") {
          (blob as any).close();
        }
      }
    })
  );

  await setDoc(
    doc(db, "apartments", apartmentId),
    {
      photos: downloadUrls,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return downloadUrls;
}