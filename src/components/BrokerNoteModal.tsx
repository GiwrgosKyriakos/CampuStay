import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  deleteBrokerNote,
  noteCategoryColorMap,
  saveBrokerNote,
  updateBrokerNote,
  type BrokerNote,
  type NoteCategory,
} from "@/src/api/brokerCalendar";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { getWordCount, isNoteBodyValid, isNoteTitleValid, MAX_NOTE_BODY_CHARS, MAX_NOTE_BODY_WORDS, MAX_NOTE_TITLE_CHARS, MAX_NOTE_TITLE_WORDS } from "@/src/utils/noteValidation";
import { NOTE_REMINDER_OPTIONS, scheduleCalendarNoteReminder } from "@/src/utils/calendarNoteReminders";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import SelectCoveringBrokerModal from "@/src/components/SelectCoveringBrokerModal";
import { delegateShowing, getAgencyStaff, type AgencyStaffMember } from "@/src/api/agencyCollaboration";
import { getUserProfile } from "@/src/api/userProfile";

export interface BrokerListingItem {
  id: string;
  title: string;
  price?: number;
}

export interface BrokerClientItem {
  id: string;
  name: string;
  apartmentIds?: string[];
  isActive?: boolean;
}

export interface BrokerNoteModalProps {
  visible: boolean;
  isBroker?: boolean;
  brokerId: string;
  date: string;
  listings: BrokerListingItem[];
  clients: BrokerClientItem[];
  note?: BrokerNote | null;
  onClose: () => void;
  onSaved?: (noteId: string) => void;
  onUpdated?: (noteId: string) => void;
  onDeleted?: (noteId: string) => void;
  onSignViewingOrder?: (context: { apartmentId: string; clientId: string; apartmentTitle?: string; apartmentPrice?: number; clientName?: string; clientProfileId?: string }) => void;
}

const CATEGORY_OPTIONS: { value: NoteCategory; label: string }[] = [
  { value: "visit", label: "calendar.noteModal.categories.visit" },
  { value: "keys", label: "calendar.noteModal.categories.keys" },
  { value: "message", label: "calendar.noteModal.categories.message" },
  { value: "phone", label: "calendar.noteModal.categories.phone" },
  { value: "offer_review", label: "calendar.noteModal.categories.offerReview" },
  { value: "deal_confirmation", label: "calendar.noteModal.categories.dealConfirmation" },
  { value: "other", label: "calendar.noteModal.categories.other" },
];

const USER_CATEGORY_OPTIONS: { value: NoteCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "showing", label: "calendar.noteModal.categories.visit", icon: "home-outline" },
  { value: "call", label: "calendar.noteModal.categories.phone", icon: "call-outline" },
];

const TIME_OPTIONS: string[] = (() => {
  const values: string[] = [];
  for (let hour = 7; hour <= 20; hour += 1) {
    values.push(`${String(hour).padStart(2, "0")}:00`);
    if (hour < 20) {
      values.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }
  return values;
})();

function formatPrice(price?: number): string {
  if (typeof price !== "number" || Number.isNaN(price)) return "";
  return `${price.toLocaleString("el-GR")} EUR`;
}

function getInitialCategory(note?: BrokerNote | null): NoteCategory {
  return note?.category ?? "visit";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return t("calendar.noteModal.unknownError");
}

export default function BrokerNoteModal({
  visible,
  isBroker = true,
  brokerId,
  date,
  listings,
  clients,
  note,
  onClose,
  onSaved,
  onUpdated,
  onDeleted,
  onSignViewingOrder,
}: BrokerNoteModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEditMode = !!note?.id;

  const [selectedTime, setSelectedTime] = useState<string | null>(note?.time ?? null);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(note?.apartmentId ?? null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(note?.clientId ?? null);
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory>(isBroker ? getInitialCategory(note) : note?.category === "call" || note?.category === "phone" ? "call" : "showing");
  const [noteTitle, setNoteTitle] = useState(note?.title ?? "");
  const [detailsText, setDetailsText] = useState(note?.notesText ?? "");
  const [enablePushReminder, setEnablePushReminder] = useState(note?.enablePushReminder ?? false);
  const [reminderLeadTimeMinutes, setReminderLeadTimeMinutes] = useState(note?.reminderLeadTimeMinutes ?? 30);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [coveringBroker, setCoveringBroker] = useState<AgencyStaffMember | null>(null);
  const [coveringBrokerModalVisible, setCoveringBrokerModalVisible] = useState(false);
  const [agencyId, setAgencyId] = useState("");
  const [primaryBrokerName, setPrimaryBrokerName] = useState("");

  const selectedApartment = useMemo(
    () => listings.find((item) => item.id === selectedApartmentId),
    [listings, selectedApartmentId],
  );

  const activeClients = useMemo(
    () => clients.filter((client) => client.isActive !== false),
    [clients],
  );

  const filteredClients = useMemo(() => {
    if (!selectedApartmentId) {
      return activeClients;
    }
    return activeClients.filter((client) => Array.isArray(client.apartmentIds) && client.apartmentIds.includes(selectedApartmentId));
  }, [activeClients, selectedApartmentId]);

  const selectedClient = useMemo(
    () => filteredClients.find((item) => item.id === selectedClientId) ?? activeClients.find((item) => item.id === selectedClientId),
    [activeClients, filteredClients, selectedClientId],
  );

  const categoryColor = noteCategoryColorMap[selectedCategory] ?? colors.surfaceSecondary;

  useEffect(() => {
    if (!visible) return;

    setSelectedTime(note?.time ?? null);
    setSelectedApartmentId(note?.apartmentId ?? null);
    setSelectedClientId(note?.clientId ?? null);
    setSelectedCategory(isBroker ? getInitialCategory(note) : note?.category === "call" || note?.category === "phone" ? "call" : "showing");
    setNoteTitle(note?.title ?? "");
    setDetailsText(note?.notesText ?? "");
    setEnablePushReminder(note?.enablePushReminder ?? false);
    setReminderLeadTimeMinutes(note?.reminderLeadTimeMinutes ?? 30);
    setErrorText(null);
    setCoveringBroker(null);
    setAgencyId("");
    setPrimaryBrokerName("");
    if (isBroker && brokerId) {
      void getUserProfile(brokerId).then(async (profile) => {
        const resolvedAgencyId = profile?.agencyId?.trim() || "";
        setAgencyId(resolvedAgencyId);
        setPrimaryBrokerName(profile?.name?.trim() || "Μεσίτης");
        if (resolvedAgencyId && note?.coveringBrokerId) {
          const members = await getAgencyStaff(resolvedAgencyId);
          const member = members.find((item) => item.id === note.coveringBrokerId);
          if (member) setCoveringBroker(member);
        }
      }).catch(() => setAgencyId(""));
    }
  }, [brokerId, isBroker, note, visible]);

  const resetForCurrentMode = () => {
    setSelectedTime(note?.time ?? null);
    setSelectedApartmentId(note?.apartmentId ?? null);
    setSelectedClientId(note?.clientId ?? null);
    setSelectedCategory(isBroker ? getInitialCategory(note) : note?.category === "call" || note?.category === "phone" ? "call" : "showing");
    setNoteTitle(note?.title ?? "");
    setDetailsText(note?.notesText ?? "");
    setEnablePushReminder(note?.enablePushReminder ?? false);
    setReminderLeadTimeMinutes(note?.reminderLeadTimeMinutes ?? 30);
    setErrorText(null);
  };

  const closeWithReset = () => {
    resetForCurrentMode();
    onClose();
  };

  const handleSelectApartment = (apartmentId: string | null) => {
    setSelectedApartmentId(apartmentId);
    if (!apartmentId || !selectedClientId) {
      return;
    }

    const stillValidClient = activeClients.some(
      (item) => item.id === selectedClientId && Array.isArray(item.apartmentIds) && item.apartmentIds.includes(apartmentId),
    );
    if (!stillValidClient) {
      setSelectedClientId(null);
    }
  };

  const handleSave = async () => {
    if (!brokerId.trim()) {
      setErrorText("Δεν βρέθηκε brokerId.");
      return;
    }
    if (!isNoteTitleValid(noteTitle) || !isNoteBodyValid(detailsText)) return;

    setIsSaving(true);
    setErrorText(null);

    try {
      const resolvedTitle = noteTitle.trim() || (selectedCategory === "showing" || selectedCategory === "visit" ? "Σημείωση Επίσκεψης" : selectedCategory === "call" || selectedCategory === "phone" ? "Σημείωση Τηλεφωνήματος" : "Σημείωση");
      const payload = {
        brokerId,
        date,
        title: resolvedTitle,
        time: selectedTime ?? undefined,
        scheduledDate: date,
        scheduledTime: selectedTime ?? undefined,
        apartmentId: selectedApartment?.id,
        apartmentTitle: selectedApartment?.title,
        apartmentPrice: selectedApartment?.price,
        clientId: selectedClient?.id,
        clientName: selectedClient?.name?.trim() || note?.clientName?.trim(),
        category: selectedCategory,
        type: selectedCategory,
        enablePushReminder,
        reminderLeadTimeMinutes,
        notesText: detailsText.trim().length > 0 ? detailsText.trim() : undefined,
        primaryBrokerId: brokerId,
        primaryBrokerName: primaryBrokerName || "Μεσίτης",
        ...(agencyId ? { agencyId } : {}),
        ...(coveringBroker ? { coveringBrokerId: coveringBroker.id, coveringBrokerName: coveringBroker.name } : {}),
      };

      let savedNoteId: string;
      if (isEditMode && note?.id) {
        await updateBrokerNote(brokerId, note.id, payload);
        onUpdated?.(note.id);
        savedNoteId = note.id;
      } else {
        const newId = await saveBrokerNote(brokerId, payload);
        onSaved?.(newId);
        savedNoteId = newId;
        if (coveringBroker && !note?.appointmentId) {
          await saveBrokerNote(coveringBroker.id, {
            ...payload,
            brokerId,
            calendarOwnerId: coveringBroker.id,
            coveringBrokerId: coveringBroker.id,
            coveringBrokerName: coveringBroker.name,
            primaryBrokerId: brokerId,
            primaryBrokerName: primaryBrokerName || "Μεσίτης",
            primaryNoteId: savedNoteId,
          });
        }
      }
      if (coveringBroker && note?.appointmentId) {
        await delegateShowing({ appointmentId: note.appointmentId, coveringBrokerId: coveringBroker.id });
      }

      const reminderNotificationId = enablePushReminder
        ? await scheduleCalendarNoteReminder({
          noteId: savedNoteId,
          title: resolvedTitle,
          noteTypeLabel: t(CATEGORY_OPTIONS.find((option) => option.value === selectedCategory)?.label ?? "calendar.noteModal.note"),
          date,
          time: selectedTime ?? undefined,
          leadTimeMinutes: reminderLeadTimeMinutes,
          existingNotificationId: note?.reminderNotificationId,
        })
        : await scheduleCalendarNoteReminder({
          noteId: savedNoteId,
          title: resolvedTitle,
          noteTypeLabel: t("calendar.noteModal.note"),
          date,
          time: undefined,
          leadTimeMinutes: reminderLeadTimeMinutes,
          existingNotificationId: note?.reminderNotificationId,
        });
      await updateBrokerNote(brokerId, savedNoteId, { reminderNotificationId: reminderNotificationId ?? "" });

      closeWithReset();
    } catch (error: unknown) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditMode || !note?.id) return;

    setIsSaving(true);
    setErrorText(null);

    try {
      await deleteBrokerNote(brokerId, note.id);
      onDeleted?.(note.id);
      closeWithReset();
    } catch (error: unknown) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const titleWords = getWordCount(noteTitle);
  const bodyWords = getWordCount(detailsText);
  const titleInvalid = !isNoteTitleValid(noteTitle);
  const bodyInvalid = !isNoteBodyValid(detailsText);
  const titleNearLimit = titleWords >= MAX_NOTE_TITLE_WORDS * 0.9 || noteTitle.length >= MAX_NOTE_TITLE_CHARS * 0.9;
  const bodyNearLimit = bodyWords >= MAX_NOTE_BODY_WORDS * 0.9 || detailsText.length >= MAX_NOTE_BODY_CHARS * 0.9;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeWithReset}>
      <Pressable style={styles.modalBackdrop} onPress={closeWithReset}>
        <Pressable
          style={styles.modalCard}
          onPress={(event) => event.stopPropagation()}
        >
          <View
            style={[styles.headerBanner, { backgroundColor: categoryColor }]}
          >
            <Text style={styles.previewTitle}>{isEditMode ? t("calendar.noteModal.editTitle") : t("calendar.noteModal.newTitle")}</Text>
            <Text style={styles.previewDate}>{date}</Text>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.titleLabel")}</Text>
              <TextInput value={noteTitle} onChangeText={setNoteTitle} placeholder={t("calendar.noteModal.titlePlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} style={[styles.notesInput, styles.titleInput, titleInvalid && styles.inputErrorBorder]} maxLength={MAX_NOTE_TITLE_CHARS} testID="calendar-note-title-input" />
              <Text style={[styles.counterText, titleNearLimit && styles.counterTextWarning, titleInvalid && styles.counterTextError]}>{t("calendar.noteModal.titleCounter", { words: titleWords, maxWords: MAX_NOTE_TITLE_WORDS, characters: noteTitle.length, maxCharacters: MAX_NOTE_TITLE_CHARS })}</Text>
              {titleInvalid ? <Text style={styles.warningText}>{t("calendar.noteModal.titleInvalid")}</Text> : null}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.timeLabel")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                <Pressable
                  style={[styles.choicePill, !selectedTime && styles.choicePillActive]}
                  onPress={() => setSelectedTime(null)}
                >
                  <Text style={[styles.choicePillText, !selectedTime && styles.choicePillTextActive]}>{t("calendar.noteModal.noTime")}</Text>
                </Pressable>
                {TIME_OPTIONS.map((time) => {
                  const active = selectedTime === time;
                  return (
                    <Pressable
                      key={time}
                      style={[styles.choicePill, active && styles.choicePillActive]}
                      onPress={() => setSelectedTime(time)}
                    >
                      <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{time}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {isBroker ? <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.apartmentLabel")}</Text>
              <ScrollView style={styles.selectorBox} contentContainerStyle={styles.selectorContent}>
                <Pressable
                  style={[styles.selectorItem, !selectedApartmentId && styles.selectorItemActive]}
                  onPress={() => handleSelectApartment(null)}
                >
                  <Text style={[styles.selectorTitle, !selectedApartmentId && styles.selectorTitleActive]}>{t("calendar.noteModal.noSelection")}</Text>
                </Pressable>

                {listings.map((listing) => {
                  const active = selectedApartmentId === listing.id;
                  return (
                    <Pressable
                      key={listing.id}
                      style={[styles.selectorItem, styles.listingItem, active && styles.selectorItemActive]}
                      onPress={() => handleSelectApartment(listing.id)}
                    >
                      <Text style={[styles.selectorTitle, styles.listingTitle, active && styles.selectorTitleActive]} numberOfLines={1}>
                        {listing.title}
                      </Text>
                      {!!formatPrice(listing.price) && (
                        <View style={[styles.priceBadge, active && styles.priceBadgeActive]}>
                          <Text style={[styles.priceBadgeText, active && styles.priceBadgeTextActive]}>{formatPrice(listing.price)}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View> : null}

            {isBroker ? <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.clientLabel")}</Text>
              <ScrollView style={styles.selectorBox} contentContainerStyle={styles.selectorContent}>
                <Pressable
                  style={[styles.selectorItem, !selectedClientId && styles.selectorItemActive]}
                  onPress={() => setSelectedClientId(null)}
                >
                  <Text style={[styles.selectorTitle, !selectedClientId && styles.selectorTitleActive]}>{t("calendar.noteModal.noSelection")}</Text>
                </Pressable>

                {filteredClients.map((client) => {
                  const active = selectedClientId === client.id;
                  return (
                    <Pressable
                      key={client.id}
                      style={[styles.selectorItem, active && styles.selectorItemActive]}
                      onPress={() => setSelectedClientId(client.id)}
                    >
                      <Text style={[styles.selectorTitle, active && styles.selectorTitleActive]} numberOfLines={1}>
                        {client.name}
                      </Text>
                    </Pressable>
                  );
                })}

                {filteredClients.length === 0 ? (
                  <View style={styles.emptyHintWrap}>
                    <Text style={styles.emptyHintText}>{t("calendar.noteModal.noClients")}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View> : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.categoryLabel")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {(isBroker ? CATEGORY_OPTIONS : USER_CATEGORY_OPTIONS).map((option) => {
                  const active = selectedCategory === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isBroker ? noteCategoryColorMap[option.value] : active ? colors.brand : colors.surfaceSecondary },
                        active && styles.categoryChipActive,
                        active && !isBroker && styles.userCategoryChipActive,
                      ]}
                      onPress={() => setSelectedCategory(option.value)}
                    >
                      {!isBroker ? <Ionicons name={option.value === "showing" ? "home-outline" : "call-outline"} size={16} color={active ? colors.onBrand : colors.onSurface} /> : null}
                      <Text style={[styles.categoryChipText, active && !isBroker && styles.userCategoryChipTextActive]}>{t(option.label)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {isBroker && (selectedCategory === "showing" || selectedCategory === "visit") ? (
              <View style={styles.coveringSection}>
                <Pressable style={styles.coveringLink} onPress={() => setCoveringBrokerModalVisible(true)} testID="calendar-note-covering-broker-link">
                  <Ionicons name="people-outline" size={17} color={colors.brand} />
                  <Text style={styles.coveringLinkText}>{coveringBroker ? `Κάλυψη Ραντεβού: ${coveringBroker.name}` : "Ανάθεση σε Συνάδελφο (Κάλυψη Ραντεβού)"}</Text>
                </Pressable>
                {coveringBroker ? <Pressable onPress={() => setCoveringBroker(null)} hitSlop={8}><Ionicons name="close-circle-outline" size={18} color={colors.onSurfaceTertiary} /></Pressable> : null}
              </View>
            ) : null}

            <View style={styles.reminderCard} testID="calendar-note-reminder-card">
              <View style={styles.reminderHeader}>
                <View style={styles.reminderCopy}>
                  <Text style={styles.reminderTitle}>{t("calendar.noteModal.reminderTitle")}</Text>
                  <Text style={styles.reminderSubtitle}>{t("calendar.noteModal.reminderDescription")}</Text>
                </View>
                <Switch
                  value={enablePushReminder}
                  onValueChange={setEnablePushReminder}
                  trackColor={{ false: colors.surfaceTertiary, true: colors.brandTertiary }}
                  thumbColor={enablePushReminder ? colors.brand : colors.onSurfaceTertiary}
                  testID="calendar-note-reminder-toggle"
                />
              </View>
              {enablePushReminder ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                  {NOTE_REMINDER_OPTIONS.map((option) => {
                    const active = reminderLeadTimeMinutes === option.minutes;
                    return (
                      <Pressable key={option.minutes} style={[styles.choicePill, active && styles.choicePillActive]} onPress={() => setReminderLeadTimeMinutes(option.minutes)} testID={`calendar-note-reminder-${option.minutes}`}>
                        <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{t(option.label)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t("calendar.noteModal.notesLabel")}</Text>
              <View style={styles.voiceInputWrap}>
                <TextInput
                  value={detailsText}
                  onChangeText={setDetailsText}
                  multiline
                  placeholder={t("calendar.noteModal.notesPlaceholder")}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={[styles.notesInput, styles.voiceInput, bodyInvalid && styles.inputErrorBorder]}
                  textAlignVertical="top"
                  maxLength={MAX_NOTE_BODY_CHARS}
                  testID="calendar-note-body-input"
                />
                <View style={styles.voiceButtonWrap}>
                  <VoiceInputButton
                    onTextAppend={(spokenText) => setDetailsText((current) => current.trim() ? `${current.trim()} ${spokenText}` : spokenText)}
                    color={colors.onSurfaceTertiary}
                    disabled={isSaving}
                  />
                </View>
              </View>
              <View style={styles.counterRow}>
                {bodyInvalid ? <Text style={styles.warningText}>{t("calendar.noteModal.bodyInvalid")}</Text> : null}
                <Text style={[styles.counterText, bodyNearLimit && styles.counterTextWarning, bodyInvalid && styles.counterTextError]}>{t("calendar.noteModal.bodyCounter", { words: bodyWords, maxWords: MAX_NOTE_BODY_WORDS })}</Text>
              </View>
            </View>

            {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
            {isBroker && (selectedCategory === "showing" || selectedCategory === "visit") && selectedApartment?.id && selectedClient?.id && onSignViewingOrder ? (
              <Pressable
                style={styles.contractAction}
                onPress={() => {
                  onSignViewingOrder({
                    apartmentId: selectedApartment.id,
                    clientId: selectedClient.id,
                    apartmentTitle: selectedApartment.title,
                    apartmentPrice: selectedApartment.price,
                    clientName: selectedClient.name,
                    clientProfileId: `${brokerId}_${selectedClient.id}`,
                  });
                  closeWithReset();
                }}
                testID="calendar-note-sign-viewing-order"
              >
                <Ionicons name="document-text-outline" size={19} color={colors.onBrand} />
                <Text style={styles.contractActionText}>{t("esign.signViewingOrder")}</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.footerContainer}>
            {isEditMode ? (
              <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete} disabled={isSaving}>
                <Text style={styles.deleteButtonText}>{t("common.actions.delete")}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.actionButton, styles.saveButton, isSaving && styles.actionButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving || titleInvalid || bodyInvalid}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.onBrand} />
              ) : (
                <Text style={styles.saveButtonText}>{isEditMode ? t("calendar.noteModal.update") : t("common.actions.save")}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <SelectCoveringBrokerModal
        visible={coveringBrokerModalVisible}
        agencyId={agencyId}
        currentUserId={brokerId}
        selectedId={coveringBroker?.id}
        onClose={() => setCoveringBrokerModalVisible(false)}
        onSelect={(broker) => {
          setCoveringBroker(broker);
          setCoveringBrokerModalVisible(false);
        }}
      />
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    modalCard: {
      width: "92%",
      maxWidth: 480,
      maxHeight: "88%",
      padding: 0,
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    scrollBody: {
      backgroundColor: "transparent",
      overflow: "hidden",
      flexShrink: 1,
    },
    headerBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      overflow: "hidden",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    previewTitle: {
      fontFamily: fonts.display,
      fontSize: fontSize.lg,
      color: colors.onSurface,
    },
    previewDate: {
      marginTop: 2,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    contentWrap: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      paddingBottom: 40,
      gap: spacing.md,
    },
    coveringSection: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
    coveringLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    coveringLinkText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.brand },
    fieldBlock: {
      gap: spacing.xs,
    },
    fieldLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    reminderCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    reminderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    reminderCopy: {
      flex: 1,
      gap: 2,
    },
    reminderTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    reminderSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    pillRow: {
      gap: spacing.xs,
      paddingRight: spacing.lg,
    },
    choicePill: {
      minHeight: 34,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    choicePillActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brandSecondary,
    },
    choicePillText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    choicePillTextActive: {
      color: colors.onBrand,
    },
    selectorBox: {
      maxHeight: 148,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    selectorContent: {
      padding: spacing.xs,
      gap: spacing.xs,
    },
    selectorItem: {
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: colors.surface,
    },
    listingItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    selectorItemActive: {
      borderColor: colors.brandSecondary,
      backgroundColor: colors.brandTertiary,
    },
    selectorTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    selectorTitleActive: {
      color: colors.onSurface,
    },
    listingTitle: {
      flex: 1,
      minWidth: 0,
    },
    priceBadge: {
      marginLeft: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      backgroundColor: colors.surfaceSecondary,
    },
    priceBadgeActive: {
      borderColor: colors.brand,
      backgroundColor: colors.brand,
    },
    priceBadgeText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    priceBadgeTextActive: {
      color: colors.onBrand,
    },
    emptyHintWrap: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    emptyHintText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    categoryChip: {
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      minHeight: 34,
      alignItems: "center",
      justifyContent: "center",
    },
    categoryChipActive: {
      borderColor: colors.borderStrong,
      borderWidth: 1,
    },
    userCategoryChipActive: {
      borderColor: colors.brand,
    },
    categoryChipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    userCategoryChipTextActive: {
      color: colors.onBrand,
    },
    notesInput: {
      minHeight: 110,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      color: colors.onSurface,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
    },
    voiceInputWrap: { position: "relative" },
    voiceInput: { paddingRight: 48 },
    voiceButtonWrap: { position: "absolute", top: 4, right: 4 },
    titleInput: { minHeight: 46 },
    inputErrorBorder: { borderColor: "#EF4444", borderWidth: 1 },
    counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
    counterText: { flex: 1, textAlign: "right", fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    counterTextWarning: { color: "#F59E0B" },
    counterTextError: { color: "#EF4444" },
    warningText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: "#F59E0B" },
    errorText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.error,
    },
    contractAction: {
      minHeight: 46,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    contractActionText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
    },
    footerContainer: {
      flexDirection: "row",
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: "hidden",
    },
    actionButton: {
      minHeight: 46,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.brand,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
    },
    saveButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onBrand,
    },
    deleteButton: {
      backgroundColor: colors.error,
      borderWidth: 1,
      borderColor: colors.error,
    },
    deleteButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onError,
    },
    actionButtonDisabled: {
      opacity: 0.7,
    },
  });
}
