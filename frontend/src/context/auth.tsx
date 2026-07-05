import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
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
  registerEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<AuthUser | null>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  clearProfileSetup: () => void;
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

async function syncUserDocument(firebaseUser: FirebaseUser): Promise<void> {
  const userRef = doc(db, "users", firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  const payload: Record<string, unknown> = {
    email: firebaseUser.email ?? null,
    name: firebaseUser.displayName ?? null,
    photoUrl: firebaseUser.photoURL ?? "",
    photos: firebaseUser.photoURL ? [firebaseUser.photoURL] : [],
    authProvider: firebaseUser.providerData?.[0]?.providerId ?? "password",
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
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const proxyProjectName = process.env.EXPO_PUBLIC_EXPO_PROXY_PROJECT ?? "@gkyriakos92/frontend";
  const redirectUri = AuthSession.makeRedirectUri();
  // const redirectUri = "https://auth.expo.io/@gkyriakos92/frontend";

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID,
    redirectUri,
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

  const persist = useCallback(async (newToken: string, newUser: AuthUser) => {
    await storage.secureSet(TOKEN_KEY, newToken);
    await storage.setItem("roomie_user_id", newUser.user_id);
    setUserIdCache(newUser.user_id);
    await storage.removeItem(GUEST_KEY);
    const needsSetup = (await storage.getItem(SETUP_KEY, false)) ?? false;

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
      await syncUserDocument(userCredential.user);
      const idToken = await userCredential.user.getIdToken();
      await persist(idToken, mapFirebaseUser(userCredential.user));
    },
    [persist],
  );

  const registerEmail = useCallback(
    async (email: string, password: string) => {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await syncUserDocument(userCredential.user);
      const idToken = await userCredential.user.getIdToken();
      await persist(idToken, mapFirebaseUser(userCredential.user));
    },
    [persist],
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthUser | null> => {
    if (!request) {
      throw new Error("Google authentication is not ready yet.");
    }

    const result = await promptAsync({ showInRecents: true });

    if (result.type !== "success") {
      return null;
    }

    const idToken = result.authentication?.idToken ?? result.params?.id_token;
    if (!idToken) {
      throw new Error("Google sign-in did not return an ID token.");
    }

    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(firebaseAuth, credential);
    const firebaseUser = userCredential.user;
    const firebaseToken = await firebaseUser.getIdToken();
    const mappedUser = mapFirebaseUser(firebaseUser);

    await persist(firebaseToken, mappedUser);
    return mappedUser;
  }, [promptAsync, request, persist]);

  const continueAsGuest = useCallback(async () => {
    await enterGuestMode();
  }, [enterGuestMode]);

  const clearProfileSetup = useCallback(() => {
    setNeedsProfileSetup(false);
    storage.removeItem(SETUP_KEY);
  }, []);

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
