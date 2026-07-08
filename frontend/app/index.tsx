
//import { Redirect } from "expo-router";

//import { useAuth } from "@/src/context/auth";

//export default function Index() {
//  const { isLoading, isLoggedIn, isGuestMode, needsProfileSetup } = useAuth();
//
//  if (isLoading) return null;
//
//  if (isLoggedIn) {
//    return <Redirect href={needsProfileSetup ? "/edit-profile" : "/(tabs)/roommates"} />;
//  }
//  if (isGuestMode) {
//    return <Redirect href="/(tabs)/roommates" />;
//  }
//  return <Redirect href="/auth-landing" />;
//}


import { ActivityIndicator, View } from "react-native";

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}