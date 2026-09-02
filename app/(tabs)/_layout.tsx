import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import GlassTabBar from "@/src/components/GlassTabBar";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { t } from "@/src/locales";

export default function TabsLayout() {
  const { colors } = useTheme();
  const auth = useAuth();
  const isBroker = !!auth.isBroker;
  const notLookingForRoommate = auth.notLookingForRoommate === true;
  const hasAgency = isBroker && !!auth.agencyId;
  const canViewSettlements = hasAgency && ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");
  const isExecutive = auth.agencyRole === "ceo" || auth.agencyRole === "secretary";
  const effectiveBroker = isBroker || isExecutive;
  const isSeekerUser = !isBroker && !notLookingForRoommate;
  const initialRouteName = isExecutive ? "analytics" : effectiveBroker ? "calendar" : isSeekerUser ? "explore-feed" : notLookingForRoommate ? "apartments" : "roommates";

  return (
    <Tabs
      initialRouteName={initialRouteName}
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.onSurface },
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="calendar-outline" size={size} />,
          href: effectiveBroker ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="roommates"
        options={{
          title: t("tabs.roommates"),
          href: !effectiveBroker && !notLookingForRoommate ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t("tabs.matches"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons color={color} name={isBroker ? (focused ? "mail" : "mail-outline") : (focused ? "heart" : "heart-outline")} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore-feed"
        options={{
          title: t("feed.reelsTitle"),
          tabBarIcon: ({ color, size, focused }) => <Ionicons color={color} name={focused ? "play-circle" : "play-circle-outline"} size={size} />,
          href: isSeekerUser ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t("analytics.title"),
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="bar-chart-outline" size={size} />,
          href: isExecutive ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="apartment-pool"
        options={{
          title: "Apartment Pool",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="business-outline" size={size} />,
          href: hasAgency ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="apartments"
        options={{
          title: t("tabs.apartments"),
        }}
      />
      <Tabs.Screen
        name="broker"
        options={{
          title: "Broker",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="person-outline" size={size} />,
          href: effectiveBroker ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="settlements"
        options={{
          title: "Settlements",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="receipt-outline" size={size} />,
          href: canViewSettlements ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="secretariat-pool"
        options={{
          title: "Pool Oversight",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="shield-checkmark-outline" size={size} />,
          href: canViewSettlements ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          href: effectiveBroker ? null : undefined,
        }}
      />
    </Tabs>
  );
}