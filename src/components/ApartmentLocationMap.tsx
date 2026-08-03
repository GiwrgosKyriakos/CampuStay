import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, fontSize, radius } from "@/src/theme";

interface ApartmentLocationMapProps {
  latitude?: number;
  longitude?: number;
  cityCoordinates: { latitude: number; longitude: number };
  hasExactLocation: boolean;
  height?: number;
}

const EXACT_REGION_DELTA = 0.012;
const AREA_REGION_DELTA = 0.045;
const AREA_RADIUS_METERS = 1500;

const customMapStyle = [
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

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default function ApartmentLocationMap({
  latitude,
  longitude,
  cityCoordinates,
  hasExactLocation,
  height = 280,
}: ApartmentLocationMapProps) {
  const mapRef = useRef<MapView>(null);

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
    const nextRegion = displayRegion;
    mapRef.current?.animateToRegion(nextRegion, 350);
  }, [displayRegion]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={displayRegion}
        customMapStyle={customMapStyle}
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
        {exactCoordinates ? (
          <Marker coordinate={exactCoordinates} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.pinWrap}>
              <View style={styles.pinOuter}>
                <View style={styles.pinInner}>
                  <Ionicons name="location-sharp" size={18} color={colors.onBrand} />
                </View>
              </View>
            </View>
          </Marker>
        ) : (
          <Circle
            center={cityCoordinates}
            radius={AREA_RADIUS_METERS}
            fillColor="rgba(56, 189, 248, 0.2)"
            strokeColor="#38bdf8"
            strokeWidth={2}
          />
        )}
      </MapView>

      <View pointerEvents="none" style={styles.overlayBorder} />

      {!exactCoordinates ? (
        <View pointerEvents="none" style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>Ενδεικτική περιοχή</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
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
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  pinWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  pinOuter: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(8, 61, 74, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    backgroundColor: "rgba(5, 14, 26, 0.8)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  modeBadgeText: {
    color: "#d7f4ff",
    fontFamily: fonts.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
  },
});