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
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { t } from "@/src/locales";

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
  const lastLoggedX = useSharedValue(0);

  React.useEffect(() => {
    setCardStack(profiles);
    console.log("[SwipeDeck] Card stack refreshed from parent profiles", {
      profileCount: profiles.length,
    });
  }, [profiles]);

  // 🟢 ΑΣΦΑΛΕΙΣ JS ΣΥΝΑΡΤΗΣΕΙΣ ΓΙΑ LOGGING (Εκτελούνται στο JS Thread και διαβάζουν με ασφάλεια το State)
  const logSwipeStart = () => {
    const profileId = cardStack[0]?.id;
    console.log("[SwipeDeck] Swipe started", { profileId });
  };

  const logSwipeMove = (translationX: number, translationY: number) => {
    const profileId = cardStack[0]?.id;
    console.log("[SwipeDeck] Swipe moving", {
      profileId,
      translationX,
      translationY,
    });
  };

  const logSwipeComplete = (dir: "left" | "right") => {
    const profileId = cardStack[0]?.id;
    console.log("[SwipeDeck] Swipe completed", { direction: dir, profileId });
  };

  const logSwipeCanceled = (translationX: number, translationY: number) => {
    const profileId = cardStack[0]?.id;
    console.log("[SwipeDeck] Swipe canceled (below threshold)", {
      profileId,
      translationX,
      translationY,
    });
  };

  const finish = (dir: "left" | "right") => {
    const p = cardStack[0];
    console.log("[SwipeDeck] Finalizing swipe", {
      direction: dir,
      profileId: p?.id,
      currentStackSize: cardStack.length,
    });
    if (p) {
      if (dir === "right") onLike(p);
      else onNope(p);
    }
    x.value = 0;
    y.value = 0;
    lastLoggedX.value = 0;
    setCardStack((prev) => prev.slice(1));
  };

  const fly = (dir: "left" | "right") => {
    console.log("[SwipeDeck] Triggering programmatic swipe", {
      direction: dir,
      profileId: cardStack[0]?.id,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSwipeAction?.(dir);
    logSwipeComplete(dir);
    x.value = withTiming(dir === "right" ? OUT_X : -OUT_X, { duration: 280 }, () => {
      runOnJS(finish)(dir);
    });
  };

  useImperativeHandle(ref, () => ({
    swipeRight: () => fly("right"),
    swipeLeft: () => fly("left"),
  }));

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(logSwipeStart)();
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;

      if (Math.abs(e.translationX - lastLoggedX.value) > 40) {
        lastLoggedX.value = e.translationX;
        runOnJS(logSwipeMove)(e.translationX, e.translationY);
      }
    })
    .onEnd(() => {
      if (x.value > SWIPE_THRESHOLD) {
        if (onSwipeAction) {
          runOnJS(onSwipeAction)("right");
        }
        runOnJS(logSwipeComplete)("right");
        x.value = withTiming(OUT_X, { duration: 250 }, () => runOnJS(finish)("right"));
      } else if (x.value < -SWIPE_THRESHOLD) {
        if (onSwipeAction) {
          runOnJS(onSwipeAction)("left");
        }
        runOnJS(logSwipeComplete)("left");
        x.value = withTiming(-OUT_X, { duration: 250 }, () => runOnJS(finish)("left"));
      } else {
        // 🟢 Ασφαλής κλήση της custom log function αντί για runOnJS(console.log)
        runOnJS(logSwipeCanceled)(x.value, y.value);
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
          <Text style={styles.emptyTitle}>{t("swipeDeck.emptyTitle")}</Text>
          <Text style={styles.emptySub}>{t("swipeDeck.emptyBody")}</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => {
              setCardStack(profiles);
              onEmptyReset?.();
            }}
            testID="deck-reset-button"
          >
            <Ionicons name="refresh" size={18} color={colors.onBrand} />
            <Text style={styles.emptyBtnText}>{t("common.actions.startOver")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderCard = (p: RoommateProfile) => (
    <View style={styles.card}>
      {typeof p.matchScore === "number" && (
        <LinearGradient
          colors={[colors.brandTertiary, colors.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.matchBadge}
        >
          <Ionicons name="sparkles" size={12} color={colors.onSurfaceInverse} />
          <Text style={styles.matchBadgeText}>{`${Math.max(0, Math.min(100, Math.round(p.matchScore)))}% Match`}</Text>
        </LinearGradient>
      )}
      {p.photo?.trim() ? (
        <Image
          source={{ uri: p.photo }}
          style={styles.photo}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          recyclingKey={p.id}
        />
      ) : (
        <View style={styles.photoFallbackWrap}>
          <DefaultProfileAvatar size={120} iconSize={56} testID={`swipe-card-avatar-fallback-${p.id}`} />
        </View>
      )}
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
              {p.budget}{t("common.format.perMonthShort")}
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
  matchBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    shadowColor: colors.surfaceInverse,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  matchBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurfaceInverse },
  photo: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  photoFallbackWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
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
  metaText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
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
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, textAlign: "center"  },
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