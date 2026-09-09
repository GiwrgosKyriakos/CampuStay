import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/auth";
import { getRoleHomeTab } from "@/src/utils/roles";

export default function Index() {
  const auth = useAuth();

  if (auth.isLoading) return null;

  if (auth.isLoggedIn) {
    const targetHome = `/(tabs)/${getRoleHomeTab(auth)}` as const;
    return <Redirect href={auth.needsProfileSetup ? "/edit-profile" : targetHome} />;
  }
  if (auth.isGuestMode) {
    return <Redirect href="/roommates" />;
  }
  return <Redirect href="/auth-landing" />;
}