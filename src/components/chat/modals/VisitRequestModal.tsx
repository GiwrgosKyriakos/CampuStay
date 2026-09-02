import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { getCurrentLocale, t } from "@/src/locales";
import { getBrokerNotesByDateRange, type BrokerNote } from "@/src/api/brokerCalendar";

export interface VisitRequestModalProps {
  visible: boolean;
  isSubmitting: boolean;
  brokerId: string;
  listings: VisitRequestListing[];
  onClose: () => void;
  onSubmit: (date: string, time: string, apartmentId: string) => void;
}

export interface VisitRequestListing {
  id: string;
  title: string;
  rent?: number;
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

export default function VisitRequestModal({ visible, isSubmitting, brokerId, listings, onClose, onSubmit }: VisitRequestModalProps) {
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
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [brokerNotes, setBrokerNotes] = useState<BrokerNote[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [monthCursor, setMonthCursor] = useState(todayStart);

  useEffect(() => {
    if (visible) {
      const next = getNextHalfHour(new Date());
      setSelectedDate(toIsoDate(next));
      setSelectedHour(`${next.getHours()}`.padStart(2, "0"));
      setSelectedMinute(next.getMinutes() >= 30 ? "30" : "00");
      setMonthCursor(new Date(next.getFullYear(), next.getMonth(), 1));
      setSelectedApartmentId(listings[0]?.id ?? null);
    }
  }, [listings, visible]);

  useEffect(() => {
    if (!visible || !brokerId || !selectedDate) return;
    let active = true;
    setLoadingAvailability(true);
    void getBrokerNotesByDateRange(brokerId, selectedDate, selectedDate)
      .then((notes) => { if (active) setBrokerNotes(notes); })
      .catch(() => { if (active) setBrokerNotes([]); })
      .finally(() => { if (active) setLoadingAvailability(false); });
    return () => { active = false; };
  }, [brokerId, selectedDate, visible]);

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
  const isSlotUnavailable = (hour: string, minute: "00" | "30") => {
    const selectedTime = `${hour}:${minute}`;
    return brokerNotes.some((note) => {
      if (note.done || note.isCompleted) return false;
      if (note.time && note.time !== selectedTime && note.scheduledTime !== selectedTime) return false;
      const type = note.type ?? note.category;
      if (type === "showing" || type === "visit") return note.apartmentId !== selectedApartmentId;
      return type === "pickup" || type === "owner_meeting" || type === "call" || type === "phone" || type === "message" || type === "other";
    });
  };
  const isHourDisabled = (hour: string) => {
    if (!isToday) return false;
    const value = Number(hour);
    return value < now.getHours() || (value === now.getHours() && minuteOptions.every((minute) => Number(minute) < now.getMinutes())) || minuteOptions.every((minute) => isSlotUnavailable(hour, minute));
  };
  const isMinuteDisabled = (minute: "00" | "30") => {
    if (!isToday) return false;
    const value = Number(selectedHour);
    return value < now.getHours() || (value === now.getHours() && Number(minute) < now.getMinutes()) || isSlotUnavailable(selectedHour, minute);
  };
  const submitDisabled = !selectedDate || !selectedApartmentId || isSubmitting || loadingAvailability || isHourDisabled(selectedHour) || isMinuteDisabled(selectedMinute);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={() => { if (!isSubmitting) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("chat.visitRequest.title")}</Text>
          <Text style={styles.sectionLabel}>{t("chat.visitRequest.selectProperty")}</Text>
          <ScrollView style={styles.propertyList} contentContainerStyle={styles.propertyListContent}>
            {listings.map((listing) => <Pressable key={listing.id} style={[styles.propertyOption, selectedApartmentId === listing.id && styles.selected]} onPress={() => setSelectedApartmentId(listing.id)} testID={`chat-visit-property-${listing.id}`}><Text style={[styles.propertyTitle, selectedApartmentId === listing.id && styles.selectedText]} numberOfLines={1}>{listing.title}</Text>{typeof listing.rent === "number" ? <Text style={[styles.propertyRent, selectedApartmentId === listing.id && styles.selectedText]}>€{listing.rent.toLocaleString("el-GR")}</Text> : null}</Pressable>)}
            {listings.length === 0 ? <Text style={styles.emptyPropertyText}>{t("chat.visitRequest.noProperties")}</Text> : null}
          </ScrollView>
          <View style={styles.calendarHeader}>
            <Pressable style={[styles.nav, !canGoPrevious(monthCursor, todayStart) && styles.disabled]} onPress={() => setMonthCursor((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))} disabled={!canGoPrevious(monthCursor, todayStart)} testID="chat-visit-prev-month"><Ionicons name="chevron-back" size={16} color={colors.onSurface} /></Pressable>
            <Text style={styles.calendarHeaderText}>{new Intl.DateTimeFormat(getCurrentLocale(), { month: "long", year: "numeric" }).format(monthCursor)}</Text>
            <Pressable style={styles.nav} onPress={() => setMonthCursor((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))} testID="chat-visit-next-month"><Ionicons name="chevron-forward" size={16} color={colors.onSurface} /></Pressable>
          </View>
          <View style={styles.weekdays}>{["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => <Text key={day} style={styles.weekday}>{t(`chat.visitRequest.weekdays.${day}`)}</Text>)}</View>
          <View style={styles.days}>
            {calendarCells.map((cell, index) => cell ? (
              <Pressable key={cell.iso} style={[styles.day, cell.disabled && styles.disabled, selectedDate === cell.iso && styles.selected]} onPress={() => setSelectedDate(cell.iso)} disabled={cell.disabled} testID={`chat-visit-day-${cell.iso}`}>
                <Text style={[styles.dayText, cell.disabled && styles.dayTextDisabled, selectedDate === cell.iso && styles.selectedText]}>{cell.day}</Text>
              </Pressable>
            ) : <View key={`empty-${index}`} style={styles.day} />)}
          </View>
          <View style={styles.timePicker}>
            <TimeColumn label={t("chat.visitRequest.hour")} options={hourOptions} selected={selectedHour} disabled={isHourDisabled} onSelect={setSelectedHour} styles={styles} testPrefix="chat-visit-hour" />
            <TimeColumn label={t("chat.visitRequest.minutes")} options={minuteOptions} selected={selectedMinute} disabled={isMinuteDisabled} onSelect={setSelectedMinute} styles={styles} testPrefix="chat-visit-minute" />
          </View>
          {loadingAvailability ? <ActivityIndicator color={colors.brand} /> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={isSubmitting} testID="chat-visit-request-cancel"><Text style={styles.cancelText}>{t("common.actions.cancel")}</Text></Pressable>
            <Pressable style={[styles.submit, submitDisabled && styles.disabled]} onPress={() => selectedDate && selectedApartmentId && onSubmit(selectedDate, `${selectedHour}:${selectedMinute}`, selectedApartmentId)} disabled={submitDisabled} testID="chat-visit-request-submit"><Ionicons name="checkmark-circle" size={30} color={colors.onBrand} /></Pressable>
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
  return <View style={styles.timeColumn}><Text style={styles.timeLabel}>{label}</Text><ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>{options.map((option) => { const isDisabled = disabled(option); return <Pressable key={option} style={[styles.timeOption, selected === option && styles.selected, isDisabled && styles.disabled]} onPress={() => onSelect(option)} disabled={isDisabled} testID={`${testPrefix}-${option}`}><View style={styles.timeOptionContent}><Text style={[styles.timeText, selected === option && styles.selectedText, isDisabled && styles.dayTextDisabled]}>{option}</Text>{isDisabled ? <Text style={styles.unavailableBadge}>{t("chat.visitRequest.unavailableTime")}</Text> : null}</View></Pressable>; })}</ScrollView></View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  sectionLabel: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  propertyList: { maxHeight: 100, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  propertyListContent: { padding: 4, gap: 4 },
  propertyOption: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  propertyTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  propertyRent: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  emptyPropertyText: { padding: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
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
  timeOptionContent: { alignItems: "center", gap: 1 },
  timeText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  unavailableBadge: { fontFamily: fonts.regular, fontSize: 8, color: colors.error },
  actions: { marginTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  submit: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
});
