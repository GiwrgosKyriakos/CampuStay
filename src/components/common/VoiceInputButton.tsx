import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { t } from "@/src/locales";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { useTheme } from "@/src/context/ThemeContext";

interface VoiceInputButtonProps {
  onTextAppend: (spokenText: string) => void;
  size?: number;
  color?: string;
  disabled?: boolean;
}

export default function VoiceInputButton({ onTextAppend, size = 20, color, disabled = false }: VoiceInputButtonProps) {
  const { colors } = useTheme();
  const { isListening, error, startListening, stopListening } = useVoiceToText();
  const pulse = useRef(new Animated.Value(0)).current;
  const appendRef = useRef(onTextAppend);

  useEffect(() => {
    appendRef.current = onTextAppend;
  }, [onTextAppend]);

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
    if (error) console.warn("[VoiceInputButton] Speech recognition error:", error);
  }, [error]);

  const handlePress = () => {
    if (disabled) return;
    if (isListening) {
      void stopListening();
      return;
    }
    void startListening({ onFinalResult: (text) => appendRef.current(text) });
  };

  const iconColor = isListening ? colors.brand : color ?? colors.onSurfaceTertiary;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0] });

  return (
    <Pressable
      style={[styles.button, { width: size + 20, height: size + 20 }, disabled && styles.disabled]}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isListening ? t("voice.stop") : t("voice.start")}
      accessibilityState={{ disabled, busy: isListening }}
    >
      {isListening ? <Animated.View style={[styles.ring, { width: size + 12, height: size + 12, borderColor: colors.brand, transform: [{ scale: ringScale }], opacity: ringOpacity }]} /> : null}
      <Ionicons name={isListening ? "mic" : "mic-outline"} size={size} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", position: "relative" },
  ring: { position: "absolute", borderWidth: 2, borderRadius: 999 },
  disabled: { opacity: 0.4 },
});
