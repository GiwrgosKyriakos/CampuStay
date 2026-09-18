import React, { Suspense, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CalendarNoteModal from "@/src/components/calendar/CalendarNoteModal";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";

const CalendarScheduleView = React.lazy(() => import("@/src/components/calendar/CalendarScheduleView"));

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function RoommateCalendarRoute() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [noteDate, setNoteDate] = useState(() => formatDateKey(new Date()));
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const closeNoteModal = () => setIsNoteModalOpen(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg }} testID="roommate-calendar-screen">
      <Suspense fallback={<ActivityIndicator color={colors.brand} />}>
        <CalendarScheduleView
          isBroker={false}
          userId={auth.userId ?? ""}
          onAddNotePress={(date) => {
            setNoteDate(date);
            setIsNoteModalOpen(true);
          }}
        />
      </Suspense>
      <CalendarNoteModal
        visible={isNoteModalOpen}
        isBroker={false}
        userId={auth.userId ?? ""}
        date={noteDate}
        onClose={closeNoteModal}
        onSaved={closeNoteModal}
        onUpdated={closeNoteModal}
        onDeleted={closeNoteModal}
      />
    </View>
  );
}