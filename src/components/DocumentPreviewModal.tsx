import React, { useMemo } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, spacing, type ThemeColors } from "@/src/theme";

type DocumentPreviewModalProps = {
  visible: boolean;
  fileUrl?: string;
  fileName?: string;
  contentType?: string;
  onClose: () => void;
};

export default function DocumentPreviewModal({ visible, fileUrl, fileName, contentType, onClose }: DocumentPreviewModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPdf = contentType === "application/pdf" || fileName?.toLowerCase().endsWith(".pdf") === true;

  const handleShare = async () => {
    if (!fileUrl) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(fileUrl, { dialogTitle: fileName || "Έγγραφο" });
        } catch {
          await Linking.openURL(fileUrl);
        }
      } else {
        await Linking.openURL(fileUrl);
      }
    } catch (error) {
      console.warn("[DocumentPreviewModal] Unable to share document:", error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton} accessibilityLabel="Κλείσιμο προεπισκόπησης" testID="document-preview-close">
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>{fileName || "Έγγραφο"}</Text>
          <Pressable onPress={() => void handleShare()} style={styles.headerButton} accessibilityLabel="Κοινή χρήση εγγράφου" testID="document-preview-share">
            <Ionicons name="share-outline" size={22} color={colors.brand} />
          </Pressable>
        </View>
        {fileUrl ? (
          isPdf ? (
            <WebView source={{ uri: fileUrl }} style={styles.pdf} startInLoadingState />
          ) : (
            <ScrollView
              style={styles.imageScroll}
              contentContainerStyle={styles.imageContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              bouncesZoom
            >
              <Image source={{ uri: fileUrl }} contentFit="contain" style={styles.image} />
            </ScrollView>
          )
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={42} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Το έγγραφο δεν είναι διαθέσιμο.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface, textAlign: "center" },
    pdf: { flex: 1, backgroundColor: colors.surfaceTertiary },
    imageScroll: { flex: 1 },
    imageContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    image: { width: "100%", height: "100%" },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
    emptyText: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
  });
}
