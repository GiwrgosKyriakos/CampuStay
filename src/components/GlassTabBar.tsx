import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  roommates: { active: "flame", inactive: "flame-outline" },
  calendar: { active: "calendar", inactive: "calendar-outline" },
  broker: { active: "person", inactive: "person-outline" },
  matches: { active: "heart", inactive: "heart-outline" },
  apartments: { active: "home", inactive: "home-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function GlassTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const auth = useAuth();
  const isBroker = !!auth.isBroker;
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focusedRouteName = state.routes[state.index]?.name;
  const visibleRoutes = useMemo(() => {
    return state.routes
      .filter((route) => {
        const href = (descriptors[route.key]?.options as { href?: string | null } | undefined)?.href;
        if (href === null) return false;
        if (isBroker) return ["calendar", "matches", "apartments", "broker"].includes(route.name);
        if (route.name === "roommates") return !notLookingForRoommate;
        return ["matches", "apartments", "profile"].includes(route.name);
      })
      .sort((left, right) => {
        const order = isBroker
          ? ["calendar", "matches", "apartments", "broker"]
          : ["roommates", "matches", "apartments", "profile"];
        return order.indexOf(left.name) - order.indexOf(right.name);
      });
  }, [descriptors, isBroker, notLookingForRoommate, state.routes]);

  if (isBroker && focusedRouteName === "profile") {
    return null;
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="bottom-tab-bar">
      <View style={styles.bar}>
        <View style={styles.row}>
          {visibleRoutes.map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
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
                <View
                  style={[
                    styles.iconPill,
                    focused ? { backgroundColor: colors.brand } : undefined,
                  ]}
                >
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      overflow: "hidden",
    },
    iconPillActive: {
      backgroundColor: colors.brand,
    },
  });
}