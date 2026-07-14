import {
  Timestamp,
  arrayUnion,
  doc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";

export interface ReportedUserRecord {
  message: string;
  timestamp: Timestamp;
  chatRoomId: string | null;
}

export interface SubmitUserReportInput {
  reportedUserId: string;
  reportedUsername: string;
  reporterUid: string;
  reportReasonText: string;
  chatRoomId?: string | null;
}

export async function submitReportedUserEntry(input: SubmitUserReportInput): Promise<void> {
  const {
    reportedUserId,
    reportedUsername,
    reporterUid,
    reportReasonText,
    chatRoomId = null,
  } = input;

  const sanitizedReason = reportReasonText.trim();
  if (!reportedUserId.trim()) {
    throw new Error("reportedUserId is required.");
  }
  if (!reporterUid.trim()) {
    throw new Error("reporterUid is required.");
  }
  if (!sanitizedReason) {
    throw new Error("reportReasonText is required.");
  }

  const reportTimestamp = Timestamp.now();
  const reportEntry: ReportedUserRecord & { reporterUid: string } = {
    reporterUid,
    message: sanitizedReason,
    timestamp: reportTimestamp,
    chatRoomId,
  };

  const reportedUserRef = doc(db, "reported_users", reportedUserId);

  await setDoc(
    reportedUserRef,
    {
      reportedUserId,
      username: reportedUsername.trim() || "Unknown",
      updatedAt: serverTimestamp(),
      reportCount: increment(1),
      reporterUids: arrayUnion(reporterUid),
      reportLogs: arrayUnion(reportEntry),
      reports: {
        [reporterUid]: {
          message: sanitizedReason,
          timestamp: reportTimestamp,
          chatRoomId,
        },
      },
    },
    { merge: true },
  );
}
