import { useSyncExternalStore } from "react";
import type { RoommateProfile } from "@/src/data/profiles";

let liked: RoommateProfile[] = [];
const listeners = new Set<() => void>();

function emit() {
  liked = [...liked];
  listeners.forEach((l) => l());
}

export const matchesStore = {
  add(p: RoommateProfile) {
    if (!liked.find((x) => x.id === p.id)) {
      liked = [p, ...liked];
      emit();
    }
  },
  remove(id: string) {
    liked = liked.filter((x) => x.id !== id);
    emit();
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get() {
    return liked;
  },
};

export function useMatches() {
  return useSyncExternalStore(matchesStore.subscribe, matchesStore.get, matchesStore.get);
}
