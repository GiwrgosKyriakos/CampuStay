import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ListingPhotoGrid from "@/src/components/ListingPhotoGrid";
import PhotoCaptionModal from "@/src/components/PhotoCaptionModal";
import { BrokerAssignmentSection, BrokerNotesSection, BrokerOwnerSection, BrokerPrivacySection, BrokerTermsSection } from "@/src/components/ListingBrokerSections";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { ListingPhotoItem } from "@/src/types/apartment";
import { createEmptyListingBrokerDraft, type ListingBrokerDraft } from "@/src/types/listingBroker";
import { getListingBrokerDraft, hydrateListingBrokerDraft, saveListingBrokerDraft } from "@/src/utils/listingBrokerDraft";
import { reindexListingPhotoItems } from "@/src/utils/listingMedia";

function BackCircleButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} hitSlop={8} testID="listing-broker-view-back">
      <Ionicons name="chevron-back" size={21} color={colors.onSurface} />
    </Pressable>
  );
}

export default function ListingBrokerViewScreen() {
  const { colors } = useTheme();
  const stylesForTheme = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ draftKey?: string; listingId?: string }>();
  const draftKey = params.draftKey || params.listingId || "broker-new-listing";
  const [draft, setDraft] = useState<ListingBrokerDraft>(() => getListingBrokerDraft(draftKey) ?? createEmptyListingBrokerDraft());
  const [captionPhoto, setCaptionPhoto] = useState<ListingPhotoItem | null>(null);
  const [hasSynced, setHasSynced] = useState(false);

  const syncBrokerFormState = useCallback(() => {
    saveListingBrokerDraft(draftKey, draft);
  }, [draft, draftKey]);

  const updateDraft = useCallback((patch: Partial<ListingBrokerDraft>) => {
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      saveListingBrokerDraft(draftKey, next);
      setHasSynced(true);
      return next;
    });
  }, [draftKey]);

  useEffect(() => {
    let active = true;
    void hydrateListingBrokerDraft(draftKey).then((hydrated) => {
      if (active && hydrated) setDraft(hydrated);
    });
    return () => {
      active = false;
    };
  }, [draftKey]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", syncBrokerFormState);
    return unsubscribe;
  }, [navigation, syncBrokerFormState]);

  useEffect(() => () => syncBrokerFormState(), [syncBrokerFormState]);

  const handleBack = useCallback(() => {
    syncBrokerFormState();
    router.back();
  }, [router, syncBrokerFormState]);

  const pickPrivatePhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 6 - draft.brokerPrivatePhotos.length),
      quality: 0.7,
    });
    if (result.canceled) return;
    const picked = result.assets
      .map((asset, index) => ({ id: `broker-photo-${Date.now()}-${index}`, url: asset.uri, orderIndex: draft.brokerPrivatePhotos.length + index } satisfies ListingPhotoItem));
    updateDraft({ brokerPrivatePhotos: reindexListingPhotoItems([...draft.brokerPrivatePhotos, ...picked].slice(0, 6)) });
  }, [draft.brokerPrivatePhotos, updateDraft]);

  const saveCaption = useCallback((caption: string) => {
    if (!captionPhoto) return;
    updateDraft({ brokerPrivatePhotos: draft.brokerPrivatePhotos.map((photo) => photo.id === captionPhoto.id ? { ...photo, caption: caption || null } : photo) });
  }, [captionPhoto, draft.brokerPrivatePhotos, updateDraft]);

  return (
    <View style={stylesForTheme.screen}>
      <View style={[stylesForTheme.curvedHeader, { paddingTop: insets.top + spacing.sm }]}>
        <View style={stylesForTheme.headerRow}>
          <BackCircleButton onPress={handleBack} />
          <Text style={stylesForTheme.headerTitle}>{t("listings.brokerView.title")}</Text>
          <View style={stylesForTheme.headerSpacer}>
            {hasSynced ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} accessibilityLabel={t("listings.brokerView.syncedNotice")} /> : null}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[stylesForTheme.content, { paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID="listing-broker-view-scroll"
      >
        <BrokerAssignmentSection draft={draft} onChange={updateDraft} />
        <BrokerTermsSection draft={draft} onChange={updateDraft} />
        <BrokerOwnerSection draft={draft} onChange={updateDraft} />

        <View style={[stylesForTheme.photoCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Text style={stylesForTheme.cardTitle}>Private Broker Photos</Text>
          <Text style={stylesForTheme.hint}>Visible only to the managing broker or agency.</Text>
          <ListingPhotoGrid
            photos={draft.brokerPrivatePhotos}
            maxSlots={6}
            onAdd={() => void pickPrivatePhotos()}
            onRemove={(index) => updateDraft({ brokerPrivatePhotos: reindexListingPhotoItems(draft.brokerPrivatePhotos.filter((_, photoIndex) => photoIndex !== index)) })}
            onReorder={(photos) => updateDraft({ brokerPrivatePhotos: reindexListingPhotoItems(photos) })}
            onCaption={setCaptionPhoto}
            testID="listing-broker-private-photo-grid"
          />
        </View>

        <BrokerPrivacySection draft={draft} onChange={updateDraft} />
        <BrokerNotesSection draft={draft} onChange={updateDraft} />
      </ScrollView>

      <PhotoCaptionModal visible={captionPhoto !== null} photo={captionPhoto} onClose={() => setCaptionPhoto(null)} onSave={saveCaption} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: "center", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
});

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.surface, flex: 1 },
    curvedHeader: { backgroundColor: colors.brandTertiary, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    headerTitle: { color: colors.onSurface, flex: 1, fontFamily: fonts.displayExtra, fontSize: fontSize.xl, textAlign: "center" },
    headerSpacer: { height: 40, width: 40 },
    content: { gap: spacing.md, padding: spacing.lg },
    photoCard: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
    cardTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.lg },
    hint: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm },
  });
}
