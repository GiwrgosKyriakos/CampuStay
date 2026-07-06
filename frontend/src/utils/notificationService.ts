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