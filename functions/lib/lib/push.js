"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushToUser = sendPushToUser;
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const firestore_1 = require("firebase-admin/firestore");
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function isExpoToken(token) {
    return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}
async function pruneToken(userId, token) {
    const userRef = db.doc(`users/${userId}`);
    const snapshot = await userRef.get();
    const tokens = Array.isArray(snapshot.data()?.fcmTokens) ? snapshot.data()?.fcmTokens.filter((entry) => entry !== token) : [];
    await userRef.set({ fcmTokens: tokens, ...(snapshot.data()?.expoPushToken === token ? { expoPushToken: null } : {}) }, { merge: true });
}
async function sendExpoToken(userId, token, title, body, data) {
    const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ to: token, sound: "default", title, body, data, ...(typeof data.categoryId === "string" ? { categoryId: data.categoryId } : {}), ...(typeof data.channelId === "string" ? { channelId: data.channelId } : {}) }),
    });
    const payload = await response.json();
    const error = payload.data?.details?.error;
    if (error === "DeviceNotRegistered" || error === "InvalidCredentials")
        await pruneToken(userId, token);
}
async function sendPushToUser(userId, title, body, data = {}) {
    const snapshot = await db.doc(`users/${userId}`).get();
    if (!snapshot.exists)
        return;
    const userData = snapshot.data();
    const tokens = Array.from(new Set([
        ...(Array.isArray(userData.fcmTokens) ? userData.fcmTokens.filter((token) => typeof token === "string" && Boolean(token.trim())) : []),
        ...(typeof userData.expoPushToken === "string" && userData.expoPushToken.trim() ? [userData.expoPushToken] : []),
    ]));
    const expoTokens = tokens.filter(isExpoToken);
    const fcmTokens = tokens.filter((token) => !isExpoToken(token));
    await Promise.all(expoTokens.map((token) => sendExpoToken(userId, token, title, body, data)));
    if (fcmTokens.length === 0)
        return;
    try {
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
            tokens: fcmTokens,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).filter((entry) => typeof entry[1] !== "undefined").map(([key, value]) => [key, String(value)])),
            android: { priority: "high", notification: typeof data.channelId === "string" ? { channelId: data.channelId } : undefined },
        });
        await Promise.all(response.responses.map((result, index) => {
            if (result.success || result.error?.code !== "messaging/registration-token-not-registered")
                return Promise.resolve();
            return pruneToken(userId, fcmTokens[index]);
        }));
    }
    catch (error) {
        console.error("[Push] FCM delivery failed", error);
    }
}
//# sourceMappingURL=push.js.map