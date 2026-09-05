import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import CalendarNoteModal from "@/src/components/calendar/CalendarNoteModal";
import { getBrokerNotesByDateRange, type BrokerNote } from "@/src/api/brokerCalendar";
import type { BrokerClientItem, BrokerListingItem } from "@/src/components/BrokerNoteModal";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

export default function ClientCalendarNotesModal({
  visible,
  clientId,
  clientName,
  brokerId,
  listings,
  onClose,
}: {
  visible: boolean;
  clientId: string;
  clientName: string;
  brokerId: string;
  listings: BrokerListingItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [notes, setNotes] = useState<BrokerNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<BrokerNote | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const clients = useMemo<BrokerClientItem[]>(() => [{ id: clientId, name: clientName || "Πελάτης", apartmentIds: listings.map((listing) => listing.id), isActive: true }], [clientId, clientName, listings]);

  const loadNotes = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const brokerNotes = await getBrokerNotesByDateRange(brokerId, "0000-01-01", "9999-12-31");
      setNotes(brokerNotes.filter((note) => note.clientId === clientId || note.counterpartId === clientId));
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [brokerId, clientId]);

  useEffect(() => { if (visible) void loadNotes(); }, [loadNotes, visible]);

  const closeEditor = () => { setEditorVisible(false); setSelectedNote(null); };
  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable={false} maxHeight="88%">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Ionicons name="calendar-outline" size={22} color={colors.brand} />
              <Text style={[styles.title, { color: colors.onSurface }]}>Σημειώσεις Ημερολογίου</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={[styles.headerAddButton, { backgroundColor: colors.brand }]}
                onPress={() => { setSelectedNote(null); setEditorVisible(true); }}
                hitSlop={8}
                testID="client-calendar-notes-add-header"
              >
                <Ionicons name="add" size={18} color={colors.onBrand} />
                <Text style={[styles.headerAddButtonText, { color: colors.onBrand }]}>Σημείωση</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            </View>
          </View>
          {loading ? <ActivityIndicator color={colors.brand} /> : <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {notes.length === 0 ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν σημειώσεις, επισκέψεις ή υπενθυμίσεις.</Text> : notes.map((note) => (
              <Pressable key={note.id} style={[styles.note, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} onPress={() => { setSelectedNote(note); setEditorVisible(true); }} testID={`client-calendar-note-${note.id}`}>
                <View style={styles.noteHeader}><Text style={[styles.noteTitle, { color: colors.onSurface }]} numberOfLines={1}>{note.title || "Σημείωση"}</Text><Text style={[styles.noteDate, { color: colors.brand }]}>{note.date} {note.time || ""}</Text></View>
                <Text style={[styles.noteMeta, { color: colors.onSurfaceTertiary }]}>{note.category} {note.apartmentTitle ? `· ${note.apartmentTitle}` : ""}</Text>
                {note.notesText ? <Text style={[styles.noteBody, { color: colors.onSurface }]} numberOfLines={2}>{note.notesText}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>}
        </View>
      <CalendarNoteModal visible={editorVisible} isBroker brokerId={brokerId} userId={brokerId} date={selectedNote?.date || new Date().toISOString().slice(0, 10)} initialClientId={clientId} initialClientName={clientName} initialDate={selectedNote?.date || new Date().toISOString().slice(0, 10)} note={selectedNote} listings={listings} clients={clients} onClose={closeEditor} onSaved={() => { closeEditor(); void loadNotes(); }} onUpdated={() => { closeEditor(); void loadNotes(); }} onDeleted={() => { closeEditor(); void loadNotes(); }} />
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { maxHeight: "82%", borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerAddButton: { height: 32, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  headerAddButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  list: { flexShrink: 1 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  empty: { fontFamily: fonts.regular, fontSize: fontSize.sm, textAlign: "center", paddingVertical: spacing.lg },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  noteHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  noteTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  noteDate: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  noteMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  noteBody: { fontFamily: fonts.regular, fontSize: fontSize.sm },
});
