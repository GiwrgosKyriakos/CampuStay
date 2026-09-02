import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { TourScene, VirtualTourData } from "@/src/types/apartment";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export function generatePannellumHtml(tourData: VirtualTourData): string {
  const config = {
    default: {
      firstScene: tourData.defaultSceneId || tourData.scenes[0]?.id,
      autoLoad: true,
      showControls: false,
      compass: false,
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
    },
    scenes: Object.fromEntries(tourData.scenes.map((scene) => [scene.id, {
      title: scene.title,
      type: "equirectangular",
      panorama: scene.imageUrl,
      hotSpots: (scene.hotspots ?? []).map((hotspot) => ({ pitch: hotspot.pitch, yaw: hotspot.yaw, type: "scene", text: hotspot.text, sceneId: hotspot.targetSceneId })),
    }])),
  };
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"><script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script><style>*{margin:0;padding:0;box-sizing:border-box}html,body,#panorama{width:100%;height:100%;background:#000;overflow:hidden}.pnlm-load-box{background:rgba(0,0,0,.72)!important;color:#fff!important}</style></head><body><div id="panorama"></div><script>const viewer=pannellum.viewer('panorama',${serializedConfig});viewer.on('scenechange',function(sceneId){window.ReactNativeWebView.postMessage(JSON.stringify({type:'SCENE_CHANGED',sceneId:sceneId}));});window.switchScene=function(sceneId){viewer.loadScene(sceneId);};</script></body></html>`;
}

interface VirtualTourViewerModalProps {
  visible: boolean;
  tourData: VirtualTourData | null;
  onClose: () => void;
}

export default function VirtualTourViewerModal({ visible, tourData, onClose }: VirtualTourViewerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const webViewRef = useRef<WebView>(null);
  const [activeSceneId, setActiveSceneId] = useState(tourData?.defaultSceneId ?? tourData?.scenes[0]?.id ?? "");
  const scene = tourData?.scenes.find((item) => item.id === activeSceneId) ?? tourData?.scenes[0];

  useEffect(() => {
    setActiveSceneId(tourData?.defaultSceneId ?? tourData?.scenes[0]?.id ?? "");
  }, [tourData]);

  const switchScene = (nextScene: TourScene) => {
    setActiveSceneId(nextScene.id);
    webViewRef.current?.injectJavaScript(`window.switchScene(${JSON.stringify(nextScene.id)}); true;`);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; sceneId?: string };
      if (message.type === "SCENE_CHANGED" && message.sceneId) setActiveSceneId(message.sceneId);
    } catch {
      // Ignore malformed WebView messages.
    }
  };

  if (!tourData || tourData.scenes.length === 0) return null;
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <WebView ref={webViewRef} source={{ html: generatePannellumHtml(tourData) }} onMessage={handleMessage} javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback style={styles.webView} />
        <View style={styles.header} pointerEvents="box-none">
          <Pressable style={styles.iconButton} onPress={onClose} hitSlop={8} testID="virtual-tour-close"><Ionicons name="close" size={24} color="#FFFFFF" /></Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{scene?.title ?? "360° Virtual Tour"}</Text>
          <View style={styles.headerIndicators}><Ionicons name="phone-portrait-outline" size={18} color="#FFFFFF" /><Ionicons name="expand-outline" size={18} color="#FFFFFF" /></View>
        </View>
        <View style={styles.sceneBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneBarContent}>
            {tourData.scenes.map((item) => <Pressable key={item.id} style={[styles.scenePill, item.id === activeSceneId && styles.scenePillActive]} onPress={() => switchScene(item)} testID={`virtual-tour-scene-${item.id}`}><Text style={[styles.scenePillText, item.id === activeSceneId && styles.scenePillTextActive]}>{item.title}</Text></Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    webView: { flex: 1, backgroundColor: "#000" },
    header: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: spacing.xl, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    iconButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
    headerTitle: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: fontSize.lg, color: "#FFFFFF" },
    headerIndicators: { width: 72, flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
    sceneBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: spacing.lg, paddingTop: spacing.md, backgroundColor: "rgba(0,0,0,0.52)" },
    sceneBarContent: { paddingHorizontal: spacing.md, gap: spacing.sm },
    scenePill: { minHeight: 38, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)", backgroundColor: "rgba(0,0,0,0.35)" },
    scenePillActive: { borderColor: colors.brand, backgroundColor: colors.brand },
    scenePillText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: "#FFFFFF" },
    scenePillTextActive: { color: colors.onBrand },
  });
}