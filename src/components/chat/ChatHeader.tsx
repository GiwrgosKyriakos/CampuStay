import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import type { ThemeColors } from "@/src/theme";

type ChatHeaderStyles = Record<string, any>;

export interface ChatHeaderProps {
  styles: ChatHeaderStyles;
  colors: ThemeColors;
  topInset: number;
  spacing: { sm: number };
  isHostChat: boolean;
  apartmentLocked: boolean;
  hostApartment?: { image?: string } | null;
  apartmentTitle: string;
  apartmentSubtitle: string;
  apartmentPrice: string;
  showHostClientActions: boolean;
  inputBlocked: boolean;
  showHostActionMenu: boolean;
  onApartmentPress: () => void;
  onToggleHostActions: () => void;
  onPriceProposal: () => void;
  onVisitRequest: () => void;
  showAvatarImage: boolean;
  avatarUri?: string;
  displayName: string;
  displayUniversity: string;
  hostPhoneNumber: string;
  onProfilePress: () => void;
  profileDisabled: boolean;
  onBack: () => void;
  onContextMenu: () => void;
  onFilterHistory: () => void;
  filterHistoryActive: boolean;
  isRoommateChat: boolean;
  showMutualLikes: boolean;
  onMutualLikes: () => void;
  testID?: string;
}

export default function ChatHeader({
  styles,
  colors,
  topInset,
  spacing,
  isHostChat,
  apartmentLocked,
  hostApartment,
  apartmentTitle,
  apartmentSubtitle,
  apartmentPrice,
  showHostClientActions,
  inputBlocked,
  showHostActionMenu,
  onApartmentPress,
  onToggleHostActions,
  onPriceProposal,
  onVisitRequest,
  showAvatarImage,
  avatarUri,
  displayName,
  displayUniversity,
  hostPhoneNumber,
  onProfilePress,
  profileDisabled,
  onBack,
  onContextMenu,
  onFilterHistory,
  filterHistoryActive,
  isRoommateChat,
  showMutualLikes,
  onMutualLikes,
  testID,
}: ChatHeaderProps) {
  const hasApartment = isHostChat && (hostApartment || apartmentTitle);

  return (
    <View style={[styles.header, { paddingTop: topInset + spacing.sm }]} testID={testID}>
      {hasApartment ? (
        <Pressable
          style={[styles.apartmentPill, apartmentLocked && styles.apartmentPillDisabled]}
          onPress={onApartmentPress}
          disabled={apartmentLocked}
          testID="chat-apartment-pill"
        >
          {apartmentLocked ? (
            <View style={styles.apartmentThumbFallback}>
              <Ionicons name="image-outline" size={16} color={colors.onSurfaceTertiary} />
            </View>
          ) : hostApartment?.image ? (
            <Image source={{ uri: hostApartment.image }} style={styles.apartmentThumb} contentFit="cover" />
          ) : (
            <View style={styles.apartmentThumbFallback}>
              <Ionicons name="home-outline" size={16} color={colors.onSurfaceTertiary} />
            </View>
          )}
          <View style={styles.apartmentPillTextWrap}>
            <Text style={styles.apartmentPillText} numberOfLines={1}>{apartmentTitle}</Text>
            {!apartmentLocked && (apartmentSubtitle || apartmentPrice) ? (
              <Text style={styles.apartmentPillMeta} numberOfLines={1}>
                {[apartmentSubtitle, apartmentPrice].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          {showHostClientActions && !inputBlocked ? (
            <Pressable style={styles.hostActionTrigger} onPress={onToggleHostActions} hitSlop={6} testID="chat-host-actions-trigger">
              <Ionicons name={showHostActionMenu ? "chevron-down" : "chevron-down-circle-outline"} size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null}
        </Pressable>
      ) : null}
      {showHostActionMenu && showHostClientActions && !inputBlocked ? (
        <View style={styles.hostActionMenu} testID="chat-host-actions-menu">
          <Pressable style={styles.hostActionMenuItem} onPress={onPriceProposal} testID="chat-host-action-price-proposal">
            <Text style={styles.hostActionMenuText}>Πρότεινε τιμή</Text>
          </Pressable>
          <Pressable style={styles.hostActionMenuItem} onPress={onVisitRequest} testID="chat-host-action-visit-request">
            <Text style={styles.hostActionMenuText}>Ζήτα επίσκεψη</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.headerTop}>
        <Pressable style={styles.iconBtn} onPress={onBack} testID="chat-back-button" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.headerProfileTapArea} onPress={onProfilePress} disabled={profileDisabled} testID="chat-header-profile-trigger">
          {showAvatarImage && avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <DefaultProfileAvatar size={44} iconSize={22} testID="chat-header-avatar-fallback" />
          )}
          <View style={[styles.headerTextWrap, !displayUniversity?.trim() && { transform: [{ translateY: 7 }] }]}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
              {hostPhoneNumber ? (
                <View style={styles.hostPhoneBadge}>
                  <Ionicons name="call-outline" size={11} color={colors.onSurfaceTertiary} />
                  <Text style={styles.hostPhoneBadgeText} numberOfLines={1}>{hostPhoneNumber}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.headerUni} numberOfLines={1}>{displayUniversity}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onContextMenu} testID="chat-context-menu-button" hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable style={[styles.iconBtn, filterHistoryActive && styles.iconBtnActive]} onPress={onFilterHistory} testID="chat-filter-history-toggle" hitSlop={8}>
          <Ionicons name="time-outline" size={22} color={filterHistoryActive ? colors.brand : colors.onSurface} />
        </Pressable>
        {isRoommateChat ? (
          <Pressable style={[styles.iconBtn, showMutualLikes && styles.iconBtnActive]} onPress={onMutualLikes} testID="chat-mutual-likes-toggle" hitSlop={8}>
            <Text style={[styles.mutualLikesEmoji, showMutualLikes && styles.mutualLikesEmojiActive]}>💕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
