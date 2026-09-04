import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
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
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { storage } from "@/src/utils/storage";
import { setUserIdCache } from "@/src/utils/userId";
import { db, firebaseAuth } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { isBrokerOrAgencyUser } from "@/src/utils/roles";

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
  isBroker: boolean;
  notLookingForRoommate: boolean;
  agencyId: string | null;
  agencyRole: string | null;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  enterGuestMode: () => Promise<void>;
  clearProfileSetup: () => Promise<void>;
  updateRoleStates: (isBroker: boolean, notLookingForRoommate: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
        : !userSnap.exists();

  // ΔΙΑΤΗΡΗΣΗ ΥΠΑΡΧΟΝΤΩΝ ΣΤΟΙΧΕΙΩΝ
  // Αν ο χρήστης έχει ήδη ορίσει δικό του όνομα/φωτογραφίες στη βάση, δεν τα πατάμε με του Google Mail
  const existingPhotos = Array.isArray(existingData?.photos) && existingData.photos.length > 0
    ? existingData.photos
    : null;
  const existingPhotoUrl = (typeof existingData?.photoUrl === "string" && existingData.photoUrl.trim().length > 0)
    ? existingData.photoUrl
    : (existingPhotos ? existingPhotos[0] : null);
  const existingName = (typeof existingData?.name === "string" && existingData.name.trim().length > 0)
    ? existingData.name
    : null;

  const resolvedName = existingName ?? options.name ?? firebaseUser.displayName ?? null;
  const resolvedEmail = options.email ?? firebaseUser.email ?? existingData?.email ?? null;
  const resolvedPhotos = existingPhotos ?? (firebaseUser.photoURL ? [firebaseUser.photoURL] : []);
  const resolvedPhotoUrl = existingPhotoUrl ?? firebaseUser.photoURL ?? "";

  const payload: Record<string, unknown> = {
    email: resolvedEmail,
    name: resolvedName,
    photoUrl: resolvedPhotoUrl,
    photos: resolvedPhotos,
    authProvider: firebaseUser.providerData?.[0]?.providerId ?? "password",
    needsProfileSetup: resolvedNeedsProfileSetup,
    ...(existingData?.is_broker !== undefined ? { is_broker: existingData.is_broker } : {}),
    ...(existingData?.agencyId ? { agencyId: existingData.agencyId } : {}),
    ...(existingData?.agencyRole ? { agencyRole: existingData.agencyRole } : {}),
    ...(existingData?.agencyStatus ? { agencyStatus: existingData.agencyStatus } : {}),
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
      is_visible: true, // Προεπιλεγμένη ορατότητα για νέους χρήστες
      not_looking_for_roommate: false,
      createdAt: serverTimestamp(),
    });
  }

  await setDoc(userRef, payload, { merge: true });
  return resolvedNeedsProfileSetup;
}

async function claimManualClientData(firebaseUser: FirebaseUser): Promise<void> {
  const email = firebaseUser.email?.trim().toLowerCase();
  if (!email) return;

  const pendingSnapshot = await getDocs(query(
    collection(db, "users"),
    where("pendingClaimEmail", "==", email),
    where("is_manual_client", "==", true),
  ));
  if (pendingSnapshot.empty) return;

  for (const pendingDoc of pendingSnapshot.docs) {
    const placeholderId = pendingDoc.id;
    if (placeholderId === firebaseUser.uid) continue;

    const [profileByClientId, profileByClientUserId, savedSetsSnapshot, notesSnapshot, chatsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "brokerClientProfiles"), where("clientId", "==", placeholderId))),
      getDocs(query(collection(db, "brokerClientProfiles"), where("clientUserId", "==", placeholderId))),
      getDocs(collection(db, "users", placeholderId, "savedFilterSets")),
      getDocs(collection(db, "users", placeholderId, "calendarNotes")),
      getDocs(query(collection(db, "chats"), where("manualClientUserId", "==", placeholderId))),
    ]);
    const profileDocs = new Map([...profileByClientId.docs, ...profileByClientUserId.docs].map((profileDoc) => [profileDoc.id, profileDoc]));
    const batch = writeBatch(db);

    for (const savedSet of savedSetsSnapshot.docs) {
      batch.set(doc(db, "users", firebaseUser.uid, "savedFilterSets", savedSet.id), savedSet.data(), { merge: true });
    }
    for (const note of notesSnapshot.docs) {
      batch.set(doc(db, "users", firebaseUser.uid, "calendarNotes", note.id), { ...note.data(), brokerId: firebaseUser.uid }, { merge: true });
    }

    for (const profileDoc of profileDocs.values()) {
      const profileData = profileDoc.data() as { brokerId?: string; role?: string; [key: string]: unknown };
      if (!profileData.brokerId) continue;
      const newProfileRef = doc(db, "brokerClientProfiles", `${profileData.brokerId}_${firebaseUser.uid}`);
      batch.set(newProfileRef, {
        ...profileData,
        clientId: firebaseUser.uid,
        clientUserId: firebaseUser.uid,
        isManual: false,
        updatedAt: Date.now(),
      }, { merge: true });

      const migrateLegacyDeals = httpsCallable<{ profileId: string; clientId: string }, { migrated: number; skipped: number }>(firebaseFunctions, "migrateLegacyDealsCallable");
      await migrateLegacyDeals({ profileId: profileDoc.id, clientId: firebaseUser.uid });
      const dealsSnapshot = await getDocs(collection(profileDoc.ref, "deals"));
      for (const deal of dealsSnapshot.docs) {
        batch.delete(deal.ref);
      }
      batch.delete(profileDoc.ref);
    }

    for (const chatDoc of chatsSnapshot.docs) {
      const chatData = chatDoc.data() as { users?: unknown; participantDisplayNames?: Record<string, string> };
      const users = Array.isArray(chatData.users) ? chatData.users.map((userId) => userId === placeholderId ? firebaseUser.uid : userId) : [];
      const displayNames = { ...(chatData.participantDisplayNames ?? {}) };
      if (displayNames[placeholderId]) {
        displayNames[firebaseUser.uid] = displayNames[placeholderId];
        delete displayNames[placeholderId];
      }
      batch.update(chatDoc.ref, { users, participantDisplayNames: displayNames, updatedAt: serverTimestamp() });
      const messagesSnapshot = await getDocs(collection(chatDoc.ref, "messages"));
      messagesSnapshot.docs.forEach((messageDoc) => {
        const messageData = messageDoc.data() as { senderId?: string; receiverId?: string };
        const update: Record<string, string> = {};
        if (messageData.senderId === placeholderId) update.senderId = firebaseUser.uid;
        if (messageData.receiverId === placeholderId) update.receiverId = firebaseUser.uid;
        if (Object.keys(update).length > 0) batch.update(messageDoc.ref, update);
      });
    }

    batch.update(pendingDoc.ref, {
      is_manual_client: false,
      claimedAt: serverTimestamp(),
      claimedByUserId: firebaseUser.uid,
    });
    await batch.commit();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const updateRoleStates = useCallback((brokerState: boolean, noRoommateState: boolean) => {
    setIsBroker(brokerState);
    setNotLookingForRoommate(noRoommateState);
  }, []);
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isBroker, setIsBroker] = useState(false);
  const [notLookingForRoommate, setNotLookingForRoommate] = useState(false);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyRole, setAgencyRole] = useState<string | null>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_WEB_CLIENT_ID,
      offlineAccess: true,
    });
  }, []);

  const enterGuestMode = useCallback(async () => {
    await storage.setItem(GUEST_KEY, true);
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(SETUP_KEY);
    await storage.removeItem("roomie_user_id");
    setUserIdCache(null);
    setToken(null);
    setUser(null);
    setNeedsProfileSetup(false);
    setIsBroker(false);
    setNotLookingForRoommate(false);
    setAgencyId(null);
    setAgencyRole(null);
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
    let unsubscribeUserDoc: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!mounted) return;

      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          const userData = userSnap.exists() ? userSnap.data() : null;
          const needsSetup =
            typeof userData?.needsProfileSetup === "boolean"
              ? userData.needsProfileSetup
              : !userSnap.exists();

          setIsBroker(isBrokerOrAgencyUser(userData));
          setNotLookingForRoommate(userData?.not_looking_for_roommate === true);
          setAgencyId(typeof userData?.agencyId === "string" ? userData.agencyId : null);
          setAgencyRole(typeof userData?.agencyRole === "string" ? userData.agencyRole : typeof userData?.role === "string" ? userData.role : null);
          await claimManualClientData(firebaseUser).catch((error) => console.error("[Auth] Manual client claim failed during session restore:", error));
          await persist(idToken, mapFirebaseUser(firebaseUser), needsSetup);

          unsubscribeUserDoc?.();
          unsubscribeUserDoc = onSnapshot(userRef, (snapshot) => {
            if (!mounted) return;
            const data = snapshot.exists() ? snapshot.data() : null;
            setIsBroker(isBrokerOrAgencyUser(data));
            setNotLookingForRoommate(data?.not_looking_for_roommate === true);
            setAgencyId(typeof data?.agencyId === "string" ? data.agencyId : null);
            setAgencyRole(typeof data?.agencyRole === "string" ? data.agencyRole : typeof data?.role === "string" ? data.role : null);
            if (typeof data?.needsProfileSetup === "boolean") {
              setNeedsProfileSetup(data.needsProfileSetup);
            }
          });
        } catch (err) {
          console.error("[Auth] Failed to sync Firebase session:", err);
          setStatus("unauth");
        }
        return;
      }

      setToken(null);
      setUser(null);
      setUserIdCache(null);
      setIsBroker(false);
      setNotLookingForRoommate(false);
      setAgencyId(null);
      setAgencyRole(null);
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = null;

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
      unsubscribeUserDoc?.();
      unsubscribe();
    };
  }, [persist]);

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      const userCredential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const needsSetup = await syncUserDocument(userCredential.user);
      await claimManualClientData(userCredential.user).catch((error) => console.error("[Auth] Manual client claim failed during email login:", error));
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
      await claimManualClientData(userCredential.user).catch((error) => console.error("[Auth] Manual client claim failed during registration:", error));
      const idToken = await userCredential.user.getIdToken();
      await persist(idToken, mapFirebaseUser(userCredential.user), true);
    },
    [persist],
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    const wasGuest = status === "guest";
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;

      if (!idToken) {
        throw new Error("No ID Token returned from native Google SDK");
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(firebaseAuth, credential);
      const needsSetup = await syncUserDocument(userCredential.user);
      await claimManualClientData(userCredential.user).catch((error) => console.error("[Auth] Manual client claim failed during Google login:", error));
      const firebaseToken = await userCredential.user.getIdToken();
      await persist(firebaseToken, mapFirebaseUser(userCredential.user), needsSetup);
      console.log("[Auth] Native Google sign-in completed via Firebase.", {
        userId: userCredential.user.uid,
        operationType: userCredential.operationType,
        upgradedFromGuest: wasGuest,
      });
    } catch (error) {
      console.error("Native Google Sign-In Error:", error);
      throw error;
    }
  }, [persist, status]);

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
    // ΔΙΟΡΘΩΣΗ: Γράφουμε ΠΡΩΤΑ τα flags του Guest mode στο storage.
    // Έτσι, όταν πυροδοτηθεί το ασύγχρονο signOut, η εφαρμογή θα ξέρει ήδη ότι είσαι Guest και δεν θα κάνει flash στο auth-landing.
    try {
      await storage.setItem(GUEST_KEY, true);
      await storage.secureRemove(TOKEN_KEY);
      await storage.removeItem(SETUP_KEY);
      await storage.removeItem("roomie_user_id");
      setUserIdCache(null);
    } catch (storageErr) {
      console.warn("[Auth] Failed to pre-set guest storage:", storageErr);
    }

    try {
      await signOut(firebaseAuth);
    } catch (err) {
      console.warn("[Auth] Firebase signOut failed; clearing local session anyway:", err);
    }

    try {
      await GoogleSignin.revokeAccess();
    } catch (err) {
      console.warn("[Auth] Google revokeAccess failed; continuing sign out:", err);
    }

    try {
      await GoogleSignin.signOut();
    } catch (err) {
      console.warn("[Auth] Google signOut failed; clearing local session anyway:", err);
    }

    // Ενημέρωση των τοπικών states
    setToken(null);
    setUser(null);
    setNeedsProfileSetup(false);
    setNotLookingForRoommate(false);
    setAgencyId(null);
    setAgencyRole(null);
    setStatus("guest");
  }, []);

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
      updateRoleStates,
      isBroker,
      notLookingForRoommate,
      agencyId,
      agencyRole,
    }),
    [
      status,
      user,
      token,
      needsProfileSetup,
      isBroker,
      notLookingForRoommate,
      agencyId,
      agencyRole,
      loginEmail,
      registerEmail,
      signInWithGoogle,
      continueAsGuest,
      logout,
      enterGuestMode,
      clearProfileSetup,
      updateRoleStates,
    ],
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
