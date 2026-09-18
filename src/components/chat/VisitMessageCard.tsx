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
    status?: "pending" | "confirmed" | "completed" | "cancelled" | "pending_confirmation" | "reschedule_proposed" | "reschedule_accepted" | "reschedule_rejected";
    proposalStatus?: "pending_confirmation" | "accepted" | "rejected";
    proposedBy?: string;
    previousAppointmentId?: string;
    previousAppointmentDate?: string;
    proposedAppointmentDate?: string;
  };
}

export default function VisitMessageCard({
  message,
  isMine,
  onEdit,
  canDecideReschedule = false,
  onAcceptReschedule,
  onRejectReschedule,
}: {
  message: VisitMessageCardData;
  isMine: boolean;
  onEdit?: () => void;
  canDecideReschedule?: boolean;
  onAcceptReschedule?: () => void;
  onRejectReschedule?: () => void;
}) {
  const { colors } = useTheme();
  const date = message.metadata?.appointmentDate ? new Date(message.metadata.appointmentDate) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "-";
  const status = message.metadata?.status ?? "confirmed";
  const proposalPending = message.metadata?.proposalStatus === "pending_confirmation" || status === "pending_confirmation" || status === "reschedule_proposed";
  const oldDate = message.metadata?.previousAppointmentDate ? new Date(message.metadata.previousAppointmentDate) : null;
  const oldDateLabel = oldDate && !Number.isNaN(oldDate.getTime()) ? oldDate.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
  const statusLabel = proposalPending ? (canDecideReschedule ? "Επιβεβαιώστε τη νέα ώρα" : "Αναμονή για αποδοχή") : status === "cancelled" ? "Ακυρώθηκε" : status === "completed" ? "Ολοκληρώθηκε" : "Επιβεβαιώθηκε";

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
          
          {onEdit && status !== "cancelled" && !proposalPending ? (
            <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Επεξεργασία ραντεβού" testID={`edit-visit-${message.id}`}>
              <Ionicons name="pencil-outline" size={19} color={colors.brand} />
            </Pressable>
          ) : null}
          
        </View>
        {proposalPending ? <Text style={{ marginTop: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textDecorationLine: "line-through" }}>{oldDateLabel}</Text> : null}
        <Text style={{ marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface }}>{dateLabel}</Text>
        <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary }} numberOfLines={2}>
          {message.metadata?.apartmentAddress || "Η διεύθυνση θα κοινοποιηθεί από τον μεσίτη."}
        </Text>
        <Text style={{ marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: status === "cancelled" ? colors.error : colors.brand }}>{statusLabel}</Text>
        {proposalPending && canDecideReschedule && onAcceptReschedule && onRejectReschedule ? (
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onRejectReschedule} style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.error }} testID={`reject-reschedule-${message.id}`}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.error }}>Απόρριψη</Text>
            </Pressable>
            <Pressable onPress={onAcceptReschedule} style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.brand }} testID={`accept-reschedule-${message.id}`}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrand }}>Αποδοχή</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}