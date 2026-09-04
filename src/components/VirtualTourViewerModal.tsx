import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import pannellumCssAsset from "@/src/assets/pannellum/pannellum.css.txt";
import pannellumJsAsset from "@/src/assets/pannellum/pannellum.js.txt";
import type { VirtualTourScene, VirtualTourData } from "@/src/types/apartment";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import { buildSwitchSceneCommand, getNextActiveSceneId, getPannellumConfig, parseVirtualTourBridgeMessage } from "@/src/utils/virtualTour";

export interface PannellumBundle {
  css: string;
  js: string;
}

type ViewerState = "loading" | "ready" | "webgl_unsupported" | "error" | "timeout";

async function loadPannellumBundle(): Promise<PannellumBundle> {
  const [jsAsset, cssAsset] = await Asset.loadAsync([pannellumJsAsset, pannellumCssAsset]);
  const jsUri = jsAsset.localUri ?? jsAsset.uri;
  const cssUri = cssAsset.localUri ?? cssAsset.uri;
  if (!jsUri || !cssUri) throw new Error("Pannellum assets are unavailable");

  return {
    js: await new File(jsUri).text(),
    css: await new File(cssUri).text(),
  };
}

export function generatePannellumHtml(tourData: VirtualTourData, bundle: PannellumBundle): string {
  const config = getPannellumConfig(tourData);
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");
  const safeJavaScript = bundle.js.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>${bundle.css}*{margin:0;padding:0;box-sizing:border-box}html,body,#panorama{width:100%;height:100%;background:#000;overflow:hidden}.pnlm-load-box{background:rgba(0,0,0,.72)!important;color:#fff!important}</style></head><body><div id="panorama"></div><script>${safeJavaScript}</script><script>function send(message){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(message));}}try{const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl')||canvas.getContext('experimental-webgl');if(!gl){send({type:'WEBGL_UNSUPPORTED'});}else{const viewer=pannellum.viewer('panorama',${serializedConfig});viewer.on('scenechange',function(sceneId){send({type:'SCENE_CHANGED',sceneId:sceneId});});viewer.on('load',function(){send({type:'PANNELLUM_READY'});});viewer.on('error',function(error){send({type:'PANORAMA_ERROR',error:String(error||'Panorama failed to load')});});window.switchScene=function(sceneId){viewer.loadScene(sceneId);};}}catch(error){send({type:'PANORAMA_ERROR',error:String(error||'Panorama failed to initialize')});}</script></body></html>`;
}

interface VirtualTourViewerModalProps {
  visible: boolean;
  tourData: VirtualTourData | null;
  onClose: () => void;
}

export default function VirtualTourViewerModal({ visible, tourData, onClose }: VirtualTourViewerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bundle, setBundle] = useState<PannellumBundle | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>("loading");
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [activeSceneId, setActiveSceneId] = useState(tourData?.defaultSceneId ?? tourData?.scenes[0]?.id ?? "");
  const scene = tourData?.scenes.find((item) => item.id === activeSceneId) ?? tourData?.scenes[0];

  useEffect(() => {
    setActiveSceneId(tourData?.defaultSceneId ?? tourData?.scenes[0]?.id ?? "");
  }, [tourData]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!visible || !tourData || tourData.scenes.length === 0) {
      setBundle(null);
      setViewerState("loading");
      return;
    }

    let cancelled = false;
    setBundle(null);
    setViewerState("loading");
    setWebViewLoaded(false);
    timeoutRef.current = setTimeout(() => {
      if (!cancelled) setViewerState("timeout");
    }, 10_000);

    void loadPannellumBundle()
      .then((loadedBundle) => {
        if (!cancelled) setBundle(loadedBundle);
      })
      .catch(() => {
        if (!cancelled) setViewerState("error");
      });

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [retryToken, tourData, visible]);

  const switchScene = (nextScene: VirtualTourScene) => {
    setActiveSceneId(nextScene.id);
    webViewRef.current?.injectJavaScript(`${buildSwitchSceneCommand(nextScene.id)}; true;`);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = parseVirtualTourBridgeMessage(event.nativeEvent.data);
      if (!message) return;
      setActiveSceneId((currentSceneId) => getNextActiveSceneId(currentSceneId, message, new Set(tourData?.scenes.map((item) => item.id) ?? [])));
      if (message.type === "WEBGL_UNSUPPORTED") setViewerState("webgl_unsupported");
      if (message.type === "PANNELLUM_READY") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setViewerState("ready");
      }
      if (message.type === "PANORAMA_ERROR") setViewerState("error");
    } catch {
      // Ignore malformed WebView messages.
    }
  };

  if (!tourData || tourData.scenes.length === 0) return null;
  const isFallback = viewerState === "webgl_unsupported";
  const isRetryState = viewerState === "error" || viewerState === "timeout";
  const isLoading = viewerState === "loading";
  const retry = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setRetryToken((current) => current + 1);
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.viewerArea}>
          {bundle && !isFallback && !isRetryState ? (
            <WebView
              key={retryToken}
              ref={webViewRef}
              source={{ html: generatePannellumHtml(tourData, bundle) }}
              onMessage={handleMessage}
              onLoadStart={() => {
                setWebViewLoaded(false);
                setViewerState("loading");
              }}
              onLoadEnd={() => setWebViewLoaded(true)}
              onError={() => setViewerState("error")}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              originWhitelist={["*"]}
              style={styles.webView}
            />
          ) : null}
          {isFallback ? (
            <View style={styles.fallbackRoot}>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.fallbackCarousel}>
                {tourData.scenes.map((item) => (
                  <View key={item.id} style={[styles.fallbackSlide, { width }]}>
                    <Image source={item.imageUrl} contentFit="contain" style={styles.fallbackImage} />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.fallbackBanner}><Text style={styles.fallbackTitle}>Η προβολή 360° δεν υποστηρίζεται σε αυτή τη συσκευή.</Text><Text style={styles.fallbackText}>Οι φωτογραφίες του ακινήτου είναι διαθέσιμες παρακάτω.</Text></View>
            </View>
          ) : null}
          {isRetryState ? (
            <View style={styles.retryCard}><Ionicons name="alert-circle-outline" size={34} color={colors.warning} /><Text style={styles.retryTitle}>Δεν ήταν δυνατή η φόρτωση του πανοράματος.</Text><Text style={styles.retryText}>Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.</Text><Pressable style={styles.retryButton} onPress={retry}><Ionicons name="refresh-outline" size={18} color={colors.onBrand} /><Text style={styles.retryButtonText}>Retry Loading Panorama</Text></Pressable></View>
          ) : null}
          {isLoading ? <View style={styles.loadingOverlay}><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, styles.skeletonLineShort]} /><ActivityIndicator size="large" color={colors.brandSecondary} /><Text style={styles.loadingText}>{webViewLoaded ? "Φόρτωση πανοράματος..." : "Προετοιμασία προβολέα..."}</Text></View> : null}
        </View>
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
    viewerArea: { flex: 1, backgroundColor: "#000" },
    webView: { flex: 1, backgroundColor: "#000" },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: "#071417" },
    skeletonLine: { width: "44%", height: 12, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.16)" },
    skeletonLineShort: { width: "28%" },
    loadingText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: "#FFFFFF" },
    fallbackRoot: { flex: 1, backgroundColor: "#071417" },
    fallbackCarousel: { flex: 1 },
    fallbackSlide: { height: "100%", alignItems: "center", justifyContent: "center" },
    fallbackImage: { width: "100%", height: "100%" },
    fallbackBanner: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing["3xl"], padding: spacing.md, borderRadius: radius.md, backgroundColor: "rgba(7,20,23,0.9)" },
    fallbackTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: "#FFFFFF", textAlign: "center" },
    fallbackText: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.78)", textAlign: "center" },
    retryCard: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: "#071417" },
    retryTitle: { marginTop: spacing.md, fontFamily: fonts.bold, fontSize: fontSize.lg, color: "#FFFFFF", textAlign: "center" },
    retryText: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.78)", textAlign: "center" },
    retryButton: { marginTop: spacing.lg, minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brand },
    retryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
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