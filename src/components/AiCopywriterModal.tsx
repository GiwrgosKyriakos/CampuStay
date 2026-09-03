import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { generateListingCopywritingStub } from "@/src/services/aiFeatureService";

export interface AiCopywriterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (value: string) => void;
  specs?: {
    rooms?: number;
    sqm?: number;
    area?: string;
    amenities?: string[];
    price?: number;
  };
}

const tones = [
  { key: "professional", label: "Επαγγελματικό" },
  { key: "enthusiastic", label: "Ενθουσιώδες" },
  { key: "luxury", label: "Luxury/Premium" },
  { key: "concise_bulleted", label: "Σύντομο" },
] as const;

export default function AiCopywriterModal({ visible, onClose, onApply, specs }: AiCopywriterModalProps) {
  const { colors } = useTheme();
  const [selectedTone, setSelectedTone] = useState<(typeof tones)[number]["key"]>("professional");
  const [generated, setGenerated] = useState<Awaited<ReturnType<typeof generateListingCopywritingStub>>[number] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const options = await generateListingCopywritingStub(specs ?? {}, selectedTone);
      setGenerated(options.find((option) => option.tone === selectedTone) ?? options[0] ?? null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
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
                style={[styles.pill, { backgroundColor: selectedTone === tone.key ? colors.brand : colors.surfaceSecondary, borderColor: colors.border }]}
              >
                <Text style={[styles.pillText, { color: selectedTone === tone.key ? colors.onBrand : colors.onSurface }]}>{tone.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }]} onPress={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("ai.generateCopy")}</Text>}
          </Pressable>

          {generated ? (
            <ScrollView style={styles.preview}>
              <Text style={[styles.headline, { color: colors.onSurface }]}>{generated.headline}</Text>
              <Text style={[styles.body, { color: colors.onSurfaceTertiary }]}>{generated.description}</Text>
              <Text style={[styles.highlightsTitle, { color: colors.onSurface }]}>Highlights</Text>
              {generated.keyHighlights.map((highlight) => (
                <Text key={highlight} style={[styles.highlight, { color: colors.onSurfaceTertiary }]}>• {highlight}</Text>
              ))}
            </ScrollView>
          ) : null}

          {generated ? (
            <Pressable style={[styles.applyButton, { backgroundColor: colors.brandSecondary }]} onPress={() => { onApply(`${generated.headline}\n\n${generated.description}`); onClose(); }}>
              <Text style={[styles.applyButtonText, { color: colors.onBrand }]}>{t("ai.applyToDescription")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "flex-end", backgroundColor: "rgba(15,18,26,0.55)" },
  sheet: { width: "100%", maxHeight: "80%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700" },
  sectionLabel: { fontSize: 13, fontWeight: "700" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { fontWeight: "700" },
  primaryButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButtonText: { fontWeight: "700" },
  preview: { maxHeight: 240, borderRadius: 12, padding: 12 },
  headline: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22 },
  highlightsTitle: { fontSize: 14, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  highlight: { fontSize: 14, lineHeight: 22 },
  applyButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  applyButtonText: { fontWeight: "700" },
});
