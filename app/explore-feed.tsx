import React, { useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ApartmentReelCard from "@/src/components/feed/ApartmentReelCard";
import type { Apartment } from "@/src/types/apartment";

const demoListings: Apartment[] = [
  {
    id: "r1",
    title: "Modern Apartment near Metro",
    area: "Παγκράτι, Αθήνα",
    address: "Παγκράτι",
    showExactAddress: true,
    hostId: "demo-host",
    areaName: "Παγκράτι",
    city: "Athens",
    rent: 750,
    monthlyRent: 750,
    rooms: 2,
    floor: "3ος",
    size: 85,
    sizeSqm: 85,
    photos: ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80"],
    status: "active",
  },
  {
    id: "r2",
    title: "Sunny Studio with Balcony",
    area: "Κολωνάκι, Αθήνα",
    address: "Κολωνάκι",
    showExactAddress: true,
    hostId: "demo-host-2",
    areaName: "Κολωνάκι",
    city: "Athens",
    rent: 820,
    monthlyRent: 820,
    rooms: 1,
    floor: "5ος",
    size: 62,
    sizeSqm: 62,
    photos: ["https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80"],
    status: "active",
  },
];

export default function ExploreFeedScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => demoListings, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0e13" }}>
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item) => item.id ?? item.title ?? "reel"}
        renderItem={({ item }) => <ApartmentReelCard apartment={item} />}
        pagingEnabled
        snapToInterval={1}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={({ viewableItems }) => {
          const nextIndex = viewableItems[0]?.index ?? 0;
          setActiveIndex(nextIndex);
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        getItemLayout={(_, index) => ({ length: 1, offset: index * 1, index })}
      />
    </SafeAreaView>
  );
}
