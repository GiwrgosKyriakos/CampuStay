import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function SendAddressModal({
  visible,
  exactAddress,
  latitude,
  longitude,
  isSending,
  onClose,
  onShare,
}: {
  visible: boolean;
  exactAddress: string;
  latitude?: number;
  longitude?: number;
  isSending: boolean;
  onClose: () => void;
  onShare: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}><View style={styles.titleWrap}><Ionicons name="location-outline" size={22} color={colors.brand} /><Text style={[styles.title, { color: colors.onSurface }]}>Κοινοποίηση ακριβούς διεύθυνσης</Text></View><Pressable onPress={onClose} disabled={isSending} hitSlop={8}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable></View>
          <Text style={[styles.description, { color: colors.onSurfaceTertiary }]}>Η διεύθυνση θα σταλεί στον πελάτη για την αυριανή υπόδειξη.</Text>
          <View style={[styles.addressBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.address, { color: colors.onSurface }]}>{exactAddress || "Δεν βρέθηκε ακριβής διεύθυνση"}</Text>{Number.isFinite(latitude) && Number.isFinite(longitude) ? <Text style={[styles.coordinates, { color: colors.onSurfaceTertiary }]}>{`${latitude}, ${longitude}`}</Text> : null}</View>
          <View style={styles.actions}><Pressable onPress={onClose} disabled={isSending} style={styles.cancel}><Text style={[styles.cancelText, { color: colors.onSurfaceTertiary }]}>Ακύρωση</Text></Pressable><Pressable onPress={onShare} disabled={isSending || !exactAddress.trim()} style={[styles.share, { backgroundColor: colors.brand }, (isSending || !exactAddress.trim()) && styles.disabled]}>{isSending ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Ionicons name="send-outline" size={17} color={colors.onBrand} />}<Text style={[styles.shareText, { color: colors.onBrand }]}>Κοινοποίηση Διεύθυνσης</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, flex: 1 },
  description: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  addressBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  address: { fontFamily: fonts.semibold, fontSize: fontSize.base },
  coordinates: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm, flexWrap: "wrap" },
  cancel: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  share: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, paddingHorizontal: spacing.md },
  shareText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  disabled: { opacity: 0.5 },
});
