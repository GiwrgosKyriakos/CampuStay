import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import type { SharedProfileMessageMetadata } from "@/src/types/chat";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

export default function RoommateDeckDetailModal({ visible, profile, onClose }: { visible: boolean; profile: SharedProfileMessageMetadata | null; onClose: () => void }) {
  const { colors } = useTheme();
  if (!profile) return null;
  const data = profile.sharedUserData;
  const photos = data.photos?.length ? data.photos : data.avatarUrl ? [data.avatarUrl] : [];
  const quizAnswers = Object.entries(data.compatibilityQuizAnswers ?? {});
  return <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="90%"><View style={styles.contentWrap}><View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Προφίλ συγκάτοικου</Text><Pressable onPress={onClose}><Ionicons name="close-outline" size={24} color={colors.onSurface} /></Pressable></View><View style={styles.content}>{photos.length ? <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photoStrip} contentContainerStyle={styles.photoStripContent}>{photos.map((photo) => <Image key={photo} source={{ uri: photo }} style={styles.avatar} contentFit="cover" />)}</ScrollView> : <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="person-outline" size={42} color={colors.onSurfaceTertiary} /></View>}<Text style={[styles.name, { color: colors.onSurface }]}>{data.fullName}</Text>{data.compatibilityScore != null ? <View style={[styles.matchBadge, { backgroundColor: colors.brandTertiary }]}><Ionicons name="sparkles-outline" size={16} color={colors.brand} /><Text style={[styles.matchText, { color: colors.brand }]}>{data.compatibilityScore}% Match</Text></View> : null}<View style={styles.metaGrid}>{data.age ? <Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>{data.age} ετών</Text> : null}{data.budget ? <Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>€{data.budget}/μήνα</Text> : null}{data.gender ? <Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>{data.gender}</Text> : null}</View>{data.program || data.university ? <Text style={[styles.meta, { color: colors.onSurfaceTertiary }]}>{[data.program, data.university].filter(Boolean).join(" · ")}</Text> : null}{data.bio ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Σχετικά</Text><Text style={[styles.body, { color: colors.onSurfaceTertiary }]}>{data.bio}</Text></View> : null}{data.lifestyleBadges?.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Lifestyle</Text><View style={styles.badges}>{data.lifestyleBadges.map((badge) => <View key={badge} style={[styles.badge, { backgroundColor: colors.brandTertiary }]}><Text style={[styles.badgeText, { color: colors.onBrandTertiary }]}>{badge}</Text></View>)}</View></View> : null}{quizAnswers.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Ανάλυση συμβατότητας</Text>{quizAnswers.map(([key, value]) => <View key={key} style={styles.detailRow}><Text style={[styles.detailKey, { color: colors.onSurfaceTertiary }]}>{key}</Text><Text style={[styles.body, { color: colors.onSurface }]}>{String(value)}</Text></View>)}</View> : null}{data.hardCriteria ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Hard criteria</Text>{Object.entries(data.hardCriteria).map(([key, value]) => <Text key={key} style={[styles.body, { color: colors.onSurfaceTertiary }]}>{key}: {String(value)}</Text>)}</View> : null}</View></View></BaseBottomSheet>;
}
const styles = StyleSheet.create({
  contentWrap: { padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  content: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  avatar: { width: 170, height: 210, borderRadius: radius.lg, backgroundColor: "#D7D9DD" },
  photoStrip: { width: "100%", maxHeight: 230 },
  photoStripContent: { alignItems: "center", gap: spacing.sm },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bold, fontSize: fontSize.xl },
  matchBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  matchText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.base },
  section: { width: "100%", gap: spacing.xs, marginTop: spacing.md },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base },
  body: { fontFamily: fonts.regular, fontSize: fontSize.base, lineHeight: 22 },
  detailRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  detailKey: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
});