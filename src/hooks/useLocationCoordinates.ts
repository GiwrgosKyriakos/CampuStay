import { useEffect, useMemo, useState } from "react";

type Coordinates = {
  latitude: number;
  longitude: number;
};

const DEFAULT_COORDINATES: Coordinates = {
  latitude: 37.9838,
  longitude: 23.7275,
};

const cache = new Map<string, Coordinates>();

function normalizeKey(city?: string | null, area?: string | null): string {
  return [city ?? "", area ?? ""]
    .join("|")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function geocodeQuery(queryText: string, signal: AbortSignal): Promise<Coordinates | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", queryText);
  url.searchParams.set("countrycodes", "gr");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "el,en");

  const response = await fetch(url.toString(), {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "CampuStayApp/1.0 (contact@campustay.com)",
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Array<{ lat: string; lon: string }>;
  const firstResult = Array.isArray(payload) ? payload[0] : null;

  if (!firstResult) return null;

  const latitude = Number(firstResult.lat);
  const longitude = Number(firstResult.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

export async function resolveLocationCoordinates(city?: string | null, area?: string | null): Promise<Coordinates | null> {
  const cacheKey = normalizeKey(city, area);
  if (!cacheKey) return DEFAULT_COORDINATES;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const queryText = [area?.trim(), city?.trim(), "Ελλάδα"]
    .filter((part): part is string => !!part && part.length > 0)
    .join(", ");

  try {
    const result = await geocodeQuery(queryText, controller.signal);
    if (result) cache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export function useLocationCoordinates(city?: string | null, area?: string | null): Coordinates {
  const cacheKey = useMemo(() => normalizeKey(city, area), [city, area]);
  const [coordinates, setCoordinates] = useState<Coordinates>(() => cache.get(cacheKey) ?? DEFAULT_COORDINATES);

  useEffect(() => {
    let active = true;

    if (!city?.trim() && !area?.trim()) {
      setCoordinates(DEFAULT_COORDINATES);
      return () => {
        active = false;
      };
    }

    const cached = cache.get(cacheKey);
    if (cached) {
      setCoordinates(cached);
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    const queryText = [area?.trim(), city?.trim(), "Ελλάδα"].filter((part): part is string => !!part && part.length > 0).join(", ");

    void geocodeQuery(queryText, controller.signal)
      .then((result) => {
        if (!active || !result) return;
        cache.set(cacheKey, result);
        setCoordinates(result);
      })
      .catch(() => {
        if (active) setCoordinates(DEFAULT_COORDINATES);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [area, cacheKey, city]);

  return coordinates;
}