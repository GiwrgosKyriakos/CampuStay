import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DimensionValue,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

export interface BaseBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: DimensionValue;
  scrollable?: boolean;
  avoidKeyboard?: boolean;
  showDragHandle?: boolean;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  preventDismissOnTouchOutside?: boolean;
}

const EXIT_DURATION = 235;
const ENTER_DURATION = 260;

export default function BaseBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = "88%",
  scrollable = true,
  avoidKeyboard = true,
  showDragHandle = true,
  headerRight,
  footer,
  preventDismissOnTouchOutside = false,
}: BaseBottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const isClosingRef = useRef(false);
  const mountedRef = useRef(visible);
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const isDraggingSheet = useSharedValue(false);
  const dragStartTranslationY = useSharedValue(0);

  const finishClose = useCallback(() => {
    isClosingRef.current = false;
    mountedRef.current = false;
    setMounted(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    translateY.value = withTiming(screenHeight, {
      duration: EXIT_DURATION,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdropOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [backdropOpacity, finishClose, screenHeight, translateY]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const headerPanGesture = Gesture.Pan()
    .activeOffsetY([0, 8])
    .failOffsetX([-25, 25])
    .cancelsTouchesInView(false)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        backdropOpacity.value = Math.max(0, 0.5 - event.translationY / screenHeight);
      }
    })
    .onEnd((event) => {
      if (event.translationY > Math.min(100, screenHeight * 0.15) || event.velocityY > 500) {
        runOnJS(requestClose)();
        return;
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0.5, { duration: 150 });
    });

  const universalPanGesture = Gesture.Pan()
    .activeOffsetY([0, 8])
    .failOffsetX([-25, 25])
    .cancelsTouchesInView(false)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        backdropOpacity.value = Math.max(0, 0.5 - event.translationY / screenHeight);
      }
    })
    .onEnd((event) => {
      if (event.translationY > Math.min(100, screenHeight * 0.15) || event.velocityY > 500) {
        runOnJS(requestClose)();
        return;
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0.5, { duration: 150 });
    });

  const contentPanGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-25, 25])
    .cancelsTouchesInView(false)
    .onStart(() => {
      isDraggingSheet.value = scrollOffset.value <= 0;
      dragStartTranslationY.value = 0;
    })
    .onUpdate((event) => {
      if (!isDraggingSheet.value && scrollOffset.value <= 0 && event.translationY > 0) {
        isDraggingSheet.value = true;
        dragStartTranslationY.value = event.translationY;
      }
      const sheetTranslationY = event.translationY - dragStartTranslationY.value;
      if (isDraggingSheet.value && sheetTranslationY > 0) {
        translateY.value = sheetTranslationY;
        backdropOpacity.value = Math.max(0, 0.5 - sheetTranslationY / screenHeight);
      }
    })
    .onEnd((event) => {
      const sheetTranslationY = event.translationY - dragStartTranslationY.value;
      const shouldDismiss = isDraggingSheet.value && (sheetTranslationY > Math.min(100, screenHeight * 0.15) || event.velocityY > 500);
      isDraggingSheet.value = false;
      if (shouldDismiss) {
        runOnJS(requestClose)();
        return;
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0.5, { duration: 150 });
    })
    .onFinalize(() => {
      isDraggingSheet.value = false;
    });

  const nativeScrollGesture = Gesture.Native();
  const contentGesture = Gesture.Simultaneous(contentPanGesture, nativeScrollGesture);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      mountedRef.current = true;
      setMounted(true);
      translateY.value = screenHeight;
      backdropOpacity.value = 0;
      translateY.value = withTiming(0, { duration: ENTER_DURATION, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(0.5, { duration: ENTER_DURATION, easing: Easing.out(Easing.cubic) });
      return;
    }

    if (mountedRef.current) requestClose();
  }, [backdropOpacity, requestClose, screenHeight, translateY, visible]);

  const headerContent = showDragHandle || title || subtitle || headerRight ? (
    <View style={styles.headerGestureSurface}>
      {showDragHandle ? <View style={[styles.dragHandle, { backgroundColor: colors.onSurfaceTertiary }]} /> : null}
      {title || subtitle || headerRight ? (
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerCopy}>
            {title ? <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text> : null}
            {subtitle ? <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>
      ) : null}
    </View>
  ) : null;

  const sheetContent = (
    <Animated.View
      style={[
        styles.sheet,
        sheetStyle,
        { backgroundColor: colors.surface, borderColor: colors.border, maxHeight },
      ]}
    >
      {headerContent ? (scrollable ? <GestureDetector gesture={headerPanGesture}>{headerContent}</GestureDetector> : headerContent) : null}
      <View style={styles.body}>
        {scrollable ? (
          <GestureDetector gesture={contentGesture}>
            <Animated.ScrollView
              style={styles.scrollView}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }}
              bounces={false}
              overScrollMode="never"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
            >
              {children}
            </Animated.ScrollView>
          </GestureDetector>
        ) : (
          <View style={[styles.nonScrollableBody, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{children}</View>
        )}
      </View>
      {footer ? <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{footer}</View> : null}
    </Animated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={avoidKeyboard ? (Platform.OS === "ios" ? "padding" : "height") : undefined}
          keyboardVerticalOffset={avoidKeyboard && Platform.OS === "ios" ? insets.top : 0}
        >
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={preventDismissOnTouchOutside ? undefined : requestClose}
              accessible={!preventDismissOnTouchOutside}
              accessibilityRole="button"
              accessibilityLabel={t("common.accessibility.close")}
            />
          </Animated.View>
          {scrollable ? sheetContent : <GestureDetector gesture={universalPanGesture}>{sheetContent}</GestureDetector>}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000" },
  sheet: {
    width: "100%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 14,
  },
  dragHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: radius.pill, marginTop: spacing.sm, marginBottom: spacing.xs, opacity: 0.45 },
  headerGestureSurface: { width: "100%" },
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: fontSize.lg },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  body: { flexShrink: 1 },
  scrollView: { flexShrink: 1 },
  nonScrollableBody: { flexShrink: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
