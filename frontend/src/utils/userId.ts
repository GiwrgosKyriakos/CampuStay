import { storage } from "@/src/utils/storage";

const KEY = "roomie_user_id";
let cached: string | null = null;

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getUserId(): Promise<string> {
  if (cached) return cached;
  let id: string | null = await storage.getItem(KEY, null);
  if (!id) {
    id = uuidv4();
    await storage.setItem(KEY, id);
  }
  cached = id;
  return id;
}

// Used by the auth layer to bind the active account's id so profile/quiz
// screens (which read getUserId) target the logged-in user.
export function setUserIdCache(id: string | null): void {
  cached = id;
}
