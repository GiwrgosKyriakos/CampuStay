import React, { useEffect, useMemo, useRef, useState } from "react";
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";

import { fonts, fontSize, radius, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { db } from "@/src/config/firebase";

interface ApartmentLocationMapProps {
  latitude?: number;
  longitude?: number;
  cityCoordinates: { latitude: number; longitude: number };
  hasExactLocation: boolean;
  transactionType?: "sale" | "rent";
  height?: number;
  showLayerControls?: boolean;
}

type MapLayer = "transit" | "education" | "shopping" | "heatmap";
type PoiCategory = Exclude<MapLayer, "heatmap">;
type Coordinate = { latitude: number; longitude: number };

interface MapPoi {
  id: string;
  category: PoiCategory;
  name: string;
  coordinate: Coordinate;
}

interface PriceRegion {
  id: string;
  label: string;
  averagePricePerSqm: number;
  coordinates: Coordinate[];
}

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

const layerLabels: Record<MapLayer, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  transit: { icon: "train-outline", label: "Μετρό / ΜΜΜ" },
  education: { icon: "school-outline", label: "Σχολεία / Πανεπιστήμια" },
  shopping: { icon: "cart-outline", label: "Supermarkets / Εμπόριο" },
  heatmap: { icon: "thermometer-outline", label: "Χάρτης τιμών €/τ.μ." },
};

const EXACT_REGION_DELTA = 0.012;
const AREA_REGION_DELTA = 0.045;
const AREA_RADIUS_METERS = 1500;
const LISTING_RADIUS_METERS = 5000;
const OVERPASS_API_URL = process.env.EXPO_PUBLIC_OVERPASS_API_URL?.trim();

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#050e1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa4c6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050e1a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1b263b" }] },
  { featureType: "administrative.land_parcel", elementType: "geometry.stroke", stylers: [{ color: "#1b263b" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#10233c" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f86a7" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#102d35" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b263b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9fb4d1" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#24344f" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1b263b" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#14253b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a192f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4f789f" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#050e1a" }] },
];

const lightMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f1f7f8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a7f86" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f8fbfc" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c8dce0" }] },
  { featureType: "administrative.land_parcel", elementType: "geometry.stroke", stylers: [{ color: "#c8dce0" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#e7f2f4" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#d9ebee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f8f96" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d5ece0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d8e7ea" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#63868c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dbeff3" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#c8e1e7" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e3eef0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cdebf2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5585a0" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#e9f7fb" }] },
];

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function distanceInMeters(first: Coordinate, second: Coordinate): number {
  const earthRadius = 6371000;
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
  const latitudeOne = first.latitude * Math.PI / 180;
  const latitudeTwo = second.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitudeOne) * Math.cos(latitudeTwo);
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function convexHull(points: Coordinate[]): Coordinate[] {
  const unique = Array.from(new Map(points.map((point) => [`${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`, point])).values());
  const sorted = unique.sort((first, second) => first.longitude - second.longitude || first.latitude - second.latitude);
  if (sorted.length < 3) return [];
  const cross = (origin: Coordinate, point: Coordinate, next: Coordinate) =>
    (point.longitude - origin.longitude) * (next.latitude - origin.latitude) - (point.latitude - origin.latitude) * (next.longitude - origin.longitude);
  const lower: Coordinate[] = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Coordinate[] = [];
  sorted.slice().reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function poiCategory(tags: Record<string, string> = {}): PoiCategory | null {
  if (tags.public_transport || tags.railway === "station" || tags.railway === "halt" || tags.railway === "tram_stop") return "transit";
  if (tags.amenity === "school" || tags.amenity === "college" || tags.amenity === "university") return "education";
  if (tags.shop === "supermarket" || tags.shop === "convenience" || tags.shop === "mall") return "shopping";
  return null;
}

function poiCoordinate(element: OverpassElement): Coordinate | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return isValidCoordinate(latitude) && isValidCoordinate(longitude) ? { latitude, longitude } : null;
}

function regionColor(region: PriceRegion, overallAverage: number): { fill: string; stroke: string } {
  if (region.averagePricePerSqm > overallAverage * 1.1) return { fill: "rgba(231,111,81,0.34)", stroke: "rgba(231,111,81,0.8)" };
  if (region.averagePricePerSqm < overallAverage * 0.9) return { fill: "rgba(42,157,143,0.34)", stroke: "rgba(42,157,143,0.8)" };
  return { fill: "rgba(244,196,48,0.34)", stroke: "rgba(244,196,48,0.8)" };
}

export default function ApartmentLocationMap({
  latitude,
  longitude,
  cityCoordinates,
  hasExactLocation,
  transactionType = "rent",
  height = 280,
  showLayerControls = true,
}: ApartmentLocationMapProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const mapRef = useRef<MapView>(null);
  const mapStyle = isDark ? darkMapStyle : lightMapStyle;
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>({ transit: false, education: false, shopping: false, heatmap: false });
  const [layerSheetVisible, setLayerSheetVisible] = useState(false);
  const [pois, setPois] = useState<MapPoi[]>([]);
  const [priceRegions, setPriceRegions] = useState<PriceRegion[]>([]);

  const exactCoordinates = useMemo(() => {
    if (!hasExactLocation) return null;
    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) return null;
    return { latitude, longitude };
  }, [hasExactLocation, latitude, longitude]);

  const displayRegion = useMemo<Region>(() => {
    if (exactCoordinates) {
      return {
        latitude: exactCoordinates.latitude,
        longitude: exactCoordinates.longitude,
        latitudeDelta: EXACT_REGION_DELTA,
        longitudeDelta: EXACT_REGION_DELTA,
      };
    }

    return {
      latitude: cityCoordinates.latitude,
      longitude: cityCoordinates.longitude,
      latitudeDelta: AREA_REGION_DELTA,
      longitudeDelta: AREA_REGION_DELTA,
    };
  }, [cityCoordinates.latitude, cityCoordinates.longitude, exactCoordinates]);

  useEffect(() => {
    if (mapRef.current && displayRegion) {
      mapRef.current.animateToRegion(displayRegion, 500);
    }
  }, [displayRegion]);

  useEffect(() => {
    if (!exactCoordinates || !OVERPASS_API_URL) {
      setPois([]);
      return;
    }
    let active = true;
    const query = `[out:json][timeout:10];(nwr(around:1800,${exactCoordinates.latitude},${exactCoordinates.longitude})[public_transport];nwr(around:1800,${exactCoordinates.latitude},${exactCoordinates.longitude})[railway~"station|halt|tram_stop"];nwr(around:1800,${exactCoordinates.latitude},${exactCoordinates.longitude})[amenity~"school|college|university"];nwr(around:1800,${exactCoordinates.latitude},${exactCoordinates.longitude})[shop~"supermarket|convenience|mall"];);out center;`;
    fetch(`${OVERPASS_API_URL}?data=${encodeURIComponent(query)}`)
      .then((response) => response.ok ? response.json() as Promise<{ elements?: OverpassElement[] }> : Promise.reject(new Error("Overpass request failed")))
      .then((data) => {
        if (!active) return;
        const nextPois = (data.elements ?? []).map((element) => {
          const category = poiCategory(element.tags);
          const coordinate = poiCoordinate(element);
          if (!category || !coordinate) return null;
          return { id: `${element.type}-${element.id}`, category, coordinate, name: element.tags?.name?.trim() || layerLabels[category].label } satisfies MapPoi;
        }).filter((poi): poi is MapPoi => poi !== null);
        setPois(Array.from(new Map(nextPois.map((poi) => [poi.id, poi])).values()));
      })
      .catch(() => { if (active) setPois([]); });
    return () => { active = false; };
  }, [exactCoordinates]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onSnapshot(collection(db, "apartments"), (snapshot) => {
      if (!active) return;
      const groups = new Map<string, { label: string; prices: number[]; coordinates: Coordinate[] }>();
      snapshot.docs.forEach((document) => {
        const data = document.data() as Record<string, unknown>;
        if (data.transactionType !== transactionType) return;
        if (typeof data.status === "string" && !["active", "available"].includes(data.status)) return;
        const latitude = data.latitude;
        const longitude = data.longitude;
        const size = Number(data.sqm ?? data.size);
        const price = Number(data[transactionType === "sale" ? "price" : "rent"]);
        if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude) || !Number.isFinite(size) || size <= 0 || !Number.isFinite(price) || price <= 0) return;
        const coordinate = { latitude, longitude };
        if (distanceInMeters(cityCoordinates, coordinate) > LISTING_RADIUS_METERS) return;
        const rawLabel = [data.postalCode, data.postcode, data.neighborhood, data.district, data.area].find((value) => typeof value === "string" && value.trim()) as string | undefined;
        if (!rawLabel) return;
        const key = rawLabel.trim().toLocaleLowerCase();
        const group = groups.get(key) ?? { label: rawLabel.trim(), prices: [], coordinates: [] };
        group.prices.push(price / size);
        group.coordinates.push(coordinate);
        groups.set(key, group);
      });
      const allPrices = Array.from(groups.values()).flatMap((group) => group.prices);
      const overallAverage = allPrices.length ? allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length : 0;
      const regions = Array.from(groups.entries()).map(([id, group]) => {
        const coordinates = convexHull(group.coordinates);
        if (coordinates.length < 3) return null;
        return { id, label: group.label, averagePricePerSqm: group.prices.reduce((sum, price) => sum + price, 0) / group.prices.length, coordinates } satisfies PriceRegion;
      }).filter((region): region is PriceRegion => region !== null);
      setPriceRegions(overallAverage > 0 ? regions : []);
    }, () => { if (active) setPriceRegions([]); });
    return () => { active = false; unsubscribe(); };
  }, [cityCoordinates, transactionType]);

  const availableLayers = useMemo(() => (Object.keys(layerLabels) as MapLayer[]).filter((layer) => layer === "heatmap" ? priceRegions.length > 0 : pois.some((poi) => poi.category === layer)), [pois, priceRegions]);
  const overallPriceAverage = useMemo(() => {
    if (!priceRegions.length) return 0;
    return priceRegions.reduce((sum, region) => sum + region.averagePricePerSqm, 0) / priceRegions.length;
  }, [priceRegions]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={displayRegion}
        customMapStyle={mapStyle}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsTraffic={false}
        toolbarEnabled={false}
        rotateEnabled
        pitchEnabled
        scrollEnabled
        zoomEnabled
        loadingEnabled
      >
        {hasExactLocation && exactCoordinates ? (
          <Marker coordinate={exactCoordinates} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.pinWrap}>
              <View style={styles.pinOuter}>
                <View style={styles.pinInner}>
                  <Ionicons name="location-sharp" size={18} color={colors.onBrand} />
                </View>
              </View>
            </View>
          </Marker>
        ) : !hasExactLocation ? (
          <Circle
            center={cityCoordinates}
            radius={AREA_RADIUS_METERS}
            fillColor="rgba(56, 189, 248, 0.2)"
            strokeColor="#38bdf8"
            strokeWidth={2}
          />
        ) : null}
        {pois.filter((poi) => layers[poi.category]).map((poi) => (
          <Marker key={poi.id} coordinate={poi.coordinate} title={poi.name}>
            <View style={[styles.poiMarker, { backgroundColor: poi.category === "transit" ? "#168aad" : poi.category === "education" ? "#7b2cbf" : "#e76f51" }]}><Ionicons name={poi.category === "transit" ? "train" : poi.category === "education" ? "school" : "cart"} size={16} color="#fff" /></View>
          </Marker>
        ))}
        {layers.heatmap ? (
          <>{priceRegions.map((region) => { const color = regionColor(region, overallPriceAverage); return <Polygon key={region.id} coordinates={region.coordinates} fillColor={color.fill} strokeColor={color.stroke} strokeWidth={1} tappable />; })}</>
        ) : null}
      </MapView>

      <View pointerEvents="none" style={styles.overlayBorder} />

      {!exactCoordinates ? (
        <View pointerEvents="none" style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{t("map.approximateArea")}</Text>
        </View>
      ) : null}

      {showLayerControls && availableLayers.length > 0 ? (
        <>
          <Pressable style={[styles.layerButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setLayerSheetVisible((visible) => !visible)} accessibilityLabel={t("ai.mapLayers")}>
            <Ionicons name="layers-outline" size={20} color={colors.brand} />
          </Pressable>
          {layerSheetVisible ? (
            <View style={[styles.layerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {availableLayers.map((layer) => (
                <Pressable key={layer} style={styles.layerRow} onPress={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}>
                  <Ionicons name={layerLabels[layer].icon} size={19} color={layers[layer] ? colors.brand : colors.onSurfaceTertiary} />
                  <Text style={[styles.layerLabel, { color: colors.onSurface }]}>{layerLabels[layer].label}</Text>
                  <Ionicons name={layers[layer] ? "checkbox" : "square-outline"} size={20} color={layers[layer] ? colors.brand : colors.onSurfaceTertiary} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: {
      width: "100%",
      height: "100%",
    },
    overlayBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(10, 66, 80, 0.12)",
    },
    pinWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    pinOuter: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? "rgba(8, 61, 74, 0.72)" : "rgba(211, 236, 239, 0.92)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(10, 66, 80, 0.16)",
    },
    pinInner: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
    },
    modeBadge: {
      position: "absolute",
      left: 12,
      top: 12,
      backgroundColor: isDark ? "rgba(5, 14, 26, 0.8)" : "rgba(234, 245, 246, 0.92)",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: isDark ? "rgba(56, 189, 248, 0.2)" : "rgba(10, 66, 80, 0.18)",
    },
    modeBadgeText: {
      color: isDark ? "#d7f4ff" : "#0A4250",
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      letterSpacing: 0.2,
    },
    layerButton: {
      position: "absolute",
      right: 12,
      top: 12,
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    layerSheet: {
      position: "absolute",
      right: 12,
      top: 60,
      width: 230,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 8,
      gap: 2,
    },
    layerRow: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    layerLabel: {
      flex: 1,
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
    },
    poiMarker: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#fff",
    },
  });
}