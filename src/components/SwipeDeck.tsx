import React, { useState, useImperativeHandle, forwardRef, useMemo } from "react";
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

import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import type { RoommateProfile } from "@/src/data/profiles";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import { t } from "@/src/locales";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const OUT_X = SCREEN_W * 1.5;

function getQuizAnswer(answers: Record<string, string>, key: "smoking" | "pets"): string | null {
  const aliases = key === "smoking" ? ["q7_smoke", "q7", "q5"] : ["q8_pets", "q8", "q13"];
  return aliases.map((alias) => answers[alias]?.trim()).find(Boolean) ?? null;
}

function isSmokerAnswer(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return normalized.includes("yes") || normalized.includes("outside") || normalized.includes("καπν") || normalized.includes("έξω");
}

function isPetFriendlyAnswer(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return normalized.includes("yes") || normalized.includes("fine") || normalized.includes("pets are") || normalized.includes("κατοικ") || normalized.includes("ναι");
}

function QuizCompatibilityBadges({ profileAnswers, currentAnswers, colors, styles }: { profileAnswers: Record<string, string>; currentAnswers: Record<string, string>; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const profileSmokingAnswer = getQuizAnswer(profileAnswers, "smoking");
  const currentSmokingAnswer = getQuizAnswer(currentAnswers, "smoking");
  const profilePetsAnswer = getQuizAnswer(profileAnswers, "pets");
  const currentPetsAnswer = getQuizAnswer(currentAnswers, "pets");
  const profileIsSmoker = profileSmokingAnswer ? isSmokerAnswer(profileSmokingAnswer) : false;
  const profileIsPetFriendly = profilePetsAnswer ? isPetFriendlyAnswer(profilePetsAnswer) : false;
  const isMutualSmokingMatch = Boolean(profileSmokingAnswer && currentSmokingAnswer && profileSmokingAnswer === currentSmokingAnswer);
  const isMutualPetsMatch = Boolean(profilePetsAnswer && currentPetsAnswer && profilePetsAnswer === currentPetsAnswer);

  if (!profileSmokingAnswer && !profilePetsAnswer) return null;

  return (
    <View style={styles.quizBadgesRow}>
      {profileSmokingAnswer ? <View style={[styles.quizPillBadge, isMutualSmokingMatch && styles.quizPillBadgeMutualMatch]}><Ionicons name={profileIsSmoker ? "flame-outline" : "ban-outline"} size={12} color={isMutualSmokingMatch ? colors.onBrand : "#FFFFFF"} /><Text style={[styles.quizPillText, isMutualSmokingMatch && styles.quizPillTextMutualMatch]}>{profileIsSmoker ? "Καπνιστής" : "Μη καπνιστής"}</Text></View> : null}
      {profilePetsAnswer ? <View style={[styles.quizPillBadge, isMutualPetsMatch && styles.quizPillBadgeMutualMatch]}><Ionicons name={profileIsPetFriendly ? "paw-outline" : "ban-outline"} size={12} color={isMutualPetsMatch ? colors.onBrand : "#FFFFFF"} /><Text style={[styles.quizPillText, isMutualPetsMatch && styles.quizPillTextMutualMatch]}>{profileIsPetFriendly ? "Κατοικίδια" : "Όχι κατοικίδια"}</Text></View> : null}
    </View>
  );
}

interface CardContentProps {
  profile: RoommateProfile;
  currentQuizAnswers: Record<string, string>;
  currency: string;
  colors: ThemeColors;
}

const CardContent = React.memo(function CardContent({ profile: p, currentQuizAnswers, currency, colors }: CardContentProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
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
            <Ionicons name="person-outline" size={14} color={colors.onBrand} />
            <Text style={styles.metaText}>{p.gender}</Text>
          </View>
          <View style={[styles.metaPill, styles.budgetPill]}>
            <Ionicons name="wallet-outline" size={14} color={colors.onBrand} />
            <Text style={styles.metaText}>
              {currency}
              {p.budget}{t("common.format.perMonthShort")}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.criteriaOverlay} pointerEvents="none">
        <QuizCompatibilityBadges profileAnswers={p.quizAnswers ?? {}} currentAnswers={currentQuizAnswers} colors={colors} styles={styles} />
      </View>
    </View>
  );
});

export interface SwipeDeckHandle {
  swipeRight: () => void;
  swipeLeft: () => void;
}

interface Props {
  profiles: RoommateProfile[];
  currentQuizAnswers?: Record<string, string>;
  currency: string;
  onLike: (p: RoommateProfile) => void;
  onNope: (p: RoommateProfile) => void;
  onSwipeAction?: (dir: "left" | "right") => void;
  onEmptyReset?: () => void;
}

const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { profiles, currentQuizAnswers = {}, currency, onLike, onNope, onSwipeAction, onEmptyReset },
  ref,
) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const previousProfileIds = React.useRef(profiles.map((profile) => profile.id));
  const x0 = useSharedValue(0);
  const y0 = useSharedValue(0);
  const x1 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const activeSlot = useSharedValue(0);
  const lastLoggedX = useSharedValue(0);
  const swipeInProgress = useSharedValue(false);

  const topSlot = currentIndex % 2;
  React.useLayoutEffect(() => {
    activeSlot.value = currentIndex % 2;
  }, [currentIndex, activeSlot]);

  React.useEffect(() => {
    const profileIds = profiles.map((profile) => profile.id);
    const idsChanged = profileIds.length !== previousProfileIds.current.length || profileIds.some((id, index) => id !== previousProfileIds.current[index]);

    previousProfileIds.current = profileIds;
    if (!idsChanged) return;

    setCurrentIndex(0);
    console.log("[SwipeDeck] Card stack refreshed from parent profiles", {
      profileCount: profiles.length,
    });
  }, [profiles]);

  const currentProfile = profiles[currentIndex];
  const nextProfile = profiles[currentIndex + 1];

  // ΑΣΦΑΛΕΙΣ JS ΣΥΝΑΡΤΗΣΕΙΣ ΓΙΑ LOGGING (Εκτελούνται στο JS Thread και διαβάζουν με ασφάλεια το State)
  const logSwipeStart = () => {
    const profileId = currentProfile?.id;
    console.log("[SwipeDeck] Swipe started", { profileId });
  };

  const logSwipeMove = (translationX: number, translationY: number) => {
    const profileId = currentProfile?.id;
    console.log("[SwipeDeck] Swipe moving", {
      profileId,
      translationX,
      translationY,
    });
  };

  const logSwipeComplete = (dir: "left" | "right") => {
    const profileId = currentProfile?.id;
    console.log("[SwipeDeck] Swipe completed", { direction: dir, profileId });
  };

  const logSwipeCanceled = (translationX: number, translationY: number) => {
    const profileId = currentProfile?.id;
    console.log("[SwipeDeck] Swipe canceled (below threshold)", {
      profileId,
      translationX,
      translationY,
    });
  };

  const finish = (dir: "left" | "right") => {
    const p = profiles[currentIndex];
    const swipedSlot = currentIndex % 2;
    swipeInProgress.value = false;
    console.log("[SwipeDeck] Finalizing swipe", {
      direction: dir,
      profileId: p?.id,
      currentIndex,
      profileCount: profiles.length,
    });
    if (p) {
      if (dir === "right") onLike(p);
      else onNope(p);
    }
    setCurrentIndex((prev) => prev + 1);
    requestAnimationFrame(() => {
      if (swipedSlot === 0) {
        x0.value = 0;
        y0.value = 0;
      } else {
        x1.value = 0;
        y1.value = 0;
      }
      lastLoggedX.value = 0;
    });
  };

  const fly = (dir: "left" | "right") => {
    if (!currentProfile || swipeInProgress.value) return;

    swipeInProgress.value = true;
    console.log("[SwipeDeck] Triggering programmatic swipe", {
      direction: dir,
      profileId: currentProfile?.id,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSwipeAction?.(dir);
    logSwipeComplete(dir);
    const activeX = topSlot === 0 ? x0 : x1;
    activeX.value = withTiming(dir === "right" ? OUT_X : -OUT_X, { duration: 280 }, () => {
      runOnJS(finish)(dir);
    });
  };

  useImperativeHandle(ref, () => ({
    swipeRight: () => fly("right"),
    swipeLeft: () => fly("left"),
  }));

  const pan = Gesture.Pan()
    .onBegin(() => {
      if (swipeInProgress.value) return;
      runOnJS(logSwipeStart)();
    })
    .onUpdate((e) => {
      if (swipeInProgress.value) return;

      if (activeSlot.value === 0) {
        x0.value = e.translationX;
        y0.value = e.translationY;
      } else {
        x1.value = e.translationX;
        y1.value = e.translationY;
      }

      if (Math.abs(e.translationX - lastLoggedX.value) > 40) {
        lastLoggedX.value = e.translationX;
        runOnJS(logSwipeMove)(e.translationX, e.translationY);
      }
    })
    .onEnd(() => {
      if (swipeInProgress.value) return;

      const activeX = activeSlot.value === 0 ? x0 : x1;
      const activeY = activeSlot.value === 0 ? y0 : y1;
      if (activeX.value > SWIPE_THRESHOLD) {
        swipeInProgress.value = true;
        if (onSwipeAction) {
          runOnJS(onSwipeAction)("right");
        }
        runOnJS(logSwipeComplete)("right");
        activeX.value = withTiming(OUT_X, { duration: 250 }, () => runOnJS(finish)("right"));
      } else if (activeX.value < -SWIPE_THRESHOLD) {
        swipeInProgress.value = true;
        if (onSwipeAction) {
          runOnJS(onSwipeAction)("left");
        }
        runOnJS(logSwipeComplete)("left");
        activeX.value = withTiming(-OUT_X, { duration: 250 }, () => runOnJS(finish)("left"));
      } else {
        // Ασφαλής κλήση της custom log function αντί για runOnJS(console.log)
        runOnJS(logSwipeCanceled)(activeX.value, activeY.value);
        activeX.value = withSpring(0);
        activeY.value = withSpring(0);
      }
    });

  const slot0TopStyle = useAnimatedStyle(() => {
    const rotate = interpolate(x0.value, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: x0.value },
        { translateY: y0.value },
        { rotate: `${rotate}deg` },
        { scale: 1 },
      ],
    };
  });

  const slot1TopStyle = useAnimatedStyle(() => {
    const rotate = interpolate(x1.value, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: x1.value },
        { translateY: y1.value },
        { rotate: `${rotate}deg` },
        { scale: 1 },
      ],
    };
  });

  const slot0NextStyle = useAnimatedStyle(() => {
    const scale = interpolate(Math.abs(x1.value), [0, SWIPE_THRESHOLD], [0.94, 1], Extrapolation.CLAMP);
    const translateY = interpolate(Math.abs(x1.value), [0, SWIPE_THRESHOLD], [16, 0], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: 0 },
        { translateY },
        { rotate: "0deg" },
        { scale },
      ],
    };
  });

  const slot1NextStyle = useAnimatedStyle(() => {
    const scale = interpolate(Math.abs(x0.value), [0, SWIPE_THRESHOLD], [0.94, 1], Extrapolation.CLAMP);
    const translateY = interpolate(Math.abs(x0.value), [0, SWIPE_THRESHOLD], [16, 0], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: 0 },
        { translateY },
        { rotate: "0deg" },
        { scale },
      ],
    };
  });

  if (!currentProfile) {
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
              setCurrentIndex(0);
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

  const profileSlot0 = topSlot === 0 ? currentProfile : nextProfile;
  const profileSlot1 = topSlot === 1 ? currentProfile : nextProfile;

  return (
    <View style={styles.deckArea}>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFillObject}>
          {profileSlot0 && (
            <Animated.View
              key="deck-slot-0"
              style={[styles.cardWrap, topSlot === 0 ? slot0TopStyle : slot0NextStyle, topSlot === 0 ? styles.topCard : styles.nextCard]}
              pointerEvents={topSlot === 0 ? "auto" : "none"}
              testID={topSlot === 0 ? "swipe-card-top" : undefined}
            >
              <CardContent profile={profileSlot0} currentQuizAnswers={currentQuizAnswers} currency={currency} colors={colors} />
            </Animated.View>
          )}
          {profileSlot1 && (
            <Animated.View
              key="deck-slot-1"
              style={[styles.cardWrap, topSlot === 1 ? slot1TopStyle : slot1NextStyle, topSlot === 1 ? styles.topCard : styles.nextCard]}
              pointerEvents={topSlot === 1 ? "auto" : "none"}
              testID={topSlot === 1 ? "swipe-card-top" : undefined}
            >
              <CardContent profile={profileSlot1} currentQuizAnswers={currentQuizAnswers} currency={currency} colors={colors} />
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
});

export default React.memo(SwipeDeck);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    deckArea: { flex: 1, alignItems: "center", justifyContent: "center" },
    cardWrap: { ...StyleSheet.absoluteFillObject },
    nextCard: { zIndex: 1 },
    topCard: { zIndex: 2 },
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
    criteriaOverlay: { position: "absolute", top: spacing.md + 38, right: spacing.md, zIndex: 2, maxWidth: "48%" },
    quizBadgesRow: { alignItems: "flex-end", gap: 6 },
    quizPillBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(26, 26, 26, 0.78)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.18)" },
    quizPillBadgeMutualMatch: { backgroundColor: colors.brand, borderColor: colors.brandSecondary },
    quizPillText: { fontFamily: fonts.bold, fontSize: 10, color: "#FFFFFF" },
    quizPillTextMutualMatch: { color: colors.onBrand },
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
    emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface, textAlign: "center" },
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
}