import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { t } from "@/src/locales";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

export interface BrokerSelectorItem {
  id: string;
  name: string;
  avatar?: string;
  agencyName?: string;
  rating?: number;
}

export default function BrokerSelectorPopover({
  visible,
  brokers,
  loading,
  onClose,
  onSelect,
}: {
  visible: boolean;
  brokers: BrokerSelectorItem[];
  loading?: boolean;
  onClose: () => void;
  onSelect: (broker: BrokerSelectorItem) => void;
}) {
  const { colors } = useTheme();
  return (
    <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="78%">
          <View style={styles.content}>
          <View style={styles.header}><View style={styles.titleWrap}><Ionicons name="people-outline" size={21} color={colors.brand} /><Text style={[styles.title, { color: colors.onSurface }]}>{t("apartments.selectManagingBrokerTitle")}</Text></View><Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable></View>
          <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{t("apartments.selectManagingBrokerSubtitle")}</Text>
          {loading ? <ActivityIndicator color={colors.brand} /> : <View style={styles.list}>{brokers.map((broker) => <View key={broker.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><View style={[styles.avatarFallback, { backgroundColor: colors.brandTertiary }]}>{broker.avatar ? <Image source={{ uri: broker.avatar }} style={styles.avatar} /> : <Ionicons name="person-outline" size={21} color={colors.brand} />}</View><View style={styles.info}><Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{broker.name}</Text>{broker.agencyName ? <Text style={[styles.agency, { color: colors.brand }]} numberOfLines={1}>{broker.agencyName}</Text> : null}{typeof broker.rating === "number" ? <View style={styles.rating}><Ionicons name="star" size={13} color="#F59E0B" /><Text style={[styles.ratingText, { color: colors.onSurfaceTertiary }]}>{broker.rating.toFixed(1)}</Text></View> : null}</View><Pressable style={[styles.chatButton, { backgroundColor: colors.brand }]} onPress={() => onSelect(broker)} testID={`broker-selector-chat-${broker.id}`}><Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.onBrand} /><Text style={[styles.chatButtonText, { color: colors.onBrand }]}>Συνομιλία</Text></Pressable></View>)}</View>}
          </View>
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, flex: 1 },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  list: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatar: { width: 42, height: 42 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  agency: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  chatButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  chatButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
});
