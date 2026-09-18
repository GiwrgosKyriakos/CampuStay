import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  writeBatch,
  Timestamp,
  serverTimestamp,
  setDoc,
  addDoc,
  arrayRemove,
  arrayUnion,
  deleteField,
  FieldPath,
} from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { getUserSettings } from "@/src/api/accountSettings";
import { syncBrokerClientProfile } from "@/src/api/brokerClientProfiles";
import type { GroupChatMetadata, SharedProfileMessageMetadata } from "@/src/types/chat";
import { isBrokerOrAgencyUser, isRoommateGroupHost, type UserRoleData } from "@/src/utils/roles";

type GroupUserProfile = UserRoleData & {
  looking_for_roommate?: boolean;
  isLookingForRoommate?: boolean;
  not_looking_for_roommate?: boolean;
};

export interface ActiveRoommateGroup {
  id: string;
  name: string;
  hostUserId: string | null;
}

function timestampMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return 0;
  const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
  return 0;
}

function isGroupHostProfile(profile: GroupUserProfile | null): boolean {
  return isRoommateGroupHost(profile);
}

async function resolvePinnedApartmentId(
  creatorId: string,
  creatorIsHost: boolean,
  hostUserId: string | undefined,
  fallbackApartmentId?: string,
): Promise<string | undefined> {
  if (creatorIsHost) {
    for (const ownerField of ["hostId", "creatorId"] as const) {
      try {
        const snapshot = await getDocs(query(
          collection(db, "apartments"),
          where(ownerField, "==", creatorId),
          orderBy("createdAt", "desc"),
          limit(1),
        ));
        if (snapshot.docs[0]) return snapshot.docs[0].id;
      } catch {
        const fallbackSnapshot = await getDocs(query(collection(db, "apartments"), where(ownerField, "==", creatorId)));
        const latestFallback = fallbackSnapshot.docs
          .sort((left, right) => timestampMillis(right.data().createdAt) - timestampMillis(left.data().createdAt))[0];
        if (latestFallback) return latestFallback.id;
      }
    }
    return fallbackApartmentId;
  }

  if (!hostUserId) return fallbackApartmentId;
  const directChats = await getDocs(query(collection(db, "chats"), where("users", "array-contains", creatorId)));
  const originChats = directChats.docs
    .map((chatDoc) => ({ id: chatDoc.id, data: chatDoc.data() as { users?: string[]; type?: string; apartmentId?: string; hostApartmentId?: string; updatedAt?: unknown; createdAt?: unknown } }))
    .filter(({ data }) => data.type === "host" && data.users?.includes(hostUserId))
    .filter(({ data }) => Boolean(data.apartmentId || data.hostApartmentId))
    .sort((left, right) => timestampMillis(right.data.updatedAt ?? right.data.createdAt) - timestampMillis(left.data.updatedAt ?? left.data.createdAt));
  return originChats[0]?.data.apartmentId ?? originChats[0]?.data.hostApartmentId ?? fallbackApartmentId;
}

export async function createRoommateGroupChat(params: {
  creatorId: string;
  memberIds: string[];
  hostUserId?: string;
  hostUserIds?: string[];
  hostApartmentId?: string;
  groupName?: string;
}): Promise<string> {
  const creatorSnapshot = await getDoc(doc(db, "users", params.creatorId));
  const creator = creatorSnapshot.exists() ? creatorSnapshot.data() as GroupUserProfile : null;
  const creatorIsHost = isGroupHostProfile(creator);
  if (!creator || isBrokerOrAgencyUser(creator) || (!creatorIsHost && (creator.looking_for_roommate === false || creator.isLookingForRoommate === false || creator.not_looking_for_roommate === true))) {
    throw new Error("Η δημιουργία ομαδικής είναι διαθέσιμη μόνο σε χρήστες που αναζητούν συγκάτοικο.");
  }
  const memberIds = Array.from(new Set([params.creatorId, ...params.memberIds])).filter(Boolean);
  if (memberIds.length < 3) throw new Error("A group chat needs at least two selected participants.");
  const hostUserIds = Array.from(new Set([...(params.hostUserIds ?? []), ...(params.hostUserId ? [params.hostUserId] : [])]));
  if (hostUserIds.length > 1) throw new Error("Μπορεί να προστεθεί μόνο ένας Host στην ομαδική.");
  const requestedHostUserId = hostUserIds[0];
  if (requestedHostUserId && !memberIds.includes(requestedHostUserId)) {
    throw new Error("The selected host must be a group member.");
  }

  const memberProfiles: Array<GroupUserProfile | null> = await Promise.all(
    memberIds.map(async (memberId) => {
      const snapshot = await getDoc(doc(db, "users", memberId));
      return snapshot.exists() ? snapshot.data() as GroupUserProfile : null;
    }),
  );
  if (memberProfiles.some((profile) => !profile || isBrokerOrAgencyUser(profile))) {
    throw new Error("Commercial brokers cannot be added to roommate group chats.");
  }
  const memberHostIds = memberIds.filter((_, index) => isGroupHostProfile(memberProfiles[index]));
  if (memberHostIds.length > 1) throw new Error("Μπορεί να προστεθεί μόνο ένας Host στην ομαδική.");
  const hostUserId = creatorIsHost ? params.creatorId : requestedHostUserId ?? memberHostIds[0];
  if (hostUserId && !isGroupHostProfile(memberProfiles[memberIds.indexOf(hostUserId)])) {
    throw new Error("The selected host must have an active host profile.");
  }

  const pinnedApartmentId = await resolvePinnedApartmentId(params.creatorId, creatorIsHost, hostUserId, params.hostApartmentId);
  const nonHostMemberIds = memberIds.filter((memberId) => memberId !== hostUserId);

  const groupMetadata: GroupChatMetadata = {
    isGroup: true,
    groupName: params.groupName?.trim() || "Ομαδική",
    ...(hostUserId ? { hostUserId } : {}),
    ...(pinnedApartmentId ? { hostApartmentId: pinnedApartmentId, pinnedApartmentId } : {}),
    memberIds,
    createdBy: params.creatorId,
  };
  const memberStatuses = Object.fromEntries(
    memberIds.map((memberId) => [memberId, memberId === params.creatorId ? "approved" : "pending"]),
  );
  const chatRef = doc(collection(db, "chats"));
  const messageRef = doc(collection(db, "chats", chatRef.id, "messages"));
  const batch = writeBatch(db);
  batch.set(chatRef, {
    users: memberIds,
    participants: memberIds,
    type: "roommate_group",
    groupName: groupMetadata.groupName,
    groupMetadata,
    ...(pinnedApartmentId ? { hostApartmentId: pinnedApartmentId, pinnedApartmentId, apartmentId: pinnedApartmentId } : {}),
    createdBy: params.creatorId,
    initiatedBy: params.creatorId,
    status: "active",
    memberStatuses,
    lastMessage: "Ομαδική συνομιλία δημιουργήθηκε",
    lastMessageText: "Ομαδική συνομιλία δημιουργήθηκε",
    lastMessageTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    unreadCounts: Object.fromEntries(memberIds.map((id) => [id, 0])),
  });
  nonHostMemberIds.forEach((memberId) => {
    batch.update(doc(db, "users", memberId), {
      hasApartment: false,
      isLooking: true,
      housingStatus: "looking",
      has_place: false,
      already_have_apartment_to_share: false,
      looking_for_apartment: true,
      updatedAt: serverTimestamp(),
    });
  });
  batch.set(messageRef, {
    senderId: params.creatorId,
    type: "system",
    text: "Ομαδική συνομιλία δημιουργήθηκε",
    createdAt: serverTimestamp(),
    isRead: true,
  });
  await batch.commit();
  return chatRef.id;
}

export async function getActiveRoommateGroupsForUser(userId: string): Promise<ActiveRoommateGroup[]> {
  const snapshot = await getDocs(query(collection(db, "chats"), where("users", "array-contains", userId)));
  return snapshot.docs.flatMap((chatDoc): ActiveRoommateGroup[] => {
    const data = chatDoc.data() as { type?: string; status?: string; groupName?: string; hostUserId?: string; groupMetadata?: GroupChatMetadata };
    if (data.type !== "roommate_group" || data.status !== "active") return [];
    return [{
      id: chatDoc.id,
      name: data.groupMetadata?.groupName || data.groupName || "Ομαδική",
      hostUserId: data.groupMetadata?.hostUserId ?? data.hostUserId ?? null,
    }];
  });
}

export async function leaveRoommateGroupsAndSetHousing(userId: string, groups: ActiveRoommateGroup[]): Promise<void> {
  const userSnapshot = await getDoc(doc(db, "users", userId));
  const userName = userSnapshot.exists() && typeof userSnapshot.data().name === "string" ? userSnapshot.data().name.trim() : "Χρήστης";
  const batch = writeBatch(db);

  groups.forEach((group) => {
    const chatRef = doc(db, "chats", group.id);
    const messageRef = doc(collection(db, "chats", group.id, "messages"));
    const messageText = `${userName || "Χρήστης"} αποχώρησε από την ομαδική`;
    batch.update(
      chatRef,
      "users", arrayRemove(userId),
      "participants", arrayRemove(userId),
      new FieldPath("groupMetadata", "memberIds"), arrayRemove(userId),
      new FieldPath("memberStatuses", userId), "rejected",
      new FieldPath("deletedUsers", userId), true,
      "lastMessage", messageText,
      "lastMessageText", messageText,
      "lastMessageTimestamp", serverTimestamp(),
      "updatedAt", serverTimestamp(),
    );
    batch.set(messageRef, {
      senderId: userId,
      type: "user_left_group",
      text: messageText,
      createdAt: serverTimestamp(),
      isRead: true,
    });
  });
  batch.update(doc(db, "users", userId), {
    hasApartment: true,
    isLooking: false,
    housingStatus: "has_apartment",
    has_place: true,
    already_have_apartment_to_share: true,
    looking_for_apartment: false,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function renameRoommateGroupChat(chatRoomId: string, userId: string, groupName: string): Promise<void> {
  const trimmedName = groupName.trim();
  if (!trimmedName) throw new Error("Group name cannot be empty.");
  const chatRef = doc(db, "chats", chatRoomId);
  const snapshot = await getDoc(chatRef);
  if (!snapshot.exists()) throw new Error("Group chat not found.");
  const data = snapshot.data() as { users?: string[]; groupMetadata?: GroupChatMetadata };
  if (!Array.isArray(data.users) || !data.users.includes(userId)) throw new Error("Only group members can rename this chat.");
  const userSnapshot = await getDoc(doc(db, "users", userId));
  const userName = userSnapshot.exists() && typeof userSnapshot.data()?.name === "string" ? userSnapshot.data()?.name.trim() : "Χρήστης";
  const systemText = `${userName || "Χρήστης"} άλλαξε το όνομα της ομαδικής σε '${trimmedName}'`;
  await setDoc(chatRef, {
    groupName: trimmedName,
    groupMetadata: { ...(data.groupMetadata ?? { isGroup: true, memberIds: data.users, createdBy: userId }), groupName: trimmedName },
    lastMessage: systemText,
    lastMessageText: systemText,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, "chats", chatRoomId, "messages"), {
    senderId: userId,
    type: "group_name_changed",
    text: systemText,
    createdAt: serverTimestamp(),
    isRead: true,
  });
}

export async function sendSharedRoommateProfile(params: {
  chatRoomId: string;
  senderId: string;
  metadata: SharedProfileMessageMetadata;
}): Promise<void> {
  const name = params.metadata.sharedUserData.fullName || "Προφίλ συγκάτοικου";
  await addDoc(collection(db, "chats", params.chatRoomId, "messages"), {
    senderId: params.senderId,
    type: "shared_roommate_profile",
    text: `Κοινοποιήθηκε το προφίλ του/της ${name}`,
    metadata: { sharedProfile: params.metadata },
    createdAt: serverTimestamp(),
    isRead: false,
  });
  await setDoc(doc(db, "chats", params.chatRoomId), {
    lastMessage: `Κοινοποιήθηκε το προφίλ του/της ${name}`,
    lastMessageText: `Κοινοποιήθηκε το προφίλ του/της ${name}`,
    lastMessageTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export interface PropertyCardMessageData {
  id: string;
  title: string;
  rent: number;
  city: string;
  area: string;
  image: string;
  imageUrl?: string;
  images?: string[];
  rooms: number;
  size: number;
  tags?: string[];
}

export async function sendPropertyCardMessage(params: {
  chatRoomId: string;
  senderId: string;
  receiverId: string;
  apartment: PropertyCardMessageData;
}): Promise<void> {
  const text = `Κοινοποιήθηκε το ακίνητο ${params.apartment.title || "Ακίνητο"}`;
  await addDoc(collection(db, "chats", params.chatRoomId, "messages"), {
    senderId: params.senderId,
    receiverId: params.receiverId,
    type: "property_card",
    text,
    apartmentId: params.apartment.id,
    apartmentTitle: params.apartment.title,
    apartmentPrice: params.apartment.rent,
    apartmentData: params.apartment,
    createdAt: serverTimestamp(),
    isRead: false,
  });
  await setDoc(doc(db, "chats", params.chatRoomId), {
    lastMessage: text,
    lastMessageText: text,
    lastMessageType: "property_card",
    lastMessageSenderId: params.senderId,
    lastMessageTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Marks all incoming messages from a specific sender as read within a chat room.
 * This is called when the current user enters a chat, ensuring the UI reflects
 * that they've read messages from the counterparty.
 *
 * @param chatRoomId - The Firestore chat room document ID
 * @param currentUserId - The UID of the current user
 * @param counterpartUserId - The UID of the sender whose messages should be marked as read
 */
export async function markIncomingMessagesAsRead(
  chatRoomId: string,
  currentUserId: string,
  counterpartUserId: string
): Promise<void> {
  try {
    // Query all unread messages from the counterparty in this chat
    const unreadMessagesQuery = query(
      collection(db, "chats", chatRoomId, "messages"),
      where("senderId", "==", counterpartUserId),
      where("isRead", "==", false)
    );

    const snapshot = await getDocs(unreadMessagesQuery);

    if (snapshot.empty) {
      return; // No unread messages to update
    }

    // Batch update all unread messages to mark them as read
    const batchUpdate = writeBatch(db);

    snapshot.docs.forEach((msgDoc) => {
      batchUpdate.update(msgDoc.ref, {
        isRead: true,
        readAt: Timestamp.now(),
        readBy: [currentUserId],
      });
    });

    await batchUpdate.commit();

    // Keep the denormalized inbox preview in sync so unread dots clear without
    // per-row message listeners. Only touch the chat doc when the latest message
    // is one of the counterparty messages we just marked as read.
    try {
      const chatRef = doc(db, "chats", chatRoomId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists() && chatSnap.data()?.lastMessageSenderId === counterpartUserId) {
        await setDoc(
          chatRef,
          { lastMessageIsRead: true, lastMessageReadBy: arrayUnion(currentUserId) },
          { merge: true },
        );
      }
    } catch (syncError) {
      console.warn("Error syncing chat last-message read state:", syncError);
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
    // Silently fail - this is a non-critical operation that shouldn't break the UI
  }
}

/**
 * Checks if a message from a specific sender is unread by the current user.
 * Used to determine whether to show the unread indicator in the chat list.
 *
 * @param messageData - The message document data
 * @param currentUserId - The UID of the current user
 * @returns true if message is unread by current user, false otherwise
 */
export function isMessageUnread(
  messageData: {
    isRead?: boolean;
    read?: boolean;
    readAt?: any;
    readBy?: string[];
    seenBy?: string[];
  } | null,
  currentUserId: string
): boolean {
  if (!messageData) return false;

  // Check primary unread indicator
  if (messageData.isRead === false) return true;

  // Fallback checks for other read tracking patterns
  if (messageData.read === true) return false;
  if (messageData.readAt != null) return false;
  if (Array.isArray(messageData.readBy) && messageData.readBy.includes(currentUserId)) return false;
  if (Array.isArray(messageData.seenBy) && messageData.seenBy.includes(currentUserId)) return false;

  // Default to read if no unread indicators found
  return false;
}

/**
 * Checks if there are any unread messages from a specific user in a chat.
 * Useful for filtering chats with unread activity.
 *
 * @param chatRoomId - The Firestore chat room document ID
 * @param senderUserId - The UID of the sender to check unread messages from
 * @returns true if unread messages exist from the sender, false otherwise
 */
export async function hasUnreadMessagesFrom(
  chatRoomId: string,
  senderUserId: string
): Promise<boolean> {
  try {
    const unreadQuery = query(
      collection(db, "chats", chatRoomId, "messages"),
      where("senderId", "==", senderUserId),
      where("isRead", "==", false)
    );

    const snapshot = await getDocs(unreadQuery);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking for unread messages:", error);
    return false;
  }
}

function buildChatRoomId(userA: string, userB: string, apartmentId?: string): string {
  const parts = apartmentId ? [userA, userB, apartmentId] : [userA, userB];
  return parts.sort().join("_");
}

export interface BlockRelationshipState {
  isBlocker: boolean;
  isBlocked: boolean;
}

export async function getBlockRelationshipState(
  currentUserId: string,
  targetUserId: string,
): Promise<BlockRelationshipState> {
  try {
    const [currentSettings, targetSettings] = await Promise.all([
      getUserSettings(currentUserId).catch(() => null),
      getUserSettings(targetUserId).catch(() => null),
    ]);

    const currentBlocked = new Set(
      (currentSettings?.privacy?.blocked_profiles ?? []).map((entry) => entry.id),
    );
    const targetBlocked = new Set(
      (targetSettings?.privacy?.blocked_profiles ?? []).map((entry) => entry.id),
    );

    return {
      isBlocker: currentBlocked.has(targetUserId),
      isBlocked: targetBlocked.has(currentUserId),
    };
  } catch {
    return {
      isBlocker: false,
      isBlocked: false,
    };
  }
}

async function findExistingHostChatRoomId(params: {
  currentUserId: string;
  hostId: string;
  apartmentId: string;
}): Promise<string | null> {
  const { currentUserId, hostId, apartmentId } = params;
  const hostChatsQ = query(
    collection(db, "chats"),
    where("type", "==", "host"),
    where("apartmentId", "==", apartmentId),
    where("users", "array-contains", currentUserId),
  );
  const hostChatsSnap = await getDocs(hostChatsQ).catch(() => null);
  if (!hostChatsSnap) return null;
  const existing = hostChatsSnap.docs.find((chatDoc) => {
    const users = chatDoc.data()?.users;
    return Array.isArray(users) && users.includes(hostId);
  });
  return existing?.id ?? null;
}

export async function getOrCreateHostChat(params: {
  currentUserId: string;
  hostId: string;
  apartmentId: string;
  apartmentTitle?: string;
}): Promise<string> {
  const { currentUserId, hostId, apartmentId, apartmentTitle } = params;
  const blockState = await getBlockRelationshipState(currentUserId, hostId);
  const hostSnapshot = await getDoc(doc(db, "users", hostId)).catch(() => null);
  const hostData = hostSnapshot?.exists() ? hostSnapshot.data() as { is_broker?: boolean } : null;
  const brokerChatRole = hostData?.is_broker === true ? "client" : undefined;
  const blockedByUsers = {
    [currentUserId]: blockState.isBlocker,
    [hostId]: blockState.isBlocked,
  };
  const existingRoomId = await findExistingHostChatRoomId({ currentUserId, hostId, apartmentId });
  if (existingRoomId) {
    await setDoc(
      doc(db, "chats", existingRoomId),
      {
        users: [currentUserId, hostId],
        type: "host",
        ...(brokerChatRole ? { brokerChatRole } : {}),
        apartmentId,
        apartmentTitle: apartmentTitle ?? "",
        blockedByUsers,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (brokerChatRole) {
      await syncBrokerClientProfile({
        brokerId: hostId,
        clientId: currentUserId,
        role: "client",
        chatRoomId: existingRoomId,
        apartmentId,
      });
    }
    return existingRoomId;
  }

  const chatRoomId = buildChatRoomId(currentUserId, hostId, apartmentId);
  const chatRef = doc(db, "chats", chatRoomId);
  const snapshot = await getDoc(chatRef).catch(() => null);

  if (!snapshot?.exists()) {
    await setDoc(
      chatRef,
      {
        users: [currentUserId, hostId],
        status: "active",
        initiatedBy: currentUserId,
        type: "host",
        ...(brokerChatRole ? { brokerChatRole } : {}),
        apartmentId,
        apartmentTitle: apartmentTitle ?? "",
        blockedByUsers,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (brokerChatRole) {
      await syncBrokerClientProfile({
        brokerId: hostId,
        clientId: currentUserId,
        role: "client",
        chatRoomId,
        apartmentId,
      });
    }
    return chatRoomId;
  }

  await setDoc(
    chatRef,
    {
      type: "host",
      ...(brokerChatRole ? { brokerChatRole } : {}),
      apartmentId,
      apartmentTitle: apartmentTitle ?? "",
      blockedByUsers,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (brokerChatRole) {
    await syncBrokerClientProfile({
      brokerId: hostId,
      clientId: currentUserId,
      role: "client",
      chatRoomId,
      apartmentId,
    });
  }

  return chatRoomId;
}

/**
 * Updates the block state for ALL chat rooms (roommate & host chats)
 * existing between two users.
 */
export async function setBlockStateBetweenUsers(
  currentUserId: string,
  targetUserId: string,
  isBlocked: boolean
): Promise<void> {
  try {
    const chatsQ = query(
      collection(db, "chats"),
      where("users", "array-contains", currentUserId)
    );
    const snapshot = await getDocs(chatsQ);

    const batch = writeBatch(db);
    let hasUpdates = false;

    snapshot.docs.forEach((chatDoc) => {
      const users = chatDoc.data()?.users;
      if (Array.isArray(users) && users.includes(targetUserId)) {
        hasUpdates = true;
        batch.update(
          chatDoc.ref,
          new FieldPath("blockedByUsers", currentUserId), isBlocked,
          new FieldPath(`blockedByUsers.${currentUserId}`), deleteField(),
          "updatedAt", serverTimestamp(),
        );
      }
    });

    if (hasUpdates) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Error setting block state between users:", error);
    throw error;
  }
}