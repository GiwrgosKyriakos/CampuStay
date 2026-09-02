import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";

import { db, firebaseAuth } from "@/src/config/firebase";

export const ROOMMATE_MATCH_CATEGORY = "ROOMMATE_MATCH_100";
export const ADD_ROOMMATE_ACTION = "ADD_ROOMMATE";
export const VIEW_PROFILE_ACTION = "VIEW_PROFILE";

let categoriesRegistered = false;

export async function registerNotificationCategories(): Promise<void> {
  if (categoriesRegistered) return;
  await Notifications.setNotificationCategoryAsync(ROOMMATE_MATCH_CATEGORY, [
    {
      identifier: ADD_ROOMMATE_ACTION,
      buttonTitle: "Προσθήκη / Match",
      options: { opensAppToForeground: false },
    },
    {
      identifier: VIEW_PROFILE_ACTION,
      buttonTitle: "Προβολή Προφίλ",
      options: { opensAppToForeground: true },
    },
  ]);
  categoriesRegistered = true;
}

export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("visit_reminders", {
      name: "Visit reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 300, 200, 300],
      enableVibrate: true,
      enableLights: true,
    }),
    Notifications.setNotificationChannelAsync("high_matches", {
      name: "High matches",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 400, 200, 400],
      enableVibrate: true,
      enableLights: true,
    }),
    Notifications.setNotificationChannelAsync("deals_pipeline", {
      name: "Deals and pipeline",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 180],
      enableVibrate: true,
    }),
  ]);
}

export async function registerFcmTokenForUser(userId: string): Promise<string | null> {
  if (!userId || !Device.isDevice) return null;
  const permissions = await Notifications.getPermissionsAsync();
  const finalStatus = permissions.status === "granted"
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const fcmToken = await Notifications.getDevicePushTokenAsync().then((result) => typeof result.data === "string" ? result.data : null).catch(() => null);
  await setDoc(doc(db, "users", userId), { fcmTokens: arrayUnion(...[fcmToken].filter((value): value is string => Boolean(value))), expoPushToken: token }, { merge: true });
  return token;
}

export async function addRoommateConnection(candidateId: string, matchId?: string): Promise<void> {
  const currentUserId = firebaseAuth.currentUser?.uid;
  if (!currentUserId || !candidateId || currentUserId === candidateId) return;
  const connectionId = [currentUserId, candidateId].sort().join("_");
  await setDoc(doc(db, "roommateConnections", connectionId), {
    users: [currentUserId, candidateId],
    matchId: matchId ?? null,
    status: "connected",
    connectedAt: Date.now(),
    connectedBy: currentUserId,
  }, { merge: true });
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  router: { push: (href: any) => void },
): Promise<void> {
  const data = response.notification.request.content.data as Record<string, unknown>;
  const action = response.actionIdentifier;

  if (action === ADD_ROOMMATE_ACTION) {
    const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    await addRoommateConnection(candidateId, typeof data.matchId === "string" ? data.matchId : undefined);
    return;
  }

  if (action === VIEW_PROFILE_ACTION || data.type === "roommate_match") {
    const profileId = typeof data.candidateId === "string" ? data.candidateId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    if (profileId) router.push({ pathname: "/roommates/[id]", params: { id: profileId } });
    return;
  }

  if (data.type === "send_exact_address") {
    const clientId = typeof data.clientId === "string" ? data.clientId : "";
    router.push({ pathname: "/chat/[id]", params: { id: clientId, chatRoomId: data.chatRoomId as string, action: "send_exact_address", appointmentId: data.appointmentId as string } });
    return;
  }

  if (data.type === "post_visit_feedback" || data.type === "broker_visit_feedback") {
    router.push({ pathname: data.type === "broker_visit_feedback" ? "/broker-client-detail" : "/(tabs)/calendar", params: { appointmentId: data.appointmentId as string } });
    return;
  }

  if (typeof data.targetScreen === "string" || typeof data.screen === "string") {
    if (data.targetScreen === "calendar") {
      router.push({ pathname: "/(tabs)/calendar", params: { noteId: data.noteId as string } });
    } else if (data.screen === "broker-client-detail") {
      router.push({ pathname: "/broker-client-detail", params: { profileId: data.profileId as string, clientUserId: data.clientId as string, scrollTo: data.scrollTo as string } });
    }
  } else if (typeof data.senderId === "string") {
    router.push({ pathname: "/chat/[id]", params: { id: data.senderId, chatRoomId: data.chatRoomId as string } });
  }
}

export async function getActiveChatId(userId: string): Promise<string | null> {
  const snapshot = await getDoc(doc(db, "users", userId));
  const activeChatId = snapshot.exists() ? snapshot.data().activeChatId : null;
  return typeof activeChatId === "string" ? activeChatId : null;
}
