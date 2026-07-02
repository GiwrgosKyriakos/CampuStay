import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

import { storage } from "@/src/utils/storage";
import { setUserIdCache } from "@/src/utils/userId";
import { apiLogin, apiRegister, apiMe, apiLogout, AuthUser } from "@/src/api/auth";
import { firebaseAuth } from "@/src/config/firebase";
import { syncAuthUserToFirestore } from "@/src/services/firestore";

const TOKEN_KEY = "auth_token";
const GUEST_KEY = "auth_guest";
const SETUP_KEY = "post_login_setup";

type Status = "loading" | "authed" | "guest" | "unauth";

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
  clearProfileSetup: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[#?&]session_id=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const persist = useCallback(async (newToken: string, newUser: AuthUser, markSetup: boolean) => {
    await storage.secureSet(TOKEN_KEY, newToken);
    await storage.setItem("roomie_user_id", newUser.user_id);
    setUserIdCache(newUser.user_id);
    await storage.removeItem(GUEST_KEY);
    if (markSetup) {
      await storage.setItem(SETUP_KEY, true);
      setNeedsProfileSetup(true);
    }
    setToken(newToken);
    setUser(newUser);
    setStatus("authed");
  }, []);

  const loginWithGoogleSession = useCallback(
    async (sessionId: string): Promise<AuthUser | null> => {
      const { token: t, user: u } = await apiGoogle(sessionId);
      await persist(t, u, true);
      return u;
    },
    [persist],
  );

  // Bootstrap session on mount.
  useEffect(() => {
    let mounted = true;
    
    // Listen for Firebase auth state changes.
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (firebaseUser: FirebaseUser | null) => {
      if (!mounted) return;
      
      if (firebaseUser) {
        console.log("[Auth] Firebase user detected:", firebaseUser.uid);
        const idToken = await firebaseUser.getIdToken();
        setUserIdCache(firebaseUser.uid);
        await storage.setItem("roomie_user_id", firebaseUser.uid);
        
        const authUser: AuthUser = {
          user_id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          picture: firebaseUser.photoURL,
        };
        
        setToken(idToken);
        setUser(authUser);
        setStatus("authed");
      } else {
        console.log("[Auth] Firebase user cleared");
        // Don't immediately logout; check localStorage/secured storage first
      }
    });

    (async () => {
      try {
        console.log("[Auth] Starting bootstrap...");

        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = parseSessionId(window.location.hash) || parseSessionId(window.location.search);
          if (sid) {
            console.log("[Auth] Found session_id in URL, logging in via Google...");
            try {
              await loginWithGoogleSession(sid);
            } catch (err) {
              console.error("[Auth] Google session login failed:", err);
            } finally {
              window.history.replaceState(null, "", window.location.pathname);
            }
            return;
          }
        }

        if (Platform.OS !== "web") {
          const initial = await Linking.getInitialURL();
          const sid = parseSessionId(initial);
          if (sid) {
            console.log("[Auth] Found session_id in deep link, logging in via Google...");
            try {
              await loginWithGoogleSession(sid);
            } catch (err) {
              console.error("[Auth] Google session login from deep link failed:", err);
            }
            return;
          }
        }

        console.log("[Auth] Checking for stored token...");
        const setupFlag = await storage.getItem(SETUP_KEY, false);
        if (mounted && setupFlag) {
          console.log("[Auth] Profile setup flag found");
          setNeedsProfileSetup(true);
        }

        const storedToken = await storage.secureGet(TOKEN_KEY, "");
        if (storedToken) {
          console.log("[Auth] Found stored token, validating with server...");
          try {
            const me = await apiMe(storedToken);
            if (mounted) {
              console.log("[Auth] Token valid! User logged in:", me.user_id);
              setToken(storedToken);
              setUser(me);
              setUserIdCache(me.user_id);
              setStatus("authed");
            }
            return;
          } catch (err) {
            console.warn("[Auth] Stored token invalid, clearing:", err);
            await storage.secureRemove(TOKEN_KEY);
          }
        }

        console.log("[Auth] No valid token found, checking guest mode...");
        const guest = await storage.getItem(GUEST_KEY, false);
        if (mounted) {
          if (guest) {
            console.log("[Auth] Guest mode enabled");
            setStatus("guest");
          } else {
            console.log("[Auth] User not authenticated, showing login screen");
            setStatus("unauth");
          }
        }
      } catch (err) {
        console.error("[Auth] Bootstrap error:", err);
        if (mounted) setStatus("unauth");
      }
    })();
    
    return () => {
      mounted = false;
      unsubscribeAuth();
    };
  }, [loginWithGoogleSession]);

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      const { token: t, user: u } = await apiLogin(email.trim(), password);
      await persist(t, u, true);
    },
    [persist],
  );

  const registerEmail = useCallback(
    async (email: string, password: string) => {
      const { token: t, user: u } = await apiRegister(email.trim(), password);
      await persist(t, u, true);
    },
    [persist],
  );

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "YOUR_ANDROID_CLIENT_ID",
    iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID ?? "YOUR_IOS_CLIENT_ID",
    androidClientId: process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID ?? "YOUR_ANDROID_CLIENT_ID",
    webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID ?? "YOUR_WEB_CLIENT_ID",
    scopes: ["profile", "email"],
    redirectUri: makeRedirectUri({ useProxy: true }),
  });

  const signInWithGoogle = useCallback(async (): Promise<AuthUser | null> => {
    if (!promptAsync) {
      throw new Error("Google auth is not available yet.");
    }

    const result = await promptAsync({ useProxy: true });

    if (result.type !== "success" || !result.authentication?.idToken) {
      return null;
    }

    const credential = GoogleAuthProvider.credential(result.authentication.idToken);
    const userCredential = await signInWithCredential(firebaseAuth, credential);
    const firebaseUser = userCredential.user;
    await syncAuthUserToFirestore(firebaseUser);

    if (!firebaseUser.uid) {
      throw new Error("Firebase user missing UID after Google sign-in.");
    }

    const idToken = await firebaseUser.getIdToken();
    setUserIdCache(firebaseUser.uid);
    await storage.setItem("roomie_user_id", firebaseUser.uid);
    setStatus("authed");
    setUser({
      user_id: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName,
      picture: firebaseUser.photoURL,
    });
    setToken(idToken);

    return {
      user_id: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName,
      picture: firebaseUser.photoURL,
    };
  }, [promptAsync]);

  const continueAsGuest = useCallback(async () => {
    await storage.setItem(GUEST_KEY, true);
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus("guest");
  }, []);

  const clearProfileSetup = useCallback(() => {
    setNeedsProfileSetup(false);
    storage.removeItem(SETUP_KEY);
  }, []);

  const logout = useCallback(async () => {
    if (token) await apiLogout(token);
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(GUEST_KEY);
    await storage.removeItem(SETUP_KEY);
    setToken(null);
    setUser(null);
    setNeedsProfileSetup(false);
    setStatus("unauth");
  }, [token]);

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
      clearProfileSetup,
    }),
    [status, user, token, needsProfileSetup, loginEmail, registerEmail, signInWithGoogle, continueAsGuest, logout, clearProfileSetup],
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
