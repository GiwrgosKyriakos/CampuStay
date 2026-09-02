import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";

export default function ShareProfileButton({ hidden = false, user, onPress }: { hidden?: boolean; user?: { preferences?: { hideNameInDeck?: boolean; hideInStack?: boolean } } | null; onPress: () => void }) {
  const { colors } = useTheme();
  const profileHidden = hidden || user?.preferences?.hideNameInDeck === true || user?.preferences?.hideInStack === true;
  if (profileHidden) return null;
  return <Pressable onPress={onPress} hitSlop={8} testID="share-profile-button"><Ionicons name="share-social-outline" size={22} color={colors.brand} /></Pressable>;
}