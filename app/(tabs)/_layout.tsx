import { Tabs } from "expo-router";

import GlassTabBar from "@/src/components/GlassTabBar";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/auth";
import { t } from "@/src/locales";

export default function TabsLayout() {
  const { colors } = useTheme();
  const auth = useAuth();
  const isBroker = !!auth.isBroker;
  const tabScreens = [
    { name: "roommates", title: t("tabs.roommates"), visible: !isBroker },
    { name: "matches", title: t("tabs.matches"), visible: true },
    { name: "apartments", title: t("tabs.apartments"), visible: true },
    { name: "profile", title: t("tabs.profile"), visible: true },
  ];
  const visibleTabScreens = (isBroker
    ? tabScreens.filter((screen) => screen.name !== "roommates").sort((left, right) => {
        const brokerOrder = ["apartments", "matches", "profile"];
        return brokerOrder.indexOf(left.name) - brokerOrder.indexOf(right.name);
      })
    : tabScreens.filter((screen) => screen.visible));

  return (
    <Tabs
      initialRouteName={isBroker ? "apartments" : "roommates"}
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
      {visibleTabScreens.map((screen) => (
        <Tabs.Screen key={screen.name} name={screen.name} options={{ title: screen.title }} />
      ))}
    </Tabs>
  );
}
