import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { doc, getDoc } from "firebase/firestore";

import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { subscribeApartmentLikeCount } from "@/src/api/apartmentLikes";
import { db } from "@/src/config/firebase";
import { sendPropertyProposalViaMessaging } from "@/src/utils/messagingAutomation";
import { t } from "@/src/locales";
import type { Apartment, VirtualTourData } from "@/src/types/apartment";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

type ReelApartment = Apartment & {
  photos?: string[];
  images?: string[];
  image?: string;
  imageUrl?: string;
  rent?: number;
  monthlyRent?: number;
  size?: number;
  sizeSqm?: number;
  rooms?: number;
  floor?: string;
  city?: string;
  ownerId?: string;
  assignedBrokerIds?: string[];
  virtualTour?: VirtualTourData;
  extraInformation?: { energyClass?: string };
  energyClass?: string;
};

export interface ApartmentReelCardProps {
  apartment: Apartment;
  height: number;
  isActive?: boolean;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onOpenChat?: () => void;
  onOpenDetails?: () => void;
  onOpenVirtualTour?: () => void;
}

const FALLBACK_IMAGE = "https://placehold.co/900x1600/png";

export default function ApartmentReelCard({
  apartment,
  height,
  isActive = false,
  isLiked = false,
  onToggleLike = () => undefined,
  onOpenChat = () => undefined,
  onOpenDetails = () => undefined,
  onOpenVirtualTour = () => undefined,
}: ApartmentReelCardProps) {
  const apartmentData = apartment as ReelApartment;
  const [muted, setMuted] = useState(true);
  const [shareVisible, setShareVisible] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [hostProfile, setHostProfile] = useState<{ name?: string; avatar?: string; phone?: string }>({});
  const heartScale = useRef(new Animated.Value(1)).current;
  const kenBurnsProgress = useRef(new Animated.Value(0)).current;
  const photos = useMemo(() => {
    const values = [
      ...(Array.isArray(apartmentData.photos) ? apartmentData.photos : []),
      ...(Array.isArray(apartmentData.images) ? apartmentData.images : []),
      apartmentData.image,
      apartmentData.imageUrl,
    ];
    return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
  }, [apartmentData.image, apartmentData.imageUrl, apartmentData.images, apartmentData.photos]);
  const videoUrl = apartmentData.reelMedia?.videoUrl?.trim() || undefined;
  const player = useVideoPlayer(videoUrl ?? null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });
  const hostId = apartmentData.assignedBrokerIds?.find((id) => id.trim().length > 0) || apartmentData.hostId || apartmentData.ownerId;
  const tourData = apartmentData.virtualTour;
  const price = Number(apartmentData.rent ?? apartmentData.monthlyRent ?? apartmentData.price ?? 0);
  const area = [apartmentData.area, apartmentData.city].filter((value, index, all): value is string => typeof value === "string" && value.trim().length > 0 && all.indexOf(value) === index).join(", ");
  const energyClass = apartmentData.energyClass ?? apartmentData.extraInformation?.energyClass ?? "A+";
  const shareProperty = { title: apartmentData.title ?? "Property listing", price, shareUrl: `https://campustay.app/apartment/${apartment.id ?? ""}` };

  useEffect(() => {
    player.muted = muted;
    if (!videoUrl || !isActive) {
      player.pause();
      return;
    }
    player.play();
    return () => player.pause();
  }, [isActive, muted, player, videoUrl]);

  useEffect(() => {
    if (!apartment.id) return;
    return subscribeApartmentLikeCount(apartment.id, setLikeCount);
  }, [apartment.id]);

  useEffect(() => {
    if (!hostId) return;
    let active = true;
    void getDoc(doc(db, "users", hostId)).then((snapshot) => {
      if (!active || !snapshot.exists()) return;
      const data = snapshot.data();
      setHostProfile({
        name: typeof data.name === "string" ? data.name : undefined,
        avatar: typeof data.photoUrl === "string" ? data.photoUrl : Array.isArray(data.photos) ? String(data.photos[0] ?? "") : undefined,
        phone: typeof data.phone === "string" ? data.phone : undefined,
      });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hostId]);

  useEffect(() => {
    if (videoUrl || photos.length <= 1) return;
    const interval = setInterval(() => setPhotoIndex((current) => (current + 1) % photos.length), 4500);
    return () => clearInterval(interval);
  }, [photos.length, videoUrl]);

  useEffect(() => {
    if (videoUrl) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(kenBurnsProgress, { toValue: 1, duration: 4500, useNativeDriver: true }),
      Animated.timing(kenBurnsProgress, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [kenBurnsProgress, videoUrl]);

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true, speed: 30 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 24 }),
    ]).start();
    onToggleLike();
  };

  const handleNativeShare = async () => {
    setShareVisible(false);
    await Share.share({ message: `Γεια σας! Σας προτείνουμε το ακίνητο «${shareProperty.title}» στα €${shareProperty.price}. Δείτε λεπτομέρειες εδώ: ${shareProperty.shareUrl}` });
  };

  const handleMessagingShare = async (platform: "whatsapp" | "viber" | "sms") => {
    setShareVisible(false);
    try {
      await sendPropertyProposalViaMessaging(platform, hostProfile.phone ?? "", shareProperty);
    } catch {
      await handleNativeShare();
    }
  };

  const imageUri = videoUrl ? apartmentData.reelMedia?.thumbnailUrl ?? photos[photoIndex] ?? FALLBACK_IMAGE : photos[photoIndex] ?? FALLBACK_IMAGE;
  const kenBurnsScale = kenBurnsProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const kenBurnsTranslate = kenBurnsProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={[styles.root, { height }]} testID={`apartment-reel-card-${apartment.id ?? "listing"}`}>
      <View style={styles.mediaWrap}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ scale: kenBurnsScale }, { translateY: kenBurnsTranslate }] }]}>
          <Image source={imageUri} contentFit="cover" style={styles.media} transition={250} />
        </Animated.View>
        {videoUrl ? <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} /> : null}
        <View style={styles.mediaShade} />
      </View>
      <LinearGradient colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.24)", "rgba(0,0,0,0.82)"]} style={styles.gradient} />

      {videoUrl && muted && isActive ? (
        <Pressable style={styles.unmuteHint} onPress={() => setMuted(false)} accessibilityLabel={t("feed.unmuteHint")}>
          <Ionicons name="volume-mute-outline" size={15} color="#fff" />
          <Text style={styles.unmuteHintText}>{t("feed.unmuteHint")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.rightRail}>
        <Pressable style={styles.avatarCircle} onPress={onOpenChat} accessibilityLabel={hostProfile.name ?? "Open host chat"}>
          {hostProfile.avatar ? <Image source={hostProfile.avatar} style={styles.avatarImage} contentFit="cover" /> : <DefaultProfileAvatar size={42} iconSize={20} />}
        </Pressable>
        <Pressable style={styles.actionButton} onPress={animateLike} accessibilityLabel={isLiked ? "Remove favorite" : "Add favorite"}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={28} color={isLiked ? "#ff5d7a" : "#fff"} />
          </Animated.View>
          <Text style={styles.actionCount}>{likeCount}</Text>
        </Pressable>
        {tourData?.enabled && tourData.scenes.length > 0 ? (
          <Pressable style={styles.actionButton} onPress={onOpenVirtualTour} accessibilityLabel="Open 360 virtual tour">
            <Ionicons name="scan-circle-outline" size={28} color="#fff" />
            <Text style={styles.actionLabel}>360°</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.actionButton} onPress={() => setShareVisible(true)} accessibilityLabel="Share property">
          <Ionicons name="share-social-outline" size={26} color="#fff" />
        </Pressable>
        {videoUrl ? <Pressable style={styles.actionButton} onPress={() => setMuted((current) => !current)} accessibilityLabel={muted ? "Unmute video" : "Mute video"}><Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} size={25} color="#fff" /></Pressable> : null}
      </View>

      <View style={styles.bottomMeta}>
        <Text style={styles.price}>{`€${price} / μήνα`}</Text>
        <Text style={styles.titleText} numberOfLines={2}>{apartmentData.title ?? "Property Listing"}</Text>
        <Text style={styles.location} numberOfLines={1}>📍 {area || "Area"}</Text>
        <View style={styles.chipsRow}>
          <View style={styles.chip}><Text style={styles.chipText}>{`📐 ${Number(apartmentData.size ?? apartmentData.sizeSqm ?? 0)} τ.μ.`}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>{`🛏️ ${Number(apartmentData.rooms ?? 0)} Υ/Δ`}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>{`🏢 ${apartmentData.floor ?? "-"}`}</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>{`⚡ ${energyClass}`}</Text></View>
        </View>
        <Pressable style={styles.detailsButton} onPress={onOpenDetails} accessibilityRole="button">
          <Text style={styles.detailsButtonText}>{t("feed.viewDetails")}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </View>

      <BaseBottomSheet visible={shareVisible} onClose={() => setShareVisible(false)} scrollable={false} maxHeight="45%">
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Share property</Text>
            <Pressable style={styles.shareRow} onPress={() => void handleNativeShare()}><Ionicons name="share-outline" size={21} color="#18343c" /><Text style={styles.shareRowText}>More sharing options</Text></Pressable>
            <Pressable style={styles.shareRow} onPress={() => void handleMessagingShare("whatsapp")}><Ionicons name="logo-whatsapp" size={21} color="#25D366" /><Text style={styles.shareRowText}>WhatsApp</Text></Pressable>
            <Pressable style={styles.shareRow} onPress={() => void handleMessagingShare("viber")}><Ionicons name="chatbubble-ellipses-outline" size={21} color="#665CAC" /><Text style={styles.shareRowText}>Viber</Text></Pressable>
            <Pressable style={styles.shareRow} onPress={() => void handleMessagingShare("sms")}><Ionicons name="chatbox-outline" size={21} color="#168AAD" /><Text style={styles.shareRowText}>SMS</Text></Pressable>
          </View>
      </BaseBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", position: "relative", backgroundColor: "#0b0e13" },
  mediaWrap: { flex: 1, overflow: "hidden" },
  media: { flex: 1, backgroundColor: "#17242c" },
  video: { ...StyleSheet.absoluteFillObject },
  mediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,13,17,0.12)" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "54%" },
  unmuteHint: { position: "absolute", top: 54, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.48)" },
  unmuteHintText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rightRail: { position: "absolute", right: 14, bottom: 136, alignItems: "center", gap: 12 },
  avatarCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" },
  avatarImage: { width: "100%", height: "100%" },
  actionButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 22, backgroundColor: "rgba(18,24,31,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  actionCount: { color: "#fff", fontSize: 10, fontWeight: "800" },
  actionLabel: { color: "#fff", fontSize: 10, fontWeight: "800" },
  bottomMeta: { position: "absolute", left: 18, right: 82, bottom: 26, gap: 8 },
  price: { fontSize: 29, fontWeight: "800", color: "#fff" },
  titleText: { fontSize: 21, lineHeight: 26, fontWeight: "700", color: "#fff" },
  location: { fontSize: 15, color: "#f7f7f7" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  chipText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  detailsButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.38)" },
  detailsButtonText: { color: "#fff", fontWeight: "700" },
  shareSheet: { padding: 20, gap: 8 },
  shareTitle: { color: "#18343c", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  shareRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12 },
  shareRowText: { color: "#18343c", fontSize: 15, fontWeight: "600" },
});
