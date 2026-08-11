import { Tabs } from "expo-router";

import GlassTabBar from "@/src/components/GlassTabBar";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { t } from "@/src/locales";

export default function TabsLayout() {
  const { colors } = useTheme();
  const auth = useAuth();
  const isBroker = !!auth.isBroker;
  const notLookingForRoommate = auth.notLookingForRoommate === true;

  return (
    <Tabs
      initialRouteName={isBroker || notLookingForRoommate ? "apartments" : "roommates"}
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
        name="roommates"
        options={{
          title: t("tabs.roommates"),
          href: !isBroker && !notLookingForRoommate ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="broker"
        options={{
          title: "Broker",
          href: isBroker ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t("tabs.matches"),
        }}
      />
      <Tabs.Screen
        name="apartments"
        options={{
          title: t("tabs.apartments"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
        }}
      />
    </Tabs>
  );
}