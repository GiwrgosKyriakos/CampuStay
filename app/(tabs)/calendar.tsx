import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BackHandler, Text, View, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { runOnJS } from "react-native-reanimated";

import {
  calculateGridLayout,
  getBrokerNotesByDateRange,
  getMostFrequentCategoryColor,
  noteCategoryColorMap,
  updateBrokerNote,
  type BrokerNote,
} from "@/src/api/brokerCalendar";
import BrokerNoteModal, { type BrokerClientItem, type BrokerListingItem } from "@/src/components/BrokerNoteModal";
import SignContractModal from "@/src/components/SignContractModal";
import PostVisitFeedbackModal from "@/src/components/calendar/PostVisitFeedbackModal";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { getBrokerClientProfiles } from "@/src/api/brokerClientProfiles";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import type { ContractDraftContext } from "@/src/types/esignature";
import { getCalendarNoteDate } from "@/src/utils/calendarNoteReminders";
import { cancelScheduledNotification, schedulePostVisitFeedbackReminder } from "@/src/utils/notificationService";

type CalendarViewMode = "month" | "week" | "day";
const WEEKDAY_LABELS = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"] as const;
const FULL_WEEKDAY_LABELS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"] as const;
const GREEK_MONTHS = [
  "Ιανουάριος",
  "Φεβρουάριος",
  "Μάρτιος",
  "Απρίλιος",
  "Μάιος",
  "Ιούνιος",
  "Ιούλιος",
  "Αύγουστος",
  "Σεπτέμβριος",
  "Οκτώβριος",
  "Νοέμβριος",
  "Δεκέμβριος",
] as const;
const GREEK_MONTHS_GENITIVE = [
  "Ιανουαρίου",
  "Φεβρουαρίου",
  "Μαρτίου",
  "Απριλίου",
  "Μαΐου",
  "Ιουνίου",
  "Ιουλίου",
  "Αυγούστου",
  "Σεπτεμβρίου",
  "Οκτωβρίου",
  "Νοεμβρίου",
  "Δεκεμβρίου",
] as const;

interface CalendarCell {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
}

interface CalendarWeek {
  index: number;
  cells: CalendarCell[];
}

type FirestoreApartmentDoc = {
  title?: string;
  rent?: number;
  price?: number;
  status?: string;
  rentedToUserId?: string;
};

let memoryNotesCache: Record<string, BrokerNote[]> = {};

function shiftDateByCalendarView(baseDate: Date, mode: CalendarViewMode, direction: -1 | 1): Date {
  const next = new Date(baseDate);

  if (mode === "month") {
    const targetMonth = next.getMonth() + direction;
    const monthBase = new Date(next.getFullYear(), targetMonth, 1);
    const maxDay = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
    monthBase.setDate(Math.min(next.getDate(), maxDay));
    return monthBase;
  }

  if (mode === "week") {
    next.setDate(next.getDate() + 7 * direction);
    return next;
  }

  next.setDate(next.getDate() + direction);
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getTimeInMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseNoteTimeInMinutes(time?: string): number | null {
  if (!time) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function compareNoteTime(a?: string, b?: string): number {
  const aMinutes = parseNoteTimeInMinutes(a);
  const bMinutes = parseNoteTimeInMinutes(b);

  if (aMinutes === null && bMinutes === null) return 0;
  if (aMinutes === null) return 1;
  if (bMinutes === null) return -1;
  return aMinutes - bMinutes;
}

function isDateArchived(date: Date, now: Date): boolean {
  const dateDay = startOfDay(date);
  const today = startOfDay(now);

  if (dateDay >= today) {
    return false;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return dateDay.getTime() !== yesterday.getTime() || getTimeInMinutes(now) >= 10 * 60;
}

function getFullDayLabel(date: Date): string {
  return `${FULL_WEEKDAY_LABELS[(date.getDay() + 6) % 7]}, ${date.getDate()} ${GREEK_MONTHS_GENITIVE[date.getMonth()]}`;
}

function getRelativeDayLabel(date: Date, today: Date): string {
  const dateKey = formatDateKey(date);
  const todayKey = formatDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateKey === todayKey) return "Σήμερα";
  if (dateKey === formatDateKey(yesterday)) return "Χθες";
  return getFullDayLabel(date);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return startOfDay(result);
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return startOfDay(end);
}

function getVisibleRange(date: Date, mode: CalendarViewMode): { start: string; end: string } {
  if (mode === "month") {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const today = startOfDay(new Date());
    const upcomingHorizon = new Date(today);
    upcomingHorizon.setFullYear(upcomingHorizon.getFullYear() + 1);
    const monthHorizon = new Date(monthEnd);
    monthHorizon.setFullYear(monthHorizon.getFullYear() + 1);

    return {
      start: formatDateKey(monthStart < today ? monthStart : today),
      end: formatDateKey(monthHorizon > upcomingHorizon ? monthHorizon : upcomingHorizon),
    };
  }
  if (mode === "week") {
    return {
      start: formatDateKey(startOfWeek(date)),
      end: formatDateKey(endOfWeek(date)),
    };
  }

  const dayKey = formatDateKey(date);
  return { start: dayKey, end: dayKey };
}

function getHeaderTitleForCalendarMode(date: Date, mode: CalendarViewMode): string {
  if (mode === "month") {
    return `${GREEK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  if (mode === "week") {
    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);
    const sameMonth =
      weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear();

    if (sameMonth) {
      return `${weekStart.getDate()}η - ${weekEnd.getDate()}η ${GREEK_MONTHS_GENITIVE[weekEnd.getMonth()]}`;
    }

    return `${weekStart.getDate()} ${GREEK_MONTHS_GENITIVE[weekStart.getMonth()]} - ${weekEnd.getDate()} ${GREEK_MONTHS_GENITIVE[weekEnd.getMonth()]}`;
  }

  return `${date.getDate()} ${GREEK_MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

function buildMonthWeeks(date: Date): CalendarWeek[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayFirstOffset = (firstOfMonth.getDay() + 6) % 7;
  const totalCells = mondayFirstOffset + daysInMonth;
  const weekCount = totalCells <= 35 ? 5 : 6;
  const gridStart = new Date(year, month, 1 - mondayFirstOffset);

  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const cells: CalendarCell[] = Array.from({ length: 7 }, (_, dayIndex) => {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
      return {
        date: cellDate,
        dateKey: formatDateKey(cellDate),
        dayOfMonth: cellDate.getDate(),
        inCurrentMonth: cellDate.getMonth() === month,
      };
    });

    return {
      index: weekIndex,
      cells,
    };
  });
}

function CalendarView({
  colors,
  userId,
  currentDate,
  calendarViewMode,
  onCalendarViewModeChange,
  onSelectDate,
  onAddNotePress,
  onEditNotePress,
  onToggleNoteDone,
  onFeedbackSaved,
  onClientPress,
  onSignViewingOrder,
  onNavigate,
  bottomInset,
  visibleNotes,
  isLoading,
}: {
  colors: ThemeColors;
  userId: string;
  currentDate: Date;
  calendarViewMode: CalendarViewMode;
  onCalendarViewModeChange: (mode: CalendarViewMode) => void;
  onSelectDate: (nextDate: Date) => void;
  onAddNotePress: (selectedDate: string) => void;
  onEditNotePress: (note: BrokerNote) => void;
  onToggleNoteDone: (note: BrokerNote) => void;
  onFeedbackSaved: (noteId: string) => void;
  onClientPress: (note: BrokerNote) => void;
  onSignViewingOrder: (note: BrokerNote) => void;
  onNavigate: (direction: -1 | 1) => void;
  bottomInset: number;
  visibleNotes: BrokerNote[];
  isLoading: boolean;
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const today = useMemo(() => startOfDay(currentTime), [currentTime]);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const selectedDayKey = useMemo(() => formatDateKey(currentDate), [currentDate]);
  const weeks = useMemo(() => buildMonthWeeks(currentDate), [currentDate]);
  const currentWeekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const currentMonth = currentDate.getMonth();
  const currentWeekCells = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const cellDate = new Date(currentWeekStart);
        cellDate.setDate(currentWeekStart.getDate() + index);
        return {
          date: cellDate,
          dateKey: formatDateKey(cellDate),
          dayOfMonth: cellDate.getDate(),
          inCurrentMonth: cellDate.getMonth() === currentMonth,
        };
      }),
    [currentMonth, currentWeekStart],
  );
  const notesByDate = useMemo(() => {
    const grouped = new Map<string, BrokerNote[]>();
    for (const note of visibleNotes) {
      const existing = grouped.get(note.date);
      if (existing) {
        existing.push(note);
      } else {
        grouped.set(note.date, [note]);
      }
    }
    return grouped;
  }, [visibleNotes]);

  const selectedDayNotes = useMemo(() => notesByDate.get(selectedDayKey) ?? [], [notesByDate, selectedDayKey]);
  const [feedbackNote, setFeedbackNote] = useState<BrokerNote | null>(null);
  const pendingFeedbackNotes = useMemo(
    () => visibleNotes.filter((note) => {
      if (note.category !== "showing" || !note.apartmentId || note.feedbackSubmittedBy?.[userId]) return false;
      if (note.done || note.isCompleted) return true;
      const visitDate = getCalendarNoteDate(note.scheduledDate ?? note.date, note.scheduledTime ?? note.time, note.timestamp);
      return !!visitDate && currentTime.getTime() >= visitDate.getTime() + 2 * 60 * 60 * 1000;
    }),
    [currentTime, userId, visibleNotes],
  );
  useEffect(() => {
    visibleNotes.forEach((note) => {
      if (note.category !== "showing" || !note.apartmentId || note.feedbackSubmittedBy?.[userId]) return;
      if (note.done || note.isCompleted) {
        void cancelScheduledNotification(note.reminderNotificationId);
        return;
      }
      const visitDate = getCalendarNoteDate(note.scheduledDate ?? note.date, note.scheduledTime ?? note.time, note.timestamp);
      if (visitDate) void schedulePostVisitFeedbackReminder({ noteId: note.id, apartmentTitle: note.apartmentTitle ?? "το διαμέρισμα", scheduledAt: visitDate });
    });
  }, [userId, visibleNotes]);
  const nextUpNote = useMemo(() => {
    const currentMinutes = getTimeInMinutes(currentTime);
    const upcomingNotes = visibleNotes
      .filter((note) => !note.done && note.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || compareNoteTime(a.time, b.time));
    const todayNote = upcomingNotes.find((note) => {
      if (note.date !== todayKey) return false;
      const noteMinutes = parseNoteTimeInMinutes(note.time);
      return noteMinutes !== null && noteMinutes >= currentMinutes;
    });

    return todayNote ?? upcomingNotes.find((note) => note.date > todayKey) ?? null;
  }, [currentTime, todayKey, visibleNotes]);
  const isArchivedDate = useCallback((date: Date) => isDateArchived(date, currentTime), [currentTime]);
  const weekAgendaDays = useMemo(
    () => currentWeekCells.filter((cell) => (notesByDate.get(cell.dateKey) ?? []).length > 0),
    [currentWeekCells, notesByDate],
  );
  const brandPrimaryColor = useMemo(() => {
    const withLegacyKey = colors as unknown as { brandPrimary?: string; brand?: string };
    return withLegacyKey.brandPrimary ?? withLegacyKey.brand ?? "#E07A2F";
  }, [colors]);

  const handleDaySelect = useCallback(
    (date: Date) => {
      onSelectDate(date);
      onCalendarViewModeChange("day");
    },
    [onCalendarViewModeChange, onSelectDate],
  );

  const handleWeekSelect = useCallback(
    (weekDate: Date) => {
      onSelectDate(weekDate);
      onCalendarViewModeChange("week");
    },
    [onCalendarViewModeChange, onSelectDate],
  );

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) >= 56) {
            runOnJS(onNavigate)(event.translationX < 0 ? 1 : -1);
          }
        }),
    [onNavigate],
  );

  const renderDoneButton = (note: BrokerNote, isPast: boolean) => (
    <Pressable
      accessibilityLabel={note.done ? "Επισήμανση ως εκκρεμές" : "Επισήμανση ως ολοκληρωμένο"}
      disabled={isPast}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        onToggleNoteDone(note);
      }}
      style={[styles.doneButton, { backgroundColor: note.done ? colors.brand : "transparent", borderColor: note.done ? colors.brand : "#FFFFFF" }]}
    >
      <Ionicons name={note.done ? "checkmark" : "checkmark-outline"} size={20} color={note.done ? colors.onBrand : "#FFFFFF"} />
    </Pressable>
  );

  const renderExpandedNoteCard = (note: BrokerNote) => {
    const isPast = isArchivedDate(new Date(`${note.date}T00:00:00`));
    const textColor = note.done ? colors.onBrandTertiary : colors.onSurface;

    return (
      <Pressable
        key={note.id}
        disabled={isPast}
        onPress={(event) => {
          event.stopPropagation();
          if (note.clientId || note.clientProfileId) onClientPress(note);
          else onEditNotePress(note);
        }}
        style={({ pressed }) => [
          styles.noteCard,
          {
            backgroundColor: note.done ? colors.brandTertiary : noteCategoryColorMap[note.category] ?? colors.surfaceSecondary,
            borderColor: note.done ? colors.onBrandTertiary : colors.border,
            opacity: isPast ? 0.6 : pressed ? 0.82 : 1,
          },
        ]}
      >
        <View style={styles.noteDetails}>
          <Text style={[styles.notePrimaryText, { color: textColor, textDecorationLine: note.done ? "line-through" : "none" }]}>
            Ώρα: {note.time || "--:--"}
          </Text>
          <Text style={[styles.noteSecondaryText, { color: textColor, textDecorationLine: note.done ? "line-through" : "none" }]}>
            Όνομα ακινήτου: {note.apartmentTitle || "-"}
          </Text>
          <Text style={[styles.noteSecondaryText, { color: textColor, textDecorationLine: note.done ? "line-through" : "none" }]}>
            Όνομα πελάτη: {note.clientName || "-"}
          </Text>
          {note.coveringBrokerId ? <Text style={[styles.coveringNoteBadge, { color: colors.brand }]} numberOfLines={1}>Κάλυψη Ραντεβού για {note.primaryBrokerName || "τον αρχικό μεσίτη"}</Text> : null}
        </View>
        <View style={styles.noteCardActions}>
          {note.apartmentId && note.clientId && (note.category === "showing" || note.category === "visit") ? (
            <Pressable
              accessibilityLabel={t("esign.signViewingOrder")}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onSignViewingOrder(note);
              }}
              style={styles.contractIconButton}
              testID={`calendar-note-sign-viewing-order-${note.id}`}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.brand} />
            </Pressable>
          ) : null}
          {renderDoneButton(note, isPast)}
        </View>
      </Pressable>
    );
  };

  const renderCompactNoteCard = (note: BrokerNote, width: DimensionValue, visibleFields: string[]) => {
    const isPast = isArchivedDate(new Date(`${note.date}T00:00:00`));
    const textColor = note.done ? colors.onBrandTertiary : colors.onSurface;
    const compactTextStyle = { color: textColor, textDecorationLine: note.done ? "line-through" as const : "none" as const };

    return (
      <Pressable
        key={note.id}
        disabled={isPast}
        onPress={(event) => {
          event.stopPropagation();
          if (note.clientId || note.clientProfileId) onClientPress(note);
          else onEditNotePress(note);
        }}
        style={({ pressed }) => [styles.noteCard, styles.compactNoteCard, { width, backgroundColor: note.done ? colors.brandTertiary : noteCategoryColorMap[note.category] ?? colors.surfaceSecondary, borderColor: note.done ? colors.onBrandTertiary : colors.border, opacity: isPast ? 0.6 : pressed ? 0.82 : 1 }]}
      >
        <View style={styles.noteDetails}>
          {visibleFields.includes("time") ? <Text style={[styles.notePrimaryText, compactTextStyle]} numberOfLines={1}>{note.time || "--:--"}</Text> : null}
          {visibleFields.includes("apartment") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.apartmentTitle || "-"}</Text> : null}
          {visibleFields.includes("client") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.clientName || "-"}</Text> : null}
          {visibleFields.includes("apartmentOrClient") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.apartmentTitle || note.clientName || "-"}</Text> : null}
          {visibleFields.includes("timeOrTitle") ? <Text style={[styles.notePrimaryText, compactTextStyle]} numberOfLines={1}>{note.time || note.apartmentTitle || "--:--"}</Text> : null}
          {note.coveringBrokerId && visibleFields.includes("timeOrTitle") ? <Text style={[styles.coveringNoteBadge, { color: colors.brand }]} numberOfLines={1}>Κάλυψη Ραντεβού</Text> : null}
        </View>
        <View style={styles.noteCardActions}>
          {note.apartmentId && note.clientId && (note.category === "showing" || note.category === "visit") ? (
            <Pressable
              accessibilityLabel={t("esign.signViewingOrder")}
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation();
                onSignViewingOrder(note);
              }}
              style={styles.contractIconButton}
              testID={`calendar-note-sign-viewing-order-compact-${note.id}`}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.brand} />
            </Pressable>
          ) : null}
          {renderDoneButton(note, isPast)}
        </View>
      </Pressable>
    );
  };

  const renderDayAgenda = (date: Date, notes: BrokerNote[], showFullTitle: boolean) => {
    const dateKey = formatDateKey(date);
    const isPast = isArchivedDate(date);
    const dayLabel = getRelativeDayLabel(date, today);
    const fullDayLabel = getFullDayLabel(date);

    return (
      <Pressable
        disabled={showFullTitle || isPast}
        onPress={() => onSelectDate(date)}
        style={[styles.dayViewCard, { backgroundColor: colors.surface, borderColor: isPast ? colors.muted : colors.border, opacity: isPast ? 0.62 : 1 }]}
      >
        <View style={styles.dayViewHeaderRow}>
          <Text style={[styles.dayViewTitle, { color: colors.onSurface }]}>{dayLabel}</Text>
          <Pressable
            accessibilityLabel={showFullTitle ? "Σμίκρυνση σε εβδομάδα" : "Μεγέθυνση σε ημέρα"}
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              if (showFullTitle) {
                onSelectDate(startOfWeek(date));
                onCalendarViewModeChange("week");
              } else {
                onSelectDate(date);
                onCalendarViewModeChange("day");
              }
            }}
            style={[styles.zoomButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name={showFullTitle ? "contract-outline" : "expand-outline"} size={19} color={colors.onSurface} />
          </Pressable>
        </View>
        {showFullTitle ? <Text style={[styles.dayViewSubtitle, { color: colors.onSurfaceTertiary }]}>{fullDayLabel}</Text> : null}
        {notes.length === 0 ? (
          <View style={styles.emptyStateWrap}>
            <Text style={[styles.emptyStateText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν σημειώσεις για αυτήν την ημέρα.</Text>
          </View>
        ) : showFullTitle ? (
          <View style={styles.noteList}>{[...notes].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")).map(renderExpandedNoteCard)}</View>
        ) : (
          (() => {
            const layout = calculateGridLayout(notes, false, "");
            const cardWidth = `${100 / layout.columnCount}%` as DimensionValue;
            return <View style={styles.noteGrid}>{layout.notes.map((note) => renderCompactNoteCard(note, cardWidth, layout.visibleFields))}</View>;
          })()
        )}
        {!isPast ? (
          <Pressable
            style={[styles.addNoteRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            onPress={(event) => {
              event.stopPropagation();
              onAddNotePress(dateKey);
            }}
          >
            <Ionicons name="add-circle" size={28} color={brandPrimaryColor} />
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  const renderAgenda = () => {
    const isPastWeek = isArchivedDate(endOfWeek(currentDate));
    const showArchiveBanner = calendarViewMode === "day" ? isArchivedDate(currentDate) : isPastWeek;
    const archiveBanner = showArchiveBanner ? (
      <View style={[styles.archiveBanner, { backgroundColor: colors.surfaceTertiary, borderColor: colors.muted }]}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.onBrandTertiary} />
        <Text style={[styles.archiveBannerText, { color: colors.onBrandTertiary }]}>Προβολή ιστορικού: Οι σημειώσεις παρελθόντων ημερών είναι αρχειοθετημένες και μη επεξεργάσιμες</Text>
      </View>
    ) : null;

    return (
      <ScrollView
        style={styles.agendaScroll}
        contentContainerStyle={[
          styles.agendaContent,
          calendarViewMode === "week" ? { paddingBottom: bottomInset + 72 } : undefined,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {archiveBanner}
        {calendarViewMode === "day" ? renderDayAgenda(currentDate, selectedDayNotes, true) : calendarViewMode === "week" ? <View style={[styles.weekNotesContainer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>{weekAgendaDays.map((cell) => renderDayAgenda(cell.date, notesByDate.get(cell.dateKey) ?? [], false))}</View> : weekAgendaDays.map((cell) => renderDayAgenda(cell.date, notesByDate.get(cell.dateKey) ?? [], false))}
        {calendarViewMode === "week" && weekAgendaDays.length === 0 ? <View style={styles.emptyStateWrap}><Text style={[styles.emptyStateText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν σημειώσεις αυτήν την εβδομάδα.</Text></View> : null}
      </ScrollView>
    );
  };

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.calendarView}>
        <View style={[styles.monthCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        {(calendarViewMode === "month" || calendarViewMode === "week") ? (
          <View style={styles.calendarHeaderRow}>
            <View style={styles.weekBarTouchArea} />
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} style={styles.dayHeaderCell}>
                <Text style={[styles.dayHeaderText, { color: colors.onSurfaceTertiary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {calendarViewMode === "month"
          ? weeks.map((week) => {
              const isWeekActive = week.cells.some((cell) => cell.dateKey === selectedDayKey);

              return (
                <View key={`week-${week.index}`} style={styles.weekRow}>
                  <Pressable
                    style={styles.weekBarTouchArea}
                    onPress={() => handleWeekSelect(new Date(week.cells[0].date))}
                    hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                    testID={`broker-calendar-week-bar-${week.index}`}
                  >
                    <View
                      style={[
                        styles.weekVerticalBar,
                        isWeekActive ? styles.weekVerticalBarActive : styles.weekVerticalBarInactive,
                        { backgroundColor: isWeekActive ? colors.brand : colors.muted },
                      ]}
                    />
                  </Pressable>

                  {week.cells.map((cell) => {
                    const dayNotes = notesByDate.get(cell.dateKey) ?? [];
                    const dayTint = getMostFrequentCategoryColor(dayNotes);
                    const isPastDay = isArchivedDate(cell.date);
                    const isSelected = cell.dateKey === selectedDayKey;
                    const isToday = cell.dateKey === todayKey;
                    const hasNotes = dayNotes.length > 0;
                    const dotColor = hasNotes
                      ? noteCategoryColorMap[dayNotes[0].category] ?? colors.brand
                      : "transparent";

                    return (
                      <Pressable
                        key={cell.dateKey}
                        disabled={isPastDay}
                        onPress={() => handleDaySelect(new Date(cell.date))}
                        style={[
                          styles.dayCell,
                          {
                            backgroundColor: cell.inCurrentMonth && hasNotes ? dayTint : colors.surface,
                            borderColor: isToday ? "#FFFFFF" : colors.border,
                            opacity: isPastDay ? 0.45 : cell.inCurrentMonth ? 1 : 0.55,
                            borderWidth: isToday ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Text style={[styles.dayNumberText, { color: cell.inCurrentMonth ? colors.onSurface : colors.onSurfaceTertiary }]}>
                          {cell.dayOfMonth}
                        </Text>
                        {hasNotes ? <View style={[styles.noteIndicatorDot, { backgroundColor: dotColor }]} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          : null}

        {calendarViewMode === "week" ? (
          <View style={styles.weekRow}>
            <Pressable
              style={styles.weekBarTouchArea}
              onPress={() => handleWeekSelect(new Date(currentWeekCells[0].date))}
              hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
              testID="broker-calendar-week-bar-current"
            >
              <View style={[styles.weekVerticalBar, styles.weekVerticalBarActive, { backgroundColor: colors.brand }]} />
            </Pressable>

            {currentWeekCells.map((cell) => {
              const dayNotes = notesByDate.get(cell.dateKey) ?? [];
              const dayTint = getMostFrequentCategoryColor(dayNotes);
              const isPastDay = isArchivedDate(cell.date);
              const isSelected = cell.dateKey === selectedDayKey;
              const isToday = cell.dateKey === todayKey;
              const hasNotes = dayNotes.length > 0;
              const dotColor = hasNotes
                ? noteCategoryColorMap[dayNotes[0].category] ?? colors.brand
                : "transparent";

              return (
                <Pressable
                  key={`week-day-${cell.dateKey}`}
                  disabled={isPastDay}
                  onPress={() => handleDaySelect(new Date(cell.date))}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor: dayTint,
                      borderColor: isToday ? "#FFFFFF" : colors.border,
                      opacity: isPastDay ? 0.45 : 1,
                      borderWidth: isToday ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={[styles.dayNumberText, { color: colors.onSurface }]}>{cell.dayOfMonth}</Text>
                  {hasNotes ? <View style={[styles.noteIndicatorDot, { backgroundColor: dotColor }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {calendarViewMode === "week" || calendarViewMode === "day" ? renderAgenda() : null}

        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
        </View>

        {pendingFeedbackNotes.length > 0 ? <View style={[styles.feedbackCallout, { borderColor: colors.brand, backgroundColor: colors.brandTertiary }]} testID="broker-calendar-pending-feedback-callout"><Ionicons name="star-outline" size={22} color={colors.brand} /><View style={styles.feedbackCalloutCopy}><Text style={[styles.feedbackCalloutText, { color: colors.onSurface }]}>Σημείωση εκτίμησης & feedback για την υπόδειξη στο {pendingFeedbackNotes[0].apartmentTitle ?? "διαμέρισμα"}.</Text><Pressable onPress={() => setFeedbackNote(pendingFeedbackNotes[0])} testID="broker-calendar-open-feedback"><Text style={[styles.feedbackCalloutAction, { color: colors.brand }]}>Καταγραφή Feedback</Text></Pressable></View></View> : null}

        {calendarViewMode === "month" ? (
          <View style={[styles.todoCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={styles.nextUpSection}>
              <Text style={[styles.toDoTitle, { color: colors.onSurface }]}>
                To<Text style={{ color: colors.brand }}>Do</Text>
              </Text>
              {isLoading ? (
                <View style={styles.nextUpEmptyState}>
                  <ActivityIndicator size="small" color={colors.brand} />
                </View>
              ) : nextUpNote ? (
                renderExpandedNoteCard(nextUpNote)
              ) : (
                <View
                  style={[styles.nextUpEmptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.emptyStateText, { color: colors.onSurfaceTertiary }]}>Όλα τα tasks της ημέρας ολοκληρώθηκαν!</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
        <PostVisitFeedbackModal visible={feedbackNote !== null} note={feedbackNote} isClient={false} userId={userId} clientName={feedbackNote?.clientName ?? ""} propertyId={feedbackNote?.apartmentId} clientId={feedbackNote?.clientId} profileId={feedbackNote?.brokerId && feedbackNote?.clientId ? `${feedbackNote.brokerId}_${feedbackNote.clientId}` : undefined} listingPrice={feedbackNote?.apartmentPrice} onClose={() => setFeedbackNote(null)} onSaved={() => { if (!feedbackNote) return; onFeedbackSaved(feedbackNote.id); setFeedbackNote(null); }} />
      </View>
    </GestureDetector>
  );
}

export default function CalendarScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const visibleRange = useMemo(() => getVisibleRange(currentDate, calendarViewMode), [calendarViewMode, currentDate]);
  const initialNotesKey = `${visibleRange.start}_${visibleRange.end}`;
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [visibleNotes, setVisibleNotes] = useState<BrokerNote[]>(() => memoryNotesCache[initialNotesKey] ?? []);
  const [isVisibleNotesLoading, setIsVisibleNotesLoading] = useState(() => !memoryNotesCache[initialNotesKey]);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [noteModalDate, setNoteModalDate] = useState(() => formatDateKey(new Date()));
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState<BrokerNote | null>(null);
  const [completedNotePendingEdit, setCompletedNotePendingEdit] = useState<BrokerNote | null>(null);
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);

  const currentMonthIndex = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const brokerId = auth.user?.user_id ?? auth.userId ?? "";
  const headerTitle = useMemo(
    () => getHeaderTitleForCalendarMode(currentDate, calendarViewMode),
    [calendarViewMode, currentDate],
  );
  const yearRange = useMemo(() => Array.from({ length: 9 }, (_, index) => currentYear - 4 + index), [currentYear]);
  const [realListings, setRealListings] = useState<BrokerListingItem[]>([]);
  const [realClients, setRealClients] = useState<BrokerClientItem[]>([]);
  const [contractDraft, setContractDraft] = useState<ContractDraftContext | null>(null);
  useFocusEffect(
    useCallback(() => {
      setNotesRefreshToken((previous) => previous + 1);
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (calendarViewMode === "day") {
          setCurrentDate(startOfWeek(currentDate));
          setCalendarViewMode("week");
          return true;
        }

        if (calendarViewMode === "week") {
          setCalendarViewMode("month");
          return true;
        }

        return true;
      });

      return () => subscription.remove();
    }, [calendarViewMode, currentDate]),
  );

  useEffect(() => {
    let isMounted = true;

    const loadNotes = async () => {
      if (!brokerId) {
        return;
      }

      try {
        const rangeKey = `${visibleRange.start}_${visibleRange.end}`;
        if (!memoryNotesCache[rangeKey]) setIsVisibleNotesLoading(true);
        const notes = await getBrokerNotesByDateRange(brokerId, visibleRange.start, visibleRange.end);
        if (isMounted) {
          memoryNotesCache[rangeKey] = notes;
          setVisibleNotes(notes);
        }
      } catch {
        if (isMounted) {
          if (!memoryNotesCache[`${visibleRange.start}_${visibleRange.end}`]) setVisibleNotes([]);
        }
      } finally {
        if (isMounted) {
          setIsVisibleNotesLoading(false);
        }
      }
    };

    void loadNotes();
    return () => {
      isMounted = false;
    };
  }, [brokerId, notesRefreshToken, visibleRange.end, visibleRange.start]);

  useEffect(() => {
    let isMounted = true;

    const loadModalOptions = async () => {
      if (!brokerId) {
        if (isMounted) {
          setRealListings([]);
          setRealClients([]);
        }
        return;
      }

      try {
        const [ownedListingsSnapshot, assignedListingsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "apartments"), where("hostId", "==", brokerId))),
          getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", brokerId))),
        ]);
        const listingDocs = new Map(ownedListingsSnapshot.docs.map((docSnap) => [docSnap.id, docSnap]));
        assignedListingsSnapshot.docs.forEach((docSnap) => listingDocs.set(docSnap.id, docSnap));
        const listings = Array.from(listingDocs.values()).map((docSnap) => {
          const data = docSnap.data() as FirestoreApartmentDoc;
          return {
            id: docSnap.id,
            title: typeof data.title === "string" && data.title.trim().length > 0 ? data.title : "Διαμέρισμα",
            price: typeof data.price === "number" ? data.price : typeof data.rent === "number" ? data.rent : undefined,
          } satisfies BrokerListingItem;
        });

        const clients = (await getBrokerClientProfiles(brokerId))
          .filter((profile) => typeof profile.clientName === "string" && profile.clientName.trim().length > 0)
          .map((profile) => ({
            id: profile.clientId,
            name: profile.clientName!.trim(),
            apartmentIds: profile.apartmentIds ?? [],
            isActive: true,
          } satisfies BrokerClientItem));

        if (isMounted) {
          setRealListings(listings);
          setRealClients(clients);
        }
      } catch {
        if (isMounted) {
          setRealListings([]);
          setRealClients([]);
        }
      }
    };

    void loadModalOptions();
    return () => {
      isMounted = false;
    };
  }, [brokerId, notesRefreshToken]);

  const openCreateNoteModal = useCallback((selectedDate: string) => {
    setNoteModalDate(selectedDate);
    setSelectedNoteToEdit(null);
    setIsNoteModalVisible(true);
  }, []);

  const openNoteEditor = useCallback((note: BrokerNote) => {
    setSelectedNoteToEdit(note);
    setNoteModalDate(note.date);
    setIsNoteModalVisible(true);
  }, []);

  const openEditNoteModal = useCallback((note: BrokerNote) => {
    if (note.done) {
      setCompletedNotePendingEdit(note);
      return;
    }
    openNoteEditor(note);
  }, [openNoteEditor]);

  const closeNoteModal = useCallback(() => {
    setIsNoteModalVisible(false);
    setSelectedNoteToEdit(null);
  }, []);

  const closeCompletedNotePrompt = useCallback(() => {
    setCompletedNotePendingEdit(null);
  }, []);

  const openViewingOrder = useCallback((context: { apartmentId: string; clientId: string; apartmentTitle?: string; apartmentPrice?: number; clientName?: string; clientProfileId?: string }) => {
    if (!brokerId || !context.apartmentId || !context.clientId) return;
    setIsNoteModalVisible(false);
    setSelectedNoteToEdit(null);
    setContractDraft({
      agencyId: auth.agencyId ?? "",
      createdByUserId: brokerId,
      contractType: "viewing_order",
      title: t("esign.viewingOrder"),
      brokerId,
      clientId: context.clientId,
      clientProfileId: context.clientProfileId ?? `${brokerId}_${context.clientId}`,
      apartmentId: context.apartmentId,
      participantIds: [
        { id: brokerId, role: "broker" },
        { id: context.clientId, role: "client" },
      ],
      contractPayload: {
        ...(typeof context.apartmentPrice === "number" ? { monthlyRentOrPrice: context.apartmentPrice } : {}),
      },
    });
  }, [auth.agencyId, brokerId]);

  const openViewingOrderFromNote = useCallback((note: BrokerNote) => {
    if (!note.apartmentId || !note.clientId) return;
    openViewingOrder({
      apartmentId: note.apartmentId,
      clientId: note.clientId,
      apartmentTitle: note.apartmentTitle,
      apartmentPrice: note.apartmentPrice,
      clientName: note.clientName,
      clientProfileId: note.clientProfileId,
    });
  }, [openViewingOrder]);

  const handleNoteMutation = useCallback(() => {
    setNotesRefreshToken((prev) => prev + 1);
    setSelectedNoteToEdit(null);
  }, []);

  const handleToggleNoteDone = useCallback(
    async (note: BrokerNote) => {
      const nextDone = !note.done;
      const rangeKey = `${visibleRange.start}_${visibleRange.end}`;
      setVisibleNotes((previous) => {
        const next = previous.map((item) => (item.id === note.id ? { ...item, done: nextDone } : item));
        memoryNotesCache[rangeKey] = next;
        return next;
      });

      try {
        await updateBrokerNote(brokerId, note.id, { done: nextDone });
      } catch {
        setVisibleNotes((previous) => {
          const reverted = previous.map((item) => (item.id === note.id ? { ...item, done: note.done } : item));
          memoryNotesCache[rangeKey] = reverted;
          return reverted;
        });
      }
    },
    [brokerId, visibleRange.end, visibleRange.start],
  );

  const handleEditCompletedNote = useCallback(
    async (removeCompletion: boolean) => {
      const note = completedNotePendingEdit;
      if (!note) return;

      setCompletedNotePendingEdit(null);
      if (removeCompletion) {
        await handleToggleNoteDone(note);
        openNoteEditor({ ...note, done: false });
      } else {
        openNoteEditor(note);
      }
    },
    [completedNotePendingEdit, handleToggleNoteDone, openNoteEditor],
  );

  const goToPrevious = useCallback(() => {
    setCurrentDate((prev) => shiftDateByCalendarView(prev, calendarViewMode, -1));
  }, [calendarViewMode]);

  const goToNext = useCallback(() => {
    setCurrentDate((prev) => shiftDateByCalendarView(prev, calendarViewMode, 1));
  }, [calendarViewMode]);

  const openPicker = useCallback(() => {
    setSelectedYear(currentYear);
    setIsPickerVisible(true);
  }, [currentYear]);

  const closePicker = useCallback(() => {
    setIsPickerVisible(false);
  }, []);

  const handleYearSelection = useCallback((year: number) => {
    setSelectedYear(year);
  }, []);

  const handleMonthSelection = useCallback(
    (monthIndex: number) => {
      const nextDate = new Date(currentDate);
      nextDate.setFullYear(selectedYear);
      nextDate.setMonth(monthIndex);
      setCurrentDate(nextDate);
      setIsPickerVisible(false);
    },
    [currentDate, selectedYear],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.brandTitle, { color: colors.onSurface }]}>
            {t("common.brandPrefix")}<Text style={[styles.brandAccent, { color: colors.brand }]}>{t("common.brandSuffix")}</Text>
          </Text>
        </View>
      </View>
      <View style={[styles.calendarModuleContainer, { paddingBottom: insets.bottom + 72 }]}>
        <View style={[styles.calendarHeader, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Pressable style={styles.headerArrowButton} onPress={goToPrevious} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable style={styles.headerTitleButton} onPress={calendarViewMode === "month" ? openPicker : undefined}>
            <Text style={[styles.headerTitleText, { color: colors.onSurface }]}>{headerTitle}</Text>
          </Pressable>
          <Pressable style={styles.headerArrowButton} onPress={goToNext} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <CalendarView
          colors={colors}
          userId={brokerId}
          currentDate={currentDate}
          calendarViewMode={calendarViewMode}
          onCalendarViewModeChange={setCalendarViewMode}
          onSelectDate={setCurrentDate}
          onAddNotePress={openCreateNoteModal}
          onEditNotePress={openEditNoteModal}
          onToggleNoteDone={handleToggleNoteDone}
          onFeedbackSaved={(noteId) => setVisibleNotes((current) => current.map((note) => note.id === noteId ? { ...note, feedbackSubmittedBy: { ...(note.feedbackSubmittedBy ?? {}), [brokerId]: true } } : note))}
          onClientPress={(note) => {
            const clientId = note.clientId ?? (note.clientProfileId?.includes("_") ? note.clientProfileId.split("_").slice(1).join("_") : undefined);
            if (!clientId) return;
            router.push({ pathname: "/broker-client-detail", params: { profileId: note.clientProfileId ?? `${brokerId}_${clientId}`, clientUserId: clientId } });
          }}
          onSignViewingOrder={openViewingOrderFromNote}
          onNavigate={(direction) => setCurrentDate((previous) => shiftDateByCalendarView(previous, calendarViewMode, direction))}
          bottomInset={insets.bottom}
          visibleNotes={visibleNotes}
          isLoading={isVisibleNotesLoading}
        />
      </View>

      <Modal visible={isPickerVisible} transparent animationType="fade" onRequestClose={closePicker}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Επιλογή Μήνα και Έτους</Text>

            <View style={styles.modalBody}>
              <View style={styles.yearColumn}>
                <Text style={[styles.columnTitle, { color: colors.onSurfaceTertiary }]}>Έτος</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.yearScrollContent}>
                  {yearRange.map((year) => {
                    const active = year === selectedYear;
                    return (
                      <Pressable
                        key={year}
                        onPress={() => handleYearSelection(year)}
                        style={[
                          styles.yearItem,
                          {
                            backgroundColor: active ? colors.brand : colors.surfaceSecondary,
                          },
                        ]}
                      >
                        <Text style={[styles.yearItemText, { color: active ? colors.onBrand : colors.onSurface }]}>{year}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.monthColumn}>
                <Text style={[styles.columnTitle, { color: colors.onSurfaceTertiary }]}>Μήνας</Text>
                <View style={styles.monthGrid}>
                  {GREEK_MONTHS.map((monthLabel, monthIndex) => {
                    const isActive = monthIndex === currentMonthIndex && selectedYear === currentYear;
                    return (
                      <Pressable
                        key={monthLabel}
                        onPress={() => handleMonthSelection(monthIndex)}
                        style={[
                          styles.monthItem,
                          {
                            backgroundColor: isActive ? colors.brand : colors.surfaceSecondary,
                          },
                        ]}
                      >
                        <Text style={[styles.monthItemText, { color: isActive ? colors.onBrand : colors.onSurface }]}>
                          {monthLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <CenteredActionModal
        visible={completedNotePendingEdit !== null}
        title="Η σημείωση έχει ολοκληρωθεί"
        description="Θέλετε αφαιρέσετε ή να διατηρήσετε την ένδειξη ολοκλήρωσης πριν ανοίξετε την επεξεργασία;"
        onDismiss={closeCompletedNotePrompt}
        actions={[
          {
            label: "Αφαίρεση και επεξεργασία",
            iconName: "create-outline",
            onPress: () => void handleEditCompletedNote(true),
            variant: "solid",
          },
          {
            label: "Διατήρηση και επεξεργασία",
            iconName: "checkmark-circle-outline",
            onPress: () => void handleEditCompletedNote(false),
            variant: "outline",
          },
          {
            label: "Ακύρωση",
            iconName: "close-outline",
            onPress: closeCompletedNotePrompt,
            variant: "muted",
          },
        ]}
      />

      <BrokerNoteModal
        visible={isNoteModalVisible}
        brokerId={brokerId}
        date={noteModalDate}
        listings={realListings}
        clients={realClients}
        note={selectedNoteToEdit}
        onClose={closeNoteModal}
        onSaved={handleNoteMutation}
        onUpdated={handleNoteMutation}
        onDeleted={handleNoteMutation}
        onSignViewingOrder={openViewingOrder}
      />
      <SignContractModal
        visible={contractDraft !== null}
        draft={contractDraft ?? undefined}
        signerId={brokerId}
        onClose={() => setContractDraft(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  calendarHeader: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  headerArrowButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  headerTitleButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  headerTitleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
  },
  pagerViewport: {
    flex: 1,
    overflow: "hidden",
  },
  pagerTrack: {
    flex: 1,
    flexDirection: "row",
  },
  page: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  calendarModuleContainer: {
    marginHorizontal: spacing.lg,
    justifyContent: "center",
    gap: spacing.sm,
  },
  calendarView: {
    width: "100%",
    gap: spacing.lg,
  },
  clientsPanelWrap: {
    flex: 1,
    width: "100%",
  },
  clientListContent: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  clientCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%",
  },
  clientCardName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
  },
  clientCardMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
  },
  clientStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  forecastCard: { padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  forecastSubtitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  forecastMetric: { marginTop: spacing.xs, fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"] },
  forecastExplanation: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm },
  pipelineBadgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  pipelineBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, fontFamily: fonts.bold },
  weightedBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, fontFamily: fonts.bold },
  statusBadge: {
    minHeight: 30,
    minWidth: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  statusBadgeText: {
    fontSize: 15,
  },
  monthCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    width: "100%",
  },
  todoCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    width: "100%",
  },
  feedbackCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  feedbackCalloutCopy: { flex: 1, gap: spacing.xs },
  feedbackCalloutText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  feedbackCalloutAction: { alignSelf: "flex-start", fontFamily: fonts.bold, fontSize: fontSize.sm },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTopRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  brandTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], includeFontPadding: false },
  brandAccent: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], includeFontPadding: false },
  weekBarTouchArea: {
    width: 14,
    height: 42,
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHeaderText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    marginBottom: 4,
  },
  weekVerticalBar: {
    width: 4,
    height: 24,
    borderRadius: radius.pill,
  },
  weekVerticalBarActive: {
    width: 5,
    height: 30,
    opacity: 1,
  },
  weekVerticalBarInactive: {
    opacity: 0.35,
  },
  dayCell: {
    flex: 1,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 1,
  },
  dayNumberText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  nextUpSection: {
    width: "100%",
  },
  nextUpTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    marginBottom: spacing.sm,
  },
  toDoTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize.xl,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  nextUpEmptyState: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  dayViewCard: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  dayViewTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
    flex: 1,
  },
  dayViewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  zoomButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dayViewSubtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  agendaScroll: {
    maxHeight: 520,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  agendaContent: {
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    overflow: "hidden",
  },
  weekNotesContainer: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  archiveBannerText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
  noteList: {
    gap: spacing.sm,
  },
  noteDetails: {
    flex: 1,
  },
  noteCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  contractIconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(7,64,76,0.2)",
  },
  doneButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  noteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.sm,
  },
  addNoteRow: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 52,
    marginBottom: spacing.xs,
  },
  compactNoteCard: {
    minHeight: 52,
  },
  noteIndicatorDot: {
    position: "absolute",
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  notePrimaryText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
  noteSecondaryText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  coveringNoteBadge: { fontFamily: fonts.semibold, fontSize: fontSize.xs, marginTop: 3 },
  emptyStateWrap: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pageCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.xl,
    textAlign: "center",
  },
  pageSubtitle: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    marginBottom: spacing.md,
  },
  modalBody: {
    flexDirection: "row",
    gap: spacing.md,
  },
  yearColumn: {
    width: 110,
  },
  monthColumn: {
    flex: 1,
  },
  columnTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  yearScrollContent: {
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  yearItem: {
    borderRadius: radius.md,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  yearItemText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  monthItem: {
    width: "48%",
    minHeight: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  monthItemText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
});
