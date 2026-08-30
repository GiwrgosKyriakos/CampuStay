import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

export interface VisitRequestModalProps {
  visible: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (date: string, time: string) => void;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function getNextHalfHour(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 0);
  if (next.getMinutes() === 0) next.setHours(next.getHours() + 1);
  return next;
}

export default function VisitRequestModal({ visible, isSubmitting, onClose, onSubmit }: VisitRequestModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const now = new Date();
  const todayStart = useMemo(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), current.getDate());
  }, []);
  const todayIso = toIsoDate(todayStart);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState("12");
  const [selectedMinute, setSelectedMinute] = useState<"00" | "30">("00");
  const [monthCursor, setMonthCursor] = useState(todayStart);

  useEffect(() => {
    if (visible) {
      const next = getNextHalfHour(new Date());
      setSelectedDate(toIsoDate(next));
      setSelectedHour(`${next.getHours()}`.padStart(2, "0"));
      setSelectedMinute(next.getMinutes() >= 30 ? "30" : "00");
      setMonthCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }, [visible]);

  const calendarCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells: ({ day: number; iso: string; disabled: boolean } | null)[] = Array.from({ length: firstDay }, () => null);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      cells.push({ day, iso: toIsoDate(date), disabled: date.getTime() < todayStart.getTime() });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor, todayStart]);

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, value) => `${value}`.padStart(2, "0")), []);
  const minuteOptions = ["00", "30"] as const;
  const isToday = selectedDate === todayIso;
  const isHourDisabled = (hour: string) => {
    if (!isToday) return false;
    const value = Number(hour);
    return value < now.getHours() || (value === now.getHours() && minuteOptions.every((minute) => Number(minute) < now.getMinutes()));
  };
  const isMinuteDisabled = (minute: "00" | "30") => {
    if (!isToday) return false;
    const value = Number(selectedHour);
    return value < now.getHours() || (value === now.getHours() && Number(minute) < now.getMinutes());
  };
  const submitDisabled = !selectedDate || isSubmitting || isHourDisabled(selectedHour) || isMinuteDisabled(selectedMinute);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={() => { if (!isSubmitting) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Ζήτα επίσκεψη</Text>
          <View style={styles.calendarHeader}>
            <Pressable style={[styles.nav, !canGoPrevious(monthCursor, todayStart) && styles.disabled]} onPress={() => setMonthCursor((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))} disabled={!canGoPrevious(monthCursor, todayStart)} testID="chat-visit-prev-month"><Ionicons name="chevron-back" size={16} color={colors.onSurface} /></Pressable>
            <Text style={styles.calendarHeaderText}>{new Intl.DateTimeFormat("el-GR", { month: "long", year: "numeric" }).format(monthCursor)}</Text>
            <Pressable style={styles.nav} onPress={() => setMonthCursor((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))} testID="chat-visit-next-month"><Ionicons name="chevron-forward" size={16} color={colors.onSurface} /></Pressable>
          </View>
          <View style={styles.weekdays}>{["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.days}>
            {calendarCells.map((cell, index) => cell ? (
              <Pressable key={cell.iso} style={[styles.day, cell.disabled && styles.disabled, selectedDate === cell.iso && styles.selected]} onPress={() => setSelectedDate(cell.iso)} disabled={cell.disabled} testID={`chat-visit-day-${cell.iso}`}>
                <Text style={[styles.dayText, cell.disabled && styles.dayTextDisabled, selectedDate === cell.iso && styles.selectedText]}>{cell.day}</Text>
              </Pressable>
            ) : <View key={`empty-${index}`} style={styles.day} />)}
          </View>
          <View style={styles.timePicker}>
            <TimeColumn label="Ώρα" options={hourOptions} selected={selectedHour} disabled={isHourDisabled} onSelect={setSelectedHour} styles={styles} testPrefix="chat-visit-hour" />
            <TimeColumn label="Λεπτά" options={minuteOptions} selected={selectedMinute} disabled={isMinuteDisabled} onSelect={setSelectedMinute} styles={styles} testPrefix="chat-visit-minute" />
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={isSubmitting} testID="chat-visit-request-cancel"><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
            <Pressable style={[styles.submit, submitDisabled && styles.disabled]} onPress={() => selectedDate && onSubmit(selectedDate, `${selectedHour}:${selectedMinute}`)} disabled={submitDisabled} testID="chat-visit-request-submit"><Ionicons name="checkmark-circle" size={30} color={colors.onBrand} /></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function canGoPrevious(cursor: Date, today: Date): boolean {
  return cursor.getFullYear() > today.getFullYear() || (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() > today.getMonth());
}

function TimeColumn({ label, options, selected, disabled, onSelect, styles, testPrefix }: { label: string; options: readonly string[]; selected: string; disabled: (value: any) => boolean; onSelect: (value: any) => void; styles: Record<string, any>; testPrefix: string }) {
  return <View style={styles.timeColumn}><Text style={styles.timeLabel}>{label}</Text><ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>{options.map((option) => { const isDisabled = disabled(option); return <Pressable key={option} style={[styles.timeOption, selected === option && styles.selected, isDisabled && styles.disabled]} onPress={() => onSelect(option)} disabled={isDisabled} testID={`${testPrefix}-${option}`}><Text style={[styles.timeText, selected === option && styles.selectedText, isDisabled && styles.dayTextDisabled]}>{option}</Text></Pressable>; })}</ScrollView></View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nav: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  calendarHeaderText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, textTransform: "capitalize" },
  weekdays: { flexDirection: "row", justifyContent: "space-between" },
  weekday: { width: "14.28%", textAlign: "center", fontFamily: fonts.semibold, fontSize: 11, color: colors.onSurfaceTertiary },
  days: { flexDirection: "row", flexWrap: "wrap" },
  day: { width: "14.28%", height: 34, alignItems: "center", justifyContent: "center", marginBottom: 4, borderRadius: radius.pill },
  dayText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  dayTextDisabled: { color: colors.onSurfaceTertiary, opacity: 0.45 },
  selected: { backgroundColor: colors.brand },
  selectedText: { color: colors.onBrand },
  disabled: { opacity: 0.45 },
  timePicker: { flexDirection: "row", gap: spacing.md },
  timeColumn: { flex: 1, gap: 6 },
  timeLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  timeList: { maxHeight: 118, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 4 },
  timeOption: { borderRadius: radius.md, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  timeText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  actions: { marginTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  submit: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
});
