import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View, StyleSheet, Pressable, useWindowDimensions, Modal, ScrollView, ActivityIndicator, FlatList, DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  calculateGridLayout,
  getBrokerNotesByDateRange,
  getMostFrequentCategoryColor,
  noteCategoryColorMap,
  type BrokerNote,
} from "@/src/api/brokerCalendar";
import BrokerNoteModal, { type BrokerClientItem, type BrokerListingItem } from "@/src/components/BrokerNoteModal";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { getPipelineStageConfig, type PipelineStageKey } from "@/src/constants/pipeline";

type BrokerMode = "calendar" | "pipeline";
type CalendarViewMode = "month" | "week" | "day";

const SWIPE_THRESHOLD_RATIO = 0.25;
const SWIPE_VELOCITY_THRESHOLD = 700;
const WEEKDAY_LABELS = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"] as const;
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
  label: string;
  cells: CalendarCell[];
}

type FirestoreApartmentDoc = {
  title?: string;
  rent?: number;
  price?: number;
  status?: string;
  rentedToUserId?: string;
};

type FirestoreChatDoc = {
  users?: unknown;
  type?: unknown;
  apartmentId?: unknown;
  apartmentTitle?: unknown;
  status?: unknown;
  participantDisplayNames?: unknown;
  brokerId?: unknown;
  hostId?: unknown;
  visitCompleted?: unknown;
};

type FirestoreChatMessageDoc = {
  type?: unknown;
};

type FirestoreClientProfileDoc = {
  pipelineStage?: PipelineStageKey;
  dealCommission?: number;
};

interface ClientLeadItem {
  chatRoomId: string;
  clientUserId: string;
  clientName: string;
  apartmentId?: string;
  apartmentTitle?: string;
  apartmentPrice?: number;
  hasMessage: boolean;
  hasPriceProposal: boolean;
  hasVisitRequest: boolean;
  isVisitCompleted: boolean;
  isDealClosed: boolean;
  progressScore: number;
  pipelineStage: PipelineStageKey;
  dealCommission?: number;
  weightedShare: number;
}

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.max(min, Math.min(value, max));
}

function modeToProgress(mode: BrokerMode): number {
  return mode === "calendar" ? 0 : 1;
}

function toMode(progress: number): BrokerMode {
  return progress >= 0.5 ? "pipeline" : "calendar";
}

function shiftDateByMode(baseDate: Date, mode: BrokerMode, direction: -1 | 1): Date {
  const next = new Date(baseDate);
  if (mode === "calendar") {
    const targetMonth = next.getMonth() + direction;
    const targetYear = next.getFullYear();
    const currentDay = next.getDate();
    const monthBase = new Date(targetYear, targetMonth, 1);
    const maxDay = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
    monthBase.setDate(Math.min(currentDay, maxDay));
    return monthBase;
  }

  if (mode === "pipeline") {
    next.setDate(next.getDate() + 7 * direction);
    return next;
  }

  next.setDate(next.getDate() + direction);
  return next;
}

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

function getCalendarWeekLabel(date: Date): string {
  const monthWeeks = buildMonthWeeks(date);
  const dayKey = formatDateKey(date);
  const week = monthWeeks.find((item) => item.cells.some((cell) => cell.dateKey === dayKey));
  return week?.label ?? "1η";
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
      label: `${weekIndex + 1}η`,
      cells,
    };
  });
}

function animateToMode(mode: BrokerMode, width: number, translateX: SharedValue<number>): void {
  const target = mode === "calendar" ? 0 : -width;
  translateX.value = withTiming(target, { duration: 240 });
}

function computeProgressScore(item: {
  isDealClosed: boolean;
  isVisitCompleted: boolean;
  hasVisitRequest: boolean;
  hasPriceProposal: boolean;
  hasMessage: boolean;
}): number {
  let score = 0;
  if (item.isDealClosed) score += 50;
  if (item.isVisitCompleted) score += 40;
  if (item.hasVisitRequest) score += 30;
  if (item.hasPriceProposal) score += 20;
  if (item.hasMessage) score += 10;
  return score;
}

function CalendarView({
  colors,
  currentDate,
  calendarViewMode,
  onCalendarViewModeChange,
  onSelectDate,
  onAddNotePress,
  onEditNotePress,
  visibleNotes,
  isLoading,
  currentTimeStr,
}: {
  colors: ThemeColors;
  currentDate: Date;
  calendarViewMode: CalendarViewMode;
  onCalendarViewModeChange: (mode: CalendarViewMode) => void;
  onSelectDate: (nextDate: Date) => void;
  onAddNotePress: (selectedDate: string) => void;
  onEditNotePress: (note: BrokerNote) => void;
  visibleNotes: BrokerNote[];
  isLoading: boolean;
  currentTimeStr: string;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedDayKey = useMemo(() => formatDateKey(currentDate), [currentDate]);
  const isSelectedDayToday = useMemo(() => selectedDayKey === formatDateKey(today), [selectedDayKey, today]);
  const weeks = useMemo(() => buildMonthWeeks(currentDate), [currentDate]);
  const currentWeekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const currentWeekCells = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const cellDate = new Date(currentWeekStart);
        cellDate.setDate(currentWeekStart.getDate() + index);
        return {
          date: cellDate,
          dateKey: formatDateKey(cellDate),
          dayOfMonth: cellDate.getDate(),
          inCurrentMonth: cellDate.getMonth() === currentDate.getMonth(),
        };
      }),
    [currentDate.getMonth(), currentWeekStart],
  );
  const currentWeekLabel = useMemo(() => getCalendarWeekLabel(currentDate), [currentDate]);

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
  const dayLayout = useMemo(
    () => calculateGridLayout(selectedDayNotes, isSelectedDayToday, currentTimeStr),
    [currentTimeStr, isSelectedDayToday, selectedDayNotes],
  );
  const dayCardWidth = useMemo<DimensionValue>(
    () => `${100 / dayLayout.columnCount}%` as DimensionValue,
    [dayLayout.columnCount],
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
        if (event.scale < 0.9) {
          if (calendarViewMode === "month") {
            runOnJS(onCalendarViewModeChange)("week");
          } else if (calendarViewMode === "week") {
            runOnJS(onCalendarViewModeChange)("day");
          }
        } else if (event.scale > 1.1) {
          if (calendarViewMode === "day") {
            runOnJS(onCalendarViewModeChange)("week");
          } else if (calendarViewMode === "week") {
            runOnJS(onCalendarViewModeChange)("month");
          }
        }
      }),
    [calendarViewMode, onCalendarViewModeChange],
  );

  const renderDayPlan = () => (
    <View style={[styles.dayViewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <Text style={[styles.dayViewTitle, { color: colors.onSurface }]}>Ημερήσιο Πλάνο</Text>
      <Text style={[styles.dayViewSubtitle, { color: colors.onSurfaceTertiary }]}>{selectedDayKey}</Text>

      {dayLayout.notes.length === 0 ? (
        <View style={styles.emptyStateWrap}>
          <Text style={[styles.emptyStateText, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν ενεργές σημειώσεις για αυτήν την ημέρα.</Text>
        </View>
      ) : (
        <View style={styles.noteGrid}>
          {dayLayout.notes.map((note) => {
            const cardBackground = noteCategoryColorMap[note.category] ?? colors.surfaceSecondary;
            const apartmentOrClient = note.apartmentTitle || note.clientName || "-";

            return (
              <Pressable
                key={note.id}
                onPress={() => onEditNotePress(note)}
                style={[
                  styles.noteCard,
                  {
                    width: dayCardWidth,
                    backgroundColor: cardBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                {dayLayout.columnCount === 1 ? (
                  <>
                    <Text style={[styles.notePrimaryText, { color: colors.onSurface }]} numberOfLines={1}>
                      {note.time || "--:--"}
                    </Text>
                    <Text style={[styles.noteSecondaryText, { color: colors.onSurface }]} numberOfLines={1}>
                      {note.apartmentTitle || "-"}
                    </Text>
                    <Text style={[styles.noteSecondaryText, { color: colors.onSurface }]} numberOfLines={1}>
                      {note.clientName || "-"}
                    </Text>
                  </>
                ) : null}

                {dayLayout.columnCount === 2 ? (
                  <>
                    <Text style={[styles.notePrimaryText, { color: colors.onSurface }]} numberOfLines={1}>
                      {note.time || "--:--"}
                    </Text>
                    <Text style={[styles.noteSecondaryText, { color: colors.onSurface }]} numberOfLines={1}>
                      {apartmentOrClient}
                    </Text>
                  </>
                ) : null}

                {dayLayout.columnCount >= 3 ? (
                  <Text style={[styles.notePrimaryText, { color: colors.onSurface }]} numberOfLines={1}>
                    {note.time || "--:--"}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable
        style={[styles.addNoteRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        onPress={() => onAddNotePress(selectedDayKey)}
      >
        <Ionicons name="add-circle" size={28} color={brandPrimaryColor} />
      </Pressable>
    </View>
  );

  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={[styles.monthCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
        {(calendarViewMode === "month" || calendarViewMode === "week") ? (
          <View style={styles.calendarHeaderRow}>
            <View style={styles.weekLabelSpacer} />
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} style={styles.dayHeaderCell}>
                <Text style={[styles.dayHeaderText, { color: colors.onSurfaceTertiary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {calendarViewMode === "month"
          ? weeks.map((week) => {
              const weekNotes = week.cells.flatMap((cell) => notesByDate.get(cell.dateKey) ?? []);
              const weekTint = getMostFrequentCategoryColor(weekNotes);

              return (
                <View key={`week-${week.index}`} style={styles.weekRow}>
                  <Pressable
                    style={[styles.weekLabelCell, { backgroundColor: weekTint, borderColor: colors.border }]}
                    onPress={() => handleWeekSelect(new Date(week.cells[0].date))}
                  >
                    <Text style={[styles.weekLabelText, { color: colors.onSurface }]}>{week.label}</Text>
                  </Pressable>

                  {week.cells.map((cell) => {
                    const dayNotes = notesByDate.get(cell.dateKey) ?? [];
                    const dayTint = getMostFrequentCategoryColor(dayNotes);
                    const isPastDay = cell.date < today;
                    const isSelected = cell.dateKey === selectedDayKey;

                    return (
                      <Pressable
                        key={cell.dateKey}
                        onPress={() => handleDaySelect(new Date(cell.date))}
                        style={[
                          styles.dayCell,
                          {
                            backgroundColor: cell.inCurrentMonth ? dayTint : colors.surface,
                            borderColor: colors.border,
                            opacity: isPastDay ? 0.45 : cell.inCurrentMonth ? 1 : 0.55,
                            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Text style={[styles.dayNumberText, { color: cell.inCurrentMonth ? colors.onSurface : colors.onSurfaceTertiary }]}>
                          {cell.dayOfMonth}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          : null}

        {calendarViewMode === "week" ? (
          <View style={styles.weekRow}>
            <View style={[styles.weekLabelCell, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Text style={[styles.weekLabelText, { color: colors.onSurface }]}>{currentWeekLabel}</Text>
            </View>

            {currentWeekCells.map((cell) => {
              const dayNotes = notesByDate.get(cell.dateKey) ?? [];
              const dayTint = getMostFrequentCategoryColor(dayNotes);
              const isPastDay = cell.date < today;
              const isSelected = cell.dateKey === selectedDayKey;

              return (
                <Pressable
                  key={`week-day-${cell.dateKey}`}
                  onPress={() => handleDaySelect(new Date(cell.date))}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor: dayTint,
                      borderColor: colors.border,
                      opacity: isPastDay ? 0.45 : 1,
                      borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={[styles.dayNumberText, { color: colors.onSurface }]}>{cell.dayOfMonth}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {calendarViewMode === "week" || calendarViewMode === "day" ? renderDayPlan() : null}

        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function PipelineView({
  colors,
  leads,
  isLoading,
  onOpenChat,
  onToggleVisitCompleted,
}: {
  colors: ThemeColors;
  leads: ClientLeadItem[];
  isLoading: boolean;
  onOpenChat: (lead: ClientLeadItem) => void;
  onToggleVisitCompleted: (lead: ClientLeadItem) => void;
}) {
  const brandPrimaryColor = useMemo(() => {
    const withLegacyKey = colors as unknown as { brandPrimary?: string; brand?: string };
    return withLegacyKey.brandPrimary ?? withLegacyKey.brand ?? "#E07A2F";
  }, [colors]);

  const totalForecast = leads.reduce((total, item) => total + item.weightedShare, 0);
  const renderItem = ({ item }: { item: ClientLeadItem }) => {
    const stage = getPipelineStageConfig(item.pipelineStage);
    return (
    <Pressable
      style={[styles.clientCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
      onPress={() => onOpenChat(item)}
      testID={`broker-pipeline-client-card-${item.clientUserId}`}
    >
      <Text style={[styles.clientCardName, { color: colors.onSurface }]} numberOfLines={1}>
        {item.clientName || "Πελάτης"}
      </Text>

      <Text style={[styles.clientCardMeta, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>

        {item.apartmentTitle || "Χωρίς διαμέρισμα"}
        {typeof item.apartmentPrice === "number" ? ` · ${item.apartmentPrice.toLocaleString("el-GR")} EUR` : ""}
      </Text>

      <View style={styles.pipelineBadgeRow}><Text style={[styles.pipelineBadge, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}>{stage.shortLabel}</Text><Text style={[styles.pipelineBadge, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface }]}>{Math.round(stage.probability * 100)}%</Text><Text style={[styles.weightedBadge, { backgroundColor: colors.brandTertiary, color: colors.brand }]}>Αναμενόμενο: €{Math.round(item.weightedShare).toLocaleString("el-GR")}</Text></View>

      <View style={styles.clientStatusBar}>
        {item.hasMessage ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}> 
            <Text style={styles.statusBadgeText}>📁</Text>
          </View>
        ) : null}

        {item.hasPriceProposal ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}> 
            <Text style={styles.statusBadgeText}>💵</Text>
          </View>
        ) : null}

        {item.hasVisitRequest ? (
          <Pressable
            style={[
              styles.statusBadge,
              {
                backgroundColor: item.isVisitCompleted ? brandPrimaryColor : colors.surface,
              },
            ]}
            onPress={(event) => {
              event.stopPropagation();
              onToggleVisitCompleted(item);
            }}
          >
            <Text style={[styles.statusBadgeText, { color: item.isVisitCompleted ? colors.onBrand : colors.onSurface }]}>🏠</Text>
          </Pressable>
        ) : null}

        {item.isDealClosed ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.surface }]}> 
            <Text style={styles.statusBadgeText}>✅</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
    );
  };

  return (
    <View style={styles.clientsPanelWrap}>
            <View style={[styles.forecastCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="broker-pipeline-forecast-card"><Text style={[styles.forecastSubtitle, { color: colors.onSurfaceTertiary }]}>Πρόβλεψη Εσόδων Ταμείου</Text><Text style={[styles.forecastMetric, { color: colors.brand }]}>€{Math.round(totalForecast).toLocaleString("el-GR")}</Text><Text style={[styles.forecastExplanation, { color: colors.onSurfaceTertiary }]}>Σταθμισμένα αναμενόμενα έσοδα βάσει πιθανότητας κλεισίματος (Win Rate).</Text></View>
      {isLoading ? (
        <View style={[styles.pageCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(item) => item.chatRoomId}
          renderItem={renderItem}
          contentContainerStyle={styles.clientListContent}
          ListEmptyComponent={
            <View style={[styles.pageCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}> 
              <Text style={[styles.pageTitle, { color: colors.onSurface }]}>Pipeline Πελατών</Text>
              <Text style={[styles.pageSubtitle, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν ενεργοί πελάτες αυτή τη στιγμή.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

export default function BrokerTabScreen({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [activeMode, setActiveMode] = useState<BrokerMode>("calendar");
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [visibleNotes, setVisibleNotes] = useState<BrokerNote[]>([]);
  const [isVisibleNotesLoading, setIsVisibleNotesLoading] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [noteModalDate, setNoteModalDate] = useState(() => formatDateKey(new Date()));
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState<BrokerNote | null>(null);
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);
  const [clientLeads, setClientLeads] = useState<ClientLeadItem[]>([]);
  const [isClientLeadsLoading, setIsClientLeadsLoading] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const currentMonthIndex = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const brokerId = auth.user?.user_id ?? auth.userId ?? "";
  const headerTitle = useMemo(
    () => getHeaderTitleForCalendarMode(currentDate, calendarViewMode),
    [calendarViewMode, currentDate],
  );
  const yearRange = useMemo(() => Array.from({ length: 9 }, (_, index) => currentYear - 4 + index), [currentYear]);
  const visibleRange = useMemo(() => getVisibleRange(currentDate, calendarViewMode), [calendarViewMode, currentDate]);
  const [realListings, setRealListings] = useState<BrokerListingItem[]>([]);
  const [realClients, setRealClients] = useState<BrokerClientItem[]>([]);
  const sortedClients = useMemo(() => {
    return [...clientLeads].sort((a, b) => {
      if (b.progressScore !== a.progressScore) {
        return b.progressScore - a.progressScore;
      }
      return (a.clientName || "").localeCompare(b.clientName || "", "el", { sensitivity: "base" });
    });
  }, [clientLeads]);

  useFocusEffect(
    useCallback(() => {
      setNotesRefreshToken((previous) => previous + 1);
    }, []),
  );

  useEffect(() => {
    animateToMode(activeMode, width, translateX);
  }, [activeMode, width, translateX]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30_000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNotes = async () => {
      if (!brokerId) {
        if (isMounted) {
          setVisibleNotes([]);
        }
        return;
      }

      try {
        setIsVisibleNotesLoading(true);
        const notes = await getBrokerNotesByDateRange(brokerId, visibleRange.start, visibleRange.end);
        if (isMounted) {
          setVisibleNotes(notes);
        }
      } catch {
        if (isMounted) {
          setVisibleNotes([]);
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

        const chatsSnapshot = await getDocs(
          query(collection(db, "chats"), where("users", "array-contains", brokerId)),
        );
        const chatDocs = chatsSnapshot.docs.filter((docSnap) => {
          const data = docSnap.data() as FirestoreChatDoc;
          return data.type === "host";
        });
        const clientsMap = new Map<string, BrokerClientItem>();

        for (const chatDoc of chatDocs) {
          const data = chatDoc.data() as FirestoreChatDoc;
          const status = typeof data.status === "string" ? data.status : "active";
          if (status !== "active") {
            continue;
          }

          const users = Array.isArray(data.users)
            ? data.users.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [];

          const clientId = users.find((uid) => uid !== brokerId);
          if (!clientId) {
            continue;
          }

          const participantDisplayNames =
            data.participantDisplayNames && typeof data.participantDisplayNames === "object"
              ? (data.participantDisplayNames as Record<string, unknown>)
              : {};
          const clientNameCandidate = participantDisplayNames[clientId];
          const clientName =
            typeof clientNameCandidate === "string" && clientNameCandidate.trim().length > 0
              ? clientNameCandidate
              : "Πελάτης";

          const apartmentId = typeof data.apartmentId === "string" ? data.apartmentId : undefined;
          const existing = clientsMap.get(clientId);

          if (!existing) {
            clientsMap.set(clientId, {
              id: clientId,
              name: clientName,
              apartmentIds: apartmentId ? [apartmentId] : [],
              isActive: true,
            });
          } else if (apartmentId) {
            const ids = new Set(existing.apartmentIds ?? []);
            ids.add(apartmentId);
            existing.apartmentIds = Array.from(ids);
          }
        }

        if (isMounted) {
          setRealListings(listings);
          setRealClients(Array.from(clientsMap.values()));
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

  useEffect(() => {
    let isMounted = true;

    const loadClientLeads = async () => {
      if (!brokerId) {
        if (isMounted) {
          setClientLeads([]);
        }
        return;
      }

      try {
        setIsClientLeadsLoading(true);

        const chatsSnapshot = await getDocs(
          query(collection(db, "chats"), where("users", "array-contains", brokerId)),
        );
        const chatDocs = chatsSnapshot.docs.filter((docSnap) => {
          const data = docSnap.data() as FirestoreChatDoc;
          const isHostType = data.type === "host";
          const isActive = (typeof data.status === "string" ? data.status : "active") === "active";
          return isHostType && isActive;
        });

        const leads = await Promise.all(
          chatDocs.map(async (chatDoc) => {
            const chatData = chatDoc.data() as FirestoreChatDoc;
            const status = typeof chatData.status === "string" ? chatData.status : "active";
            if (status !== "active") return null;

            const users = Array.isArray(chatData.users)
              ? chatData.users.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              : [];
            const clientUserId = users.find((uid) => uid !== brokerId);
            if (!clientUserId) return null;

            const participantDisplayNames =
              chatData.participantDisplayNames && typeof chatData.participantDisplayNames === "object"
                ? (chatData.participantDisplayNames as Record<string, unknown>)
                : {};
            const nameValue = participantDisplayNames[clientUserId];
            const clientName = typeof nameValue === "string" && nameValue.trim().length > 0 ? nameValue : "Πελάτης";

            const messagesSnapshot = await getDocs(collection(db, "chats", chatDoc.id, "messages"));
            const messageDocs = messagesSnapshot.docs.map((messageDoc) => messageDoc.data() as FirestoreChatMessageDoc);
            const hasMessage = messageDocs.length > 0;
            const hasPriceProposal = messageDocs.some((item) => item.type === "price_proposal");
            const hasVisitRequest = messageDocs.some((item) => item.type === "visit_request");

            const apartmentId = typeof chatData.apartmentId === "string" ? chatData.apartmentId : undefined;
            let apartmentTitle = typeof chatData.apartmentTitle === "string" ? chatData.apartmentTitle : undefined;
            let apartmentPrice: number | undefined;
            let isDealClosed = false;

            if (apartmentId) {
              const apartmentSnap = await getDoc(doc(db, "apartments", apartmentId));
              if (apartmentSnap.exists()) {
                const apartmentData = apartmentSnap.data() as FirestoreApartmentDoc;
                if (typeof apartmentData.title === "string" && apartmentData.title.trim().length > 0) {
                  apartmentTitle = apartmentData.title;
                }
                apartmentPrice =
                  typeof apartmentData.price === "number"
                    ? apartmentData.price
                    : typeof apartmentData.rent === "number"
                      ? apartmentData.rent
                      : undefined;
                isDealClosed = apartmentData.status === "closed_deal" && apartmentData.rentedToUserId === clientUserId;
              }
            }

            const isVisitCompleted = chatData.visitCompleted === true;
            let profile: FirestoreClientProfileDoc = {};
            try {
              const profileSnap = await getDoc(doc(db, "brokerClientProfiles", `${brokerId}_${clientUserId}`));
              if (profileSnap.exists()) {
                profile = profileSnap.data() as FirestoreClientProfileDoc;
              }
            } catch (error) {
              console.warn(`[Broker] Could not sync brokerClientProfiles for ${clientUserId}; using default pipeline stage.`, error);
            }
            const pipelineStage = getPipelineStageConfig(profile.pipelineStage).key;
            const commissionBase = typeof profile.dealCommission === "number" ? profile.dealCommission : apartmentPrice ?? 1000;
            const weightedShare = commissionBase * getPipelineStageConfig(pipelineStage).probability;

            const lead: ClientLeadItem = {
              chatRoomId: chatDoc.id,
              clientUserId,
              clientName,
              apartmentId,
              apartmentTitle,
              apartmentPrice,
              hasMessage,
              hasPriceProposal,
              hasVisitRequest,
              isVisitCompleted,
              isDealClosed,
              progressScore: computeProgressScore({
                isDealClosed,
                isVisitCompleted,
                hasVisitRequest,
                hasPriceProposal,
                hasMessage,
              }),
              pipelineStage,
              dealCommission: typeof profile.dealCommission === "number" ? profile.dealCommission : undefined,
              weightedShare,
            };

            return lead;
          }),
        );

        if (isMounted) {
          setClientLeads(leads.filter((item): item is ClientLeadItem => item !== null));
        }
      } catch {
        if (isMounted) {
          setClientLeads([]);
        }
      } finally {
        if (isMounted) {
          setIsClientLeadsLoading(false);
        }
      }
    };

    void loadClientLeads();
    return () => {
      isMounted = false;
    };
  }, [brokerId, notesRefreshToken]);

  const openCreateNoteModal = useCallback((selectedDate: string) => {
    setNoteModalDate(selectedDate);
    setSelectedNoteToEdit(null);
    setIsNoteModalVisible(true);
  }, []);

  const openEditNoteModal = useCallback((note: BrokerNote) => {
    setSelectedNoteToEdit(note);
    setNoteModalDate(note.date);
    setIsNoteModalVisible(true);
  }, []);

  const closeNoteModal = useCallback(() => {
    setIsNoteModalVisible(false);
    setSelectedNoteToEdit(null);
  }, []);

  const handleNoteMutation = useCallback(() => {
    setNotesRefreshToken((prev) => prev + 1);
    setSelectedNoteToEdit(null);
  }, []);

  const handleToggleVisitCompleted = useCallback(async (lead: ClientLeadItem) => {
    const nextStatus = !lead.isVisitCompleted;

    setClientLeads((prev) =>
      prev.map((item) =>
        item.chatRoomId === lead.chatRoomId
          ? {
              ...item,
              isVisitCompleted: nextStatus,
              progressScore: computeProgressScore({
                isDealClosed: item.isDealClosed,
                isVisitCompleted: nextStatus,
                hasVisitRequest: item.hasVisitRequest,
                hasPriceProposal: item.hasPriceProposal,
                hasMessage: item.hasMessage,
              }),
            }
          : item,
      ),
    );

    try {
      await updateDoc(doc(db, "chats", lead.chatRoomId), {
        visitCompleted: nextStatus,
      });
    } catch {
      setClientLeads((prev) =>
        prev.map((item) =>
          item.chatRoomId === lead.chatRoomId
            ? {
                ...item,
                isVisitCompleted: lead.isVisitCompleted,
                progressScore: computeProgressScore({
                  isDealClosed: item.isDealClosed,
                  isVisitCompleted: lead.isVisitCompleted,
                  hasVisitRequest: item.hasVisitRequest,
                  hasPriceProposal: item.hasPriceProposal,
                  hasMessage: item.hasMessage,
                }),
              }
            : item,
        ),
      );
    }
  }, []);

  const openLeadChat = useCallback(
    (lead: ClientLeadItem) => {
      router.push({
        pathname: "/broker-client-detail",
        params: {
          clientUserId: lead.clientUserId,
          clientName: lead.clientName,
          chatRoomId: lead.chatRoomId,
        },
      });
    },
    [router],
  );

  const setMode = useCallback(
    (mode: BrokerMode) => {
      setActiveMode(mode);
      animateToMode(mode, width, translateX);
    },
    [translateX, width],
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

  const pagerGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onBegin(() => {
          dragStartX.value = translateX.value;
        })
        .onUpdate((event) => {
          const nextValue = clamp(dragStartX.value + event.translationX, -width, 0);
          translateX.value = nextValue;
        })
        .onEnd((event) => {
          const absTranslation = Math.abs(event.translationX);
          const threshold = width * SWIPE_THRESHOLD_RATIO;
          const fromClients = dragStartX.value <= -width / 2;

          let nextMode: BrokerMode;
          if (event.velocityX <= -SWIPE_VELOCITY_THRESHOLD) {
            nextMode = "pipeline";
          } else if (event.velocityX >= SWIPE_VELOCITY_THRESHOLD) {
            nextMode = "calendar";
          } else if (absTranslation > threshold) {
            if (event.translationX < 0) {
              nextMode = "pipeline";
            } else {
              nextMode = "calendar";
            }
          } else {
              nextMode = fromClients ? "pipeline" : "calendar";
          }

          const target = nextMode === "calendar" ? 0 : -width;
          translateX.value = withTiming(target, { duration: 220 });
          runOnJS(setActiveMode)(nextMode);
        }),
    [dragStartX, setActiveMode, translateX, width],
  );

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const calendarActive = activeMode === "calendar";
  const pipelineActive = activeMode === "pipeline";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top + spacing.md }]}> 
      {onOpenSettings ? (
        <View style={styles.dashboardHeaderRow}>
          <Pressable
            style={styles.headerIconButton}
            onPress={onOpenSettings}
            testID="broker-dashboard-settings-btn"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.toggleShell, { backgroundColor: colors.surfaceSecondary }]}>
        <Pressable style={[styles.toggleOption, calendarActive && [styles.toggleOptionActive, { backgroundColor: colors.brand }]]} onPress={() => setMode("calendar")} testID="broker-tab-toggle-calendar">
          <View style={styles.toggleOptionContent}>
            <Ionicons name="calendar-outline" size={18} color={calendarActive ? colors.onBrand : colors.onSurface} />
            <Text style={[styles.toggleText, { color: colors.onSurface }, calendarActive && { color: colors.onBrand }]}>Calendar</Text>
          </View>
        </Pressable>

        <Pressable style={[styles.toggleOption, pipelineActive && [styles.toggleOptionActive, { backgroundColor: colors.brand }]]} onPress={() => setMode("pipeline")} testID="broker-tab-toggle-pipeline">
          <View style={styles.toggleOptionContent}>
            <Ionicons name="cash-outline" size={18} color={pipelineActive ? colors.onBrand : colors.onSurface} />
            <Text style={[styles.toggleText, { color: colors.onSurface }, pipelineActive && { color: colors.onBrand }]}>Pipeline</Text>
          </View>
        </Pressable>
      </View>

      {calendarActive ? <View style={[styles.calendarHeader, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}> 
        <Pressable style={styles.headerArrowButton} onPress={goToPrevious}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Pressable style={styles.headerTitleButton} onPress={calendarViewMode === "month" ? openPicker : undefined}>
          <Text style={[styles.headerTitleText, { color: colors.onSurface }]}>{headerTitle}</Text>
        </Pressable>

        <Pressable style={styles.headerArrowButton} onPress={goToNext}>
          <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
        </Pressable>
      </View> : null}

      <GestureDetector gesture={pagerGesture}>
        <View style={styles.pagerViewport}>
          <Animated.View style={[styles.pagerTrack, { width: width * 2 }, pagerStyle]}>
            <View style={[styles.page, { width }]}>
              <CalendarView
                colors={colors}
                currentDate={currentDate}
                calendarViewMode={calendarViewMode}
                onCalendarViewModeChange={setCalendarViewMode}
                onSelectDate={setCurrentDate}
                onAddNotePress={openCreateNoteModal}
                onEditNotePress={openEditNoteModal}
                visibleNotes={visibleNotes}
                isLoading={isVisibleNotesLoading}
                currentTimeStr={currentTimeStr}
              />
            </View>
            <View style={[styles.page, { width }]}>
              <PipelineView
                colors={colors}
                leads={sortedClients}
                isLoading={isClientLeadsLoading}
                onOpenChat={openLeadChat}
                onToggleVisitCompleted={handleToggleVisitCompleted}
              />
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

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
    paddingHorizontal: spacing.lg,
  },
  toggleShell: {
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.md,
    gap: 4,
  },
  toggleOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  toggleOptionActive: {
  },
  toggleOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  toggleText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
  },
  calendarHeader: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
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
    paddingBottom: spacing.lg,
  },
  clientsPanelWrap: {
    flex: 1,
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
    minHeight: 340,
    position: "relative",
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  dashboardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabelSpacer: {
    width: 38,
    marginRight: spacing.xs,
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
    alignItems: "stretch",
    marginBottom: spacing.xs,
  },
  weekLabelCell: {
    width: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  weekLabelText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
  dayCell: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 1,
  },
  dayNumberText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
  },
  dayViewCard: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  dayViewTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.base,
  },
  dayViewSubtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  noteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 52,
    marginBottom: spacing.xs,
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
