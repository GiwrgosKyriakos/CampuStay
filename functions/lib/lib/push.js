"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECURRING_DISPATCHES = void 0;
exports.sendPushToUser = sendPushToUser;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const firestore_1 = require("firebase-admin/firestore");
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
exports.MAX_RECURRING_DISPATCHES = 4;
function isExpoToken(token) {
    return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (!value || typeof value !== "object")
        return value;
    return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]));
}
function defaultDedupeKey(payload) {
    return JSON.stringify(canonicalize({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        entityId: payload.entityId ?? "",
        action: payload.action ?? "",
        screen: payload.screen,
        params: payload.params,
    }));
}
function hashKey(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
async function claimDispatch(userId, payload, channelId, options) {
    const dedupeKey = options?.dedupeKey ?? defaultDedupeKey(payload);
    const notificationRef = db.doc(`users/${userId}/notifications/${hashKey(dedupeKey)}`);
    const sequenceRef = options?.recurringKey
        ? db.doc(`users/${userId}/notificationSequences/${hashKey(options.recurringKey)}`)
        : null;
    const maxDispatches = Math.min(exports.MAX_RECURRING_DISPATCHES, Math.max(1, Math.floor(options?.maxDispatches ?? exports.MAX_RECURRING_DISPATCHES)));
    return db.runTransaction(async (transaction) => {
        const notificationSnapshot = await transaction.get(notificationRef);
        const sequenceSnapshot = sequenceRef ? await transaction.get(sequenceRef) : null;
        if (notificationSnapshot.exists)
            return null;
        const previousDispatchCount = Number(sequenceSnapshot?.data()?.dispatchCount ?? 0);
        if (sequenceRef && previousDispatchCount >= maxDispatches)
            return null;
        const dispatchCount = sequenceRef ? previousDispatchCount + 1 : 1;
        transaction.create(notificationRef, {
            ...payload,
            ...(channelId ? { channelId } : {}),
            read: false,
            createdAt: Date.now(),
            dedupeKey,
            ...(sequenceRef ? { recurringKey: options?.recurringKey, dispatchCount, maxDispatches } : {}),
        });
        if (sequenceRef) {
            transaction.set(sequenceRef, {
                recurringKey: options?.recurringKey,
                dispatchCount,
                maxDispatches,
                exhausted: dispatchCount >= maxDispatches,
                updatedAt: Date.now(),
            }, { merge: true });
        }
        return dispatchCount;
    });
}
async function pruneToken(userId, token) {
    const userRef = db.doc(`users/${userId}`);
    const snapshot = await userRef.get();
    const tokens = Array.isArray(snapshot.data()?.fcmTokens) ? snapshot.data()?.fcmTokens.filter((entry) => entry !== token) : [];
    await userRef.set({ fcmTokens: tokens, ...(snapshot.data()?.expoPushToken === token ? { expoPushToken: null } : {}) }, { merge: true });
}
function toTransportData(payload, channelId) {
    return {
        type: payload.type,
        screen: payload.screen,
        params: JSON.stringify(payload.params),
        ...(payload.entityId ? { entityId: payload.entityId } : {}),
        ...(payload.action ? { action: payload.action } : {}),
        ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
        ...(channelId ? { channelId } : {}),
    };
}
async function sendExpoToken(userId, token, payload, data) {
    const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ to: token, sound: "default", title: payload.title, body: payload.body, data, ...(payload.categoryId ? { categoryId: payload.categoryId } : {}), ...(typeof data.channelId === "string" ? { channelId: data.channelId } : {}) }),
    });
    const responsePayload = await response.json();
    const error = responsePayload.data?.details?.error;
    if (error === "DeviceNotRegistered" || error === "InvalidCredentials")
        await pruneToken(userId, token);
}
async function sendPushToUser(userId, payload, channelId, options) {
    const snapshot = await db.doc(`users/${userId}`).get();
    if (!snapshot.exists)
        return;
    const userData = snapshot.data();
    const dispatchCount = await claimDispatch(userId, payload, channelId, options);
    if (dispatchCount === null)
        return;
    const tokens = Array.from(new Set([
        ...(typeof userData.expoPushToken === "string" && userData.expoPushToken.trim()
            ? [userData.expoPushToken]
            : Array.isArray(userData.fcmTokens)
                ? userData.fcmTokens.filter((token) => typeof token === "string" && Boolean(token.trim()))
                : []),
    ]));
    const expoTokens = tokens.filter(isExpoToken);
    const fcmTokens = tokens.filter((token) => !isExpoToken(token));
    const data = toTransportData(payload, channelId);
    await Promise.all(expoTokens.map((token) => sendExpoToken(userId, token, payload, data)));
    if (fcmTokens.length === 0)
        return;
    try {
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
            tokens: fcmTokens,
            notification: { title: payload.title, body: payload.body },
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