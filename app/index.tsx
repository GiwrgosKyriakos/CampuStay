import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/auth";
import { isBrokerOrSecretariat } from "@/src/utils/roles";

export default function Index() {
  const auth = useAuth();

  if (auth.isLoading) return null;

  if (auth.isLoggedIn) {
    const targetHome = isBrokerOrSecretariat(auth) ? "/(tabs)/apartment-pool" : "/(tabs)/apartments";
    return <Redirect href={auth.needsProfileSetup ? "/edit-profile" : targetHome} />;
  }
  if (auth.isGuestMode) {
    return <Redirect href="/roommates" />;
  }
  return <Redirect href="/auth-landing" />;
}