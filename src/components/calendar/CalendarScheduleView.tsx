import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarView } from "@/app/(tabs)/calendar";
import { deduplicateBrokerNotes, getBrokerNotesByDateRange, type BrokerNote } from "@/src/api/brokerCalendar";
import { useTheme } from "@/src/context/ThemeContext";
import { getCurrentLocale } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import MonthYearPickerModal from "@/src/components/calendar/MonthYearPickerModal";

export interface CalendarScheduleViewProps {
  isBroker: boolean;
  userId: string;
  onAddNotePress: (date: string) => void;
  refreshToken?: number;
}

type CalendarViewMode = "month" | "week" | "day";

function shiftDate(date: Date, mode: CalendarViewMode, direction: -1 | 1): Date {
  const next = new Date(date);
  if (mode === "month") next.setMonth(next.getMonth() + direction);
  else if (mode === "week") next.setDate(next.getDate() + direction * 7);
  else next.setDate(next.getDate() + direction);
  return next;
}

export default function CalendarScheduleView({ isBroker, userId, onAddNotePress, refreshToken = 0 }: CalendarScheduleViewProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [notes, setNotes] = useState<BrokerNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!userId) {
      setNotes([]);
      return;
    }
    setIsLoading(true);
    const start = `${currentDate.getFullYear()}-01-01`;
    const end = `${currentDate.getFullYear() + 1}-12-31`;
    try {
      setNotes(deduplicateBrokerNotes(await getBrokerNotesByDateRange(userId, start, end)));
    } catch {
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, userId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshToken]);

  const headerTitle = useMemo(() => {
    if (calendarViewMode === "month") return new Intl.DateTimeFormat(getCurrentLocale(), { month: "long", year: "numeric" }).format(currentDate);
    if (calendarViewMode === "week") return `Εβδομάδα ${new Intl.DateTimeFormat(getCurrentLocale(), { day: "numeric", month: "short" }).format(currentDate)}`;
    return new Intl.DateTimeFormat(getCurrentLocale(), { dateStyle: "medium" }).format(currentDate);
  }, [calendarViewMode, currentDate]);

  return (
    <View style={styles.container} testID={`calendar-schedule-view-${isBroker ? "broker" : "user"}`}>
      <View style={styles.calendarHeader}>
        <Pressable style={styles.headerButton} onPress={() => setCurrentDate((date) => shiftDate(date, calendarViewMode, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.headerTitlePill}
          onPress={calendarViewMode === "month" ? () => setIsPickerVisible(true) : undefined}
          disabled={calendarViewMode !== "month"}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole={calendarViewMode === "month" ? "button" : undefined}
          accessibilityLabel={calendarViewMode === "month" ? "Επιλογή μήνα και έτους" : headerTitle}
          testID="calendar-schedule-month-year-pill"
        >
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {calendarViewMode === "month" ? <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} /> : null}
        </Pressable>
        <Pressable style={styles.headerButton} onPress={() => setCurrentDate((date) => shiftDate(date, calendarViewMode, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <CalendarView
        colors={colors}
        isBroker={isBroker}
        userId={userId}
        currentDate={currentDate}
        calendarViewMode={calendarViewMode}
        onCalendarViewModeChange={setCalendarViewMode}
        onSelectDate={setCurrentDate}
        onAddNotePress={onAddNotePress}
        onEditNotePress={(note) => onAddNotePress(note.date)}
        onToggleNoteDone={() => undefined}
        onFeedbackSaved={(noteId) => setNotes((current) => current.map((note) => note.id === noteId ? { ...note, feedbackSubmittedBy: { ...(note.feedbackSubmittedBy ?? {}), [userId]: true } } : note))}
        onClientPress={() => undefined}
        onSignViewingOrder={() => undefined}
        onNavigate={(direction) => setCurrentDate((date) => shiftDate(date, calendarViewMode, direction))}
        bottomInset={insets.bottom}
        visibleNotes={notes}
        isLoading={isLoading}
      />
      <MonthYearPickerModal
        visible={isPickerVisible}
        currentDate={currentDate}
        onClose={() => setIsPickerVisible(false)}
        onSelect={(nextDate) => {
          setCurrentDate(nextDate);
          setIsPickerVisible(false);
        }}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, gap: spacing.sm },
    calendarHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm },
    headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
    headerTitlePill: { minHeight: 36, maxWidth: "72%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    headerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface, textAlign: "center" },
  });
}
