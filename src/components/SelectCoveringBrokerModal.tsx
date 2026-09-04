import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { getAgencyStaff, type AgencyStaffMember } from "@/src/api/agencyCollaboration";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

export default function SelectCoveringBrokerModal({ visible, agencyId, currentUserId, selectedId, onClose, onSelect }: { visible: boolean; agencyId: string; currentUserId: string; selectedId?: string; onClose: () => void; onSelect: (broker: AgencyStaffMember) => void }) {
  const { colors } = useTheme();
  const [brokers, setBrokers] = useState<AgencyStaffMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !agencyId) return;
    let active = true;
    setLoading(true);
    void getAgencyStaff(agencyId).then((members) => {
      if (active) setBrokers(members.filter((member) => member.id !== currentUserId));
    }).catch(() => {
      if (active) setBrokers([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agencyId, currentUserId, visible]);

  return <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="78%"><View style={styles.content}><View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Ανάθεση σε Συνάδελφο</Text><Pressable onPress={onClose}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>{loading ? <ActivityIndicator color={colors.brand} /> : <View style={styles.list}>{brokers.map((broker) => <Pressable key={broker.id} style={[styles.row, { backgroundColor: colors.surfaceSecondary }, selectedId === broker.id && { borderColor: colors.brand }]} onPress={() => onSelect(broker)} testID={`covering-broker-${broker.id}`}>{broker.avatar ? <Image source={{ uri: broker.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.fallback]}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /></View>}<View style={styles.copy}><Text style={[styles.name, { color: colors.onSurface }]}>{broker.name}</Text><Text style={[styles.role, { color: colors.onSurfaceTertiary }]}>{broker.agencyRole || "Μεσίτης"}</Text></View><Ionicons name="checkmark-circle-outline" size={21} color={selectedId === broker.id ? colors.brand : colors.onSurfaceTertiary} /></Pressable>)}</View>}{!loading && brokers.length === 0 ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν διαθέσιμοι συνεργάτες.</Text> : null}</View></BaseBottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  list: { gap: spacing.sm },
  row: { minHeight: 62, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent", padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: "#D7D9DD" },
  fallback: { alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base },
  role: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  empty: { textAlign: "center", fontFamily: fonts.regular, paddingVertical: spacing.lg },
});