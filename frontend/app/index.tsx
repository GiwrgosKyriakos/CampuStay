import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";

export default function Index() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.loaded) {
      router.replace("/roommates");
    }
  }, [auth.loaded, router]);

  return auth.loaded ? <Redirect href="/roommates" /> : null;
}
