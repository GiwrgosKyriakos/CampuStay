import React, { useEffect, useRef, useState } from "react";
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

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { calculatePolygonArea, type LatLng } from "@/src/utils/geometry";
import { fontSize, fonts, radius, spacing } from "@/src/theme";

interface MapPolygonDrawModalProps {
  visible: boolean;
  initialPolygon?: LatLng[];
  onClose: () => void;
  onSave: (polygon: LatLng[]) => void;
}

export default function MapPolygonDrawModal({ visible, initialPolygon = [], onClose, onSave }: MapPolygonDrawModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const mapRef = useRef<MapView>(null);
  const drawModeRef = useRef(false);
  const currentPathRef = useRef<LatLng[]>([]);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [coordinates, setCoordinates] = useState<LatLng[]>(initialPolygon);
  const [currentPath, setCurrentPath] = useState<LatLng[]>([]);

  useEffect(() => {
    if (visible) setCoordinates(initialPolygon);
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

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>{t("mapPolygon.modalTitle")}</Text>
          <Pressable hitSlop={8} onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>{t("mapPolygon.clearBtn")}</Text>
          </Pressable>
        </View>

        <View style={styles.mapWrap}>
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
            {coordinates.length >= 3 ? <Polygon coordinates={coordinates} fillColor="rgba(37, 99, 235, 0.2)" strokeColor={colors.brand} strokeWidth={2} /> : null}
            {currentPath.length > 1 ? <Polyline coordinates={currentPath} strokeColor={colors.brand} strokeWidth={3} /> : null}
          </MapView>

          {isDrawMode ? <View style={styles.gestureOverlay} {...panResponder.panHandlers} /> : null}

          <View style={styles.floatingControls}>
            <Pressable
              onPress={() => setDrawing(!isDrawMode)}
              style={[styles.floatingBtn, isDrawMode && styles.floatingBtnActive]}
              hitSlop={8}
              testID="toggle-pen-btn"
            >
              <Ionicons name={isDrawMode ? "pencil" : "pencil-outline"} size={22} color={isDrawMode ? colors.onBrand : colors.onSurface} />
            </Pressable>
            <Pressable hitSlop={8} onPress={handleSave} style={[styles.floatingBtn, styles.saveBtn]} testID="save-polygon-btn">
              <Ionicons name="checkmark" size={22} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { padding: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  clearBtn: { padding: spacing.xs },
  clearText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: "#EF4444" },
  mapWrap: { flex: 1, position: "relative" },
  map: { ...StyleSheet.absoluteFillObject },
  gestureOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  floatingControls: { position: "absolute", right: spacing.md, bottom: spacing.xl, gap: spacing.sm, zIndex: 20 },
  floatingBtn: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  floatingBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  saveBtn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
