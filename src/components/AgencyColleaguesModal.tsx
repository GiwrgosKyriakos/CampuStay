import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { getAgencyStaff, type AgencyStaffMember } from "@/src/api/agencyCollaboration";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function AgencyColleaguesModal({ visible, agencyId, currentUserId, onClose, onSelect }: { visible: boolean; agencyId: string; currentUserId: string; onClose: () => void; onSelect: (colleague: AgencyStaffMember) => void }) {
  const { colors } = useTheme();
  const [colleagues, setColleagues] = useState<AgencyStaffMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !agencyId) return;
    let active = true;
    setLoading(true);
    void getAgencyStaff(agencyId).then((members) => {
      if (active) setColleagues(members.filter((member) => member.id !== currentUserId));
    }).catch(() => {
      if (active) setColleagues([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agencyId, currentUserId, visible]);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Συνεργάτες</Text><Pressable onPress={onClose} hitSlop={8}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>
      {loading ? <ActivityIndicator color={colors.brand} /> : <ScrollView contentContainerStyle={styles.list} bounces={false}>{colleagues.map((colleague) => <Pressable key={colleague.id} style={[styles.row, { backgroundColor: colors.surfaceSecondary }]} onPress={() => onSelect(colleague)} testID={`agency-colleague-${colleague.id}`}>{colleague.avatar ? <Image source={{ uri: colleague.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /></View>}<View style={styles.copy}><Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{colleague.name}</Text><Text style={[styles.role, { color: colors.onSurfaceTertiary }]}>{colleague.agencyRole || "Μεσίτης"}</Text></View><Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.brand} /></Pressable>)}</ScrollView>}
      {!loading && colleagues.length === 0 ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>Δεν βρέθηκαν ενεργοί συνεργάτες.</Text> : null}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "78%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xl },
  list: { gap: spacing.sm },
  row: { minHeight: 62, borderRadius: radius.md, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: "#D7D9DD" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base },
  role: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  empty: { paddingVertical: spacing.lg, textAlign: "center", fontFamily: fonts.regular },
});