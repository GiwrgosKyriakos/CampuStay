import { getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
if (getApps().length === 0) initializeApp();
const db = getFirestore();

type PushData = Record<string, string | number | boolean | undefined>;

function isExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

async function pruneToken(userId: string, token: string): Promise<void> {
  const userRef = db.doc(`users/${userId}`);
  const snapshot = await userRef.get();
  const tokens = Array.isArray(snapshot.data()?.fcmTokens) ? snapshot.data()?.fcmTokens.filter((entry: unknown) => entry !== token) : [];
  await userRef.set({ fcmTokens: tokens, ...(snapshot.data()?.expoPushToken === token ? { expoPushToken: null } : {}) }, { merge: true });
}

async function sendExpoToken(userId: string, token: string, title: string, body: string, data: PushData): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ to: token, sound: "default", title, body, data, ...(typeof data.categoryId === "string" ? { categoryId: data.categoryId } : {}), ...(typeof data.channelId === "string" ? { channelId: data.channelId } : {}) }),
  });
  const payload = await response.json() as { data?: { status?: string; details?: { error?: string } } };
  const error = payload.data?.details?.error;
  if (error === "DeviceNotRegistered" || error === "InvalidCredentials") await pruneToken(userId, token);
}

export async function sendPushToUser(userId: string, title: string, body: string, data: PushData = {}): Promise<void> {
  const snapshot = await db.doc(`users/${userId}`).get();
  if (!snapshot.exists) return;
  const userData = snapshot.data() as DocumentData;
  const tokens = Array.from(new Set([
    ...(Array.isArray(userData.fcmTokens) ? userData.fcmTokens.filter((token: unknown): token is string => typeof token === "string" && Boolean(token.trim())) : []),
    ...(typeof userData.expoPushToken === "string" && userData.expoPushToken.trim() ? [userData.expoPushToken] : []),
  ]));
  const expoTokens = tokens.filter(isExpoToken);
  const fcmTokens = tokens.filter((token) => !isExpoToken(token));

  await Promise.all(expoTokens.map((token) => sendExpoToken(userId, token, title, body, data)));
  if (fcmTokens.length === 0) return;

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens: fcmTokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] !== "undefined").map(([key, value]) => [key, String(value)])),
      android: { priority: "high", notification: typeof data.channelId === "string" ? { channelId: data.channelId } : undefined },
    });
    await Promise.all(response.responses.map((result: any, index: number) => {
      if (result.success || result.error?.code !== "messaging/registration-token-not-registered") return Promise.resolve();
      return pruneToken(userId, fcmTokens[index]);
    }));
  } catch (error) {
    console.error("[Push] FCM delivery failed", error);
  }
}
