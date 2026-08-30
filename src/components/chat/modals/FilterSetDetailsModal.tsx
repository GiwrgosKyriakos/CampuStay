import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import type { FilterSetMessageData } from "./types";

export interface FilterSetDetailsModalProps {
  visible: boolean;
  filterSetData: FilterSetMessageData | null;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
}

const sortLabels: Record<string, string> = { newest: "Πιο πρόσφατα", oldest: "Πιο παλιά", price_asc: "Αύξουσα τιμή", price_desc: "Φθίνουσα τιμή", size_asc: "Αύξον εμβαδόν", size_desc: "Φθίνουσα εμβαδόν", price_sqm_asc: "Αύξουσα τιμή/τ.μ.", price_sqm_desc: "Φθίνουσα τιμή/τ.μ." };

export default function FilterSetDetailsModal({ visible, filterSetData, canApply, onClose, onApply }: FilterSetDetailsModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const data = filterSetData;
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><View style={styles.card} testID="chat-filter-set-details-modal"><View style={styles.header}><Text style={styles.title}>Κριτήρια Αναζήτησης</Text><Pressable onPress={onClose} testID="chat-filter-set-details-close"><Ionicons name="close-outline" size={22} color={colors.onSurface} /></Pressable></View>{data ? <><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>{data.title ? <Row label="Τίτλος" value={data.title} styles={styles} /> : null}<Row label="Ενοίκιο" value={`${data.rentMin || "0"} - ${data.rentMax || "∞"} €`} styles={styles} /><Row label="Τιμή / τ.μ." value={`${data.minSqmPrice || "0"} - ${data.maxSqmPrice || "∞"} €/m²`} styles={styles} /><Row label="Περιοχή / Πόλη" value={data.cityQuery?.trim() || "Όλες οι περιοχές"} styles={styles} /><Row label="Εμβαδόν" value={`${data.sizeMin || "0"} - ${data.sizeMax || "∞"} m²`} styles={styles} /><Row label="Κατοικίδια" value={data.petFriendly ? "Ναι" : "Όχι"} styles={styles} /><Row label="Μετρό" value={data.nearMetro ? "Ναι" : "Όχι"} styles={styles} /><Row label="Ταξινόμηση" value={sortLabels[data.sortBy || "newest"] || data.sortBy || "Πιο πρόσφατα"} styles={styles} /></ScrollView>{canApply ? <Pressable style={styles.apply} onPress={onApply} testID="broker-apply-filter-set-btn"><Ionicons name="search-outline" size={19} color={colors.onBrand} /><Text style={styles.applyText}>Εφαρμογή στην Αναζήτηση</Text></Pressable> : null}</> : null}</View></View></Modal>;
}

function Row({ label, value, styles }: { label: string; value: string; styles: Record<string, any> }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { maxHeight: "80%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  scroll: { flexGrow: 0 },
  content: { gap: spacing.sm },
  row: { gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  value: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  apply: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.brand, paddingVertical: spacing.md },
  applyText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
});
