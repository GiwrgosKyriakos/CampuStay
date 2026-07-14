import { Tabs } from "expo-router";

import GlassTabBar from "@/src/components/GlassTabBar";
import { t } from "@/src/locales";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="roommates" options={{ title: t("tabs.roommates") }} />
      <Tabs.Screen name="matches" options={{ title: t("tabs.matches") }} />
      <Tabs.Screen name="apartments" options={{ title: t("tabs.apartments") }} />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile") }} />
    </Tabs>
  );
}
