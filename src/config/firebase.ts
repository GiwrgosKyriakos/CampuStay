import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, memoryLocalCache } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Firebase's React Native conditional export is selected by Metro but omitted from the default TypeScript declaration.
// @ts-expect-error Firebase's React Native conditional export is available at runtime.
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const phoneAuthApp = getApps().some((candidate) => candidate.name === "phone-auth")
  ? getApp("phone-auth")
  : initializeApp(firebaseConfig, "phone-auth");

// Use AsyncStorage-backed persistence on native to keep sessions after app restarts.
export const firebaseAuth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

// Keep phone-auth sign-in isolated so the app's authenticated contract identity is not replaced.
export const firebasePhoneAuth = (() => {
  try {
    return initializeAuth(phoneAuthApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(phoneAuthApp);
  }
})();

export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch {
    return getFirestore(app);
  }
})();
export const storage = getStorage(app);
