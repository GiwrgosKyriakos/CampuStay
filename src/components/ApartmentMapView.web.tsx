import React, { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export interface ApartmentMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface ApartmentMapRef {
  animateToRegion: (region: ApartmentMapRegion, duration?: number) => void;
}

type MapProps = ViewProps & {
  initialRegion?: ApartmentMapRegion;
  customMapStyle?: unknown;
  provider?: string;
  onMapReady?: () => void;
  onPress?: () => void;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  pitchEnabled?: boolean;
  rotateEnabled?: boolean;
  children?: React.ReactNode;
};

const ApartmentMapView = forwardRef<ApartmentMapRef, MapProps>(({ children, ...props }, ref) => {
  useImperativeHandle(ref, () => ({ animateToRegion: () => undefined }), []);
  return <View {...props} style={[styles.map, props.style]}>{children}</View>;
});
ApartmentMapView.displayName = "ApartmentMapView";

export function Marker({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const PROVIDER_DEFAULT = "default";

const styles = StyleSheet.create({
  map: { backgroundColor: "#dcebee", overflow: "hidden" },
});

export default ApartmentMapView;