import React, { useEffect, useRef } from "react";
import { Animated, Keyboard, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { t } from "@/src/locales";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { useTheme } from "@/src/context/ThemeContext";

interface VoiceInputButtonProps {
  onTextAppend: (spokenText: string) => void;
  onPartialResult?: (spokenText: string) => void;
  onAbort?: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  testID?: string;
}

export default function VoiceInputButton({ onTextAppend, onPartialResult, onAbort, size = 20, color, disabled = false, testID }: VoiceInputButtonProps) {
  const { colors } = useTheme();
  const { isListening, error, hasPermission, permissionCanAskAgain, isRecognitionAvailable, startListening, stopListening, abortListening } = useVoiceToText();
  const pulse = useRef(new Animated.Value(0)).current;
  const appendRef = useRef(onTextAppend);
  const partialRef = useRef<VoiceInputButtonProps["onPartialResult"]>(undefined);
  const abortRef = useRef<VoiceInputButtonProps["onAbort"]>(undefined);

  useEffect(() => {
    appendRef.current = onTextAppend;
  }, [onTextAppend]);

  useEffect(() => {
    partialRef.current = onPartialResult;
  }, [onPartialResult]);

  useEffect(() => {
    abortRef.current = onAbort;
  }, [onAbort]);

  useEffect(() => {
    if (!isListening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [isListening, pulse]);

  useEffect(() => {
    if (error) abortRef.current?.();
  }, [error]);

  const handlePress = () => {
    if (isUnavailable) return;
    if (isListening) {
      void stopListening();
      return;
    }
    Keyboard.dismiss();
    void startListening({ onPartialResult: (text) => partialRef.current?.(text), onFinalResult: (text) => appendRef.current(text) });
  };

  const isUnavailable = disabled || isRecognitionAvailable === false || (hasPermission === false && permissionCanAskAgain === false);
  const iconColor = isUnavailable ? colors.error : isListening ? colors.brand : color ?? colors.onSurfaceTertiary;
  const unavailableMessage = error?.message ?? (hasPermission === false && permissionCanAskAgain === false ? t("voice.errors.permissionDenied") : t("voice.errors.unavailable"));
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0] });

  return (
    <Pressable
      testID={testID}
      style={[styles.button, { width: size + 20, height: size + 20 }, isUnavailable && styles.disabled, isUnavailable && { borderColor: colors.error, borderWidth: 1, borderRadius: 999 }]}
      onPress={handlePress}
      onLongPress={() => {
        if (isListening) {
          abortListening();
          abortRef.current?.();
        }
      }}
      disabled={isUnavailable}
      accessibilityRole="button"
      accessibilityLabel={isUnavailable ? unavailableMessage : isListening ? t("voice.stop") : t("voice.start")}
      accessibilityHint={isUnavailable ? unavailableMessage : undefined}
      accessibilityState={{ disabled: isUnavailable, busy: isListening }}
    >
      {isListening ? <Animated.View style={[styles.ring, { width: size + 12, height: size + 12, borderColor: colors.brand, transform: [{ scale: ringScale }], opacity: ringOpacity }]} /> : null}
      <Ionicons name={isUnavailable ? "mic-off-outline" : isListening ? "mic" : "mic-outline"} size={size} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", position: "relative" },
  ring: { position: "absolute", borderWidth: 2, borderRadius: 999 },
  disabled: { opacity: 0.4 },
});
