import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/config/firebase";

type FirestoreRecentSearchDoc = {
  query?: string;
  createdAt?: ReturnType<typeof serverTimestamp>;
};

function buildRecentSearchDocId(queryText: string): string {
  return encodeURIComponent(queryText.trim());
}

export async function saveRecentSearch(userId: string, queryText: string): Promise<void> {
  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) return;

  const recentSearchRef = doc(db, "users", userId, "recentSearches", buildRecentSearchDocId(trimmedQuery));

  await setDoc(
    recentSearchRef,
    {
      query: trimmedQuery,
      createdAt: serverTimestamp(),
    } satisfies FirestoreRecentSearchDoc,
    { merge: true },
  );
}

export function subscribeRecentSearches(userId: string, callback: (searches: string[]) => void): () => void {
  const recentSearchesQ = query(collection(db, "users", userId, "recentSearches"), orderBy("createdAt", "desc"));

  return onSnapshot(recentSearchesQ, (snapshot) => {
    const searches = snapshot.docs
      .map((item) => item.data()?.query)
      .filter((queryText): queryText is string => typeof queryText === "string" && queryText.trim().length > 0);

    callback(searches);
  });
}