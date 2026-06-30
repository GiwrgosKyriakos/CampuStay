import { useEffect } from "react";
import { Redirect, useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth";

export default function Index() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.loaded) {
      router.replace(auth.isGuest ? "/guest" : "/roommates");
    }
  }, [auth.loaded, auth.isGuest, router]);

  return auth.loaded ? <Redirect href={auth.isGuest ? "/guest" : "/roommates"} /> : null;
}
