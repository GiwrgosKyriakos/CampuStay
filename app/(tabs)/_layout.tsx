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
  const initialRouteName = isBroker ? "calendar" : notLookingForRoommate ? "apartments" : "roommates";

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
          href: isBroker ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="roommates"
        options={{
          title: t("tabs.roommates"),
          href: !isBroker && !notLookingForRoommate ? undefined : null,
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
          href: isBroker ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          href: isBroker ? null : undefined,
        }}
      />
    </Tabs>
  );
}