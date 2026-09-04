import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { dispatchMailOutboxMessage } from "../lib/mailOutbox";

const db = getFirestore();

export const processMailOutbox = onSchedule("every 5 minutes", async () => {
  const now = Date.now();
  const [pending, failed] = await Promise.all([
    db.collection("mail_outbox").where("status", "==", "pending").where("nextAttemptAt", "<=", now).limit(25).get(),
    db.collection("mail_outbox").where("status", "==", "failed").where("nextAttemptAt", "<=", now).limit(25).get(),
  ]);
  const messageIds = new Set([...pending.docs, ...failed.docs].map((snapshot) => snapshot.id));
  await Promise.all(Array.from(messageIds).map((messageId) => dispatchMailOutboxMessage(messageId)));
});
