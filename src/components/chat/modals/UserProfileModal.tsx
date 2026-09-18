import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { RoommateProfile } from "@/src/data/profiles";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { localizeCity } from "@/src/utils/localizeData";
import type { FirestoreUserDoc } from "./types";
import ShareProfileButton from "@/src/components/chat/ShareProfileButton";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";
import type { PropertyCardMessageData } from "@/src/api/chat";

type SocialIconName = React.ComponentProps<typeof Ionicons>["name"];

export type RecentApartmentPreview = PropertyCardMessageData;

export interface UserProfileModalProps {
  visible: boolean;
  profile: RoommateProfile | null;
  details: FirestoreUserDoc | null;
  compatibilityScore: number | null;
  displayName: string;
  displayAbout: string;
  displayGender?: string;
  displayBudget?: string;
  showAvatar: boolean;
  socialLinks: { id: string; label: string; icon: SocialIconName; url: string }[];
  canShare?: boolean;
  onShare?: () => void;
  recentApartment?: RecentApartmentPreview | null;
  canShareListing?: boolean;
  onOpenRecentApartment?: () => void;
  onShareListing?: () => void;
  onClose: () => void;
}

export default function UserProfileModal({ visible, profile, details, compatibilityScore, displayName, displayAbout, displayGender, displayBudget, showAvatar, socialLinks, canShare = false, onShare, recentApartment, canShareListing = false, onOpenRecentApartment, onShareListing, onClose }: UserProfileModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const activeProfile = profile;
  const city = localizeCity(details?.city?.trim() || activeProfile?.city) || t("common.values.notAvailable");
  const university = activeProfile?.university || t("common.values.notAvailable");

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable>
      <View style={styles.scrollContent}>
          <View style={styles.topRow}>
            <View style={styles.summary}>
              {showAvatar && activeProfile?.photo ? <Image source={{ uri: activeProfile.photo }} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><Ionicons name="person-outline" size={28} color={colors.onSurfaceTertiary} /></View>}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.line}>{t("common.format.ageLabel", { age: activeProfile?.age || 0 })}</Text>
                {displayGender ? <Text style={styles.line}>{displayGender}</Text> : null}
                <Text style={styles.line}>{city}</Text>
                <Text style={styles.line} numberOfLines={1}>{university}</Text>
                {displayBudget ? <Text style={styles.line}>{displayBudget}</Text> : null}
              </View>
            </View>
            <View style={styles.topActions}>{canShare && onShare ? <ShareProfileButton user={details} hidden={false} onPress={onShare} /> : null}<View style={styles.compatibility}><Text style={styles.compatibilityLabel}>{t("chat.compatibility")}</Text><Text style={styles.compatibilityValue}>{compatibilityScore != null ? `${compatibilityScore}%` : "--"}</Text></View></View>
          </View>
          <View style={styles.section}><Text style={styles.sectionTitle}>{t("chat.aboutMe")}</Text><Text style={styles.body}>{displayAbout}</Text></View>
          {recentApartment && onOpenRecentApartment ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("chat.listingShare.latestListing")}</Text>
              <Pressable style={styles.listingRow} onPress={onOpenRecentApartment} testID="chat-profile-latest-listing">
                {recentApartment.image ? <Image source={{ uri: recentApartment.image }} style={styles.listingImage} contentFit="cover" /> : <View style={styles.listingImageFallback}><Ionicons name="home-outline" size={20} color={colors.onSurfaceTertiary} /></View>}
                <View style={styles.listingCopy}>
                  <Text style={styles.listingTitle} numberOfLines={1}>{recentApartment.title}</Text>
                  <Text style={styles.listingLocation} numberOfLines={1}>{[recentApartment.area, recentApartment.city].filter(Boolean).join(" · ")}</Text>
                  <View style={styles.listingPrice}><Text style={styles.listingPriceText}>{`€${recentApartment.rent}`}</Text></View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
              {canShareListing && onShareListing ? <Pressable style={styles.shareListingButton} onPress={onShareListing} testID="chat-profile-share-listing"><Ionicons name="share-social-outline" size={17} color={colors.onBrand} /><Text style={styles.shareListingText}>{t("chat.listingShare.action")}</Text></Pressable> : null}
            </View>
          ) : null}
          {socialLinks.length > 0 ? <View style={styles.section}><Text style={styles.sectionTitle}>{t("chat.socialLinks")}</Text><View style={styles.socialGrid}>{socialLinks.map((social) => <Pressable key={social.id} style={styles.socialPill} onPress={() => void Linking.openURL(social.url)} testID={`chat-social-link-${social.id}`}><Ionicons name={social.icon} size={16} color={colors.onBrandTertiary} /><Text style={styles.socialText}>{social.label}</Text></Pressable>)}</View></View> : null}
          <Pressable style={styles.close} onPress={onClose}><Text style={styles.closeText}>{t("common.actions.done")}</Text></Pressable>
      </View>
    </BaseBottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  scrollContent: { gap: spacing.lg, padding: spacing.lg },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  summary: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { width: 64, height: 64, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  meta: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  line: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  compatibility: { alignItems: "center", borderRadius: radius.md, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  topActions: { alignItems: "flex-end", gap: spacing.sm },
  compatibilityLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  compatibilityValue: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.brand },
  section: { gap: spacing.xs },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, lineHeight: 22 },
  listingRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  listingImage: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  listingImageFallback: { width: 56, height: 56, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  listingCopy: { flex: 1, gap: 3 },
  listingTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  listingLocation: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  listingPrice: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: colors.brandTertiary },
  listingPriceText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  shareListingButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.brand },
  shareListingText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  socialGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  socialPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  socialText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  close: { alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.brand, paddingVertical: spacing.md },
  closeText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
});
