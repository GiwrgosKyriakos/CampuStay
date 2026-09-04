import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";

export const TAB_BAR_HEIGHT = 60;

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  roommates: { active: "flame", inactive: "flame-outline" },
  calendar: { active: "calendar", inactive: "calendar-outline" },
  broker: { active: "person", inactive: "person-outline" },
  matches: { active: "heart", inactive: "heart-outline" },
  "explore-feed": { active: "play-circle", inactive: "play-circle-outline" },
  apartments: { active: "home", inactive: "home-outline" },
  "apartment-pool": { active: "business", inactive: "business-outline" },
  settlements: { active: "receipt", inactive: "receipt-outline" },
  "secretariat-pool": { active: "shield-checkmark", inactive: "shield-checkmark-outline" },
  analytics: { active: "bar-chart", inactive: "bar-chart-outline" },
  "marketing-spend": { active: "megaphone", inactive: "megaphone-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function GlassTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const auth = useAuth();
  const isBroker = !!auth.isBroker;
  const isExecutive = auth.agencyRole === "ceo" || auth.agencyRole === "secretary";
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focusedRouteName = state.routes[state.index]?.name;
  const isReelsTab = focusedRouteName === "explore-feed";
  const visibleRoutes = useMemo(() => {
    return state.routes
      .filter((route) => {
        const href = (descriptors[route.key]?.options as { href?: string | null } | undefined)?.href;
        if (href === null) return false;
        if (isExecutive) return ["apartment-pool", "settlements", "secretariat-pool", "marketing-spend", "analytics"].includes(route.name);
        if (isBroker) return ["calendar", "matches", "apartments", "broker"].includes(route.name);
        if (notLookingForRoommate) return ["calendar", "matches", "explore-feed", "apartments", "profile"].includes(route.name);
        if (route.name === "roommates") return !notLookingForRoommate;
        return ["matches", "explore-feed", "apartments", "profile"].includes(route.name);
      })
      .sort((left, right) => {
        const order = isExecutive
          ? ["apartment-pool", "settlements", "secretariat-pool", "marketing-spend", "analytics"]
          : isBroker
          ? ["calendar", "matches", "apartments", "broker"]
          : notLookingForRoommate
          ? ["calendar", "matches", "explore-feed", "apartments", "profile"]
          : ["roommates", "matches", "explore-feed", "apartments", "profile"];
        return order.indexOf(left.name) - order.indexOf(right.name);
      });
  }, [descriptors, isBroker, isExecutive, notLookingForRoommate, state.routes]);

  if (isBroker && focusedRouteName === "profile") {
    return null;
  }

  return (
    <View style={isReelsTab ? styles.reelsWrap : [styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="bottom-tab-bar">
      <View style={[isReelsTab ? styles.reelsBar : styles.bar, isReelsTab && { paddingBottom: insets.bottom }]}>
        <View style={[styles.row, isReelsTab && styles.reelsRow]}>
          {visibleRoutes.map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const cfg = route.name === "matches" && (isBroker || isExecutive)
              ? { active: "mail" as const, inactive: "mail-outline" as const }
              : ICONS[route.name] ?? ICONS.roommates;
            const onPress = () => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={[styles.tab, isReelsTab && styles.reelsTab]}
                testID={`tab-${route.name}`}
                hitSlop={8}
              >
                <View
                  style={[
                    styles.iconPill,
                    route.name === "explore-feed" && styles.reelIconPill,
                    isReelsTab && styles.reelsIconPill,
                    focused ? { backgroundColor: colors.brand } : undefined,
                  ]}
                >
                  <Ionicons
                    name={focused ? cfg.active : cfg.inactive}
                    size={24}
                    color={focused ? colors.onBrand : isReelsTab ? "rgba(255,255,255,0.82)" : "#0A3A45"}
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
    reelsWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
    },
    bar: {
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: colors.muted,
    },
    reelsBar: {
      overflow: "hidden",
      backgroundColor: colors.surfaceSecondary,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(255,255,255,0.16)",
      minHeight: TAB_BAR_HEIGHT,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    reelsRow: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    reelsTab: {
      minHeight: 44,
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
    reelIconPill: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: 2,
      borderColor: colors.brand,
    },
    reelsIconPill: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 0,
    },
  });
}