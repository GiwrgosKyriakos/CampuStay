import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Apartment } from "@/src/types/apartment";

export default function ApartmentReelCard({ apartment }: { apartment: Apartment }) {
  const [liked, setLiked] = useState(false);
  const [muted, setMuted] = useState(true);
  const apartmentData = apartment as Apartment & {
    photos?: string[];
    image?: string;
    rent?: number;
    monthlyRent?: number;
    size?: number;
    sizeSqm?: number;
    rooms?: number;
    floor?: string;
  };
  const image = apartmentData.photos?.[0] ?? apartmentData.image ?? "https://placehold.co/900x1600/png";
  const price = Number(apartmentData.rent ?? apartmentData.monthlyRent ?? 0);
  const title = apartment.title ?? "Property Listing";
  const area = apartment.area ?? "Area";

  const statRows = useMemo(() => [
    { label: "📐", value: `${Number(apartmentData.size ?? apartmentData.sizeSqm ?? 80)} τ.μ.` },
    { label: "🛏️", value: `${Number(apartmentData.rooms ?? 2)} Υ/Δ` },
    { label: "🏢", value: `${apartmentData.floor ?? "3ος"} όροφος` },
    { label: "⚡", value: "Α+" },
  ], [apartmentData]);

  return (
    <View style={styles.root}>
      <View style={styles.mediaWrap}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0e1320" }]} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.18)" }]} />
        <View style={styles.image} />
        <View style={styles.overlay} />
      </View>
      <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.28)", "rgba(0,0,0,0.72)"]} style={styles.gradient} />

      <View style={styles.rightRail}>
        <Pressable style={styles.avatarCircle} onPress={() => undefined}>
          <Ionicons name="person-circle" size={34} color="#fff" />
        </Pressable>
        <Pressable style={styles.actionRound} onPress={() => setLiked((prev) => !prev)}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={28} color={liked ? "#ff5d7a" : "#fff"} />
        </Pressable>
        <Pressable style={styles.actionRound} onPress={() => undefined}>
          <Ionicons name="camera-outline" size={26} color="#fff" />
        </Pressable>
        <Pressable style={styles.actionRound} onPress={() => undefined}>
          <Ionicons name="share-social-outline" size={26} color="#fff" />
        </Pressable>
        <Pressable style={styles.actionRound} onPress={() => setMuted((prev) => !prev)}>
          <Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.bottomMeta}>
        <Text style={styles.price}>{`€${price} / μήνα`}</Text>
        <Text style={styles.titleText}>{title}</Text>
        <Text style={styles.location}>📍 {area}</Text>
        <View style={styles.chipsRow}>
          {statRows.map((chip) => (
            <View key={chip.label + chip.value} style={styles.chip}>
              <Text style={styles.chipText}>{chip.label} {chip.value}</Text>
            </View>
          ))}
        </View>
        <Pressable style={styles.detailsButton}>
          <Text style={styles.detailsButtonText}>Προβολή Ακινήτου</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: "100%", width: "100%", position: "relative" },
  mediaWrap: { flex: 1, overflow: "hidden" },
  image: { flex: 1, backgroundColor: "#d3d8ff", opacity: 0.9 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,13,18,0.1)" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  rightRail: { position: "absolute", right: 14, bottom: 130, alignItems: "center", gap: 12 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
  actionRound: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(18,24,31,0.5)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  bottomMeta: { position: "absolute", left: 18, right: 84, bottom: 22, gap: 8 },
  price: { fontSize: 28, fontWeight: "800", color: "#fff" },
  titleText: { fontSize: 21, fontWeight: "700", color: "#fff" },
  location: { fontSize: 15, color: "#f7f7f7" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  detailsButton: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  detailsButtonText: { color: "#fff", fontWeight: "700" },
});
