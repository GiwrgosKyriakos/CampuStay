import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import CenteredActionModal from "@/src/components/CenteredActionModal";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { db } from "@/src/config/firebase";
import { saveApartmentNote, getApartmentNoteDetails, type Apartment } from "@/src/api/apartmentNotes";
import { getWordCount, isNoteBodyValid, isNoteTitleValid, MAX_NOTE_BODY_CHARS, MAX_NOTE_BODY_WORDS, MAX_NOTE_TITLE_CHARS, MAX_NOTE_TITLE_WORDS } from "@/src/utils/noteValidation";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { t } from "@/src/locales";

function getApartmentCoverImage(apartment: Apartment | null | undefined): string {
  if (!apartment) return "";
  return apartment.image || apartment.imageUrl || apartment.images?.[0] || "";
}

type ShareMatchItem = {
  chatRoomId: string;
  counterpartId: string;
  name: string;
  avatar: string;
};

type FirestoreChatDoc = {
  users?: string[];
  type?: "roommate" | "host" | string;
  status?: "pending" | "active" | "rejected" | string;
};

type FirestoreUserDoc = {
  name?: string;
  photoUrl?: string;
  avatar?: string;
  photos?: string[];
};

export default function ApartmentNoteScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const params = useLocalSearchParams<{ apartmentData?: string; data?: string; fromList?: string; isOwner?: string }>();
  const isBrokerOwnerNote = auth.isBroker === true && params.isOwner === "true";

  const [noteText, setNoteText] = useState("");
  const [initialText, setInitialText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [activeShareMatches, setActiveShareMatches] = useState<ShareMatchItem[]>([]);
  const [loadingShareMatches, setLoadingShareMatches] = useState(false);
  const [sendingShareChatId, setSendingShareChatId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ title: string; description: string } | null>(null);

  const apartmentData = useMemo(() => {
    const serializedData =
      typeof params.apartmentData === "string"
        ? params.apartmentData
        : typeof params.data === "string"
          ? params.data
          : null;
    if (!serializedData) return null;
    try {
      return JSON.parse(serializedData) as Apartment;
    } catch {
      return null;
    }
  }, [params.apartmentData, params.data]);

  const fromList = useMemo(() => {
    const raw = params.fromList;
    if (typeof raw === "string") return raw === "true" || raw === "1";
    return false;
  }, [params.fromList]);

  useEffect(() => {
    if (!saveFeedbackVisible) return;
    const timer = setTimeout(() => setSaveFeedbackVisible(false), 1400);
    return () => clearTimeout(timer);
  }, [saveFeedbackVisible]);

  useEffect(() => {
    if (!auth.userId || !apartmentData?.id || auth.isGuest) {
      setNoteText("");
      setInitialText("");
      setNoteTitle("");
      setInitialTitle("");
      setLoadingNote(false);
      return;
    }

    let active = true;
    setLoadingNote(true);

    void (async () => {
      try {
        const existingNote = await getApartmentNoteDetails(auth.userId!, apartmentData.id);
        if (!active) return;
        const normalized = existingNote?.text ?? "";
        const normalizedTitle = existingNote?.title ?? "";
        setNoteText(normalized);
        setInitialText(normalized);
        setNoteTitle(normalizedTitle);
        setInitialTitle(normalizedTitle);
      } catch {
        if (!active) return;
        setNoteText("");
        setInitialText("");
        setNoteTitle("");
        setInitialTitle("");
      } finally {
        if (active) setLoadingNote(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [apartmentData?.id, auth.isGuest, auth.userId]);

  useEffect(() => {
    if (!shareModalVisible || !auth.userId) {
      setLoadingShareMatches(false);
      setActiveShareMatches([]);
      return;
    }

    let active = true;
    setLoadingShareMatches(true);

    void (async () => {
      try {
        const currentUserId = auth.userId!;
        const chatsSnap = await getDocs(
          query(collection(db, "chats"), where("users", "array-contains", currentUserId)),
        );

        const rows = await Promise.all(
          chatsSnap.docs.map(async (chatDoc) => {
            const chatData = chatDoc.data() as FirestoreChatDoc;
            const users = Array.isArray(chatData.users) ? chatData.users : [];
            const counterpartId = users.find((uid) => uid !== currentUserId) || "";
            if (!counterpartId) return null;

            const isRoommateChat = chatData.type !== "host";
            if (!isRoommateChat || chatData.status !== "active") {
              return null;
            }

            const counterpartSnap = await getDoc(doc(db, "users", counterpartId));
            const counterpartData = counterpartSnap.exists() ? (counterpartSnap.data() as FirestoreUserDoc) : null;
            const photos = Array.isArray(counterpartData?.photos) ? counterpartData.photos : [];

            return {
              chatRoomId: chatDoc.id,
              counterpartId,
              name: counterpartData?.name?.trim() || t("common.values.unknown"),
              avatar: counterpartData?.photoUrl || counterpartData?.avatar || photos[0] || "",
            } satisfies ShareMatchItem;
          }),
        );

        if (!active) return;
        setActiveShareMatches(rows.filter((row): row is ShareMatchItem => !!row));
      } catch {
        if (active) {
          setActiveShareMatches([]);
        }
      } finally {
        if (active) {
          setLoadingShareMatches(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, shareModalVisible]);

  if (!apartmentData) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{t("apartmentNote.missingApartment")}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>{t("common.actions.back")}</Text>
        </Pressable>
      </View>
    );
  }

  const sharedApartmentPayload = {
    id: apartmentData.id,
    title: apartmentData.title,
    rent: apartmentData.rent,
    city: apartmentData.city,
    area: apartmentData.area,
    image: getApartmentCoverImage(apartmentData),
    rooms: apartmentData.rooms,
    size: apartmentData.size,
    tags: Array.isArray(apartmentData.tags) ? apartmentData.tags : [],
  };

  const hasUnsavedChanges = noteText !== initialText || noteTitle !== initialTitle;
  const titleInvalid = !isNoteTitleValid(noteTitle);
  const bodyInvalid = !isNoteBodyValid(noteText);
  const titleNearLimit = getWordCount(noteTitle) >= MAX_NOTE_TITLE_WORDS * 0.9 || noteTitle.length >= MAX_NOTE_TITLE_CHARS * 0.9;
  const bodyNearLimit = getWordCount(noteText) >= MAX_NOTE_BODY_WORDS * 0.9 || noteText.length >= MAX_NOTE_BODY_CHARS * 0.9;

  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
      return;
    }
    router.back();
  };

  const handleSave = async () => {
    if (!auth.userId || auth.isGuest) {
      router.push("/auth-landing");
      return;
    }

    if (saving) return;
    if (titleInvalid || bodyInvalid) return;

    try {
      setSaving(true);
      const cleanTitle = noteTitle.trim() || t("apartmentNote.defaultTitle");
      await saveApartmentNote(auth.userId, apartmentData.id, noteText, apartmentData, cleanTitle);
      setNoteTitle(cleanTitle);
      setInitialTitle(cleanTitle);
      setInitialText(noteText);
      setSaveFeedbackVisible(true);
    } catch {
      setActionModal({
        title: t("apartmentNote.saveFailedTitle"),
        description: t("apartmentNote.saveFailedDescription"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenShare = () => {
    if (!auth.userId || auth.isGuest) {
      router.push("/auth-landing");
      return;
    }
    setShareModalVisible(true);
  };

  const handleShareApartmentToMatch = async (item: ShareMatchItem) => {
    if (!auth.userId || !apartmentData?.id || sendingShareChatId) return;

    setSendingShareChatId(item.chatRoomId);
    try {
      await addDoc(collection(db, "chats", item.chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "apartment_note_share",
        text: noteText,
        noteText,
        apartmentData: sharedApartmentPayload,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      await updateDoc(doc(db, "chats", item.chatRoomId), {
        lastMessageText: `Σημείωση αγγελίας: ${apartmentData.title}`,
        lastMessage: `Σημείωση αγγελίας: ${apartmentData.title}`,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShareModalVisible(false);
      setActionModal({
        title: t("apartmentNote.shareSuccessTitle"),
        description: t("apartmentNote.shareSuccessDescription"),
      });
    } catch {
      setActionModal({
        title: t("apartmentNote.shareFailedTitle"),
        description: t("apartmentNote.shareFailedDescription"),
      });
    } finally {
      setSendingShareChatId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
        <Pressable style={styles.iconButton} onPress={handleBackPress} testID="apartment-note-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{apartmentData.title || t("apartmentNote.shortTitle")}</Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              void handleSave();
            }}
            disabled={saving}
            testID="apartment-note-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onSurface} />
            ) : (
              <Ionicons name="checkmark" size={22} color={colors.onSurface} />
            )}
          </Pressable>

          <Pressable style={styles.iconButton} onPress={handleOpenShare} testID="apartment-note-share">
            <Ionicons name="share-social-outline" size={20} color={colors.onSurface} />
          </Pressable>

          {fromList ? (
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                router.push({
                  pathname: "/apartment-detail",
                  params: { data: JSON.stringify(apartmentData) },
                } as never);
              }}
              testID="apartment-note-open-detail"
            >
              <Ionicons name="home-outline" size={20} color={colors.onSurface} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {isBrokerOwnerNote || initialText === "" ? (
          <View style={styles.infoBanner}>
            <Ionicons
              name={isBrokerOwnerNote ? "shield-checkmark-outline" : "information-circle-outline"}
              size={20}
              color={colors.onSurface}
            />
            <View style={styles.infoBannerTextWrap}>
              {isBrokerOwnerNote ? (
                <Text style={styles.infoBannerTitle}>{t("apartmentNote.brokerPrivateNotice")}</Text>
              ) : (
                <Text style={styles.infoBannerText}>
                  {t("apartmentNote.userNotice")}
                </Text>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.noteCard}>
          {loadingNote ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={colors.brand} />
            </View>
          ) : (
            <>
              <TextInput
                value={noteTitle}
                onChangeText={setNoteTitle}
                placeholder={t("apartmentNote.titlePlaceholder")}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.noteTitleInput, titleInvalid && styles.inputErrorBorder]}
                maxLength={MAX_NOTE_TITLE_CHARS}
                testID="apartment-note-title-input"
              />
              <Text style={[styles.counterText, titleNearLimit && styles.counterTextWarning, titleInvalid && styles.counterTextError]}>{t("apartmentNote.counter", { words: getWordCount(noteTitle), maxWords: MAX_NOTE_TITLE_WORDS, characters: noteTitle.length, maxCharacters: MAX_NOTE_TITLE_CHARS })}</Text>
              {titleInvalid ? <Text style={styles.warningText}>{t("apartmentNote.titleInvalid")}</Text> : null}
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder={t("apartmentNote.bodyPlaceholder")}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={[styles.noteInput, bodyInvalid && styles.inputErrorBorder]}
                multiline
                textAlignVertical="top"
                maxLength={MAX_NOTE_BODY_CHARS}
                testID="apartment-note-input"
              />
              <View style={styles.counterRow}>
                {bodyInvalid ? <Text style={styles.warningText}>{t("apartmentNote.bodyInvalid")}</Text> : null}
                <Text style={[styles.counterText, bodyNearLimit && styles.counterTextWarning, bodyInvalid && styles.counterTextError]}>{t("apartmentNote.counter", { words: getWordCount(noteText), maxWords: MAX_NOTE_BODY_WORDS, characters: noteText.length, maxCharacters: MAX_NOTE_BODY_CHARS })}</Text>
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>

      {saveFeedbackVisible ? (
        <View style={[styles.toastWrap, { bottom: spacing.lg + insets.bottom }]} pointerEvents="none">
          <Text style={styles.toastText}>{t("apartmentNote.saved")}</Text>
        </View>
      ) : null}

      <CenteredActionModal
        visible={showUnsavedModal}
        title={t("apartmentNote.unsavedTitle")}
        description={t("apartmentNote.unsavedDescription")}
        onDismiss={() => setShowUnsavedModal(false)}
        actionsLayout="horizontal"
        actions={[
          {
            label: t("common.actions.cancel"),
            variant: "muted",
            iconName: "close-outline",
            onPress: () => setShowUnsavedModal(false),
            testID: "apartment-note-unsaved-cancel",
          },
          {
            label: t("apartmentNote.leave"),
            variant: "danger",
            iconName: "exit-outline",
            onPress: () => {
              setShowUnsavedModal(false);
              router.back();
            },
            testID: "apartment-note-unsaved-leave",
          },
        ]}
        testID="apartment-note-unsaved-modal"
      />

      <CenteredActionModal
        visible={!!actionModal}
        title={actionModal?.title ?? ""}
        description={actionModal?.description}
        onDismiss={() => setActionModal(null)}
        actions={[
          {
            label: t("common.actions.ok"),
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ]}
      />

      <CenteredActionModal
        visible={shareModalVisible}
        title={t("apartmentNote.shareTitle")}
        description={t("apartmentNote.shareDescription")}
        onDismiss={() => {
          if (!sendingShareChatId) setShareModalVisible(false);
        }}
        actions={[
          {
            label: t("common.actions.close"),
            variant: "outline",
            iconName: "close-outline",
            onPress: () => setShareModalVisible(false),
          },
        ]}
        testID="apartment-note-share-modal-shell"
      >
        {loadingShareMatches ? (
              <View style={styles.shareStateWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : activeShareMatches.length === 0 ? (
              <View style={styles.shareStateWrap}>
                <Text style={styles.shareStateText}>{t("apartmentNote.noActiveChats")}</Text>
              </View>
            ) : (
              <ScrollView style={styles.shareList} contentContainerStyle={styles.shareListContent}>
                {activeShareMatches.map((item) => (
                  <View key={item.chatRoomId} style={styles.shareRow}>
                    <View style={styles.shareAvatarWrap}>
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.shareAvatarImage} contentFit="cover" />
                      ) : (
                        <DefaultProfileAvatar size={44} iconSize={18} />
                      )}
                    </View>

                    <View style={styles.shareNameWrap}>
                      <Text style={styles.shareNameText} numberOfLines={1}>{item.name}</Text>
                    </View>

                    <Pressable
                      style={styles.shareSendBtn}
                      onPress={() => {
                        void handleShareApartmentToMatch(item);
                      }}
                      disabled={!!sendingShareChatId}
                      testID={`apartment-note-share-send-${item.chatRoomId}`}
                    >
                      {sendingShareChatId === item.chatRoomId ? (
                        <ActivityIndicator size="small" color={colors.onBrand} />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={18} color={colors.onBrand} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
      </CenteredActionModal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    titleWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    headerTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      textAlign: "center",
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    infoBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
      backgroundColor: colors.brandTertiary,
      padding: spacing.md,
    },
    infoBannerTextWrap: {
      flex: 1,
    },
    infoBannerTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onBrandTertiary,
      lineHeight: 20,
    },
    infoBannerText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onBrandTertiary,
      lineHeight: 20,
    },
    noteCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      minHeight: 280,
      padding: spacing.md,
      gap: spacing.sm,
    },
    noteInput: {
      minHeight: 220,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      color: colors.onSurface,
      lineHeight: 22,
      textAlignVertical: "top",
      padding: 0,
    },
    noteTitleInput: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
    inputErrorBorder: { borderColor: "#EF4444" },
    counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
    counterTextError: { color: "#EF4444" },
    warningText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: "#F59E0B" },
    counterText: {
      alignSelf: "flex-end",
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    counterTextWarning: { color: "#F59E0B" },
    toastWrap: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      alignItems: "center",
    },
    toastText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onBrand,
      backgroundColor: colors.brand,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      overflow: "hidden",
    },
    errorText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.error,
      textAlign: "center",
      marginBottom: spacing.sm,
    },
    backPill: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    backPillText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    shareOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
    },
    sharePanel: {
      maxHeight: "56%",
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    shareList: {
      maxHeight: 320,
    },
    shareListContent: {
      gap: spacing.sm,
    },
    shareRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    shareAvatarWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
    },
    shareAvatarImage: {
      width: "100%",
      height: "100%",
    },
    shareNameWrap: {
      flex: 1,
    },
    shareNameText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    shareSendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.brand,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    shareStateWrap: {
      minHeight: 90,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.md,
    },
    shareStateText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
  });
}
