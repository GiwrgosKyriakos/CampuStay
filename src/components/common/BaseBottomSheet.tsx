import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  DimensionValue,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

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
  const scrollOffsetRef = useRef(0);
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        const reachedTop = scrollOffsetRef.current <= 0;
        return gestureState.dy > 8 && gestureState.dy > Math.abs(gestureState.dx) && (gestureState.vy >= 0 || reachedTop);
      },
      onPanResponderMove: (_event, gestureState) => {
        translateY.setValue(Math.max(0, gestureState.dy));
        backdropOpacity.setValue(Math.max(0, 0.5 - gestureState.dy / screenHeight));
      },
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dy > Math.min(120, screenHeight * 0.16)) {
          requestClose();
          return;
        }
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
          Animated.timing(backdropOpacity, { toValue: 0.5, duration: 120, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
          Animated.timing(backdropOpacity, { toValue: 0.5, duration: 120, useNativeDriver: true }),
        ]).start();
      },
    }),
  ).current;

  const finishClose = useCallback(() => {
    isClosingRef.current = false;
    setMounted(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: EXIT_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: EXIT_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) finishClose();
    });
  }, [backdropOpacity, finishClose, screenHeight, translateY]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setMounted(true);
      translateY.setValue(screenHeight);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.5,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (mounted) requestClose();
  }, [backdropOpacity, requestClose, screenHeight, translateY, visible]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={avoidKeyboard && Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={avoidKeyboard && Platform.OS === "ios" ? insets.top : 0}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={preventDismissOnTouchOutside ? undefined : requestClose}
            accessible={!preventDismissOnTouchOutside}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border, maxHeight, transform: [{ translateY }] },
          ]}
        >
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
          <View style={styles.body}>
            {scrollable ? (
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.nonScrollableBody, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{children}</View>
            )}
          </View>
          {footer ? <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: fontSize.lg },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  body: { flexShrink: 1 },
  scrollView: { flexShrink: 1 },
  nonScrollableBody: { flexShrink: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
