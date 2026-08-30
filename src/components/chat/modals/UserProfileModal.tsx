import React, { useEffect, useMemo, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Animated, Linking, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import type { RoommateProfile } from "@/src/data/profiles";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import type { FirestoreUserDoc } from "./types";

export interface UserProfileModalProps {
  visible: boolean;
  profile: RoommateProfile | null;
  details: FirestoreUserDoc | null;
  compatibilityScore: number | null;
  displayName: string;
  displayAbout: string;
  showAvatar: boolean;
  socialLinks: { id: string; label: string; icon: any; url: string }[];
  onClose: () => void;
}

export default function UserProfileModal({ visible, profile, details, compatibilityScore, displayName, displayAbout, showAvatar, socialLinks, onClose }: UserProfileModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const translateY = useRef(new Animated.Value(0)).current;
  const activeProfile = profile;
  const city = details?.city?.trim() || activeProfile?.city || t("common.values.notAvailable");
  const university = activeProfile?.university || t("common.values.notAvailable");

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [translateY, visible]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_event, gestureState) => {
      if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (gestureState.dy > 120 || gestureState.vy > 1.1) {
        Animated.timing(translateY, { toValue: 420, duration: 180, useNativeDriver: true }).start(onClose);
      } else {
        Animated.spring(translateY, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
      }
    },
  }), [onClose, translateY]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.topRow}>
            <View style={styles.summary}>
              {showAvatar && activeProfile?.photo ? <Image source={{ uri: activeProfile.photo }} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><Ionicons name="person-outline" size={28} color={colors.onSurfaceTertiary} /></View>}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.line}>{t("common.format.ageLabel", { age: activeProfile?.age || 0 })}</Text>
                <Text style={styles.line}>{city}</Text>
                <Text style={styles.line} numberOfLines={1}>{university}</Text>
              </View>
            </View>
            <View style={styles.compatibility}><Text style={styles.compatibilityLabel}>{t("chat.compatibility")}</Text><Text style={styles.compatibilityValue}>{compatibilityScore != null ? `${compatibilityScore}%` : "--"}</Text></View>
          </View>
          <View style={styles.section}><Text style={styles.sectionTitle}>{t("chat.aboutMe")}</Text><Text style={styles.body}>{displayAbout}</Text></View>
          {socialLinks.length > 0 ? <View style={styles.section}><Text style={styles.sectionTitle}>{t("chat.socialLinks")}</Text><View style={styles.socialGrid}>{socialLinks.map((social) => <Pressable key={social.id} style={styles.socialPill} onPress={() => void Linking.openURL(social.url)} testID={`chat-social-link-${social.id}`}><Ionicons name={social.icon} size={16} color={colors.onBrandTertiary} /><Text style={styles.socialText}>{social.label}</Text></Pressable>)}</View></View> : null}
          <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeText}>{t("common.actions.done")}</Text></Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  card: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  summary: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { width: 64, height: 64, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  meta: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  line: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  compatibility: { alignItems: "center", borderRadius: radius.md, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  compatibilityLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  compatibilityValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.brand },
  section: { gap: spacing.xs },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, lineHeight: 22 },
  socialGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  socialPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  socialText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  close: { alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.brand, paddingVertical: spacing.md },
  closeText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});
