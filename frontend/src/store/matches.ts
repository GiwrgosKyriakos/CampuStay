import { useEffect, useState } from "react";
import { useAuth } from "@/src/context/auth";
import { subscribeMatches } from "@/src/services/firestore";
import type { FirestoreMatch } from "@/src/services/firestore";

export function useMatches() {
  const auth = useAuth();
  const [matches, setMatches] = useState<FirestoreMatch[]>([]);

  useEffect(() => {
    if (!auth.userId) {
      setMatches([]);
      return;
    }

    const unsubscribe = subscribeMatches(auth.userId, setMatches);
    return unsubscribe;
  }, [auth.userId]);

  return matches;
}
