import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { BackHandler, Text, View, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
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
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { getBrokerClientProfiles } from "@/src/api/brokerClientProfiles";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

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

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(date: Date): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    start: formatDateKey(firstDay),
    end: formatDateKey(lastDay),
  };
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
    return getMonthRange(date);
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
  currentDate,
  calendarViewMode,
  onCalendarViewModeChange,
  onSelectDate,
  onAddNotePress,
  onEditNotePress,
  onToggleNoteDone,
  onNavigate,
  bottomInset,
  visibleNotes,
  isLoading,
}: {
  colors: ThemeColors;
  currentDate: Date;
  calendarViewMode: CalendarViewMode;
  onCalendarViewModeChange: (mode: CalendarViewMode) => void;
  onSelectDate: (nextDate: Date) => void;
  onAddNotePress: (selectedDate: string) => void;
  onEditNotePress: (note: BrokerNote) => void;
  onToggleNoteDone: (note: BrokerNote) => void;
  onNavigate: (direction: -1 | 1) => void;
  bottomInset: number;
  visibleNotes: BrokerNote[];
  isLoading: boolean;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
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

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch().onEnd((event) => {
        if (event.scale > 1.1) {
          if (calendarViewMode === "month") {
            runOnJS(onCalendarViewModeChange)("week");
          } else if (calendarViewMode === "week") {
            runOnJS(onCalendarViewModeChange)("day");
          }
        } else if (event.scale < 0.9) {
          if (calendarViewMode === "day") {
            runOnJS(onCalendarViewModeChange)("week");
          } else if (calendarViewMode === "week") {
            runOnJS(onCalendarViewModeChange)("month");
          }
        }
      }),
    [calendarViewMode, onCalendarViewModeChange],
  );

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (calendarViewMode === "month" && Math.abs(event.translationX) >= 56) {
            runOnJS(onNavigate)(event.translationX < 0 ? 1 : -1);
          }
        }),
    [calendarViewMode, onNavigate],
  );

  const calendarGesture = useMemo(() => Gesture.Simultaneous(pinchGesture, swipeGesture), [pinchGesture, swipeGesture]);

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
    const isPast = note.date < formatDateKey(today);
    const textColor = note.done ? colors.onBrandTertiary : colors.onSurface;

    return (
      <Pressable
        key={note.id}
        disabled={isPast}
        onPress={(event) => {
          event.stopPropagation();
          onEditNotePress(note);
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
        </View>
        {renderDoneButton(note, isPast)}
      </Pressable>
    );
  };

  const renderCompactNoteCard = (note: BrokerNote, width: DimensionValue, visibleFields: string[]) => {
    const isPast = note.date < formatDateKey(today);
    const textColor = note.done ? colors.onBrandTertiary : colors.onSurface;
    const compactTextStyle = { color: textColor, textDecorationLine: note.done ? "line-through" as const : "none" as const };

    return (
      <Pressable
        key={note.id}
        disabled={isPast}
        onPress={(event) => {
          event.stopPropagation();
          onEditNotePress(note);
        }}
        style={({ pressed }) => [styles.noteCard, styles.compactNoteCard, { width, backgroundColor: note.done ? colors.brandTertiary : noteCategoryColorMap[note.category] ?? colors.surfaceSecondary, borderColor: note.done ? colors.onBrandTertiary : colors.border, opacity: isPast ? 0.6 : pressed ? 0.82 : 1 }]}
      >
        <View style={styles.noteDetails}>
          {visibleFields.includes("time") ? <Text style={[styles.notePrimaryText, compactTextStyle]} numberOfLines={1}>{note.time || "--:--"}</Text> : null}
          {visibleFields.includes("apartment") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.apartmentTitle || "-"}</Text> : null}
          {visibleFields.includes("client") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.clientName || "-"}</Text> : null}
          {visibleFields.includes("apartmentOrClient") ? <Text style={[styles.noteSecondaryText, compactTextStyle]} numberOfLines={1}>{note.apartmentTitle || note.clientName || "-"}</Text> : null}
          {visibleFields.includes("timeOrTitle") ? <Text style={[styles.notePrimaryText, compactTextStyle]} numberOfLines={1}>{note.time || note.apartmentTitle || "--:--"}</Text> : null}
        </View>
        {renderDoneButton(note, isPast)}
      </Pressable>
    );
  };

  const renderDayAgenda = (date: Date, notes: BrokerNote[], showFullTitle: boolean) => {
    const dateKey = formatDateKey(date);
    const isPast = date < today;
    const dayLabel = `${FULL_WEEKDAY_LABELS[(date.getDay() + 6) % 7]}, ${date.getDate()} ${GREEK_MONTHS_GENITIVE[date.getMonth()]}`;

    return (
      <Pressable
        disabled={showFullTitle || isPast}
        onPress={() => onSelectDate(date)}
        style={[styles.dayViewCard, { backgroundColor: colors.surface, borderColor: isPast ? colors.muted : colors.border, opacity: isPast ? 0.62 : 1 }]}
      >
        <Text style={[styles.dayViewTitle, { color: colors.onSurface }]}>{showFullTitle ? "Ημερήσιο πλάνο" : dayLabel}</Text>
        {showFullTitle ? <Text style={[styles.dayViewSubtitle, { color: colors.onSurfaceTertiary }]}>{dayLabel}</Text> : null}
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
    const isPastWeek = endOfWeek(currentDate) < today;
    const showArchiveBanner = calendarViewMode === "day" ? currentDate < today : isPastWeek;
    const archiveBanner = showArchiveBanner ? (
      <View style={[styles.archiveBanner, { backgroundColor: colors.surfaceTertiary, borderColor: colors.muted }]}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.onBrandTertiary} />
        <Text style={[styles.archiveBannerText, { color: colors.onBrandTertiary }]}>Προβολή ιστορικού: Οι σημειώσεις παρελθόντων ημερών είναι αρχειοθετημένες και μη επεξεργάσιμες</Text>
      </View>
    ) : null;

    return (
      <ScrollView
        style={styles.agendaScroll}
        contentContainerStyle={[styles.agendaContent, { paddingBottom: bottomInset + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        {archiveBanner}
        {calendarViewMode === "day" ? renderDayAgenda(currentDate, selectedDayNotes, true) : weekAgendaDays.map((cell) => renderDayAgenda(cell.date, notesByDate.get(cell.dateKey) ?? [], false))}
        {calendarViewMode === "week" && weekAgendaDays.length === 0 ? <View style={styles.emptyStateWrap}><Text style={[styles.emptyStateText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν σημειώσεις αυτήν την εβδομάδα.</Text></View> : null}
      </ScrollView>
    );
  };

  return (
    <GestureDetector gesture={calendarGesture}>
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
                    const isPastDay = cell.date < today;
                    const isSelected = cell.dateKey === selectedDayKey;
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
                            borderColor: isSelected ? "#FFFFFF" : colors.border,
                            opacity: isPastDay ? 0.45 : cell.inCurrentMonth ? 1 : 0.55,
                            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
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
              const isPastDay = cell.date < today;
              const isSelected = cell.dateKey === selectedDayKey;
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
                      borderColor: isSelected ? "#FFFFFF" : colors.border,
                      opacity: isPastDay ? 0.45 : 1,
                      borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
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
    </GestureDetector>
  );
}

export default function CalendarScreen() {
  const auth = useAuth();
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
      <View style={styles.calendarModuleContainer}>
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
          currentDate={currentDate}
          calendarViewMode={calendarViewMode}
          onCalendarViewModeChange={setCalendarViewMode}
          onSelectDate={setCurrentDate}
          onAddNotePress={openCreateNoteModal}
          onEditNotePress={openEditNoteModal}
          onToggleNoteDone={handleToggleNoteDone}
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
    minHeight: 320,
    position: "relative",
    width: "100%",
  },
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
    marginBottom: spacing.sm,
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
    gap: spacing.md,
    overflow: "hidden",
  },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
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
