import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export interface VisitMessageCardData {
  id: string;
  text?: string;
  type?: string;
  senderId: string;
  metadata?: {
    appointmentId?: string;
    apartmentTitle?: string;
    apartmentAddress?: string;
    appointmentDate?: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
  };
}

export default function VisitMessageCard({
  message,
  isMine,
  onEdit,
}: {
  message: VisitMessageCardData;
  isMine: boolean;
  onEdit?: () => void;
}) {
  const { colors } = useTheme();
  const date = message.metadata?.appointmentDate ? new Date(message.metadata.appointmentDate) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "-";
  const status = message.metadata?.status ?? "confirmed";
  const statusLabel = status === "cancelled" ? "Ακυρώθηκε" : status === "completed" ? "Ολοκληρώθηκε" : "Επιβεβαιώθηκε";

  return (
    <View style={{ marginVertical: spacing.xs, alignSelf: isMine ? "flex-end" : "flex-start", width: "88%" }} testID={`visit-message-card-${message.id}`}>
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: status === "cancelled" ? colors.error : colors.brand, backgroundColor: colors.surfaceSecondary, padding: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
            <Ionicons name="calendar-outline" size={20} color={status === "cancelled" ? colors.error : colors.brand} />
            <Text style={{ fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, flex: 1 }} numberOfLines={1}>
              {message.metadata?.apartmentTitle || "Υπόδειξη ακινήτου"}
            </Text>
          </View>
          {onEdit && status !== "cancelled" ? (
            <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Επεξεργασία ραντεβού" testID={`edit-visit-${message.id}`}>
              <Ionicons name="pencil-outline" size={19} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
        <Text style={{ marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface }}>{dateLabel}</Text>
        <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }} numberOfLines={2}>
          {message.metadata?.apartmentAddress || "Η διεύθυνση θα κοινοποιηθεί από τον μεσίτη."}
        </Text>
        <Text style={{ marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: status === "cancelled" ? colors.error : colors.brand }}>{statusLabel}</Text>
      </View>
    </View>
  );
}