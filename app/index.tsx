import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/auth";

export default function Index() {
  const { isLoading, isLoggedIn, isGuestMode, needsProfileSetup, isBroker, notLookingForRoommate } = useAuth();

  if (isLoading) return null;

  if (isLoggedIn) {
    const targetHome = isBroker || notLookingForRoommate ? "/apartments" : "/roommates";
    return <Redirect href={needsProfileSetup ? "/edit-profile" : targetHome} />;
  }
  if (isGuestMode) {
    return <Redirect href="/roommates" />;
  }
  return <Redirect href="/auth-landing" />;
}