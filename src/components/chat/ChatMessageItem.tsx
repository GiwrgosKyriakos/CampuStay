import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { ThemeColors } from "@/src/theme";
import { BrokerModificationBadge } from "@/src/components/BrokerModificationBadge";
import { t } from "@/src/locales";
import VisitMessageCard from "@/src/components/chat/VisitMessageCard";
import AddressCardMessage from "@/src/components/chat/AddressCardMessage";

export interface ChatMessageItemData {
  id: string;
  text: string;
  noteText?: string;
  senderId: string;
  type?: string;
  status?: "pending" | "approved";
  proposedPrice?: number;
  requestedDate?: string;
  requestedTime?: string;
  apartmentData?: {
    title: string;
    rent: number;
    city: string;
    area: string;
    image: string;
    imageUrl?: string;
    images?: string[];
    rooms: number;
    size: number;
  };
  filterSetData?: { title?: string; summary?: string; brokerModCount?: number; lastModifiedByBrokerName?: string; lastModifiedAt?: number };
  filterSetId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
  contractId?: string;
  contractType?: string;
  contractTitle?: string;
  metadata?: {
    appointmentId?: string;
    apartmentId?: string;
    apartmentTitle?: string;
    apartmentAddress?: string;
    appointmentDate?: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
    exactAddress?: string;
    latitude?: number;
    longitude?: number;
    sharedProfile?: { sharedUserId: string; sharedUserData: { fullName: string; avatarUrl?: string; age?: number; budget?: number; bio?: string; lifestyleBadges?: string[]; hardCriteria?: Record<string, any> } };
  };
}

type ChatMessageStyles = Record<string, any>;

export interface ChatMessageItemProps {
  message: ChatMessageItemData;
  styles: ChatMessageStyles;
  colors: ThemeColors;
  isMine: boolean;
  itemMarginStyle: object;
  borderRadii: object;
  isHostChat: boolean;
  isCurrentUserHost: boolean;
  canDeleteForEveryone: boolean;
  apartmentCoverImage?: string;
  statusLabel: string;
  formatRequestDate: (date: string) => string;
  onApartmentPress: () => void;
  onFilterSetPress: () => void;
  onPropertyListPress: () => void;
  onDeletePress: () => void;
  onApprove: () => void;
  onVisitEdit: () => void;
  showMatchScore: boolean;
  compatibilityScore: number;
  onSharedProfilePress: () => void;
  onContractPress: () => void;
}

export default function ChatMessageItem({
  message,
  styles,
  colors,
  isMine,
  itemMarginStyle,
  borderRadii,
  isHostChat,
  isCurrentUserHost,
  canDeleteForEveryone,
  apartmentCoverImage,
  statusLabel,
  formatRequestDate,
  onApartmentPress,
  onFilterSetPress,
  onPropertyListPress,
  onDeletePress,
  onApprove,
  onVisitEdit,
  showMatchScore,
  compatibilityScore,
  onSharedProfilePress,
  onContractPress,
}: ChatMessageItemProps) {
  const deleteProps = canDeleteForEveryone ? { onLongPress: onDeletePress, delayLongPress: 300 } : {};
  const apartmentShare = message.type === "apartment_share" && !!message.apartmentData;
  const noteShare = message.type === "apartment_note_share" && !!message.apartmentData;
  const filterShare = message.type === "filter_set_share" && !!message.filterSetData;
  const propertyListShare = message.type === "property_list_share";
  const actionShare = isHostChat && (message.type === "price_proposal" || message.type === "visit_request");

  if (apartmentShare && message.apartmentData) {
    const apartment = message.apartmentData;
    const matchColor = compatibilityScore >= 75 ? colors.success : compatibilityScore >= 50 ? colors.warning : colors.error;
    return (
      <Pressable key={message.id} style={[styles.shareBubble, isMine ? styles.shareBubbleMine : styles.shareBubbleTheirs, itemMarginStyle]} onPress={onApartmentPress} {...deleteProps} testID={`chat-message-${message.id}`}>
        {apartmentCoverImage ? <Image source={{ uri: apartmentCoverImage }} style={styles.shareImage} contentFit="cover" transition={120} /> : <View style={styles.shareImageFallback}><Ionicons name="home-outline" size={22} color={colors.onSurfaceTertiary} /></View>}
        <View style={styles.shareContent}>
          <Text style={[styles.shareTitle, isMine && styles.shareTitleMine]} numberOfLines={1}>{apartment.title || message.text}</Text>
          <View style={styles.shareLocationRow}><Ionicons name="location-outline" size={13} color={isMine ? "rgba(255,255,255,0.88)" : colors.onSurfaceTertiary} /><Text style={[styles.shareLocationText, isMine && styles.shareLocationTextMine]} numberOfLines={1}>{[apartment.area, apartment.city].filter(Boolean).join(", ")}</Text></View>
          <View style={styles.shareMetaRow}><View style={styles.sharePricePill}><Text style={styles.sharePriceText}>{`€${apartment.rent ?? 0}`}</Text></View>{showMatchScore ? <View style={[styles.matchScoreCardBadge, { borderColor: matchColor }]}><Ionicons name="sparkles" size={11} color={matchColor} style={styles.matchScoreIcon} /><Text style={[styles.matchScoreCardText, { color: matchColor }]}>{`${Math.round(compatibilityScore)}%`}</Text></View> : null}<Text style={[styles.shareStatsText, isMine && styles.shareStatsTextMine]} numberOfLines={1}>{`${apartment.rooms ?? 0} rooms · ${apartment.size ?? 0} m²`}</Text></View>
        </View>
      </Pressable>
    );
  }

  if (filterShare && message.filterSetData) {
    return (
      <Pressable key={message.id} style={[styles.filterSetShareBubble, isMine ? styles.filterSetShareBubbleMine : styles.filterSetShareBubbleTheirs, itemMarginStyle]} onPress={onFilterSetPress} {...deleteProps} testID={`chat-message-${message.id}`}>
        <View style={styles.filterSetShareIcon}><Ionicons name="options-outline" size={20} color={isMine ? colors.onBrand : colors.brand} /></View>
        <View style={styles.filterSetShareContent}><Text style={[styles.filterSetShareTag, isMine && styles.filterSetShareTagMine]}>{t("chat.message.filterCriteriaTag")}</Text><Text style={[styles.filterSetShareTitle, isMine && styles.filterSetShareTitleMine]} numberOfLines={1}>{message.filterSetData.title || message.filterSetData.summary || t("chat.message.allApartments")}</Text><Text style={[styles.filterSetShareSubtitle, isMine && styles.filterSetShareSubtitleMine]}>{t("chat.message.viewDetails")}</Text><BrokerModificationBadge modCount={message.filterSetData.brokerModCount} brokerName={message.filterSetData.lastModifiedByBrokerName} modifiedAt={message.filterSetData.lastModifiedAt} /></View>
      </Pressable>
    );
  }

  if (propertyListShare) {
    return (
      <Pressable key={message.id} style={[styles.sharedListMessageCard, isMine ? styles.sharedListMessageCardMine : styles.sharedListMessageCardTheirs, itemMarginStyle]} onPress={onPropertyListPress} {...deleteProps} testID={`open-shared-list-${message.id}`}>
        <View style={styles.sharedListHeader}><Ionicons color={isMine ? colors.onBrand : colors.brand} name="layers-outline" size={18} /><Text numberOfLines={1} style={[styles.sharedListTitle, isMine && styles.sharedListTitleMine]}>{message.listTitle || t("chat.message.propertyList")}</Text></View>
        <Text style={[styles.sharedListCountText, isMine && styles.sharedListCountTextMine]}>{t("chat.message.proposedProperties", { count: message.apartmentCount || message.apartmentIds?.length || 0 })}</Text>
        <View style={[styles.sharedListActionRow, isMine && styles.sharedListActionRowMine]}><Text style={[styles.sharedListViewBtnText, isMine && styles.sharedListViewBtnTextMine]}>{t("chat.message.viewList")}</Text><Ionicons color={isMine ? colors.onBrand : colors.brand} name="chevron-forward" size={16} /></View>
      </Pressable>
    );
  }

  if (noteShare && message.apartmentData) {
    const apartment = message.apartmentData;
    return (
      <Pressable key={message.id} style={[styles.noteShareBubble, isMine ? styles.noteShareBubbleMine : styles.noteShareBubbleTheirs, itemMarginStyle]} onPress={onApartmentPress} {...deleteProps} testID={`chat-message-${message.id}`}>
        <View style={styles.noteShareHeader}><View style={styles.noteShareBadge}><Ionicons name="document-text-outline" size={12} color={isMine ? colors.onBrand : colors.onBrandTertiary} /><Text style={[styles.noteShareBadgeText, isMine && styles.noteShareBadgeTextMine]} numberOfLines={1}>{t("chat.message.listingNote")}</Text></View></View>
        <View style={styles.noteShareQuote}><Ionicons name="open-outline" size={16} color={isMine ? "rgba(255,255,255,0.72)" : colors.onSurfaceTertiary} /><Text style={[styles.noteShareQuoteText, isMine && styles.noteShareQuoteTextMine]}>{(message.noteText || message.text || "").trim() || message.text}</Text></View>
        <View style={styles.noteShareFooter}>{apartmentCoverImage ? <Image source={{ uri: apartmentCoverImage }} style={styles.noteShareThumb} contentFit="cover" transition={120} /> : <View style={styles.noteShareThumbFallback}><Ionicons name="home-outline" size={18} color={colors.onSurfaceTertiary} /></View>}<View style={styles.noteShareApartmentTextWrap}><Text style={[styles.noteShareApartmentTitle, isMine && styles.noteShareApartmentTitleMine]} numberOfLines={1}>{apartment.title || message.text}</Text><Text style={[styles.noteShareApartmentMeta, isMine && styles.noteShareApartmentMetaMine]} numberOfLines={1}>{[apartment.area, apartment.city].filter(Boolean).join(", ")}</Text></View><View style={[styles.noteShareRentPill, isMine && styles.noteShareRentPillMine]}><Text style={[styles.noteShareRentText, isMine && styles.noteShareRentTextMine]}>{`€${apartment.rent ?? 0}`}</Text></View></View>
      </Pressable>
    );
  }

  if (message.type === "visit_confirmed" || message.type === "visit_rescheduled" || message.type === "visit_cancelled") {
    return <VisitMessageCard message={message} isMine={isMine} onEdit={message.type === "visit_cancelled" ? undefined : onVisitEdit} />;
  }

  if (message.type === "address_revealed" && message.metadata?.exactAddress) {
    return <AddressCardMessage exactAddress={message.metadata.exactAddress} latitude={message.metadata.latitude} longitude={message.metadata.longitude} isMine={isMine} />;
  }

  if (message.type === "shared_roommate_profile" && message.metadata?.sharedProfile) {
    const shared = message.metadata.sharedProfile.sharedUserData;
    return <Pressable key={message.id} style={[styles.shareBubble, isMine ? styles.shareBubbleMine : styles.shareBubbleTheirs, itemMarginStyle]} onPress={onSharedProfilePress} {...deleteProps} testID={`chat-shared-profile-${message.id}`}>
      {shared.avatarUrl ? <Image source={{ uri: shared.avatarUrl }} style={styles.shareImage} contentFit="cover" /> : <View style={styles.shareImageFallback}><Ionicons name="person-outline" size={22} color={colors.onSurfaceTertiary} /></View>}
      <View style={styles.shareContent}><Text style={[styles.shareTitle, isMine && styles.shareTitleMine]} numberOfLines={1}>{shared.fullName}</Text><Text style={[styles.shareLocationText, isMine && styles.shareLocationTextMine]}>Προβολή προφίλ συγκάτοικου</Text></View>
    </Pressable>;
  }

  if (message.type === "contract_request" && message.contractId) {
    return <Pressable key={message.id} style={[styles.contractMessageCard, isMine ? styles.contractMessageCardMine : styles.contractMessageCardTheirs, itemMarginStyle]} onPress={onContractPress} {...deleteProps} testID={`chat-contract-${message.id}`}>
      <Ionicons name="document-text-outline" size={21} color={isMine ? colors.onBrand : colors.brand} />
      <View style={styles.contractMessageCopy}><Text style={[styles.contractMessageTitle, isMine && styles.contractMessageTitleMine]} numberOfLines={2}>{message.contractTitle || message.text}</Text><Text style={[styles.contractMessageSubtitle, isMine && styles.contractMessageSubtitleMine]}>{t("esign.tapToSign")}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={isMine ? colors.onBrand : colors.brand} />
    </Pressable>;
  }

  if (actionShare) {
    const pending = message.status !== "approved";
    const isPrice = message.type === "price_proposal";
    const detail = isPrice ? `${typeof message.proposedPrice === "number" ? message.proposedPrice : 0}${"€"}/μήνα` : `${message.requestedDate ? formatRequestDate(message.requestedDate) : "-"} στις ${message.requestedTime || "--:--"}`;
    return <View key={message.id} style={[styles.hostActionCardWrap, isMine ? styles.hostActionCardWrapMine : styles.hostActionCardWrapTheirs, itemMarginStyle]} testID={`chat-message-${message.id}`}><View style={styles.hostActionCard}><Text style={styles.hostActionCardTitle}>{isPrice ? "Πρόταση τιμής" : "Αίτημα επίσκεψης"}</Text><Text style={styles.hostActionCardDetail}>{detail}</Text><View style={styles.hostActionCardFooter}><View style={[styles.hostActionStatusBadge, !pending && styles.hostActionStatusBadgeApproved]}><Text style={[styles.hostActionStatusText, !pending && styles.hostActionStatusTextApproved]}>{statusLabel}</Text></View>{isCurrentUserHost && pending ? <Pressable style={styles.hostActionApproveBtn} onPress={onApprove} testID={`chat-host-action-approve-${message.id}`}><Ionicons name="checkmark-circle" size={28} color={colors.brand} /></Pressable> : null}</View></View></View>;
  }

  if (message.type === "system_notice") return <View key={message.id} style={[styles.systemNoticeWrap, itemMarginStyle]} testID={`chat-message-${message.id}`}><Text style={styles.systemNoticeText}>{message.text}</Text></View>;

  return <Pressable key={message.id} style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, borderRadii, itemMarginStyle]} {...deleteProps} testID={`chat-message-${message.id}`}><Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{message.text}</Text></Pressable>;
}
