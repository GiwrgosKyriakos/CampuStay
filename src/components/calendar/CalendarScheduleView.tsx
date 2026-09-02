import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBrokerNotesByDateRange, noteCategoryColorMap, type BrokerNote } from "@/src/api/brokerCalendar";
import PostVisitFeedbackModal from "@/src/components/calendar/PostVisitFeedbackModal";
import { getCalendarNoteDate } from "@/src/utils/calendarNoteReminders";
import { cancelScheduledNotification, schedulePostVisitFeedbackReminder } from "@/src/utils/notificationService";
import { useTheme } from "@/src/context/ThemeContext";
import { getCurrentLocale, t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export interface CalendarScheduleViewProps {
  isBroker: boolean;
  userId: string;
  onAddNotePress: (date: string) => void;
  refreshToken?: number;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarDays(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(monthStart);
    day.setDate(1 - mondayOffset + index);
    return day;
  });
}

export default function CalendarScheduleView({ isBroker, userId, onAddNotePress, refreshToken = 0 }: CalendarScheduleViewProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [notes, setNotes] = useState<BrokerNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState<BrokerNote | null>(null);
  const [feedbackNow, setFeedbackNow] = useState(() => Date.now());
  const days = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const notesByDate = useMemo(() => {
    const grouped = new Map<string, BrokerNote[]>();
    notes.forEach((note) => grouped.set(note.date, [...(grouped.get(note.date) ?? []), note]));
    return grouped;
  }, [notes]);
  const selectedNotes = notesByDate.get(selectedDate) ?? [];
  const pendingFeedbackNotes = useMemo(
    () => notes.filter((note) => {
      if (note.category !== "showing" || !note.apartmentId || note.feedbackSubmittedBy?.[userId]) return false;
      if (note.done || note.isCompleted) return true;
      const visitDate = getCalendarNoteDate(note.scheduledDate ?? note.date, note.scheduledTime ?? note.time, note.timestamp);
      return !!visitDate && feedbackNow >= visitDate.getTime() + 2 * 60 * 60 * 1000;
    }),
    [feedbackNow, notes, userId],
  );

  const loadNotes = useCallback(async () => {
    if (!userId) {
      setNotes([]);
      return;
    }
    setLoading(true);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    try {
      setNotes(await getBrokerNotesByDateRange(userId, dateKey(currentMonth), dateKey(monthEnd)));
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, userId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshToken]);

  useEffect(() => {
    const timer = setInterval(() => setFeedbackNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    notes.forEach((note) => {
      if (note.category !== "showing" || !note.apartmentId || note.feedbackSubmittedBy?.[userId]) return;
      if (note.done || note.isCompleted) {
        void cancelScheduledNotification(note.reminderNotificationId);
        return;
      }
      const visitDate = getCalendarNoteDate(note.scheduledDate ?? note.date, note.scheduledTime ?? note.time, note.timestamp);
      if (visitDate) {
        void schedulePostVisitFeedbackReminder({ noteId: note.id, apartmentTitle: note.apartmentTitle ?? "το διαμέρισμα", scheduledAt: visitDate });
      }
    });
  }, [notes, userId]);

  const changeMonth = (offset: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(next);
    setSelectedDate(dateKey(next));
  };

  const selectMonth = (monthIndex: number, year: number) => {
    const next = new Date(year, monthIndex, 1);
    setCurrentMonth(next);
    setSelectedDate(dateKey(next));
    setMonthPickerVisible(false);
  };

  const pickerYears = [currentMonth.getFullYear() - 1, currentMonth.getFullYear(), currentMonth.getFullYear() + 1];

  return (
    <View style={styles.container} testID={`calendar-schedule-view-${isBroker ? "broker" : "user"}`}>
      <View style={styles.monthHeader}>
        <Pressable style={styles.iconButton} onPress={() => changeMonth(-1)} hitSlop={8} testID="calendar-previous-month">
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable hitSlop={6} onPress={() => setMonthPickerVisible(true)} style={styles.monthYearPillButton} testID="calendar-month-year-picker-trigger">
          <Text style={styles.monthYearPillText}>{new Intl.DateTimeFormat(getCurrentLocale(), { month: "long", year: "numeric" }).format(currentMonth)}</Text>
          <Ionicons color={colors.onSurfaceTertiary} name="chevron-down" size={14} />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => changeMonth(1)} hitSlop={8} testID="calendar-next-month">
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>{WEEKDAYS.map((day) => <Text key={day} style={styles.weekday}>{t(`calendar.weekdays.${day}`)}</Text>)}</View>
      <View style={styles.grid}>
        {days.map((day) => {
          const key = dateKey(day);
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
          const isSelected = selectedDate === key;
          const dayNotes = notesByDate.get(key) ?? [];
          return (
            <Pressable key={key} style={[styles.dayCell, !isCurrentMonth && styles.dayCellMuted, isSelected && styles.dayCellSelected]} onPress={() => setSelectedDate(key)} testID={`calendar-day-${key}`}>
              <Text style={[styles.dayNumber, !isCurrentMonth && styles.dayNumberMuted, isSelected && styles.dayNumberSelected]}>{day.getDate()}</Text>
              {dayNotes.length > 0 ? <View style={styles.noteDots}>{dayNotes.slice(0, 3).map((note) => <View key={note.id} style={[styles.noteDot, { backgroundColor: noteCategoryColorMap[note.category] ?? colors.brand }]} />)}</View> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.agendaHeader}>
        <Text style={styles.agendaTitle}>{t("calendar.schedule", { date: selectedDate })}</Text>
        <Pressable style={styles.addButton} onPress={() => onAddNotePress(selectedDate)} testID="calendar-add-note-button">
          <Ionicons name="add" size={17} color={colors.onBrand} />
          <Text style={styles.addButtonText}>{t("common.actions.add")}</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.brand} style={styles.loading} /> : selectedNotes.length === 0 ? <Text style={styles.emptyText}>{t("calendar.noScheduledNotes")}</Text> : <View style={styles.weekNotesContainer}><ScrollView style={styles.agenda} contentContainerStyle={[styles.agendaContent, { paddingBottom: insets.bottom + 70 }]}>{selectedNotes.map((note) => <View key={note.id} style={styles.noteRow}><View style={[styles.noteMarker, { backgroundColor: noteCategoryColorMap[note.category] ?? colors.brand }]} /><View style={styles.noteText}><Text style={styles.noteTitle}>{note.title || (note.category === "showing" || note.category === "visit" ? t("calendar.visit") : note.category === "call" || note.category === "phone" ? t("calendar.phone") : note.category)}</Text><Text style={styles.noteMeta}>{note.time || t("calendar.noTime")}{note.notesText ? ` · ${note.notesText}` : ""}</Text></View></View>)}</ScrollView></View>}
      {pendingFeedbackNotes.length > 0 ? <View style={styles.feedbackCallout} testID="calendar-pending-feedback-callout"><Ionicons name="star-outline" size={22} color={colors.brand} /><View style={styles.feedbackCalloutCopy}><Text style={styles.feedbackCalloutText}>{isBroker ? t("calendar.brokerFeedbackPrompt", { title: pendingFeedbackNotes[0].apartmentTitle ?? t("calendar.apartment") }) : t("calendar.clientFeedbackPrompt", { title: pendingFeedbackNotes[0].apartmentTitle ?? t("calendar.apartment") })}</Text><Pressable onPress={() => setFeedbackNote(pendingFeedbackNotes[0])} testID="calendar-open-feedback"><Text style={styles.feedbackCalloutAction}>{isBroker ? t("calendar.recordFeedback") : t("calendar.rateVisit")}</Text></Pressable></View></View> : null}
      <Modal visible={monthPickerVisible} transparent animationType="fade" onRequestClose={() => setMonthPickerVisible(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard} testID="calendar-month-year-picker">
            <View style={styles.pickerHeader}><Text style={styles.pickerTitle}>{t("calendar.selectMonth")}</Text><Pressable onPress={() => setMonthPickerVisible(false)} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurfaceTertiary} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.pickerYears} horizontal showsHorizontalScrollIndicator={false}>{pickerYears.map((year) => <View key={year} style={styles.pickerYearColumn}><Text style={styles.pickerYear}>{year}</Text>{Array.from({ length: 12 }, (_, index) => <Pressable key={index} style={[styles.pickerMonth, currentMonth.getFullYear() === year && currentMonth.getMonth() === index && styles.pickerMonthActive]} onPress={() => selectMonth(index, year)}><Text style={[styles.pickerMonthText, currentMonth.getFullYear() === year && currentMonth.getMonth() === index && styles.pickerMonthTextActive]}>{new Intl.DateTimeFormat(getCurrentLocale(), { month: "long" }).format(new Date(year, index, 1))}</Text></Pressable>)}</View>)}</ScrollView>
          </View>
        </View>
      </Modal>
      <PostVisitFeedbackModal visible={feedbackNote !== null} note={feedbackNote} isClient={!isBroker} userId={userId} clientName={feedbackNote?.clientName ?? ""} propertyId={feedbackNote?.apartmentId} clientId={isBroker ? feedbackNote?.clientId : userId} profileId={feedbackNote?.brokerId && (isBroker ? feedbackNote?.clientId : userId) ? `${feedbackNote.brokerId}_${isBroker ? feedbackNote.clientId : userId}` : undefined} listingPrice={feedbackNote?.apartmentPrice} onClose={() => setFeedbackNote(null)} onSaved={() => { if (!feedbackNote) return; setNotes((current) => current.map((note) => note.id === feedbackNote.id ? { ...note, feedbackSubmittedBy: { ...(note.feedbackSubmittedBy ?? {}), [userId]: true } } : note)); setFeedbackNote(null); }} />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.md, gap: spacing.sm },
    monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
    monthTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    monthYearPillButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    monthYearPillText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    weekdayRow: { flexDirection: "row" },
    weekday: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    dayCellMuted: { backgroundColor: colors.surface },
    dayCellSelected: { backgroundColor: colors.brandTertiary },
    dayNumber: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    dayNumberMuted: { color: colors.onSurfaceTertiary },
    dayNumberSelected: { fontFamily: fonts.bold, color: colors.brand },
    noteDots: { flexDirection: "row", gap: 3, marginTop: 4 },
    noteDot: { width: 5, height: 5, borderRadius: 3 },
    agendaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
    agendaTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    addButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
    addButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
    loading: { marginTop: spacing.lg },
    emptyText: { paddingVertical: spacing.lg, textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    weekNotesContainer: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
    agenda: { flexGrow: 0 },
    agendaContent: { gap: spacing.xs, paddingBottom: spacing.xs },
    noteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
    noteMarker: { width: 8, height: 32, borderRadius: 4 },
    noteText: { flex: 1, gap: 2 },
    noteTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
    noteMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    feedbackCallout: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    feedbackCalloutCopy: { flex: 1, gap: spacing.xs },
    feedbackCalloutText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    feedbackCalloutAction: { alignSelf: "flex-start", fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
    pickerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    pickerCard: { width: "100%", maxWidth: 460, maxHeight: "82%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pickerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    pickerYears: { gap: spacing.md },
    pickerYearColumn: { width: 132, gap: spacing.xs },
    pickerYear: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center", marginBottom: spacing.xs },
    pickerMonth: { minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
    pickerMonthActive: { backgroundColor: colors.brand },
    pickerMonthText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    pickerMonthTextActive: { color: colors.onBrand },
  });
}
