import React, { useEffect, useMemo, useRef } from "react";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, fontSize, radius, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

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

export default function ApartmentLocationMap({
  latitude,
  longitude,
  cityCoordinates,
  hasExactLocation,
  height = 280,
}: ApartmentLocationMapProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const mapRef = useRef<MapView>(null);
  const mapStyle = isDark ? darkMapStyle : lightMapStyle;

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
  });
}