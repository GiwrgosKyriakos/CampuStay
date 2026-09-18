import React, { useEffect } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Mask, Rect } from "react-native-svg";

import { useTheme } from "@/src/context/ThemeContext";
import { useTour } from "@/src/context/TourContext";
import { TourTooltipCard } from "@/src/components/tour/TourTooltipCard";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function TourSpotlightOverlay() {
  const { colors } = useTheme();
  const { currentStep, currentStepIndex, currentStepTotal, currentTarget, isTourActive, next, skip } = useTour();
  const { width, height } = useWindowDimensions();
  const x = useSharedValue(-200);
  const y = useSharedValue(-200);
  const targetWidth = useSharedValue(0);
  const targetHeight = useSharedValue(0);

  useEffect(() => {
    if (!currentTarget) return;
    const transition = { duration: 260, easing: Easing.out(Easing.cubic) };
    x.value = withTiming(currentTarget.x, transition);
    y.value = withTiming(currentTarget.y, transition);
    targetWidth.value = withTiming(currentTarget.width, transition);
    targetHeight.value = withTiming(currentTarget.height, transition);
  }, [currentTarget, targetHeight, targetWidth, x, y]);

  const animatedCutoutProps = useAnimatedProps(() => ({
    x: x.value,
    y: y.value,
    width: targetWidth.value,
    height: targetHeight.value,
    rx: 14,
    ry: 14,
  }));
  const animatedBorderStyle = useAnimatedStyle(() => ({
    left: x.value - 6,
    top: y.value - 6,
    width: targetWidth.value + 12,
    height: targetHeight.value + 12,
    opacity: targetWidth.value > 0 ? 1 : 0,
  }));
  const animatedTopBlockerStyle = useAnimatedStyle(() => ({ height: Math.max(0, y.value) }));
  const animatedBottomBlockerStyle = useAnimatedStyle(() => ({ top: y.value + targetHeight.value }));
  const animatedLeftBlockerStyle = useAnimatedStyle(() => ({
    top: y.value,
    width: Math.max(0, x.value),
    height: targetHeight.value,
  }));
  const animatedRightBlockerStyle = useAnimatedStyle(() => ({
    top: y.value,
    left: x.value + targetWidth.value,
    height: targetHeight.value,
  }));

  if (!isTourActive || !currentStep) return null;
  if (!currentTarget) {
    return (
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined} />
        <TourTooltipCard
          step={currentStep}
          current={currentStepIndex + 1}
          total={currentStepTotal}
          target={{ x: width / 2, y: height / 2, width: 1, height: 1 }}
          onNext={next}
          onSkip={skip}
        />
      </View>
    );
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View pointerEvents="auto" style={[styles.touchBlocker, styles.topBlocker, animatedTopBlockerStyle]} />
      <Animated.View pointerEvents="auto" style={[styles.touchBlocker, styles.bottomBlocker, animatedBottomBlockerStyle]} />
      <Animated.View pointerEvents="auto" style={[styles.touchBlocker, styles.leftBlocker, animatedLeftBlockerStyle]} />
      <Animated.View pointerEvents="auto" style={[styles.touchBlocker, styles.rightBlocker, animatedRightBlockerStyle]} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="tour-spotlight-mask">
            <Rect x={0} y={0} width={width} height={height} fill="white" />
            <AnimatedRect animatedProps={animatedCutoutProps} fill="black" />
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="rgba(0,0,0,0.65)" mask="url(#tour-spotlight-mask)" />
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.border, { borderColor: colors.brand }, animatedBorderStyle]} />
      <TourTooltipCard
        step={currentStep}
        current={currentStepIndex + 1}
        total={currentStepTotal}
        target={currentTarget}
        onNext={next}
        onSkip={skip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  border: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 18,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  touchBlocker: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  topBlocker: {
    top: 0,
    left: 0,
    right: 0,
  },
  bottomBlocker: {
    bottom: 0,
    left: 0,
    right: 0,
  },
  leftBlocker: {
    left: 0,
  },
  rightBlocker: {
    right: 0,
  },
});