import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";

import { uploadImageAsync } from "@/src/api/imageUpload";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing } from "@/src/theme";
import type { IdCaptureSideMetadata, IdDocumentType } from "@/src/types/esignature";
import { validateIdCaptureMetadata } from "@/src/services/idCaptureValidation";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";

type IdSide = "front" | "back";

export interface IdCameraCaptureProps {
  visible: boolean;
  contractId: string;
  signerId: string;
  frontUrl?: string;
  backUrl?: string;
  documentType?: IdDocumentType;
  onUploaded: (side: IdSide, url: string, metadata: IdCaptureSideMetadata) => void;
  onClose: () => void;
}

export default function IdCameraCapture({ visible, contractId, signerId, frontUrl, backUrl, documentType = "national_id", onUploaded, onClose }: IdCameraCaptureProps) {
  const { colors } = useTheme();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [side, setSide] = useState<IdSide>(frontUrl ? "back" : "front");
  const [frontPreview, setFrontPreview] = useState(frontUrl ?? "");
  const [backPreview, setBackPreview] = useState(backUrl ?? "");
  const [selectedDocumentType, setSelectedDocumentType] = useState<IdDocumentType>(documentType);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!visible) return;
    setFrontPreview(frontUrl ?? "");
    setBackPreview(backUrl ?? "");
    setSide(frontUrl ? "back" : "front");
    setSelectedDocumentType(documentType);
    setErrorText("");
  }, [backUrl, documentType, frontUrl, visible]);

  const capture = async () => {
    if (!cameraRef.current || isTakingPhoto) return;
    setIsTakingPhoto(true);
    setErrorText("");
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.65, skipProcessing: false });
      if (!picture?.uri) throw new Error(t("esign.errors.cameraCapture"));
      const fileInfo = await new File(picture.uri).info();
      const metadata: IdCaptureSideMetadata = {
        width: Number(picture.width),
        height: Number(picture.height),
        fileSizeBytes: Number(fileInfo.size ?? 0),
        idCaptureTimestamp: Date.now(),
        idDocumentType: selectedDocumentType,
      };
      validateIdCaptureMetadata(metadata);
      const path = side === "front"
        ? `contracts/${contractId}/id_verifications/${signerId}.jpg`
        : `contracts/${contractId}/id_verifications/${signerId}-back.jpg`;
      const url = await uploadImageAsync(picture.uri, path);
      if (side === "front") setFrontPreview(url);
      else setBackPreview(url);
      onUploaded(side, url, metadata);
      if (side === "front") setSide("back");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("esign.errors.cameraUpload"));
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const hasBothSides = Boolean(frontPreview && backPreview);
  const handleDone = () => {
    if (!hasBothSides) {
      setErrorText("Απαιτούνται η μπροστινή και η πίσω όψη του εγγράφου.");
      return;
    }
    onClose();
  };

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable maxHeight="92%">
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.onSurface }]}>{t("esign.idVerificationTitle")}</Text>
              <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{t("esign.idVerificationSubtitle")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="esign-id-camera-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          {!permission ? (
            <View style={styles.centerState}><ActivityIndicator color={colors.brand} /></View>
          ) : !permission.granted ? (
            <View style={styles.centerState}>
              <Ionicons name="camera-outline" size={38} color={colors.brand} />
              <Text style={[styles.permissionText, { color: colors.onSurface }]}>{t("esign.cameraPermission")}</Text>
              <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }]} onPress={() => void requestPermission()} testID="esign-id-camera-permission">
                <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("common.actions.continue")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.cameraFrame}>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="picture" />
                <View style={styles.documentGuide} />
                <View style={styles.cameraLabel}><Text style={styles.cameraLabelText}>{side === "front" ? t("esign.idFront") : t("esign.idBack")}</Text></View>
              </View>
              <View style={styles.documentTypeRow}>
                <Pressable style={[styles.documentTypeButton, { borderColor: colors.border }, selectedDocumentType === "national_id" && { backgroundColor: colors.brand }]} onPress={() => setSelectedDocumentType("national_id")} testID="esign-id-document-national-id">
                  <Text style={[styles.documentTypeText, { color: selectedDocumentType === "national_id" ? colors.onBrand : colors.onSurface }]}>{"Ταυτότητα"}</Text>
                </Pressable>
                <Pressable style={[styles.documentTypeButton, { borderColor: colors.border }, selectedDocumentType === "passport" && { backgroundColor: colors.brand }]} onPress={() => setSelectedDocumentType("passport")} testID="esign-id-document-passport">
                  <Text style={[styles.documentTypeText, { color: selectedDocumentType === "passport" ? colors.onBrand : colors.onSurface }]}>{"Διαβατήριο"}</Text>
                </Pressable>
              </View>
              <View style={styles.previewRow}>
                <View style={styles.previewBlock}>
                  {frontPreview ? <Image source={{ uri: frontPreview }} style={styles.previewImage} contentFit="cover" /> : <View style={[styles.previewPlaceholder, { borderColor: colors.border }]}><Ionicons name="card-outline" size={22} color={colors.onSurfaceTertiary} /></View>}
                  <Text style={[styles.previewLabel, { color: colors.onSurface }]}>{t("esign.idFront")}</Text>
                </View>
                <View style={styles.previewBlock}>
                  {backPreview ? <Image source={{ uri: backPreview }} style={styles.previewImage} contentFit="cover" /> : <View style={[styles.previewPlaceholder, { borderColor: colors.border }]}><Ionicons name="card-outline" size={22} color={colors.onSurfaceTertiary} /></View>}
                  <Text style={[styles.previewLabel, { color: colors.onSurface }]}>{t("esign.idBack")}</Text>
                </View>
              </View>
              {!!errorText && <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>}
              <View style={styles.actionRow}>
                <Pressable style={[styles.secondaryButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} onPress={() => setSide((current) => current === "front" ? "back" : "front")} testID="esign-id-camera-switch-side">
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.brand} />
                  <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>{side === "front" ? t("esign.idBack") : t("esign.idFront")}</Text>
                </Pressable>
                <Pressable style={[styles.captureButton, { backgroundColor: colors.brand }, isTakingPhoto && styles.disabledButton]} onPress={() => void capture()} disabled={isTakingPhoto} testID="esign-id-camera-capture">
                  {isTakingPhoto ? <ActivityIndicator color={colors.onBrand} /> : <Ionicons name="camera" size={22} color={colors.onBrand} />}
                </Pressable>
                <Pressable style={[styles.secondaryButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, !hasBothSides && styles.disabledButton]} onPress={handleDone} disabled={!hasBothSides} testID="esign-id-camera-done">
                  <Ionicons name="checkmark-outline" size={18} color={colors.brand} />
                  <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>{t("common.actions.done")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: fonts.display, fontSize: fontSize.xl },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19 },
  centerState: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: spacing.md },
  permissionText: { fontFamily: fonts.semibold, fontSize: fontSize.base, textAlign: "center" },
  primaryButton: { minHeight: 46, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  cameraFrame: { height: 250, overflow: "hidden", borderRadius: radius.md, backgroundColor: "#17252B", alignItems: "center", justifyContent: "center" },
  documentGuide: { width: "86%", aspectRatio: 1.58, borderWidth: 2, borderColor: "rgba(255,255,255,0.88)", borderRadius: radius.md },
  cameraLabel: { position: "absolute", top: spacing.sm, left: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.54)" },
  cameraLabelText: { color: "#FFFFFF", fontFamily: fonts.bold, fontSize: fontSize.xs },
  previewRow: { flexDirection: "row", gap: spacing.sm },
  previewBlock: { flex: 1, gap: spacing.xs },
  previewImage: { width: "100%", height: 70, borderRadius: radius.md },
  previewPlaceholder: { height: 70, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  previewLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, textAlign: "center" },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  documentTypeRow: { flexDirection: "row", gap: spacing.sm },
  documentTypeButton: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  documentTypeText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: spacing.sm },
  secondaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  captureButton: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  disabledButton: { opacity: 0.6 },
});