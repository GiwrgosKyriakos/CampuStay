import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";
import { getUserPublic } from "@/src/api/discover";
import { getUserId } from "@/src/utils/userId";
import { db } from "@/src/config/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc } from "firebase/firestore";

const CURRENCY = "€";

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
}

interface FirestoreMessageDoc {
  text?: string;
  senderId?: string;
  createdAt?: any;
}

interface FirestoreChatDoc {
  status?: "pending" | "active";
}

type MessageGroupPosition = "first" | "middle" | "last" | "single";

interface MessageGroupInfo {
  position: MessageGroupPosition;
  isConsecutive: boolean;
}

function isDeletedCounterpart(profile: RoommateProfile): boolean {
  return !!profile.deleted || !profile.name?.trim();
}

function getMessageGroupInfo(messages: Message[], index: number, currentUserId: string): MessageGroupInfo {
  const currentMsg = messages[index];
  const prevMsg = index > 0 ? messages[index - 1] : null;
  const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

  const prevSame = prevMsg?.senderId === currentMsg.senderId;
  const nextSame = nextMsg?.senderId === currentMsg.senderId;

  if (!prevSame && !nextSame) {
    return { position: "single", isConsecutive: false };
  }
  if (!prevSame && nextSame) {
    return { position: "first", isConsecutive: true };
  }
  if (prevSame && nextSame) {
    return { position: "middle", isConsecutive: true };
  }
  return { position: "last", isConsecutive: true };
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, chatRoomId: chatRoomIdParam } = useLocalSearchParams<{ id: string; chatRoomId?: string }>();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoommateProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (id) setProfile(await getUserPublic(id));
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    getUserId().then(setCurrentUserId);
  }, []);

  const chatRoomId = useMemo(() => {
    if (typeof chatRoomIdParam === "string" && chatRoomIdParam.trim().length > 0) {
      return chatRoomIdParam;
    }
    if (!currentUserId || !id) return null;
    return [currentUserId, id].sort().join("_");
  }, [chatRoomIdParam, currentUserId, id]);

  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStatus, setChatStatus] = useState<"pending" | "active">("active");

  const createdAtToMillis = useCallback((value: any): number => {
    if (typeof value === "number") return value;
    if (value?.toMillis && typeof value.toMillis === "function") return value.toMillis();
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  }, []);

  const sortMessages = useCallback(
    (list: Message[]) =>
      [...list].sort((a, b) => createdAtToMillis(a.createdAt) - createdAtToMillis(b.createdAt)),
    [createdAtToMillis],
  );

  useEffect(() => {
    if (!currentUserId || !chatRoomId) return;
    const chatRef = doc(db, "chats", chatRoomId);
    const unsubChat = onSnapshot(chatRef, (snapshot) => {
      if (!snapshot.exists()) {
        setChatStatus("active");
        return;
      }
      const data = snapshot.data() as FirestoreChatDoc;
      setChatStatus(data.status === "pending" ? "pending" : "active");
    });

    const q = query(
      collection(db, "chats", chatRoomId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const fetched: Message[] = snapshot.docs.map((doc) => {
        const data = doc.data() as FirestoreMessageDoc;
        return {
          id: doc.id,
          text: data.text ?? "",
          senderId: data.senderId ?? "",
          createdAt: data.createdAt ?? 0,
        };
      });
      setMessages((prev) => {
        const optimisticPending = prev.filter((m) => m.id.startsWith("temp-") && m.senderId === currentUserId);
        const unresolved = optimisticPending.filter(
          (temp) => !fetched.some((serverMsg) => serverMsg.senderId === temp.senderId && serverMsg.text === temp.text),
        );
        return sortMessages([...fetched, ...unresolved]);
      });
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    });
    return () => {
      unsub();
      unsubChat();
    };
  }, [chatRoomId, currentUserId, sortMessages]);

  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !currentUserId || !id || !chatRoomId || chatStatus === "pending") return;

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      text: trimmed,
      senderId: currentUserId,
      createdAt: Date.now(),
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));
    setText("");
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    try {
      await addDoc(collection(db, "chats", chatRoomId, "messages"), {
        text: trimmed,
        senderId: currentUserId,
        receiverId: id,
        createdAt: serverTimestamp(),
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
    }
  }, [chatRoomId, chatStatus, currentUserId, id, sortMessages, text]);

  if (!profile) {
    return (
      <View style={[styles.container, styles.center]} testID="chat-screen">
        {loadingProfile ? (
          <ActivityIndicator size="large" color={colors.brand} />
        ) : (
          <>
            <Text style={styles.fallback}>Conversation not found</Text>
            <Pressable style={styles.backPill} onPress={() => router.back()} testID="chat-back-button">
              <Text style={styles.backPillText}>Go back</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const deletedCounterpart = isDeletedCounterpart(profile);
  const displayName = deletedCounterpart ? "Deleted Account" : profile.name;
  const displayUniversity = deletedCounterpart ? "" : profile.university;
  const displayGender = deletedCounterpart ? "N/A" : profile.gender;
  const displayAge = deletedCounterpart ? "—" : `${profile.age} yrs`;
  const displayBudget = deletedCounterpart ? "—" : `${CURRENCY}${profile.budget}/mo`;
  const showAvatarImage = !deletedCounterpart && !!profile.photo?.trim();

  return (
    <View style={styles.container} testID="chat-screen">
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTop}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.back()}
            testID="chat-back-button"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          {showAvatarImage ? (
            <Image source={{ uri: profile.photo }} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarFallback} testID="chat-header-avatar-fallback">
              <Ionicons name="person" size={22} color={colors.onSurfaceTertiary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.headerUni} numberOfLines={1}>
              {displayUniversity}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailPill}>
            <Ionicons name="person-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.detailText}>{displayGender}</Text>
          </View>
          <View style={styles.detailPill}>
            <Ionicons name="calendar-outline" size={13} color={colors.onSurfaceTertiary} />
            <Text style={styles.detailText}>{displayAge}</Text>
          </View>
          <View style={[styles.detailPill, styles.budgetPill]}>
            <Ionicons name="wallet-outline" size={13} color={colors.onBrandTertiary} />
            <Text style={[styles.detailText, { color: colors.onBrandTertiary }]}>
              {displayBudget}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((m, idx) => {
            const groupInfo = getMessageGroupInfo(messages, idx, currentUserId || "");
            const isMine = m.senderId === currentUserId;
            const lastMsgIsDifferentSender = idx > 0 && messages[idx - 1].senderId !== m.senderId;

            let borderRadii = {};
            if (isMine) {
              // Sent messages (right side)
              if (groupInfo.position === "first") {
                borderRadii = { borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.lg };
              } else if (groupInfo.position === "middle") {
                borderRadii = { borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm };
              } else if (groupInfo.position === "last") {
                borderRadii = { borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.sm };
              } else {
                borderRadii = { borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.sm };
              }
            } else {
              // Received messages (left side)
              if (groupInfo.position === "first") {
                borderRadii = { borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.lg };
              } else if (groupInfo.position === "middle") {
                borderRadii = { borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm };
              } else if (groupInfo.position === "last") {
                borderRadii = { borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.sm };
              } else {
                borderRadii = { borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.sm };
              }
            }

            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  isMine ? styles.bubbleMine : styles.bubbleTheirs,
                  borderRadii,
                  {
                    marginVertical: groupInfo.isConsecutive
                      ? groupInfo.position === "first"
                        ? spacing.xs
                        : 2
                      : lastMsgIsDifferentSender
                      ? spacing.sm
                      : spacing.xs,
                  },
                ]}
                testID={`chat-message-${m.id}`}
              >
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={chatStatus === "pending" ? "Waiting for acceptance..." : `Message ${displayName}...`}
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            testID="chat-input"
            onSubmitEditing={send}
            editable={chatStatus !== "pending"}
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() || chatStatus === "pending") && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || chatStatus === "pending"}
            testID="chat-send-button"
          >
            <Ionicons name="paper-plane" size={20} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  fallback: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  backPill: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  backPillText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  headerAvatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  headerAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerName: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  headerUni: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  detailRow: { flexDirection: "row", gap: spacing.sm },
  detailPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  budgetPill: { backgroundColor: colors.brandTertiary },
  detailText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  messages: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 0 },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceTertiary,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
  },
  bubbleText: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurface },
  bubbleTextMine: { color: colors.onBrand, fontFamily: fonts.semibold },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
