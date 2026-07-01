import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { colors, radius, spacing } from "@/src/theme";

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  roommates: { active: "flame", inactive: "flame-outline" },
  matches: { active: "heart", inactive: "heart-outline" },
  apartments: { active: "home", inactive: "home-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="bottom-tab-bar">
      <View style={styles.bar}>
        <View style={styles.row}>
          {state.routes.map((route, idx) => {
            const focused = state.index === idx;
            const cfg = ICONS[route.name] ?? ICONS.roommates;
            const onPress = () => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tab}
                testID={`tab-${route.name}`}
                hitSlop={8}
              >
                <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                  <Ionicons
                    name={focused ? cfg.active : cfg.inactive}
                    size={24}
                    color={focused ? colors.onBrand : "#0A3A45"}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
  },
  bar: {
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPill: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconPillActive: {
    backgroundColor: colors.brand,
  },
});
