import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";

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
  brokerId: string;
  date: string;
  listings: BrokerListingItem[];
  clients: BrokerClientItem[];
  note?: BrokerNote | null;
  onClose: () => void;
  onSaved?: (noteId: string) => void;
  onUpdated?: (noteId: string) => void;
  onDeleted?: (noteId: string) => void;
}

const CATEGORY_OPTIONS: Array<{ value: NoteCategory; label: string }> = [
  { value: "visit", label: "Επίσκεψη" },
  { value: "keys", label: "Κλειδιά από ιδιοκτήτη" },
  { value: "message", label: "Μήνυμα" },
  { value: "phone", label: "Τηλέφωνο" },
  { value: "offer_review", label: "Αξιολόγηση προσφοράς" },
  { value: "deal_confirmation", label: "Επιβεβαίωση συμφωνίας" },
  { value: "other", label: "Άλλο" },
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
  return "Προέκυψε άγνωστο σφάλμα.";
}

export default function BrokerNoteModal({
  visible,
  brokerId,
  date,
  listings,
  clients,
  note,
  onClose,
  onSaved,
  onUpdated,
  onDeleted,
}: BrokerNoteModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEditMode = !!note?.id;

  const [selectedTime, setSelectedTime] = useState<string | null>(note?.time ?? null);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(note?.apartmentId ?? null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(note?.clientId ?? null);
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory>(getInitialCategory(note));
  const [detailsText, setDetailsText] = useState(note?.notesText ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

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
    setSelectedCategory(getInitialCategory(note));
    setDetailsText(note?.notesText ?? "");
    setErrorText(null);
  }, [note, visible]);

  const resetForCurrentMode = () => {
    setSelectedTime(note?.time ?? null);
    setSelectedApartmentId(note?.apartmentId ?? null);
    setSelectedClientId(note?.clientId ?? null);
    setSelectedCategory(getInitialCategory(note));
    setDetailsText(note?.notesText ?? "");
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

    setIsSaving(true);
    setErrorText(null);

    try {
      const payload = {
        brokerId,
        date,
        time: selectedTime ?? undefined,
        apartmentId: selectedApartment?.id,
        apartmentTitle: selectedApartment?.title,
        apartmentPrice: selectedApartment?.price,
        clientId: selectedClient?.id,
        clientName: selectedClient?.name?.trim() || note?.clientName?.trim(),
        category: selectedCategory,
        notesText: detailsText.trim().length > 0 ? detailsText.trim() : undefined,
      };

      if (isEditMode && note?.id) {
        await updateBrokerNote(brokerId, note.id, payload);
        onUpdated?.(note.id);
      } else {
        const newId = await saveBrokerNote(brokerId, payload);
        onSaved?.(newId);
      }

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
            <Text style={styles.previewTitle}>{isEditMode ? "Επεξεργασία Σημείωσης" : "Νέα Σημείωση"}</Text>
            <Text style={styles.previewDate}>{date}</Text>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Ώρα</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                <Pressable
                  style={[styles.choicePill, !selectedTime && styles.choicePillActive]}
                  onPress={() => setSelectedTime(null)}
                >
                  <Text style={[styles.choicePillText, !selectedTime && styles.choicePillTextActive]}>Χωρίς ώρα</Text>
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

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Διαμέρισμα</Text>
              <ScrollView style={styles.selectorBox} contentContainerStyle={styles.selectorContent}>
                <Pressable
                  style={[styles.selectorItem, !selectedApartmentId && styles.selectorItemActive]}
                  onPress={() => handleSelectApartment(null)}
                >
                  <Text style={[styles.selectorTitle, !selectedApartmentId && styles.selectorTitleActive]}>Χωρίς επιλογή</Text>
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
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Πελάτης</Text>
              <ScrollView style={styles.selectorBox} contentContainerStyle={styles.selectorContent}>
                <Pressable
                  style={[styles.selectorItem, !selectedClientId && styles.selectorItemActive]}
                  onPress={() => setSelectedClientId(null)}
                >
                  <Text style={[styles.selectorTitle, !selectedClientId && styles.selectorTitleActive]}>Χωρίς επιλογή</Text>
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
                    <Text style={styles.emptyHintText}>Δεν υπάρχουν διαθέσιμοι πελάτες για το επιλεγμένο διαμέρισμα.</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Σκοπός Ραντεβού</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {CATEGORY_OPTIONS.map((option) => {
                  const active = selectedCategory === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: noteCategoryColorMap[option.value] },
                        active && styles.categoryChipActive,
                      ]}
                      onPress={() => setSelectedCategory(option.value)}
                    >
                      <Text style={styles.categoryChipText}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Σημειώσεις</Text>
              <TextInput
                value={detailsText}
                onChangeText={setDetailsText}
                multiline
                placeholder="Γράψτε επιπλέον λεπτομέρειες..."
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.notesInput}
                textAlignVertical="top"
              />
            </View>

            {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
          </ScrollView>

          <View style={styles.footerContainer}>
            {isEditMode ? (
              <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete} disabled={isSaving}>
                <Text style={styles.deleteButtonText}>Διαγραφή</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.actionButton, styles.saveButton, isSaving && styles.actionButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.onBrand} />
              ) : (
                <Text style={styles.saveButtonText}>{isEditMode ? "Ενημέρωση" : "Αποθήκευση"}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
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
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
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
    fieldBlock: {
      gap: spacing.xs,
    },
    fieldLabel: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
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
    categoryChipText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
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
    errorText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: colors.error,
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
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
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
