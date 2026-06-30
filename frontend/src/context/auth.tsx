import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";

const AUTH_USER_ID_KEY = "roomie_user_id";
const AUTH_USER_CREDENTIAL_KEY = "auth_user_credential";
const DEFAULT_USER_CREDENTIAL = "alex.mercer@unimates.com";

interface AuthContextValue {
  userId: string | null;
  credential: string | null;
  isGuest: boolean;
  loaded: boolean;
  login: (userId: string, credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [credential, setCredential] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const storedGuest = await storage.getItem(AUTH_GUEST_KEY, false);
      const storedUserId = await storage.getItem(AUTH_USER_ID_KEY, "");
      const storedCredential = await storage.getItem(AUTH_USER_CREDENTIAL_KEY, "");

      if (storedUserId && storedCredential) {
        setUserId(storedUserId);
        setCredential(storedCredential);
      } else {
        const newUserId = uuidv4();
        await storage.setItem(AUTH_USER_ID_KEY, newUserId);
        await storage.setItem(AUTH_USER_CREDENTIAL_KEY, DEFAULT_USER_CREDENTIAL);
        setUserId(newUserId);
        setCredential(DEFAULT_USER_CREDENTIAL);
      }

      setLoaded(true);
    }

    loadSession();
  }, []);

  const login = async (newUserId: string, newCredential: string) => {
    await storage.setItem(AUTH_USER_ID_KEY, newUserId);
    await storage.setItem(AUTH_USER_CREDENTIAL_KEY, newCredential);
    setUserId(newUserId);
    setCredential(newCredential);
  };

  const logout = async () => {
    await storage.removeItem(AUTH_USER_ID_KEY);
    await storage.removeItem(AUTH_USER_CREDENTIAL_KEY);
    setUserId(null);
    setCredential(null);
  };

  const value = useMemo(
    () => ({
      userId,
      credential,
      isGuest: loaded && !userId,
      loaded,
      login,
      logout,
    }),
    [userId, credential, loaded],
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
