import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";

import { db, firebaseAuth } from "@/src/config/firebase";

export const ROOMMATE_MATCH_CATEGORY = "ROOMMATE_MATCH_100";
export const ADD_ROOMMATE_ACTION = "ADD_ROOMMATE";
export const VIEW_PROFILE_ACTION = "VIEW_PROFILE";

const SCREEN_ROUTES: Record<string, string> = {
  calendar: "/(tabs)/calendar",
  broker: "/(tabs)/broker",
  profile: "/(tabs)/profile",
};

function getNotificationRoute(screen: string): string {
  return SCREEN_ROUTES[screen] ?? (screen.startsWith("/") ? screen : `/${screen}`);
}

async function openNavigationLink(params: Record<string, any>): Promise<void> {
  const links = Platform.OS === "ios"
    ? [params.appleMapsUrl, params.googleMapsUrl]
    : [params.googleMapsUrl, params.appleMapsUrl];
  for (const link of links) {
    if (typeof link !== "string" || !link) continue;
    try {
      if (await Linking.canOpenURL(link)) {
        await Linking.openURL(link);
        return;
      }
    } catch {
      continue;
    }
  }
}

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

  let params: Record<string, any> = {};
  if (typeof data.params === "string") {
    try {
      const parsed = JSON.parse(data.params) as unknown;
      if (parsed && typeof parsed === "object") params = parsed as Record<string, any>;
    } catch {
      params = {};
    }
  } else if (data.params && typeof data.params === "object") {
    params = data.params as Record<string, any>;
  }
  const type = typeof data.type === "string" ? data.type : "";
  const screen = typeof data.screen === "string" ? data.screen : typeof data.targetScreen === "string" ? data.targetScreen : "";
  const chatId = typeof params.chatId === "string" ? params.chatId : typeof data.conversationId === "string" ? data.conversationId : "";
  const chatTargetId = typeof params.clientId === "string" ? params.clientId : typeof params.brokerId === "string" ? params.brokerId : typeof params.counterpartId === "string" ? params.counterpartId : chatId;

  if (action === ADD_ROOMMATE_ACTION) {
    const candidateId = typeof data.candidateId === "string" ? data.candidateId : typeof params.candidateId === "string" ? params.candidateId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    await addRoommateConnection(candidateId, typeof data.matchId === "string" ? data.matchId : typeof params.matchId === "string" ? params.matchId : undefined);
    return;
  }

  if (action === VIEW_PROFILE_ACTION || data.type === "roommate_match" || (type === "high_match" && screen === "roomie-profile")) {
    const profileId = typeof data.candidateId === "string" ? data.candidateId : typeof params.candidateId === "string" ? params.candidateId : typeof data.targetUserId === "string" ? data.targetUserId : "";
    if (profileId) router.push({ pathname: "/roommates/[id]", params: { id: profileId } });
    return;
  }

  if (type === "visit_reminder" && (action === "send_exact_address" || data.action === "send_exact_address")) {
    router.push({ pathname: "/chat/[id]", params: { id: chatTargetId, chatRoomId: chatId, action: "send_exact_address", appointmentId: params.appointmentId as string } });
    return;
  }

  if (type === "post_visit_rating") {
    router.push({ pathname: screen === "broker-client-detail" ? "/broker-client-detail" : "/(tabs)/calendar", params: { ...params, action: "open_modal" } });
    return;
  }

  if (type === "visit_navigation") {
    await openNavigationLink(params);
    router.push({ pathname: getNotificationRoute(screen || "calendar"), params });
    return;
  }

  if (type === "visit_confirmed" || type === "visit_cancelled" || type === "visit_request") {
    router.push({ pathname: "/chat/[id]", params: { id: chatTargetId, chatRoomId: chatId, ...params } });
    return;
  }

  if (type === "high_match" || type === "price_drop" || type === "new_offer" || type === "document_required" || type === "document_rejected" || type === "document_verified" || type === "notary_ready") {
    if (screen === "broker-client-detail") {
      router.push({ pathname: "/broker-client-detail", params: { ...params, clientUserId: params.clientUserId ?? params.clientId, action: typeof data.action === "string" ? data.action : undefined } });
    } else if (screen === "chat/[id]" && chatTargetId) {
      router.push({ pathname: "/chat/[id]", params: { id: chatTargetId, chatRoomId: chatId, ...params } });
    } else if (screen === "roomie-profile") {
      router.push({ pathname: "/roomie-profile", params });
    } else {
      router.push({ pathname: "/apartment-detail", params });
    }
    return;
  }

  if (type === "closed_deal" || type === "broker_registration" || type === "broker_approved" || type === "deal_stage_update") {
    router.push({ pathname: getNotificationRoute(screen || "profile"), params });
    return;
  }

  if (typeof data.targetScreen === "string" || typeof data.screen === "string") {
    if (screen === "calendar") {
      router.push({ pathname: "/(tabs)/calendar", params: { ...params, noteId: params.noteId ?? data.noteId as string } });
    } else if (screen === "broker-client-detail") {
      router.push({ pathname: "/broker-client-detail", params: { profileId: data.profileId as string, clientUserId: data.clientId as string, scrollTo: data.scrollTo as string } });
    } else if (screen === "chat/[id]" && chatTargetId) {
      router.push({ pathname: "/chat/[id]", params: { id: chatTargetId, chatRoomId: chatId, ...params } });
    } else if (screen) {
      router.push({ pathname: getNotificationRoute(screen), params });
    }
  } else if (type === "chat_message" || typeof data.senderId === "string") {
    router.push({ pathname: "/chat/[id]", params: { id: chatTargetId || data.senderId as string, chatRoomId: chatId, ...params } });
  }
}

export async function getActiveChatId(userId: string): Promise<string | null> {
  const snapshot = await getDoc(doc(db, "users", userId));
  const activeChatId = snapshot.exists() ? snapshot.data().activeChatId : null;
  return typeof activeChatId === "string" ? activeChatId : null;
}
