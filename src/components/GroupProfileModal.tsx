import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";
import type { FirestoreUserDoc } from "@/src/components/chat/modals/types";
import type { RoommateProfile } from "@/src/data/profiles";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export interface GroupProfileMember {
  id: string;
  name: string;
  photo: string;
  isHost: boolean;
  profile: RoommateProfile;
  details: FirestoreUserDoc;
}

export interface GroupProfileModalProps {
  visible: boolean;
  groupName: string;
  members: GroupProfileMember[];
  hostUserId?: string;
  onRename: (name: string) => Promise<void>;
  onSelectProperty: () => void;
  onMemberPress: (member: GroupProfileMember) => void;
  onClose: () => void;
}

export default function GroupProfileModal({ visible, groupName, members, hostUserId, onRename, onSelectProperty, onMemberPress, onClose }: GroupProfileModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(groupName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraftName(groupName);
      setEditing(false);
    }
  }, [groupName, visible]);

  const saveName = async () => {
    const nextName = draftName.trim();
    if (!nextName || saving) return;
    setSaving(true);
    try {
      await onRename(nextName);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable>
      <View style={styles.content} testID="group-profile-modal">
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t("chat.groupProfile.title")}</Text>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput value={draftName} onChangeText={setDraftName} autoFocus style={styles.nameInput} maxLength={60} />
                <Pressable onPress={() => void saveName()} disabled={saving || !draftName.trim()} hitSlop={8} testID="group-profile-save-name">
                  {saving ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="checkmark-circle-outline" size={25} color={colors.brand} />}
                </Pressable>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.groupName} numberOfLines={2}>{groupName}</Text>
                <Pressable onPress={() => setEditing(true)} hitSlop={8} testID="group-profile-edit-name">
                  <Ionicons name="pencil-outline" size={18} color={colors.brand} />
                </Pressable>
              </View>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} testID="group-profile-close">
            <Ionicons name="close-outline" size={25} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <Pressable style={styles.propertyButton} onPress={onSelectProperty} testID="group-profile-property-selector">
          <Ionicons name="home-outline" size={20} color={colors.brand} />
          <Text style={styles.propertyButtonText}>{t("chat.groupProfile.selectProperty")}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.brand} />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("chat.groupProfile.members", { count: members.length })}</Text>
          <View style={styles.memberList}>
            {members.map((member) => (
              <Pressable key={member.id} style={styles.memberRow} onPress={() => onMemberPress(member)} testID={`group-profile-member-${member.id}`}>
                {member.photo ? <Image source={{ uri: member.photo }} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} /></View>}
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  {member.isHost || member.id === hostUserId ? <Text style={styles.hostBadge}>{t("chat.groupProfile.host")}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </BaseBottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupName: { flex: 1, fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nameInput: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  propertyButton: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  propertyButtonText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onBrandTertiary },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  memberList: { gap: spacing.sm },
  memberRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  hostBadge: { alignSelf: "flex-start", fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onBrandTertiary, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill },
});