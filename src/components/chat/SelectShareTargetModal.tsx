import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { sendSharedRoommateProfile } from "@/src/api/chat";
import type { SharedProfileMessageMetadata } from "@/src/types/chat";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize } from "@/src/theme";

type Target = { id: string; label: string; kind: "roommate" | "host" };
export default function SelectShareTargetModal({ visible, currentUserId, profile, onClose, onSent }: { visible: boolean; currentUserId: string; profile: SharedProfileMessageMetadata; onClose: () => void; onSent: () => void }) {
  const { colors } = useTheme();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || !currentUserId) return;
    let active = true;
    setLoading(true);
    void getDocs(query(collection(db, "chats"), where("users", "array-contains", currentUserId))).then(async (snapshot) => {
      const result: Target[] = [];
      for (const chat of snapshot.docs) {
        const data = chat.data() as { users?: string[]; type?: string; status?: string };
        if (data.status === "rejected" || data.type === "roommate_group") continue;
        const targetId = (data.users || []).find((id) => id !== currentUserId);
        if (!targetId) continue;
        const targetSnapshot = await getDoc(doc(db, "users", targetId));
        if (!targetSnapshot.exists()) continue;
        const target = targetSnapshot.data() as { name?: string; looking_for_roommate?: boolean; not_looking_for_roommate?: boolean };
        const kind = data.type === "host" ? "host" : "roommate";
        if (kind === "host" && target.looking_for_roommate !== true && target.not_looking_for_roommate !== false) continue;
        result.push({ id: chat.id, label: target.name?.trim() || "Συνομιλία", kind });
      }
      if (active) setTargets(result);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUserId, visible]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}><View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Κοινοποίηση προφίλ</Text><Pressable onPress={onClose}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View>{loading ? <ActivityIndicator color={colors.brand} /> : <ScrollView contentContainerStyle={styles.list} bounces={false}>{targets.map((target) => <Pressable key={target.id} style={[styles.row, { backgroundColor: colors.surfaceSecondary }]} disabled={!!sending} onPress={() => { setSending(target.id); void sendSharedRoommateProfile({ chatRoomId: target.id, senderId: currentUserId, metadata: profile }).then(onSent).finally(() => setSending(null)); }}><Ionicons name={target.kind === "host" ? "home-outline" : "people-outline"} size={22} color={colors.brand} /><Text style={[styles.label, { color: colors.onSurface }]}>{target.label}</Text>{sending === target.id ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />}</Pressable>)}</ScrollView>}{!loading && targets.length === 0 ? <Text style={[styles.empty, { color: colors.onSurfaceTertiary }]}>Δεν υπάρχουν ενεργές συνομιλίες.</Text> : null}</View></View></Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "78%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  list: { gap: spacing.sm },
  row: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base },
  empty: { textAlign: "center", fontFamily: fonts.regular, paddingVertical: spacing.lg },
});