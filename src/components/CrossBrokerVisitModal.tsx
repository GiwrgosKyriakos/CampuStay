import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getBrokerClientProfiles, type BrokerClientProfile } from "@/src/api/brokerClientProfiles";
import { createCrossBrokerShowing } from "@/src/api/agencyCollaboration";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function CrossBrokerVisitModal({ visible, agencyId, brokerId, listingBrokerId, apartmentId, apartmentTitle, apartmentAddress, apartmentPrice, onClose, onCreated }: { visible: boolean; agencyId: string; brokerId: string; listingBrokerId: string; apartmentId: string; apartmentTitle: string; apartmentAddress: string; apartmentPrice?: number; onClose: () => void; onCreated: () => void }) {
  const { colors } = useTheme();
  const [clients, setClients] = useState<BrokerClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  useEffect(() => {
    if (!visible || !brokerId) return;
    let active = true;
    setLoading(true);
    void getBrokerClientProfiles(brokerId).then((profiles) => {
      if (active) setClients(profiles.filter((profile) => profile.role !== "owner"));
    }).catch(() => {
      if (active) setClients([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [brokerId, visible]);
  const submit = async () => {
    const client = clients.find((item) => item.clientId === selectedClientId);
    if (!client || !date.match(/^\d{4}-\d{2}-\d{2}$/) || !time.match(/^([01]\d|2[0-3]):[0-5]\d$/) || saving) return;
    setSaving(true);
    try {
      await createCrossBrokerShowing({ agencyId, apartmentId, apartmentTitle, apartmentAddress, listingBrokerId, buyerBrokerId: brokerId, clientId: client.clientId, clientName: client.clientName || "Πελάτης", apartmentPrice, appointmentDate: `${date}T${time}:00` });
      onCreated();
    } catch (error) {
      Alert.alert("Η επίσκεψη απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Κλείσε επίσκεψη</Text><Text style={styles.subtitle}>{apartmentTitle}</Text></View><Pressable onPress={onClose}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View><Text style={styles.label}>Πελάτης</Text>{loading ? <ActivityIndicator color={colors.brand} /> : <ScrollView style={styles.clientList} contentContainerStyle={styles.clientListContent} bounces={false}>{clients.map((client) => <Pressable key={client.clientId} style={[styles.clientRow, selectedClientId === client.clientId && styles.clientRowSelected]} onPress={() => setSelectedClientId(client.clientId)}><View style={styles.clientCopy}><Text style={styles.clientName}>{client.clientName || "Πελάτης"}</Text><Text style={styles.clientMeta}>{client.role === "owner" ? "Ιδιοκτήτης" : "Πελάτης"}</Text></View><Ionicons name={selectedClientId === client.clientId ? "checkmark-circle" : "ellipse-outline"} size={21} color={selectedClientId === client.clientId ? colors.brand : colors.onSurfaceTertiary} /></Pressable>)}</ScrollView>}<Text style={styles.label}>Ημερομηνία</Text><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="numbers-and-punctuation" testID="cross-broker-visit-date" /><Text style={styles.label}>Ώρα</Text><TextInput value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="numbers-and-punctuation" testID="cross-broker-visit-time" /><Pressable style={[styles.submit, (!selectedClientId || saving) && styles.submitDisabled]} disabled={!selectedClientId || saving} onPress={() => void submit()} testID="cross-broker-visit-submit">{saving ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="calendar-outline" size={18} color={colors.onBrand} /><Text style={styles.submitText}>Προγραμματισμός</Text></>}</Pressable></View></View></Modal>;
}
const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "88%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  label: { marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  clientList: { maxHeight: 180 },
  clientListContent: { gap: spacing.xs },
  clientRow: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clientRowSelected: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  clientCopy: { flex: 1, gap: 2 },
  clientName: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  clientMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  submit: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  submitDisabled: { opacity: 0.45 },
  submitText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});