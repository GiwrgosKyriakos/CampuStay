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
  let id = await storage.getItem(KEY, "");
  if (!id) {
    id = uuidv4();
    await storage.setItem(KEY, id);
  }
  cached = id;
  return id;
}
