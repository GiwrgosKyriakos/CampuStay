import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  GestureResponderEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Polygon, Polyline, PROVIDER_DEFAULT, type Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { calculatePolygonArea, type LatLng } from "@/src/utils/geometry";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";

interface MapPolygonDrawModalProps {
  visible: boolean;
  initialPolygon?: LatLng[];
  onClose: () => void;
  onSave: (polygon: LatLng[]) => void;
}

export default function MapPolygonDrawModal({
  visible,
  initialPolygon = [],
  onClose,
  onSave,
}: MapPolygonDrawModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const mapRef = useRef<MapView>(null);
  const drawModeRef = useRef(false);
  const currentPathRef = useRef<LatLng[]>([]);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [coordinates, setCoordinates] = useState<LatLng[]>(initialPolygon);
  const [currentPath, setCurrentPath] = useState<LatLng[]>([]);

  useEffect(() => {
    if (visible) {
      setCoordinates(initialPolygon);
      currentPathRef.current = [];
      setCurrentPath([]);
      setIsDrawMode(false);
      drawModeRef.current = false;
    }
  }, [initialPolygon, visible]);

  const setDrawing = (value: boolean) => {
    drawModeRef.current = value;
    setIsDrawMode(value);
  };

  const addPoint = async (event: GestureResponderEvent) => {
    if (!drawModeRef.current || !mapRef.current) return;
    const { locationX, locationY } = event.nativeEvent;
    const coordinate = await mapRef.current.coordinateForPoint({ x: locationX, y: locationY });
    if (!coordinate || !drawModeRef.current) return;
    currentPathRef.current = [...currentPathRef.current, coordinate];
    setCurrentPath(currentPathRef.current);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawModeRef.current,
      onMoveShouldSetPanResponder: () => drawModeRef.current,
      onPanResponderGrant: (event) => {
        currentPathRef.current = [];
        setCurrentPath([]);
        void addPoint(event);
      },
      onPanResponderMove: (event) => {
        void addPoint(event);
      },
      onPanResponderRelease: () => {
        const path = currentPathRef.current;
        if (path.length >= 3) {
          setCoordinates(path);
        }
        setDrawing(false);
        currentPathRef.current = [];
        setCurrentPath([]);
      },
      onPanResponderTerminate: () => {
        setDrawing(false);
        currentPathRef.current = [];
        setCurrentPath([]);
      },
    }),
  ).current;

  const handleSave = () => {
    const polygon = coordinates.length >= 3 ? coordinates : currentPathRef.current;
    if (polygon.length < 3 || calculatePolygonArea(polygon) <= 500) {
      Alert.alert(t("mapPolygon.invalidShapeTitle"), t("mapPolygon.invalidShapeBody"));
      return;
    }

    onSave(polygon);
    setDrawing(false);
    onClose();
  };

  const handleClear = () => {
    currentPathRef.current = [];
    setCurrentPath([]);
    setCoordinates([]);
  };

  const initialRegion: Region = {
    latitude: coordinates[0]?.latitude ?? 37.9838,
    longitude: coordinates[0]?.longitude ?? 23.7275,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const hasPolygon = coordinates.length >= 3;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Full Screen Map behind all controls */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          scrollEnabled={!isDrawMode}
          zoomEnabled={!isDrawMode}
          pitchEnabled={!isDrawMode}
          rotateEnabled={!isDrawMode}
        >
          {hasPolygon ? (
            <Polygon
              coordinates={coordinates}
              fillColor="rgba(37, 99, 235, 0.2)"
              strokeColor={colors.brand}
              strokeWidth={2}
            />
          ) : null}
          {currentPath.length > 1 ? (
            <Polyline
              coordinates={currentPath}
              strokeColor={colors.brand}
              strokeWidth={3}
            />
          ) : null}
        </MapView>

        {/* Floating Curved Elevated Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <View style={styles.headerRow}>
            <Pressable hitSlop={8} onPress={onClose} style={styles.circularBtn}>
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.title} numberOfLines={1}>
                {t("mapPolygon.modalTitle")}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {isDrawMode
                  ? "Σχεδιάστε σύροντας στον χάρτη"
                  : hasPolygon
                  ? "Περιοχή επιλεγμένη"
                  : "Ενεργοποιήστε το μολύβι για σχεδίαση"}
              </Text>
            </View>

            <Pressable
              hitSlop={8}
              onPress={handleClear}
              style={[styles.clearBtn, !hasPolygon && styles.clearBtnDisabled]}
              disabled={!hasPolygon}
            >
              <Ionicons
                name="trash-outline"
                size={14}
                color={hasPolygon ? colors.error : colors.onSurfaceTertiary}
              />
              <Text style={[styles.clearText, !hasPolygon && styles.clearTextDisabled]}>
                {t("mapPolygon.clearBtn")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Floating Draw Mode Active Banner (Positioned below the header) */}
        {isDrawMode ? (
          <View style={[styles.drawHintBadge, { top: insets.top + 76 }]}>
            <Ionicons name="pencil" size={14} color={colors.onBrand} />
            <Text style={styles.drawHintText}>Σχεδιάστε ελεύθερα με το δάχτυλο</Text>
          </View>
        ) : null}

        {/* Gesture Drawing Overlay */}
        {isDrawMode ? <View style={styles.gestureOverlay} {...panResponder.panHandlers} /> : null}

        {/* Floating Action Controls */}
        <View style={[styles.floatingControls, { bottom: Math.max(insets.bottom, spacing.md) + spacing.lg }]}>
          <Pressable
            onPress={() => setDrawing(!isDrawMode)}
            style={[styles.floatingBtn, isDrawMode && styles.floatingBtnActive]}
            hitSlop={8}
            testID="toggle-pen-btn"
          >
            <Ionicons
              name={isDrawMode ? "pencil" : "pencil-outline"}
              size={22}
              color={isDrawMode ? colors.onBrand : colors.onSurface}
            />
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={handleSave}
            style={[styles.floatingBtn, styles.saveBtn, !hasPolygon && styles.saveBtnDisabled]}
            disabled={!hasPolygon}
            testID="save-polygon-btn"
          >
            <Ionicons name="checkmark" size={24} color={colors.onBrand} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      position: "relative",
    },
    map: {
      ...StyleSheet.absoluteFillObject,
    },
    header: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 6,
      zIndex: 20,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    circularBtn: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    clearBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.2)",
    },
    clearBtnDisabled: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      opacity: 0.6,
    },
    clearText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.xs,
      color: colors.error,
    },
    clearTextDisabled: {
      color: colors.onSurfaceTertiary,
    },
    gestureOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.02)",
      zIndex: 10,
    },
    drawHintBadge: {
      position: "absolute",
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.pill,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
      elevation: 4,
      zIndex: 15,
    },
    drawHintText: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
    },
    floatingControls: {
      position: "absolute",
      right: spacing.lg,
      gap: spacing.sm,
      zIndex: 25,
    },
    floatingBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.16,
      shadowRadius: 5,
      elevation: 5,
    },
    floatingBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    saveBtn: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    saveBtnDisabled: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
      opacity: 0.6,
    },
  });