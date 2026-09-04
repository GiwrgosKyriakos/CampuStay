"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMailOutbox = void 0;
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const mailOutbox_1 = require("../lib/mailOutbox");
const db = (0, firestore_1.getFirestore)();
exports.processMailOutbox = (0, scheduler_1.onSchedule)("every 5 minutes", async () => {
    const now = Date.now();
    const [pending, failed] = await Promise.all([
        db.collection("mail_outbox").where("status", "==", "pending").where("nextAttemptAt", "<=", now).limit(25).get(),
        db.collection("mail_outbox").where("status", "==", "failed").where("nextAttemptAt", "<=", now).limit(25).get(),
    ]);
    const messageIds = new Set([...pending.docs, ...failed.docs].map((snapshot) => snapshot.id));
    await Promise.all(Array.from(messageIds).map((messageId) => (0, mailOutbox_1.dispatchMailOutboxMessage)(messageId)));
});
//# sourceMappingURL=mailOutbox.js.map