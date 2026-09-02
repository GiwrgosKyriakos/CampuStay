import { cancelScheduledNotification, scheduleLocalCalendarNotification } from "@/src/utils/notificationService";

export const NOTE_REMINDER_OPTIONS = [
  { minutes: 15, label: "calendar.noteModal.reminders.15Minutes" },
  { minutes: 30, label: "calendar.noteModal.reminders.30Minutes" },
  { minutes: 60, label: "calendar.noteModal.reminders.1Hour" },
  { minutes: 120, label: "calendar.noteModal.reminders.2Hours" },
  { minutes: 1440, label: "calendar.noteModal.reminders.1Day" },
] as const;

export function getCalendarNoteDate(date: string, time?: string, timestamp?: number): Date | null {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return new Date(timestamp);
  if (!time) return null;
  const result = new Date(`${date}T${time}:00`);
  return Number.isNaN(result.getTime()) ? null : result;
}

export async function scheduleCalendarNoteReminder(params: {
  noteId: string;
  title: string;
  noteTypeLabel: string;
  date: string;
  time?: string;
  timestamp?: number;
  leadTimeMinutes: number;
  existingNotificationId?: string;
}): Promise<string | null> {
  await cancelScheduledNotification(params.existingNotificationId);
  const eventDate = getCalendarNoteDate(params.date, params.time, params.timestamp);
  if (!eventDate) return null;

  const reminderDate = new Date(eventDate.getTime() - params.leadTimeMinutes * 60 * 1000);
  return scheduleLocalCalendarNotification({
    title: `Υπενθύμιση: ${params.title}`,
    body: `Έχετε προγραμματισμένη ${params.noteTypeLabel} στις ${params.time ?? "--:--"}.`,
    data: { targetScreen: "calendar", noteId: params.noteId },
    date: reminderDate,
  });
}