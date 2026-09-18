import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, radius, spacing } from "@/src/theme";
import type { ListingPhotoItem } from "@/src/types/apartment";
import { calculateGridSlotCount } from "@/src/utils/listingMedia";

interface GridItem {
  id: string;
  photo: ListingPhotoItem | null;
}

export interface ListingPhotoGridProps {
  photos: ListingPhotoItem[];
  maxSlots: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (photos: ListingPhotoItem[]) => void;
  onCaption: (photo: ListingPhotoItem) => void;
  onPhotoPress?: (index: number) => void;
  tileAspectRatio?: number;
  testID: string;
}

function triggerDragHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

interface PhotoTileProps {
  item: ListingPhotoItem;
  index: number;
  drag: () => void;
  isActive: boolean;
  onRemove: () => void;
  onCaption: () => void;
  onPhotoPress?: () => void;
  tileAspectRatio: number;
  testID: string;
}

function PhotoTile({ item, index, drag, isActive, onRemove, onCaption, onPhotoPress, tileAspectRatio, testID }: PhotoTileProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_event, success) => {
      if (success && onPhotoPress) runOnJS(onPhotoPress)();
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (success) runOnJS(onCaption)();
    });
  const longPress = Gesture.LongPress()
    .minDuration(350)
    .onStart(() => {
      runOnJS(triggerDragHaptic)();
      runOnJS(drag)();
    });
  const tileGesture = Gesture.Exclusive(longPress, doubleTap, singleTap);

  React.useEffect(() => {
    scale.value = withSpring(isActive ? 1.05 : 1, { damping: 18, stiffness: 220 });
  }, [isActive, scale]);

  return (
    <ScaleDecorator activeScale={1.05}>
      <GestureDetector gesture={tileGesture}>
        <Animated.View
          style={[
            styles.tile,
            { aspectRatio: tileAspectRatio, backgroundColor: colors.surfaceTertiary, borderColor: isActive ? colors.brand : colors.border },
            animatedStyle,
          ]}
          testID={testID}
        >
          <Image source={{ uri: item.url }} style={styles.image} contentFit="cover" />
          <Pressable style={styles.removeButton} onPress={onRemove} hitSlop={6} testID={`${testID}-remove`}>
            <Ionicons name="close-circle" size={20} color={colors.onSurfaceInverse} />
          </Pressable>
          {item.caption?.trim() ? (
            <View style={[styles.captionBadge, { backgroundColor: colors.brand }]} accessibilityLabel={t("listings.photos.captionBadge")}>
              <Text style={[styles.captionBadgeText, { color: "#FFFFFF" }]}>{t("listings.photos.captionBadge")}</Text>
            </View>
          ) : null}
          <Text style={[styles.orderLabel, { color: colors.onSurfaceInverse }]}>{index + 1}</Text>
        </Animated.View>
      </GestureDetector>
    </ScaleDecorator>
  );
}

export default function ListingPhotoGrid({ photos, maxSlots, onAdd, onRemove, onReorder, onCaption, onPhotoPress, tileAspectRatio = 1, testID }: ListingPhotoGridProps) {
  const visibleSlotCount = calculateGridSlotCount(photos.length, 3, maxSlots);
  const items: GridItem[] = [
    ...photos.map((photo) => ({ id: photo.id, photo })),
    ...Array.from({ length: Math.max(0, visibleSlotCount - photos.length) }, (_, index) => ({ id: `empty-${photos.length + index}`, photo: null })),
  ];

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<GridItem>) => {
    const index = getIndex?.() ?? 0;
    if (!item.photo) {
      return (
        <Pressable style={[styles.tile, styles.emptyTile, { aspectRatio: tileAspectRatio }]} onPress={onAdd} testID={`${testID}-empty-${index}`}>
          <Ionicons name="add" size={26} color="#777" />
          <Text style={styles.emptyText}>{t("common.actions.add")}</Text>
        </Pressable>
      );
    }

    return (
      <PhotoTile
        item={item.photo}
        index={index}
        drag={drag}
        isActive={isActive}
        onRemove={() => onRemove(index)}
        onCaption={() => onCaption(item.photo as ListingPhotoItem)}
        onPhotoPress={onPhotoPress ? () => onPhotoPress(index) : undefined}
        tileAspectRatio={tileAspectRatio}
        testID={`${testID}-${item.id}`}
      />
    );
  };

  return (
    <DraggableFlatList<GridItem>
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={3}
      scrollEnabled={false}
      activationDistance={0}
      columnWrapperStyle={styles.row}
      onDragEnd={({ data }) => onReorder(data.flatMap((entry) => entry.photo ? [entry.photo] : []))}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  tile: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    maxWidth: "32%",
    overflow: "hidden",
    position: "relative",
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: "transparent",
    justifyContent: "center",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  emptyText: {
    color: "#777",
    fontFamily: fonts.semibold,
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    position: "absolute",
    right: 5,
    top: 5,
  },
  captionBadge: {
    alignItems: "center",
    borderRadius: 9,
    bottom: 6,
    height: 18,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    width: 18,
  },
  captionBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  orderLabel: {
    bottom: 5,
    fontFamily: fonts.semibold,
    fontSize: 10,
    left: 6,
    position: "absolute",
  },
});
