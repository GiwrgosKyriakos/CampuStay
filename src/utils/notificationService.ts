import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// 1. Ρύθμιση για το πώς θα συμπεριφέρεται η ειδοποίηση αν το App είναι ΑΝΟΙΧΤΟ
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token = null;

  // Α) Έλεγχος αν η συσκευή είναι πραγματικό κινητό (Τα Push Notifications ΔΕΝ δουλεύουν σε Android Emulators)
  if (!Device.isDevice) {
    console.warn('[Notifications] Πρέπει να χρησιμοποιήσεις πραγματική συσκευή για τα Push Notifications');
    return null;
  }

  // Β) Ρύθμιση ειδικού "Channel" (Κανάλι Ειδοποιήσεων) αποκλειστικά για Android (Υποχρεωτικό από το Android 8 και μετά)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX, // Εμφάνιση banner στην κορυφή της οθόνης
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Γ) Έλεγχος αν ο χρήστης έχει ήδη δώσει άδεια στο παρελθόν
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Δ) Αν δεν έχει δώσει άδεια, του πετάμε το Native παράθυρο του Android/iOS να μας δώσει
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Ε) Αν ο χρήστης πατήσει «Αρνούμαι» / "Deny", σταματάμε εδώ
  if (finalStatus !== 'granted') {
    console.log('[Notifications] Ο χρήστης αρνήθηκε την άδεια για ειδοποιήσεις!');
    return null;
  }

  // ΣΤ) Εφόσον έχουμε άδεια, ζητάμε από την Expo το μοναδικό Push Token
  try {
    // Παίρνουμε αυτόματα το EAS Project ID από τις ρυθμίσεις του app.json
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      throw new Error('Το EAS Project ID δεν βρέθηκε στο app.json');
    }

    // Παραγωγή του Token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
    
    console.log('[Notifications] Καταγραφή επιτυχής! Το Expo Push Token είναι:', token);
  } catch (error) {
    console.error('[Notifications] Σφάλμα κατά την παραγωγή του Push Token:', error);
  }

  return token;
}


export async function scheduleLocalCalendarNotification(params: {
  title: string;
  body: string;
  data: Record<string, unknown>;
  date: Date;
}): Promise<string | null> {
  if (params.date.getTime() <= Date.now()) return null;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.status !== "granted") return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      sound: "default",
      data: params.data,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.date,
    },
  });
}

export async function cancelScheduledNotification(notificationId?: string): Promise<void> {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function schedulePostVisitFeedbackReminder(params: {
  noteId: string;
  apartmentTitle: string;
  scheduledAt: Date;
}): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.type === "post_visit_feedback" && item.content.data?.noteId === params.noteId)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  const reminderAt = new Date(params.scheduledAt.getTime() + 2 * 60 * 60 * 1000);
  return scheduleLocalCalendarNotification({
    title: "Αξιολόγηση επίσκεψης",
    body: `Πώς πήγε η επίσκεψη στο ${params.apartmentTitle}; Συμπληρώστε τη σύντομη αξιολόγησή σας!`,
    data: { type: "post_visit_feedback", targetScreen: "calendar", noteId: params.noteId },
    date: reminderAt.getTime() > Date.now() ? reminderAt : new Date(Date.now() + 1000),
  });
}
