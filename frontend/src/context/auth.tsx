import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { storage } from "@/src/utils/storage";
import { setUserIdCache } from "@/src/utils/userId";
import { db, firebaseAuth } from "@/src/config/firebase";

const TOKEN_KEY = "auth_token";
const GUEST_KEY = "auth_guest";
const SETUP_KEY = "post_login_setup";

type Status = "loading" | "authed" | "guest" | "unauth";

export interface AuthUser {
  user_id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface AuthContextValue {
  isLoading: boolean;
  isLoggedIn: boolean;
  isGuestMode: boolean;
  isGuest: boolean; // alias of isGuestMode
  user: AuthUser | null;
  userId: string | null;
  token: string | null;
  needsProfileSetup: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  clearProfileSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

WebBrowser.maybeCompleteAuthSession();

function mapFirebaseUser(firebaseUser: FirebaseUser): AuthUser {
  return {
    user_id: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName,
    picture: firebaseUser.photoURL,
  };
}

interface SyncUserDocumentOptions {
  email?: string | null;
  name?: string | null;
  needsProfileSetup?: boolean;
}

async function syncUserDocument(
  firebaseUser: FirebaseUser,
  options: SyncUserDocumentOptions = {},
): Promise<boolean> {
  const userRef = doc(db, "users", firebaseUser.uid);
  const userSnap = await getDoc(userRef);
  const existingData = userSnap.exists() ? userSnap.data() : null;
  const resolvedNeedsProfileSetup =
    typeof options.needsProfileSetup === "boolean"
      ? options.needsProfileSetup
      : typeof existingData?.needsProfileSetup === "boolean"
        ? existingData.needsProfileSetup
        : false;
  const resolvedName = options.name ?? firebaseUser.displayName ?? null;
  const resolvedEmail = options.email ?? firebaseUser.email ?? null;

  const payload: Record<string, unknown> = {
    email: resolvedEmail,
    name: resolvedName,
    photoUrl: firebaseUser.photoURL ?? "",
    photos: firebaseUser.photoURL ? [firebaseUser.photoURL] : [],
    authProvider: firebaseUser.providerData?.[0]?.providerId ?? "password",
    needsProfileSetup: resolvedNeedsProfileSetup,
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (!userSnap.exists()) {
    Object.assign(payload, {
      age: null,
      university: null,
      year: null,
      maxBudget: null,
      gender: null,
      about: "",
      city: null,
      has_place: false,
        already_have_apartment_to_share: false,
      looking_for_apartment: false,
      year_of_study: null,
      budget: null,
      move_in: null,
      instagram: "",
      facebook: "",
      linkedin: "",
      twitter: "",
      createdAt: serverTimestamp(),
    });
  }

  await setDoc(userRef, payload, { merge: true });
  return resolvedNeedsProfileSetup;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID,
    selectAccount: true,
  });

  const enterGuestMode = useCallback(async () => {
    await storage.setItem(GUEST_KEY, true);
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(SETUP_KEY);
    await storage.removeItem("roomie_user_id");
    setUserIdCache(null);
    setToken(null);
    setUser(null);
    setNeedsProfileSetup(false);
    setStatus("guest");
  }, []);

  const persist = useCallback(async (newToken: string, newUser: AuthUser, shouldSetupProfile?: boolean) => {
    await storage.secureSet(TOKEN_KEY, newToken);
    await storage.setItem("roomie_user_id", newUser.user_id);
    setUserIdCache(newUser.user_id);
    await storage.removeItem(GUEST_KEY);
    if (typeof shouldSetupProfile === "boolean") {
      await storage.setItem(SETUP_KEY, shouldSetupProfile);
    }
    const needsSetup =
      typeof shouldSetupProfile === "boolean"
        ? shouldSetupProfile
        : (await storage.getItem(SETUP_KEY, false)) ?? false;

    setToken(newToken);
    setUser(newUser);
    setNeedsProfileSetup(needsSetup);
    setStatus("authed");
  }, []);

  // Bootstrap session on mount.
  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!mounted) return;

      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await persist(idToken, mapFirebaseUser(firebaseUser));
        } catch (err) {
          console.error("[Auth] Failed to sync Firebase session:", err);
          setStatus("unauth");
        }
        return;
      }

      setToken(null);
      setUser(null);
      setUserIdCache(null);

      const guest = await storage.getItem(GUEST_KEY, false);
      setStatus(guest ? "guest" : "unauth");
    });

    (async () => {
      try {
        const setup = (await storage.getItem(SETUP_KEY, false)) ?? false;
        if (mounted) {
          setNeedsProfileSetup(setup);
        }
      } catch (err) {
        console.error("[Auth] Bootstrap failed:", err);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [persist]);

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const needsSetup = await syncUserDocument(userCredential.user);
      const idToken = await userCredential.user.getIdToken();
      await persist(idToken, mapFirebaseUser(userCredential.user), needsSetup);
    },
    [persist],
  );

  const registerEmail = useCallback(
    async (email: string, password: string, name?: string) => {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const trimmedName = name?.trim() ?? "";

      if (trimmedName) {
        await updateProfile(userCredential.user, { displayName: trimmedName });
      }

      await syncUserDocument(userCredential.user, {
        email: email.trim(),
        name: trimmedName || userCredential.user.displayName,
        needsProfileSetup: true,
      });
      const idToken = await userCredential.user.getIdToken();
      await persist(idToken, mapFirebaseUser(userCredential.user), true);
    },
    [persist],
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (!request) {
      throw new Error("Google authentication is not ready yet.");
    }

    await promptAsync({ showInRecents: true });
  }, [promptAsync, request]);

  useEffect(() => {
    if (response?.type !== "success") {
      return;
    }

    const idToken = response.authentication?.idToken;
    if (!idToken) {
      console.error("[Auth] Google sign-in succeeded but no ID token was returned.");
      return;
    }

    const authenticateWithFirebase = async () => {
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(firebaseAuth, credential);
        const needsSetup = await syncUserDocument(userCredential.user);
        const firebaseToken = await userCredential.user.getIdToken();
        await persist(firebaseToken, mapFirebaseUser(userCredential.user), needsSetup);
        console.log("[Auth] Google sign-in completed via Firebase.", {
          userId: userCredential.user.uid,
          operationType: userCredential.operationType,
        });
      } catch (error) {
        console.error("[Auth] Firebase Google authentication failed:", error);
      }
    };

    void authenticateWithFirebase();
  }, [persist, response]);

  const continueAsGuest = useCallback(async () => {
    await enterGuestMode();
  }, [enterGuestMode]);

  const clearProfileSetup = useCallback(async () => {
    setNeedsProfileSetup(false);
    if (user?.user_id) {
      await setDoc(
        doc(db, "users", user.user_id),
        {
          needsProfileSetup: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
    await storage.removeItem(SETUP_KEY);
  }, [user]);

  const logout = useCallback(async () => {
    try {
      await signOut(firebaseAuth);
    } catch (err) {
      console.warn("[Auth] Firebase signOut failed; clearing local session anyway:", err);
    }
    await enterGuestMode();
  }, [enterGuestMode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading: status === "loading",
      isLoggedIn: status === "authed",
      isGuestMode: status === "guest",
      isGuest: status === "guest",
      user,
      userId: user?.user_id ?? null,
      token,
      needsProfileSetup,
      loginEmail,
      registerEmail,
      signInWithGoogle,
      continueAsGuest,
      logout,
      enterGuestMode,
      clearProfileSetup,
    }),
    [status, user, token, needsProfileSetup, loginEmail, registerEmail, signInWithGoogle, continueAsGuest, logout, enterGuestMode, clearProfileSetup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
