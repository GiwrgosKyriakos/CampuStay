import React from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { ThemeColors } from "@/src/theme";

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
  filterSetData?: { title?: string; summary?: string };
  filterSetId?: string;
  listTitle?: string;
  apartmentIds?: string[];
  apartmentCount?: number;
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
  showMatchScore: boolean;
  compatibilityScore: number;
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
  showMatchScore,
  compatibilityScore,
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
        <View style={styles.filterSetShareContent}><Text style={[styles.filterSetShareTag, isMine && styles.filterSetShareTagMine]}>Κριτήρια Αναζήτησης / Set Φίλτρων</Text><Text style={[styles.filterSetShareTitle, isMine && styles.filterSetShareTitleMine]} numberOfLines={1}>{message.filterSetData.title || message.filterSetData.summary || "Όλα τα διαμερίσματα"}</Text><Text style={[styles.filterSetShareSubtitle, isMine && styles.filterSetShareSubtitleMine]}>Πατήστε για προβολή λεπτομερειών</Text></View>
      </Pressable>
    );
  }

  if (propertyListShare) {
    return (
      <Pressable key={message.id} style={[styles.sharedListMessageCard, isMine ? styles.sharedListMessageCardMine : styles.sharedListMessageCardTheirs, itemMarginStyle]} onPress={onPropertyListPress} {...deleteProps} testID={`open-shared-list-${message.id}`}>
        <View style={styles.sharedListHeader}><Ionicons color={isMine ? colors.onBrand : colors.brand} name="layers-outline" size={18} /><Text numberOfLines={1} style={[styles.sharedListTitle, isMine && styles.sharedListTitleMine]}>{message.listTitle || "Λίστα ακινήτων"}</Text></View>
        <Text style={[styles.sharedListCountText, isMine && styles.sharedListCountTextMine]}>{`${message.apartmentCount || message.apartmentIds?.length || 0} προτεινόμενα ακίνητα`}</Text>
        <View style={[styles.sharedListActionRow, isMine && styles.sharedListActionRowMine]}><Text style={[styles.sharedListViewBtnText, isMine && styles.sharedListViewBtnTextMine]}>Προβολή Λίστας</Text><Ionicons color={isMine ? colors.onBrand : colors.brand} name="chevron-forward" size={16} /></View>
      </Pressable>
    );
  }

  if (noteShare && message.apartmentData) {
    const apartment = message.apartmentData;
    return (
      <Pressable key={message.id} style={[styles.noteShareBubble, isMine ? styles.noteShareBubbleMine : styles.noteShareBubbleTheirs, itemMarginStyle]} onPress={onApartmentPress} {...deleteProps} testID={`chat-message-${message.id}`}>
        <View style={styles.noteShareHeader}><View style={styles.noteShareBadge}><Ionicons name="document-text-outline" size={12} color={isMine ? colors.onBrand : colors.onBrandTertiary} /><Text style={[styles.noteShareBadgeText, isMine && styles.noteShareBadgeTextMine]} numberOfLines={1}>Σημείωση Αγγελίας</Text></View></View>
        <View style={styles.noteShareQuote}><Ionicons name="open-outline" size={16} color={isMine ? "rgba(255,255,255,0.72)" : colors.onSurfaceTertiary} /><Text style={[styles.noteShareQuoteText, isMine && styles.noteShareQuoteTextMine]}>{(message.noteText || message.text || "").trim() || message.text}</Text></View>
        <View style={styles.noteShareFooter}>{apartmentCoverImage ? <Image source={{ uri: apartmentCoverImage }} style={styles.noteShareThumb} contentFit="cover" transition={120} /> : <View style={styles.noteShareThumbFallback}><Ionicons name="home-outline" size={18} color={colors.onSurfaceTertiary} /></View>}<View style={styles.noteShareApartmentTextWrap}><Text style={[styles.noteShareApartmentTitle, isMine && styles.noteShareApartmentTitleMine]} numberOfLines={1}>{apartment.title || message.text}</Text><Text style={[styles.noteShareApartmentMeta, isMine && styles.noteShareApartmentMetaMine]} numberOfLines={1}>{[apartment.area, apartment.city].filter(Boolean).join(", ")}</Text></View><View style={[styles.noteShareRentPill, isMine && styles.noteShareRentPillMine]}><Text style={[styles.noteShareRentText, isMine && styles.noteShareRentTextMine]}>{`€${apartment.rent ?? 0}`}</Text></View></View>
      </Pressable>
    );
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
