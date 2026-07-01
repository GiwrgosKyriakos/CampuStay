import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";

export default function Index() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading) {
      router.replace("/(tabs)/roommates");
    }
  }, [auth.isLoading, router]);

  return !auth.isLoading ? <Redirect href="/(tabs)/roommates" /> : null;
}
