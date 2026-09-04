"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAnalyticsEvent = logAnalyticsEvent;
const firestore_1 = require("firebase-admin/firestore");
async function logAnalyticsEvent(event, idempotencyKey) {
    const eventId = idempotencyKey || `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const reference = (0, firestore_1.getFirestore)().doc(`analytics_events/${eventId}`);
    try {
        await reference.create({ id: reference.id, ...event });
    }
    catch (error) {
        const code = error.code;
        if (code !== 6 && code !== "already-exists")
            throw error;
    }
    return reference.id;
}
//# sourceMappingURL=analyticsEvents.js.map