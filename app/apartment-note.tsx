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
import { saveApartmentNote, getApartmentNote, type Apartment } from "@/src/api/apartmentNotes";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

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
  const params = useLocalSearchParams<{ apartmentData?: string; data?: string; fromList?: string | boolean }>();

  const [noteText, setNoteText] = useState("");
  const [initialText, setInitialText] = useState("");
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
    if (typeof raw === "boolean") return raw;
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
      setLoadingNote(false);
      return;
    }

    let active = true;
    setLoadingNote(true);

    void (async () => {
      try {
        const existingText = await getApartmentNote(auth.userId!, apartmentData.id);
        if (!active) return;
        const normalized = existingText ?? "";
        setNoteText(normalized);
        setInitialText(normalized);
      } catch {
        if (!active) return;
        setNoteText("");
        setInitialText("");
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
              name: counterpartData?.name?.trim() || "Unknown",
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
        <Text style={styles.errorText}>Δεν βρέθηκαν δεδομένα διαμερίσματος.</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>Επιστροφή</Text>
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
    image: apartmentData.image,
    rooms: apartmentData.rooms,
    size: apartmentData.size,
    tags: Array.isArray(apartmentData.tags) ? apartmentData.tags : [],
  };

  const hasUnsavedChanges = noteText !== initialText;

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

    try {
      setSaving(true);
      await saveApartmentNote(auth.userId, apartmentData.id, noteText, apartmentData);
      setInitialText(noteText);
      setSaveFeedbackVisible(true);
    } catch {
      setActionModal({
        title: "Αποτυχία αποθήκευσης",
        description: "Δεν ήταν δυνατή η αποθήκευση της σημείωσης. Προσπαθήστε ξανά.",
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
        type: "apartment_share",
        text: `[Αγγελία: ${apartmentData.title}]`,
        apartmentData: sharedApartmentPayload,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      await updateDoc(doc(db, "chats", item.chatRoomId), {
        lastMessageText: `[Αγγελία: ${apartmentData.title}]`,
        lastMessage: `[Αγγελία: ${apartmentData.title}]`,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShareModalVisible(false);
      setActionModal({
        title: "Το διαμέρισμα κοινοποιήθηκε!",
        description: "Η αγγελία στάλθηκε επιτυχώς στη συνομιλία.",
      });
    } catch {
      setActionModal({
        title: "Παρουσιάστηκε πρόβλημα",
        description: "Η κοινοποίηση δεν ολοκληρώθηκε. Προσπαθήστε ξανά.",
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
          <Text style={styles.headerTitle} numberOfLines={1}>{apartmentData.title || "Σημείωση"}</Text>
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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {initialText === "" ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              Οι σημειώσεις σας είναι προσωπικές, δεν δημοσιεύονται πουθενά και έχετε πρόσβαση μόνο εσείς, εκτός αν επιλέξετε να τις μοιραστείτε.
            </Text>
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
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Γράψτε τη σημείωσή σας για αυτό το διαμέρισμα..."
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.noteInput}
                multiline
                textAlignVertical="top"
                maxLength={450}
                testID="apartment-note-input"
              />
              <Text style={styles.counterText}>{`${noteText.length}/450`}</Text>
            </>
          )}
        </View>
      </ScrollView>

      {saveFeedbackVisible ? (
        <View style={[styles.toastWrap, { bottom: spacing.lg + insets.bottom }]} pointerEvents="none">
          <Text style={styles.toastText}>Η σημείωση αποθηκεύτηκε</Text>
        </View>
      ) : null}

      <CenteredActionModal
        visible={showUnsavedModal}
        title="Αποχώρηση χωρίς αποθήκευση;"
        description="Είστε σίγουροι ότι θέλετε να αποχωρήσετε χωρίς να αποθηκεύσετε τις αλλαγές σας;"
        onDismiss={() => setShowUnsavedModal(false)}
        actionsLayout="horizontal"
        actions={[
          {
            label: "Ακύρωση",
            variant: "muted",
            iconName: "close-outline",
            onPress: () => setShowUnsavedModal(false),
            testID: "apartment-note-unsaved-cancel",
          },
          {
            label: "Αποχώρηση",
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
            label: "OK",
            iconName: "checkmark-circle-outline",
            onPress: () => setActionModal(null),
          },
        ]}
      />

      <CenteredActionModal
        visible={shareModalVisible}
        title="Κοινοποίηση Διαμερίσματος"
        description="Επιλέξτε συνομιλία για κοινοποίηση"
        onDismiss={() => {
          if (!sendingShareChatId) setShareModalVisible(false);
        }}
        actions={[
          {
            label: "Κλείσιμο",
            variant: "outline",
            iconName: "close-outline",
            onPress: () => setShareModalVisible(false),
          },
        ]}
        testID="apartment-note-share-modal-shell"
      />

      {shareModalVisible ? (
        <View style={styles.shareOverlay} pointerEvents="box-none">
          <View style={styles.sharePanel}>
            {loadingShareMatches ? (
              <View style={styles.shareStateWrap}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : activeShareMatches.length === 0 ? (
              <View style={styles.shareStateWrap}>
                <Text style={styles.shareStateText}>Δεν έχετε ενεργές συνομιλίες με συγκατοίκους ακόμα</Text>
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
          </View>
        </View>
      ) : null}
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
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
      backgroundColor: colors.brandTertiary,
      padding: spacing.md,
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
    counterText: {
      alignSelf: "flex-end",
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
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
