import React, { useState, useImperativeHandle, forwardRef } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const OUT_X = SCREEN_W * 1.5;

export interface SwipeDeckHandle {
  swipeRight: () => void;
  swipeLeft: () => void;
}

interface Props {
  profiles: RoommateProfile[];
  currency: string;
  onLike: (p: RoommateProfile) => void;
  onNope: (p: RoommateProfile) => void;
  onSwipeAction?: (dir: "left" | "right") => void;
  onEmptyReset?: () => void;
}

const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { profiles, currency, onLike, onNope, onSwipeAction, onEmptyReset },
  ref,
) {
  const [cardStack, setCardStack] = useState<RoommateProfile[]>(profiles);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  React.useEffect(() => {
    setCardStack(profiles);
  }, [profiles]);

  const finish = (dir: "left" | "right") => {
    const p = cardStack[0];
    if (p) {
      if (dir === "right") onLike(p);
      else onNope(p);
    }
    x.value = 0;
    y.value = 0;
    setCardStack((prev) => prev.slice(1));
  };

  const fly = (dir: "left" | "right") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSwipeAction?.(dir);
    x.value = withTiming(dir === "right" ? OUT_X : -OUT_X, { duration: 280 }, () => {
      runOnJS(finish)(dir);
    });
  };

  useImperativeHandle(ref, () => ({
    swipeRight: () => fly("right"),
    swipeLeft: () => fly("left"),
  }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd(() => {
      if (x.value > SWIPE_THRESHOLD) {
        runOnJS(onSwipeAction)?.("right");
        x.value = withTiming(OUT_X, { duration: 250 }, () => runOnJS(finish)("right"));
      } else if (x.value < -SWIPE_THRESHOLD) {
        runOnJS(onSwipeAction)?.("left");
        x.value = withTiming(-OUT_X, { duration: 250 }, () => runOnJS(finish)("left"));
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const topStyle = useAnimatedStyle(() => {
    const rotate = interpolate(x.value, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rotate}deg` }],
    };
  });

  const nextStyle = useAnimatedStyle(() => {
    const scale = interpolate(Math.abs(x.value), [0, SWIPE_THRESHOLD], [0.94, 1], Extrapolation.CLAMP);
    const translateY = interpolate(Math.abs(x.value), [0, SWIPE_THRESHOLD], [16, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }, { translateY }] };
  });

  if (cardStack.length === 0) {
    return (
      <View style={styles.deckArea}>
        <View style={styles.empty} testID="deck-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles" size={40} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>You&apos;re all caught up!</Text>
          <Text style={styles.emptySub}>No more roommates match your filters right now.</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => {
              setCardStack(profiles);
              onEmptyReset?.();
            }}
            testID="deck-reset-button"
          >
            <Ionicons name="refresh" size={18} color={colors.onBrand} />
            <Text style={styles.emptyBtnText}>Start over</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderCard = (p: RoommateProfile) => (
    <View style={styles.card}>
      <Image
        source={{ uri: p.photo }}
        style={styles.photo}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={p.id}
      />
      <LinearGradient
        colors={["transparent", "rgba(26,26,26,0.2)", "rgba(26,26,26,0.92)"]}
        locations={[0.4, 0.62, 1]}
        style={styles.scrim}
      />
      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.age}>{p.age}</Text>
        </View>
        <Text style={styles.uni} numberOfLines={1}>
          {p.program} · {p.university}
        </Text>
        <View style={styles.pillRow}>
          <View style={styles.metaPill}>
            <Ionicons name="person-outline" size={14} color={colors.onSurfaceInverse} />
            <Text style={styles.metaText}>{p.gender}</Text>
          </View>
          <View style={[styles.metaPill, styles.budgetPill]}>
            <Ionicons name="wallet-outline" size={14} color={colors.onSurfaceInverse} />
            <Text style={styles.metaText}>
              {currency}
              {p.budget}/mo
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const next = cardStack[1];

  return (
    <View style={styles.deckArea}>
      {next && (
        <Animated.View style={[styles.cardWrap, nextStyle]} pointerEvents="none">
          {renderCard(next)}
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.cardWrap, topStyle]} testID="swipe-card-top">
          {renderCard(cardStack[0])}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

export default SwipeDeck;

const styles = StyleSheet.create({
  deckArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardWrap: { ...StyleSheet.absoluteFillObject },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  photo: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  scrim: { ...StyleSheet.absoluteFillObject },
  cardBody: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  nameRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  name: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurfaceInverse },
  age: { fontFamily: fonts.display, fontSize: fontSize["2xl"], color: colors.onSurfaceInverse, paddingBottom: 3 },
  uni: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  pillRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  budgetPill: { backgroundColor: colors.brand },
  metaText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurfaceInverse },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  emptyBtnText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
