import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { AiServiceError, fetchPropertyListingCopy, type CopywriterResult } from "@/src/services/aiFeatureService";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

export interface AiCopywriterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (value: CopywriterResult) => void;
  specs?: {
    apartmentId?: string;
    title?: string;
    rooms?: number;
    sqm?: number;
    area?: string;
    amenities?: string[];
    price?: number;
  };
}

const tones = [
  { key: "professional", label: "Επαγγελματικό" },
  { key: "luxury", label: "Luxury/Premium" },
  { key: "student_friendly", label: "Student friendly" },
] as const;

type CopywriterTab = "portal" | "social" | "seo";

export default function AiCopywriterModal({ visible, onClose, onApply, specs }: AiCopywriterModalProps) {
  const { colors } = useTheme();
  const [selectedTone, setSelectedTone] = useState<(typeof tones)[number]["key"]>("professional");
  const [generated, setGenerated] = useState<CopywriterResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CopywriterTab>("portal");
  const [copiedField, setCopiedField] = useState<"social" | "seo" | null>(null);
  const nextAllowedRequest = useRef(0);

  const handleGenerate = async () => {
    if (isGenerating || Date.now() < nextAllowedRequest.current) return;
    nextAllowedRequest.current = Date.now() + 3000;
    setIsGenerating(true);
    setErrorText(null);
    try {
      const result = await fetchPropertyListingCopy({
        apartmentId: specs?.apartmentId ?? "",
        title: specs?.title ?? "Ακίνητο",
        area: specs?.area ?? "Ελλάδα",
        sqm: specs?.sqm ?? 0,
        bedrooms: specs?.rooms ?? 0,
        price: specs?.price ?? 0,
        features: specs?.amenities ?? [],
        tone: selectedTone,
      });
      setGenerated(result);
      setActiveTab("portal");
      setCopiedField(null);
    } catch (error) {
      setErrorText(error instanceof AiServiceError ? error.message : "Δεν ήταν δυνατή η δημιουργία κειμένου.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="80%">
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.onSurface }]}>{t("ai.aiCopywriterTitle")}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>Tone</Text>
          <View style={styles.pillRow}>
            {tones.map((tone) => (
              <Pressable
                key={tone.key}
                onPress={() => setSelectedTone(tone.key)}
                disabled={isGenerating}
                style={[styles.pill, { backgroundColor: selectedTone === tone.key ? colors.brand : colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Text style={[styles.pillText, { color: selectedTone === tone.key ? colors.onBrand : colors.onSurface }]}>{tone.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }]} onPress={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("ai.generateCopy")}</Text>}
          </Pressable>

          {errorText ? <View style={styles.errorBlock}><Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text><Pressable style={[styles.retryButton, { borderColor: colors.error }]} onPress={() => void handleGenerate()} disabled={isGenerating}><Text style={[styles.retryText, { color: colors.error }]}>Επανάληψη</Text></Pressable></View> : null}

          {generated ? (
            <View style={styles.preview}>
              <View style={styles.tabRow}>
                {(["portal", "social", "seo"] as CopywriterTab[]).map((tab) => (
                  <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, { borderColor: activeTab === tab ? colors.brand : colors.border, backgroundColor: activeTab === tab ? colors.brandTertiary : colors.surfaceSecondary }]}>
                    <Text style={[styles.tabText, { color: activeTab === tab ? colors.brand : colors.onSurfaceTertiary }]}>{tab === "portal" ? "Portal Copy" : tab === "social" ? "Social Media" : "SEO & Meta"}</Text>
                  </Pressable>
                ))}
              </View>
              {activeTab === "portal" ? <>
                <Text style={[styles.headline, { color: colors.onSurface }]}>{generated.portalTitle}</Text>
                <Text style={[styles.body, { color: colors.onSurfaceTertiary }]}>{generated.portalDescription}</Text>
                <Text style={[styles.highlightsTitle, { color: colors.onSurface }]}>Highlights</Text>
                {generated.bulletHighlights.map((highlight) => <Text key={highlight} style={[styles.highlight, { color: colors.onSurfaceTertiary }]}>• {highlight}</Text>)}
              </> : null}
              {activeTab === "social" ? <View style={styles.contentBlock}>
                <Text style={[styles.fieldLabel, { color: colors.onSurfaceTertiary }]}>Instagram / Facebook caption</Text>
                <Text style={[styles.body, { color: colors.onSurface }]}>{generated.socialCaption}</Text>
                <Pressable style={[styles.copyButton, { borderColor: colors.brand }]} onPress={async () => { await Clipboard.setStringAsync(generated.socialCaption); setCopiedField("social"); }}>
                  <Ionicons name="copy-outline" size={17} color={colors.brand} /><Text style={[styles.copyButtonText, { color: colors.brand }]}>{copiedField === "social" ? "Αντιγράφηκε" : "Copy to Clipboard"}</Text>
                </Pressable>
              </View> : null}
              {activeTab === "seo" ? <View style={styles.contentBlock}>
                <Text style={[styles.fieldLabel, { color: colors.onSurfaceTertiary }]}>Search tags and keywords</Text>
                <Text style={[styles.body, { color: colors.onSurface }]}>{generated.seoTags.join(", ")}</Text>
                <Pressable style={[styles.copyButton, { borderColor: colors.brand }]} onPress={async () => { await Clipboard.setStringAsync(generated.seoTags.join(", ")); setCopiedField("seo"); }}>
                  <Ionicons name="copy-outline" size={17} color={colors.brand} /><Text style={[styles.copyButtonText, { color: colors.brand }]}>{copiedField === "seo" ? "Αντιγράφηκε" : "Copy to Clipboard"}</Text>
                </Pressable>
              </View> : null}
            </View>
          ) : null}

          {generated ? (
            <Pressable style={[styles.applyButton, { backgroundColor: colors.brandSecondary }]} onPress={() => { onApply(generated); onClose(); }}>
              <Text style={[styles.applyButtonText, { color: colors.onBrand }]}>{t("ai.applyToDescription")}</Text>
            </Pressable>
          ) : null}
        </View>
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700" },
  sectionLabel: { fontSize: 13, fontWeight: "700" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { fontWeight: "700" },
  primaryButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButtonText: { fontWeight: "700" },
  errorText: { fontSize: 13, lineHeight: 18 },
  errorBlock: { gap: 8 },
  retryButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { fontSize: 13, fontWeight: "700" },
  preview: { borderRadius: 12, padding: 12 },
  headline: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22 },
  highlightsTitle: { fontSize: 14, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  highlight: { fontSize: 14, lineHeight: 22 },
  tabRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  tabText: { fontSize: 12, fontWeight: "700" },
  contentBlock: { gap: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
  copyButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  copyButtonText: { fontSize: 12, fontWeight: "700" },
  applyButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  applyButtonText: { fontWeight: "700" },
});
