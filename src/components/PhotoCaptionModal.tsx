import React, { useEffect, useState } from "react";
import { Image as NativeImage, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { ListingPhotoItem } from "@/src/types/apartment";

export interface PhotoCaptionModalProps {
  visible: boolean;
  photo: ListingPhotoItem | null;
  onClose: () => void;
  onSave: (caption: string) => void;
}

export default function PhotoCaptionModal({ visible, photo, onClose, onSave }: PhotoCaptionModalProps) {
  const { colors } = useTheme();
  const [caption, setCaption] = useState("");

  useEffect(() => {
    setCaption(photo?.caption ?? "");
  }, [photo]);

  const save = () => {
    onSave(caption.trim());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]} testID="photo-caption-modal">
          {photo ? <NativeImage source={{ uri: photo.url }} style={styles.preview} resizeMode="cover" /> : null}
          <Text style={[styles.title, { color: colors.onSurface }]}>{t("listings.photos.captionModalTitle")}</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder={t("listings.photos.captionPlaceholder")}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.input, { borderColor: colors.border, color: colors.onSurface }]}
            maxLength={80}
            autoFocus
            testID="photo-caption-input"
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.action, { borderColor: colors.border }]} testID="photo-caption-cancel">
              <Text style={[styles.actionText, { color: colors.onSurfaceTertiary }]}>{t("common.actions.cancel")}</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.action, styles.saveAction, { backgroundColor: colors.brand }]} testID="photo-caption-save">
              <Text style={[styles.actionText, { color: colors.onBrand }]}>{t("common.actions.save")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    borderRadius: radius.md,
    maxWidth: 420,
    padding: spacing.lg,
    width: "100%",
  },
  preview: {
    alignSelf: "center",
    borderRadius: radius.sm,
    height: 150,
    marginBottom: spacing.md,
    width: 110,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    marginBottom: spacing.md,
  },
  input: {
    borderRadius: radius.sm,
    borderWidth: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    marginTop: spacing.lg,
  },
  action: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveAction: {
    borderWidth: 0,
  },
  actionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
  },
});
