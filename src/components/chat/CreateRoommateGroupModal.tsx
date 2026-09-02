import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { createRoommateGroupChat } from "@/src/api/chat";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

type GroupCandidate = {
  id: string;
  name: string;
  photo?: string;
  isHost: boolean;
  apartmentId?: string;
  apartmentTitle?: string;
};

export interface CreateRoommateGroupModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (chatRoomId: string) => void;
}

export default function CreateRoommateGroupModal({ visible, userId, onClose, onCreated }: CreateRoommateGroupModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const chats = await getDocs(query(collection(db, "chats"), where("users", "array-contains", userId)));
        const counterpartById = new Map<string, GroupCandidate>();
        await Promise.all(chats.docs.map(async (chatDoc) => {
          const data = chatDoc.data() as { users?: string[]; type?: string; apartmentId?: string; apartmentTitle?: string; hostApartmentId?: string };
          const isHostChat = data.type === "host";
          const apartmentId = data.hostApartmentId || data.apartmentId;
          if (data.type !== "roommate" && data.type !== "host") return;
          await Promise.all((Array.isArray(data.users) ? data.users : []).filter((id) => id !== userId).map(async (candidateId) => {
            const existingCandidate = counterpartById.get(candidateId);
            if (existingCandidate) {
              if (isHostChat && !existingCandidate.isHost) {
                counterpartById.set(candidateId, {
                  ...existingCandidate,
                  isHost: true,
                  ...(apartmentId ? { apartmentId } : {}),
                  ...(data.apartmentTitle ? { apartmentTitle: data.apartmentTitle } : {}),
                });
              }
              return;
            }
            const userSnapshot = await getDoc(doc(db, "users", candidateId));
            if (!userSnapshot.exists()) return;
            const user = userSnapshot.data() as { name?: string; photoUrl?: string; photos?: string[]; deleted?: boolean };
            if (user.deleted) return;
            counterpartById.set(candidateId, {
              id: candidateId,
              name: user.name?.trim() || "Άγνωστος χρήστης",
              photo: user.photoUrl || user.photos?.[0] || "",
              isHost: isHostChat,
              ...(apartmentId ? { apartmentId } : {}),
              ...(data.apartmentTitle ? { apartmentTitle: data.apartmentTitle } : {}),
            });
          }));
        }));
        if (active) setCandidates(Array.from(counterpartById.values()));
      } catch {
        if (active) setCandidates([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId, visible]);

  const selectedHost = candidates.find((candidate) => candidate.isHost && selectedIds.includes(candidate.id));
  const toggleCandidate = (candidate: GroupCandidate) => {
    if (!selectedIds.includes(candidate.id) && candidate.isHost && selectedHost) return;
    setSelectedIds((previous) => previous.includes(candidate.id) ? previous.filter((id) => id !== candidate.id) : [...previous, candidate.id]);
  };
  const createGroup = async () => {
    if (selectedIds.length < 2 || creating) return;
    setCreating(true);
    try {
      const roomId = await createRoommateGroupChat({
        creatorId: userId,
        memberIds: selectedIds,
        ...(selectedHost?.id ? { hostUserId: selectedHost.id } : {}),
        hostUserIds: candidates.filter((candidate) => candidate.isHost && selectedIds.includes(candidate.id)).map((candidate) => candidate.id),
        ...(selectedHost?.apartmentId ? { hostApartmentId: selectedHost.apartmentId } : {}),
      });
      setSelectedIds([]);
      onCreated(roomId);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="create-roommate-group-modal">
          <View style={styles.header}>
            <View><Text style={styles.title}>Δημιουργία Ομαδικής</Text><Text style={styles.subtitle}>Επίλεξε τουλάχιστον 2 συμμετέχοντες</Text></View>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable>
          </View>
          {selectedHost ? <Text style={styles.warning}>Μπορεί να προστεθεί το πολύ 1 Host με ακίνητο στην ομαδική</Text> : null}
          {loading ? <ActivityIndicator color={colors.brand} /> : (
            <ScrollView contentContainerStyle={styles.list} bounces={false}>
              {candidates.map((candidate) => {
                const selected = selectedIds.includes(candidate.id);
                const disabled = candidate.isHost && !!selectedHost && !selected;
                return <Pressable key={candidate.id} style={[styles.row, disabled && styles.disabled]} onPress={() => toggleCandidate(candidate)} disabled={disabled} testID={`group-candidate-${candidate.id}`}>
                  {candidate.photo ? <Image source={{ uri: candidate.photo }} style={styles.avatar} /> : <View style={styles.avatar}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /></View>}
                  <View style={styles.rowCopy}><Text style={styles.name}>{candidate.name}</Text><Text style={styles.role}>{candidate.isHost ? "Host" : "Συγκάτοικος"}</Text></View>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Ionicons name="checkmark" size={16} color={colors.onBrand} /> : null}</View>
                </Pressable>;
              })}
              {candidates.length === 0 ? <Text style={styles.empty}>Δεν υπάρχουν διαθέσιμα matches.</Text> : null}
            </ScrollView>
          )}
          <Pressable style={[styles.createButton, selectedIds.length < 2 && styles.createDisabled]} disabled={selectedIds.length < 2 || creating} onPress={() => void createGroup()} testID="create-roommate-group-submit">
            {creating ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="people-circle-outline" size={20} color={colors.onBrand} /><Text style={styles.createText}>Δημιουργία Ομαδικής</Text></>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "85%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  subtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  warning: { color: colors.warning, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  list: { gap: spacing.sm, paddingVertical: spacing.xs },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  disabled: { opacity: 0.45 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  rowCopy: { flex: 1 },
  name: { fontFamily: fonts.semibold, color: colors.onSurface, fontSize: fontSize.base },
  role: { marginTop: 2, fontFamily: fonts.regular, color: colors.onSurfaceTertiary, fontSize: fontSize.sm },
  checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  empty: { paddingVertical: spacing.xl, textAlign: "center", color: colors.onSurfaceTertiary, fontFamily: fonts.regular },
  createButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  createDisabled: { opacity: 0.45 },
  createText: { color: colors.onBrand, fontFamily: fonts.bold, fontSize: fontSize.base },
});