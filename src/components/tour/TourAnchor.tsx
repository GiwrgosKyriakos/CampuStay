import React, { useCallback, useEffect, useRef } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { useTour } from "@/src/context/TourContext";
import type { TourAnchorKey } from "@/src/types/tour";

export function TourAnchor({ targetKey, children, style }: { targetKey: TourAnchorKey; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { registerAnchor, unregisterAnchor } = useTour();
  const anchorRef = useRef<View | null>(null);

  const measure = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) registerAnchor(targetKey, { x, y, width, height });
    });
  }, [registerAnchor, targetKey]);

  const handleLayout = useCallback((_event: LayoutChangeEvent) => {
    requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => () => unregisterAnchor(targetKey), [targetKey, unregisterAnchor]);

  return (
    <View ref={anchorRef} style={style} collapsable={false} onLayout={handleLayout} pointerEvents="box-none">
      {children}
    </View>
  );
}