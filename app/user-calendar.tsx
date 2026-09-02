import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CalendarNoteModal from "@/src/components/calendar/CalendarNoteModal";
import CalendarScheduleView from "@/src/components/calendar/CalendarScheduleView";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function UserCalendarScreen() {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [refreshToken, setRefreshToken] = useState(0);
  const userId = auth.userId ?? "";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]} testID="user-calendar-screen">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="user-calendar-back-btn">
          <Ionicons color={colors.onSurface} name="chevron-back" size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]}>{t("calendar.title")}</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>
      <CalendarScheduleView
        isBroker={false}
        userId={userId}
        onAddNotePress={(date) => { setNoteDate(date); setIsNoteModalOpen(true); }}
        refreshToken={refreshToken}
      />
      <CalendarNoteModal
        visible={isNoteModalOpen}
        isBroker={false}
        userId={userId}
        date={noteDate}
        onClose={() => setIsNoteModalOpen(false)}
        onSaved={() => setRefreshToken((previous) => previous + 1)}
        onUpdated={() => setRefreshToken((previous) => previous + 1)}
        onDeleted={() => setRefreshToken((previous) => previous + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  headerRightPlaceholder: { width: 40 },
});
