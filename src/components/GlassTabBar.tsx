import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";

export const TAB_BAR_HEIGHT = 64; // Exported in case other screens (like Reels) need to calculate bottom clearance

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
  
  // Διατήρηση των σύγχρονων ρόλων από το GlassTabBar_4.tsx
  const isBroker = !!auth.isBroker;
  const isExecutive = auth.agencyRole === "ceo" || auth.agencyRole === "secretary" || auth.agencyRole === "secretariat";
  const hasAgencyMembership = isBroker && !!auth.agencyId;
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  
  const styles = useMemo(() => createStyles(colors), [colors]);
  const focusedRouteName = state.routes[state.index]?.name;
  
  const visibleRoutes = useMemo(() => {
    return state.routes
      .filter((route) => {
        const href = (descriptors[route.key]?.options as { href?: string | null } | undefined)?.href;
        if (href === null) return false;
        
        if (isExecutive) return ["settlements", "secretariat-pool", "apartment-pool", "marketing-spend", "analytics"].includes(route.name);
        if (isBroker) return ["calendar", "matches", hasAgencyMembership ? "apartment-pool" : "explore-feed", "apartments", "broker"].includes(route.name);
        if (notLookingForRoommate) return ["calendar", "matches", "explore-feed", "apartments", "profile"].includes(route.name);
        if (route.name === "roommates") return !notLookingForRoommate;
        
        return ["matches", "explore-feed", "apartments", "profile"].includes(route.name);
      })
      .sort((left, right) => {
        const order = isExecutive
          ? ["settlements", "secretariat-pool", "apartment-pool", "marketing-spend", "analytics"]
          : isBroker
          ? ["calendar", "matches", hasAgencyMembership ? "apartment-pool" : "explore-feed", "apartments", "broker"]
          : notLookingForRoommate
          ? ["calendar", "matches", "explore-feed", "apartments", "profile"]
          : ["roommates", "matches", "explore-feed", "apartments", "profile"];
        return order.indexOf(left.name) - order.indexOf(right.name);
      });
  }, [descriptors, hasAgencyMembership, isBroker, isExecutive, notLookingForRoommate, state.routes]);

  if (isBroker && focusedRouteName === "profile") {
    return null;
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="bottom-tab-bar">
      <View style={styles.bar}>
        <View style={styles.row}>
          {visibleRoutes.map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            
            const fallbackIcon = { active: "apps" as const, inactive: "apps-outline" as const };
            const cfg = route.name === "matches" && (isBroker || isExecutive)
              ? { active: "mail" as const, inactive: "mail-outline" as const }
              : ICONS[route.name] ?? fallbackIcon;
              
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
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <View
                  style={[
                    styles.iconPill,
                    route.name === "explore-feed" && styles.reelIconPill, // Το reel tab είναι ελάχιστα πιο τονισμένο
                    focused ? styles.iconPillActive : undefined,
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
      backgroundColor: colors.muted,
      // Το overflow: "hidden" αφαιρέθηκε σκοπίμως για να μην κόβονται τα εικονίδια στο Android
      elevation: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      paddingVertical: 8, // Ιδανικό ενδιάμεσο πάχος
      paddingHorizontal: spacing.sm,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    iconPill: {
      width: 48,  // Ισορροπία ανάμεσα στο 52 (παλιό) και 44 (τωρινό)
      height: 48,
      borderRadius: 24, // Απόλυτος κύκλος
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      overflow: "hidden",
    },
    iconPillActive: {
      backgroundColor: colors.brand,
      overflow: "hidden",
    },
    reelIconPill: {
      width: 52, // Στο παλιό ήταν 58. Το μειώσαμε αναλογικά για να ταιριάζει.
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: colors.brand,
      overflow: "hidden"
    },
  });
}