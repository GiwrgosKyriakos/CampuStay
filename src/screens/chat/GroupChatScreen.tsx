import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  arrayRemove,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  orderBy,
} from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { subscribeUserLikedApartmentIds } from "@/src/api/apartmentLikes";
import { renameRoommateGroupChat, setBlockStateBetweenUsers } from "@/src/api/chat";
import { getUserSettings, saveUserPrivacy } from "@/src/api/accountSettings";
import { updateLinkedCalendarNotes, updateVisitAppointment } from "@/src/api/visitAppointments";
import type { GroupChatMetadata } from "@/src/types/chat";
import RenameGroupModal from "@/src/components/chat/RenameGroupModal";
import CommonLikedListingsModal, { type CommonLikedListing } from "@/src/components/chat/CommonLikedListingsModal";
import RoommateContractPickerModal from "@/src/components/RoommateContractPickerModal";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import { useVoiceInputPreview } from "@/src/hooks/useVoiceInputPreview";
import { t } from "@/src/locales";
import type { ContractDraftContext, ContractType } from "@/src/types/esignature";
import EditVisitModal from "@/src/components/chat/modals/EditVisitModal";
import CenteredActionModal from "@/src/components/CenteredActionModal";

const campuStay = true;

type GroupMessage = {
  id: string;
  senderId: string;
  text: string;
  type?: string;
  contractId?: string;
  contractType?: ContractType;
  contractTitle?: string;
  createdAt: number;
  metadata?: {
    appointmentId?: string;
    appointmentDate?: string;
    apartmentTitle?: string;
    status?: "pending" | "confirmed" | "cancelled";
  };
};

type Apartment = CommonLikedListing & { images?: string[] };

type GroupMemberProfile = {
  id: string;
  name: string;
  photo: string;
};

type GroupMessagePosition = "first" | "middle" | "last" | "single";

function getGroupMessageInfo(messages: GroupMessage[], index: number): { position: GroupMessagePosition; isConsecutive: boolean } {
  const currentMessage = messages[index];
  const previousMessage = index > 0 ? messages[index - 1] : null;
  const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
  const previousSame = previousMessage?.senderId === currentMessage.senderId;
  const nextSame = nextMessage?.senderId === currentMessage.senderId;

  if (!previousSame && !nextSame) return { position: "single", isConsecutive: false };
  if (!previousSame && nextSame) return { position: "first", isConsecutive: true };
  if (previousSame && nextSame) return { position: "middle", isConsecutive: true };
  return { position: "last", isConsecutive: true };
}

function getGroupMessageMargin(messages: GroupMessage[], index: number) {
  const groupInfo = getGroupMessageInfo(messages, index);
  const previousMessage = index > 0 ? messages[index - 1] : null;

  return {
    marginVertical: groupInfo.isConsecutive
      ? groupInfo.position === "first"
        ? spacing.xs
        : 2
      : previousMessage && previousMessage.senderId !== messages[index].senderId
        ? spacing.sm
        : spacing.xs,
  };
}

export default function GroupChatScreen({
  chatRoomId,
  currentUserId,
  metadata,
}: {
  chatRoomId: string;
  currentUserId: string;
  metadata: GroupChatMetadata;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const draftVoice = useVoiceInputPreview(text, setText);
  const [groupName, setGroupName] = useState(metadata.groupName || "Ομαδική");
  const [renameVisible, setRenameVisible] = useState(false);
  const [commonVisible, setCommonVisible] = useState(false);
  const [commonLoading, setCommonLoading] = useState(false);
  const [likedByMember, setLikedByMember] = useState<Record<string, Set<string>>>({});
  const [apartments, setApartments] = useState<Record<string, Apartment>>({});
  const [hostApartment, setHostApartment] = useState<Apartment | null>(null);
  const [agencyId, setAgencyId] = useState("independent");
  const [contractPickerVisible, setContractPickerVisible] = useState(false);
  const [underConstructionModalVisible, setUnderConstructionModalVisible] = useState(false);
  const [visitToEdit, setVisitToEdit] = useState<GroupMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [memberBlockModalVisible, setMemberBlockModalVisible] = useState(false);
  const [memberBlockProfiles, setMemberBlockProfiles] = useState<GroupMemberProfile[]>([]);
  const [memberBlockLoading, setMemberBlockLoading] = useState(false);
  const [blockingMemberId, setBlockingMemberId] = useState<string | null>(null);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  const hasHost = Boolean(metadata.hostUserId || metadata.hostApartmentId);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardOpen(true),
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardOpen(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!memberBlockModalVisible) return undefined;
    let active = true;
    const memberIds = metadata.memberIds.filter((memberId) => memberId !== currentUserId);
    setMemberBlockLoading(true);
    void Promise.all(
      memberIds.map(async (memberId): Promise<GroupMemberProfile> => {
        try {
          const snapshot = await getDoc(doc(db, "users", memberId));
          const data = snapshot.exists() ? snapshot.data() as { name?: string; photoUrl?: string; photos?: string[] } : {};
          return {
            id: memberId,
            name: data.name?.trim() || "Μέλος ομάδας",
            photo: data.photoUrl || data.photos?.[0] || "",
          };
        } catch {
          return { id: memberId, name: "Μέλος ομάδας", photo: "" };
        }
      }),
    ).then((profiles) => {
      if (active) setMemberBlockProfiles(profiles);
    }).finally(() => {
      if (active) setMemberBlockLoading(false);
    });
    return () => {
      active = false;
    };
  }, [currentUserId, memberBlockModalVisible, metadata.memberIds]);

  useEffect(() => {
    return onSnapshot(doc(db, "chats", chatRoomId), (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() as { mutedByUsers?: Record<string, boolean> } : {};
      setIsChatMuted(data.mutedByUsers?.[currentUserId] === true);
    });
  }, [chatRoomId, currentUserId]);

  useFocusEffect(
    React.useCallback(() => {
      if (!currentUserId || !chatRoomId) return undefined;
      const userRef = doc(db, "users", currentUserId);
      void setDoc(userRef, { activeChatId: chatRoomId }, { merge: true }).catch(() => undefined);
      return () => {
        void runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userRef);
          if (snapshot.exists() && snapshot.data().activeChatId === chatRoomId) {
            transaction.update(userRef, { activeChatId: deleteField() });
          }
        }).catch(() => undefined);
      };
    }, [chatRoomId, currentUserId]),
  );

  useEffect(() => {
    void getDoc(doc(db, "users", currentUserId))
      .then((snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as { agencyId?: unknown }) : {};
        setAgencyId(typeof data.agencyId === "string" && data.agencyId.trim() ? data.agencyId.trim() : "independent");
      })
      .catch(() => setAgencyId("independent"));
  }, [currentUserId]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, "chats", chatRoomId, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
        const fetchedMessages = snapshot.docs.map((message) => {
            const data = message.data() as {
              senderId?: string;
              text?: string;
              type?: string;
              contractId?: string;
              contractType?: ContractType;
              contractTitle?: string;
              createdAt?: { toMillis?: () => number } | number;
              metadata?: GroupMessage["metadata"];
            };
            const createdAt = typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || 0;
            return {
              id: message.id,
              senderId: data.senderId || "",
              text: data.text || "",
              type: data.type,
              contractId: data.contractId,
              contractType: data.contractType,
              contractTitle: data.contractTitle,
              metadata: data.metadata,
              createdAt,
            };
          });
        setMessages((previous) => {
          const pendingMessages = previous.filter(
            (message) =>
              message.id.startsWith("temp-") &&
              !fetchedMessages.some(
                (fetchedMessage) =>
                  fetchedMessage.senderId === message.senderId && fetchedMessage.text === message.text,
              ),
          );
          return [...fetchedMessages, ...pendingMessages].sort((first, second) => first.createdAt - second.createdAt);
        });
      }),
    [chatRoomId],
  );

  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const activePinnedAppointment = useMemo(
    () =>
      [...new Map(messages.filter((message) => message.metadata?.appointmentId).map((message) => [message.metadata?.appointmentId, message])).values()]
        .filter(
          (message) =>
            (message.metadata?.status === "pending" || message.metadata?.status === "confirmed") &&
            !!message.metadata?.appointmentDate &&
            Date.parse(message.metadata.appointmentDate) > Date.now(),
        )
        .sort((first, second) => Date.parse(first.metadata?.appointmentDate ?? "") - Date.parse(second.metadata?.appointmentDate ?? ""))[0] ?? null,
    [messages],
  );

  const saveVisitChanges = async (appointmentDate: string) => {
    const appointmentId = visitToEdit?.metadata?.appointmentId;
    if (!appointmentId || !visitToEdit) return;
    await updateVisitAppointment(appointmentId, { appointmentDate, status: "confirmed" });
    await updateLinkedCalendarNotes({ appointmentId, appointmentDate, status: "confirmed" });
    await addDoc(collection(db, "chats", chatRoomId, "messages"), {
      senderId: "system",
      text: "Το ραντεβού ενημερώθηκε.",
      type: "visit_rescheduled",
      metadata: { ...visitToEdit.metadata, appointmentId, appointmentDate, status: "confirmed" },
      createdAt: serverTimestamp(),
      isRead: true,
    });
    setVisitToEdit(null);
  };

  const cancelVisit = async () => {
    const appointmentId = visitToEdit?.metadata?.appointmentId;
    if (!appointmentId || !visitToEdit) return;
    await updateVisitAppointment(appointmentId, { status: "cancelled" });
    await updateLinkedCalendarNotes({
      appointmentId,
      appointmentDate: visitToEdit.metadata?.appointmentDate ?? "",
      status: "cancelled",
    });
    await addDoc(collection(db, "chats", chatRoomId, "messages"), {
      senderId: "system",
      text: "Το ραντεβού ακυρώθηκε.",
      type: "visit_cancelled",
      metadata: { ...visitToEdit.metadata, appointmentId, status: "cancelled" },
      createdAt: serverTimestamp(),
      isRead: true,
    });
    setVisitToEdit(null);
  };

  useEffect(() => {
    const unsubscribers = metadata.memberIds.map((memberId) =>
      subscribeUserLikedApartmentIds(memberId, (ids) =>
        setLikedByMember((previous) => ({ ...previous, [memberId]: ids })),
      ),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [metadata.memberIds]);

  useEffect(() => {
    if (!metadata.hostApartmentId) return;
    return onSnapshot(doc(db, "apartments", metadata.hostApartmentId), (snapshot) => {
      if (!snapshot.exists()) return setHostApartment(null);
      const data = snapshot.data() as {
        title?: string;
        area?: string;
        city?: string;
        rent?: number;
        price?: number;
        image?: string;
        imageUrl?: string;
        images?: string[];
      };
      setHostApartment({
        id: snapshot.id,
        title: data.title || "Ακίνητο",
        area: data.area || "",
        city: data.city || "",
        rent: data.rent ?? data.price ?? 0,
        image: data.image || data.imageUrl || data.images?.[0],
      });
    });
  }, [metadata.hostApartmentId]);

  const commonIds = useMemo(() => {
    const sets = metadata.memberIds.map((id) => likedByMember[id]).filter(Boolean);
    if (sets.length !== metadata.memberIds.length || sets.length === 0) return [];
    return Array.from(sets[0]).filter((id) => sets.every((set) => set.has(id)));
  }, [likedByMember, metadata.memberIds]);

  useEffect(() => {
    if (!commonVisible || commonIds.length === 0) {
      if (!commonVisible) setApartments({});
      return;
    }
    let active = true;
    setCommonLoading(true);
    void Promise.all(
      commonIds.map(async (id) => {
        const snapshot = await getDoc(doc(db, "apartments", id));
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as {
          title?: string;
          area?: string;
          city?: string;
          rent?: number;
          price?: number;
          image?: string;
          imageUrl?: string;
          images?: string[];
        };
        return {
          id,
          title: data.title || "Ακίνητο",
          area: data.area || "",
          city: data.city || "",
          rent: data.rent ?? data.price ?? 0,
          image: data.image || data.imageUrl || data.images?.[0],
        };
      }),
    )
      .then((rows) => {
        const validRows = rows.filter((row) => row !== null);
        if (active) setApartments(Object.fromEntries(validRows.map((row) => [row.id, row as Apartment])));
      })
      .finally(() => {
        if (active) setCommonLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commonIds, commonVisible]);

  const send = async () => {
    const value = draftVoice.value.trim();
    if (!value || draftVoice.isPreviewing) return;

    const optimisticMessage: GroupMessage = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      type: "text",
      text: value,
      createdAt: Date.now(),
    };
    setMessages((previous) => [...previous, optimisticMessage]);
    setText("");
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));

    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        senderId: currentUserId,
        type: "text",
        text: value,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          lastMessage: value,
          lastMessageText: value,
          lastMessageType: "text",
          lastMessageSenderId: currentUserId,
          lastMessageIsRead: false,
          lastMessageReadBy: [currentUserId],
          lastMessageTimestamp: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      setMessages((previous) => previous.filter((message) => message.id !== optimisticMessage.id));
    }
  };

  const rename = async (name: string) => {
    await renameRoommateGroupChat(chatRoomId, currentUserId, name);
    setGroupName(name.trim());
    setRenameVisible(false);
  };

  const leaveGroup = async () => {
    try {
      await updateDoc(doc(db, "chats", chatRoomId), {
        users: arrayRemove(currentUserId),
        participants: arrayRemove(currentUserId),
        [`memberStatuses.${currentUserId}`]: "rejected",
        [`deletedUsers.${currentUserId}`]: true,
        updatedAt: serverTimestamp(),
      });
      setContextMenuVisible(false);
      router.back();
    } catch {
      Alert.alert("Leave group", "The group could not be left. Please try again.");
    }
  };

  const blockMember = async (member: GroupMemberProfile) => {
    if (!currentUserId || blockingMemberId) return;
    setBlockingMemberId(member.id);
    try {
      const settings = await getUserSettings(currentUserId);
      const blockedProfiles = settings.privacy.blocked_profiles.some((profile) => profile.id === member.id)
        ? settings.privacy.blocked_profiles
        : [...settings.privacy.blocked_profiles, { id: member.id, name: member.name }];
      await saveUserPrivacy(currentUserId, { ...settings.privacy, blocked_profiles: blockedProfiles });
      await setBlockStateBetweenUsers(currentUserId, member.id, true);
      setMemberBlockModalVisible(false);
      Alert.alert("Member blocked", `${member.name} has been blocked.`);
    } catch {
      Alert.alert("Block failed", "The member could not be blocked. Please try again.");
    } finally {
      setBlockingMemberId(null);
    }
  };

  const toggleChatMute = async () => {
    if (!currentUserId || !chatRoomId || isMuting) return;
    const nextMutedState = !isChatMuted;
    setContextMenuVisible(false);
    setIsMuting(true);
    try {
      await setDoc(
        doc(db, "chats", chatRoomId),
        {
          mutedByUsers: { [currentUserId]: nextMutedState },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setIsChatMuted(nextMutedState);
      Alert.alert(
        nextMutedState ? "Notifications muted" : "Notifications unmuted",
        nextMutedState ? "You will not receive push notifications for this chat." : "Push notifications are enabled for this chat.",
      );
    } catch {
      Alert.alert("Notifications update failed", "Please try again.");
    } finally {
      setIsMuting(false);
    }
  };

  const startContract = (contractType: Extract<ContractType, "roommate_agreement" | "holding_deposit_viewing">) => {
    if (campuStay) {
      setContractPickerVisible(false);
      setUnderConstructionModalVisible(true);
      return;
    }
    setContractPickerVisible(false);
    const participantIds = metadata.memberIds.map((id) => ({
      id,
      role: id === metadata.hostUserId ? ("owner" as const) : ("roommate" as const),
    }));
    const draft: ContractDraftContext = {
      agencyId,
      createdByUserId: currentUserId,
      contractType,
      title: t(contractType === "roommate_agreement" ? "esign.roommateAgreement" : "esign.holdingDeposit"),
      ownerId: metadata.hostUserId,
      apartmentId: metadata.hostApartmentId,
      chatRoomId,
      participantIds,
      contractPayload:
        contractType === "holding_deposit_viewing" ? { holdingDepositAmount: 0 } : { houseRulesConfig: {} },
    };
    router.push({ pathname: "/contract/[id]", params: { id: "new", draft: JSON.stringify(draft), signerId: currentUserId } } as never);
  };

  return (
    <View style={styles.container}>
      {/* Signature Curved Elevated Header matching ChatHeader */}
      <View
        style={[styles.header, { paddingTop: insets.top + spacing.xs }]}
      >
        {hostApartment ? (
          <Pressable
            style={styles.apartmentPill}
            onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(hostApartment) } } as never)}
            testID="group-chat-apartment-pill"
          >
            {hostApartment.image ? (
              <Image source={{ uri: hostApartment.image }} style={styles.apartmentThumb} contentFit="cover" />
            ) : (
              <View style={styles.apartmentThumbFallback}>
                <Ionicons name="home-outline" size={16} color={colors.onSurfaceTertiary} />
              </View>
            )}
            <View style={styles.apartmentPillTextWrap}>
              <Text style={styles.apartmentPillText} numberOfLines={1}>
                {hostApartment.title}
              </Text>
              <Text style={styles.apartmentPillMeta} numberOfLines={1}>
                {[hostApartment.area, hostApartment.city, `€${hostApartment.rent}`].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.brand} />
          </Pressable>
        ) : null}

        <View style={styles.headerTop}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8} testID="group-chat-back-button">
            <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
          </Pressable>

          <Pressable style={styles.headerGroupTapArea} onPress={() => setRenameVisible(true)} hitSlop={6}>
            <View style={styles.groupAvatarCircle}>
              <Ionicons name="people" size={22} color={colors.brand} />
            </View>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {groupName}
                </Text>
                <Ionicons name="pencil" size={12} color={colors.onSurfaceTertiary} />
              </View>
              <View style={styles.headerSubtitleRow}>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {`${metadata.memberIds.length} μέλη · Πατήστε για μετονομασία`}
                </Text>
                {isChatMuted ? <Ionicons name="notifications-off-outline" size={14} color={colors.onSurfaceTertiary} testID="group-chat-muted-indicator" /> : null}
              </View>
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                if (campuStay) {
                  setContractPickerVisible(false);
                  setUnderConstructionModalVisible(true);
                } else {
                  setContractPickerVisible(true);
                }
              }}
              hitSlop={8}
              testID="group-contract-button"
            >
              <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            </Pressable>

            {!hasHost && (
              <Pressable
                style={[styles.iconBtn, commonVisible && styles.iconBtnActive]}
                onPress={() => setCommonVisible(true)}
                hitSlop={8}
                testID="group-common-likes-button"
              >
                <Ionicons name="heart-circle-outline" size={18} color={commonVisible ? colors.brand : colors.onSurface} />
              </Pressable>
            )}
            <Pressable
              style={styles.iconBtn}
              onPress={() => setContextMenuVisible(true)}
              hitSlop={8}
              testID="group-chat-context-menu-button"
            >
              <Ionicons name="ellipsis-vertical" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 10 : 0}
      >
      {activePinnedAppointment ? (
        <Pressable
          style={styles.appointmentBanner}
          onPress={() => {
            const index = messages.findIndex((message) => message.id === activePinnedAppointment.id);
            if (index < 0) return;
            listRef.current?.scrollToIndex({ index: messages.length - 1 - index, animated: true, viewPosition: 0.5 });
            setHighlightedMessageId(activePinnedAppointment.id);
            setTimeout(() => setHighlightedMessageId(null), 1200);
          }}
          testID="group-chat-pinned-visit-banner"
        >
          <View style={styles.appointmentIconCircle}>
            <Ionicons name="calendar-outline" size={16} color={colors.brand} />
          </View>
          <View style={styles.propertyCopy}>
            <Text style={styles.propertyTitle} numberOfLines={1}>
              {activePinnedAppointment.metadata?.apartmentTitle || "Επερχόμενη Υπόδειξη"}
            </Text>
            <Text style={styles.propertyMeta}>
              {new Date(activePinnedAppointment.metadata?.appointmentDate ?? "").toLocaleString("el-GR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {activePinnedAppointment.metadata?.status === "pending" ? "Εκκρεμές" : "Επιβεβαιωμένο"}
            </Text>
          </View>
          <Pressable
            style={styles.bannerEditBtn}
            onPress={(event) => {
              event.stopPropagation();
              setVisitToEdit(activePinnedAppointment);
            }}
            hitSlop={8}
            testID="group-chat-pinned-visit-edit"
          >
            <Ionicons name="create-outline" size={18} color={colors.brand} />
          </Pressable>
        </Pressable>
      ) : null}

      {messages.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.chatList}
          data={invertedMessages}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messages}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const chronologicalIndex = messages.length - 1 - index;
            const itemMarginStyle = getGroupMessageMargin(messages, chronologicalIndex);

            if (item.type === "system") {
              return (
                <View style={[styles.systemPill, itemMarginStyle]}>
                  <Text style={styles.systemText}>{item.text}</Text>
                </View>
              );
            }

            if (item.type === "contract_request" && item.contractId) {
              const isMine = item.senderId === currentUserId;
              return (
                <Pressable
                  style={[styles.contractMessage, isMine ? styles.mineContract : styles.theirsContract, itemMarginStyle]}
                  onPress={() => {
                    if (campuStay) {
                      setUnderConstructionModalVisible(true);
                    } else {
                      router.push({ pathname: "/contract/[id]", params: { id: item.contractId, contractId: item.contractId, signerId: currentUserId } } as never);
                    }
                  }}
                  testID={`group-contract-message-${item.id}`}
                >
                  <View style={[styles.contractIconCircle, { backgroundColor: isMine ? "rgba(255,255,255,0.2)" : colors.brandTertiary }]}>
                    <Ionicons
                      name="document-text-outline"
                      size={20}
                      color={isMine ? colors.onBrand : colors.brand}
                    />
                  </View>
                  <View style={styles.contractMessageCopy}>
                    <Text
                      style={[
                        styles.contractMessageTitle,
                        { color: isMine ? colors.onBrand : colors.onSurface },
                      ]}
                      numberOfLines={1}
                    >
                      {item.contractTitle || item.text}
                    </Text>
                    <Text
                      style={[
                        styles.contractMessageSubtitle,
                        { color: isMine ? "rgba(255,255,255,0.78)" : colors.onSurfaceTertiary },
                      ]}
                    >
                      {t("esign.tapToSign")}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={isMine ? colors.onBrand : colors.onSurfaceTertiary}
                  />
                </Pressable>
              );
            }

            const isMine = item.senderId === currentUserId;
            return (
              <View
                style={[
                  styles.message,
                  isMine ? styles.mine : styles.theirs,
                  itemMarginStyle,
                  item.id === highlightedMessageId && styles.highlightedMessage,
                ]}
              >
                <Text style={isMine ? styles.messageTextMine : styles.messageTextTheirs}>{item.text}</Text>
              </View>
            );
          }}
        />
      )}

      {/* Modern Curved Input Bar */}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: isKeyboardOpen ? spacing.sm : Math.max(insets.bottom + spacing.sm, spacing.sm) },
        ]}
      >
        <TextInput
          value={draftVoice.value}
          onChangeText={draftVoice.onChangeText}
          style={styles.input}
          placeholder="Γράψε μήνυμα..."
          placeholderTextColor={colors.onSurfaceTertiary}
          multiline
          onFocus={() => setIsKeyboardOpen(true)}
          onBlur={() => setIsKeyboardOpen(false)}
        />
        <VoiceInputButton
          onTextAppend={draftVoice.onFinalResult}
          onPartialResult={draftVoice.onPartialResult}
          onAbort={draftVoice.onAbort}
          color={colors.onSurfaceTertiary}
        />
        <Pressable
          style={[styles.send, draftVoice.isPreviewing && styles.sendDisabled]}
          onPress={() => void send()}
          disabled={draftVoice.isPreviewing}
          hitSlop={6}
        >
          <Ionicons name="paper-plane" size={18} color={colors.onBrand} />
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <RenameGroupModal
        visible={renameVisible}
        initialName={groupName}
        onClose={() => setRenameVisible(false)}
        onSubmit={(name) => void rename(name)}
      />
      <CommonLikedListingsModal
        visible={commonVisible}
        loading={commonLoading}
        listings={commonIds.map((id) => apartments[id]).filter((listing): listing is Apartment => !!listing)}
        onClose={() => setCommonVisible(false)}
        onListingPress={(listing) =>
          router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(listing) } } as never)
        }
      />
      <RoommateContractPickerModal
        visible={contractPickerVisible}
        onClose={() => setContractPickerVisible(false)}
        onSelect={startContract}
      />
      <CenteredActionModal
        visible={underConstructionModalVisible}
        title={t("common.underConstruction.title")}
        description={t("common.underConstruction.description")}
        onDismiss={() => setUnderConstructionModalVisible(false)}
        actions={[{ label: t("common.underConstruction.action"), iconName: "checkmark-circle-outline", onPress: () => setUnderConstructionModalVisible(false) }]}
        testID="group-chat-contract-under-construction-modal"
      >
        <Ionicons name="construct-outline" size={46} color={colors.brand} style={{ alignSelf: "center" }} />
      </CenteredActionModal>
      <EditVisitModal
        visible={visitToEdit !== null}
        appointmentDate={visitToEdit?.metadata?.appointmentDate}
        isSaving={false}
        onClose={() => setVisitToEdit(null)}
        onSave={(date) => void saveVisitChanges(date)}
        onCancelAppointment={() => void cancelVisit()}
      />
      <CenteredActionModal
        visible={contextMenuVisible}
        title="Group options"
        onDismiss={() => setContextMenuVisible(false)}
        testID="group-chat-context-menu-modal"
        actions={[
          { label: "Leave Group", iconName: "exit-outline", variant: "danger", onPress: () => void leaveGroup(), testID: "group-chat-leave-action" },
          {
            label: isChatMuted ? "Unmute Notifications" : "Mute Notifications",
            iconName: isChatMuted ? "notifications-outline" : "notifications-off-outline",
            variant: "outline",
            onPress: () => void toggleChatMute(),
            testID: "group-chat-mute-toggle",
          },
          { label: "Block a Member", iconName: "hand-left-outline", variant: "outline", onPress: () => { setContextMenuVisible(false); setMemberBlockModalVisible(true); }, testID: "group-chat-block-member-action" },
          { label: "Report Group", iconName: "alert-circle-outline", variant: "outline", onPress: () => { setContextMenuVisible(false); Alert.alert("Report group", "Thanks. We will review this group."); }, testID: "group-chat-report-action" },
          { label: "Cancel", variant: "muted", onPress: () => setContextMenuVisible(false), testID: "group-chat-context-menu-cancel" },
        ]}
      />
      <Modal
        visible={memberBlockModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMemberBlockModalVisible(false)}
      >
        <View style={styles.memberBlockBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMemberBlockModalVisible(false)} />
          <View style={styles.memberBlockCard} testID="group-member-block-modal">
            <View style={styles.memberBlockHeader}>
              <View style={styles.memberBlockTitleWrap}>
                <Text style={styles.memberBlockTitle}>Block a member</Text>
                <Text style={styles.memberBlockSubtitle}>Choose a group member to block.</Text>
              </View>
              <Pressable onPress={() => setMemberBlockModalVisible(false)} hitSlop={8}>
                <Ionicons name="close-outline" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {memberBlockLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : memberBlockProfiles.length === 0 ? (
              <Text style={styles.memberBlockEmpty}>No other group members found.</Text>
            ) : (
              <ScrollView contentContainerStyle={styles.memberBlockList}>
                {memberBlockProfiles.map((member) => (
                  <View key={member.id} style={styles.memberBlockRow}>
                    {member.photo ? (
                      <Image source={{ uri: member.photo }} style={styles.memberBlockAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.memberBlockAvatarFallback}>
                        <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                    <Text style={styles.memberBlockName} numberOfLines={1}>{member.name}</Text>
                    <Pressable
                      style={[styles.memberBlockAction, blockingMemberId === member.id && styles.memberBlockActionDisabled]}
                      onPress={() => void blockMember(member)}
                      disabled={!!blockingMemberId}
                      testID={`group-member-block-action-${member.id}`}
                    >
                      {blockingMemberId === member.id ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.memberBlockActionText}>Block</Text>}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    chatArea: {
      flex: 1,
    },
    chatList: {
      flex: 1,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 4,
      zIndex: 10,
      gap: spacing.xs,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconBtnActive: {
      backgroundColor: colors.brandTertiary,
      borderColor: colors.brand,
    },
    headerGroupTapArea: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minWidth: 0,
      paddingVertical: 2,
    },
    groupAvatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTextWrap: {
      flex: 1,
      justifyContent: "center",
      gap: 2,
      minWidth: 0,
      paddingTop: 2,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    headerSubtitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    headerTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    headerSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    memberBlockBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    memberBlockCard: {
      maxHeight: "78%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    memberBlockHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    memberBlockTitleWrap: { flex: 1, gap: 3 },
    memberBlockTitle: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
    memberBlockSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    memberBlockList: { gap: spacing.sm, paddingBottom: spacing.sm },
    memberBlockRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
    },
    memberBlockAvatar: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
    memberBlockAvatarFallback: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    memberBlockName: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
    memberBlockAction: {
      minWidth: 66,
      minHeight: 34,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.error,
      alignItems: "center",
      justifyContent: "center",
    },
    memberBlockActionDisabled: { opacity: 0.55 },
    memberBlockActionText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onError },
    memberBlockEmpty: { paddingVertical: spacing.lg, textAlign: "center", fontFamily: fonts.regular, color: colors.onSurfaceTertiary },
    apartmentPill: {
      alignSelf: "center",
      maxWidth: "92%",
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      marginBottom: 2,
    },
    apartmentThumb: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
    },
    apartmentThumbFallback: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    apartmentPillTextWrap: {
      flex: 1,
      gap: 1,
    },
    apartmentPillText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    apartmentPillMeta: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    appointmentBanner: {
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    appointmentIconCircle: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    bannerEditBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    propertyCopy: {
      flex: 1,
      gap: 2,
    },
    propertyTitle: {
      color: colors.onSurface,
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
    },
    propertyMeta: {
      color: colors.onSurfaceTertiary,
      fontFamily: fonts.regular,
      fontSize: 11,
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    messages: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      gap: 0,
    },
    message: {
      maxWidth: "78%",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
    },
    mine: {
      alignSelf: "flex-end",
      backgroundColor: colors.brand,
      borderBottomRightRadius: radius.sm,
    },
    theirs: {
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: radius.sm,
    },
    highlightedMessage: {
      borderWidth: 2,
      borderColor: colors.brand,
    },
    messageTextMine: {
      color: colors.onBrand,
      fontFamily: fonts.semibold,
      fontSize: fontSize.lg,
    },
    messageTextTheirs: {
      color: colors.onSurface,
      fontFamily: fonts.regular,
      fontSize: fontSize.lg,
    },
    systemPill: {
      alignSelf: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
    },
    systemText: {
      color: colors.onSurfaceTertiary,
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      textAlign: "center",
    },
    contractMessage: {
      maxWidth: "90%",
      minHeight: 68,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
    },
    mineContract: {
      alignSelf: "flex-end",
      backgroundColor: colors.brand,
      borderColor: colors.brand,
      borderBottomRightRadius: radius.sm,
    },
    theirsContract: {
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      borderBottomLeftRadius: radius.sm,
    },
    contractIconCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    contractMessageCopy: {
      flex: 1,
      gap: 2,
    },
    contractMessageTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
    },
    contractMessageSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
    },
    inputBar: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderTopColor: colors.border,
      borderLeftColor: colors.border,
      borderRightColor: colors.border,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 6,
      zIndex: 10,
      overflow: "visible",
    },
    input: {
      flex: 1,
      maxHeight: 100,
      minHeight: 44,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingTop: Platform.OS === "ios" ? 10 : 8,
      paddingBottom: Platform.OS === "ios" ? 10 : 8,
      color: colors.onSurface,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
    },
    send: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    sendDisabled: {
      opacity: 0.45,
    },
  });
}