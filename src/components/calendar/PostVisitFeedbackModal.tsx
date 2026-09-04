import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import type { BrokerNote } from "@/src/api/brokerCalendar";
import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { savePostVisitFeedback } from "@/src/api/showingInteractions";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";
import { useVoiceInputPreview } from "@/src/hooks/useVoiceInputPreview";
import { fontSize, fonts, radius, spacing } from "@/src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SecondVisitChoice = "yes" | "no" | "maybe";

const FEEDBACK_TAGS = [
  { value: "Μεγάλο μπαλκόνι", label: "calendar.postVisit.tags.largeBalcony" },
  { value: "Φωτεινό", label: "calendar.postVisit.tags.bright" },
  { value: "Καλή τοποθεσία", label: "calendar.postVisit.tags.goodLocation" },
  { value: "Μικρό σαλόνι", label: "calendar.postVisit.tags.smallLivingRoom" },
  { value: "Μικρό μπάνιο", label: "calendar.postVisit.tags.smallBathroom" },
  { value: "Χρειάζεται ανακαίνιση", label: "calendar.postVisit.tags.needsRenovation" },
  { value: "Υπερβολική τιμή", label: "calendar.postVisit.tags.tooExpensive" },
];

const FOLLOW_UP_OPTIONS = [
  { value: "2η επίσκεψη", label: "calendar.postVisit.followUp.secondVisit" },
  { value: "Προετοιμασία συμβολαίου", label: "calendar.postVisit.followUp.contractPreparation" },
  { value: "Κλεισμένη συμφωνία", label: "calendar.postVisit.followUp.dealClosed" },
  { value: "Χωρίς επόμενο βήμα", label: "calendar.postVisit.followUp.noNextStep" },
];

export interface PostVisitFeedbackModalProps {
  visible: boolean;
  note: BrokerNote | null;
  isClient: boolean;
  userId: string;
  clientName: string;
  propertyId?: string;
  clientId?: string;
  profileId?: string;
  listingPrice?: number;
  maxDiscountPercent?: number;
  onClose: () => void;
  onSaved?: () => void;
  onSentimentInvalidated?: (apartmentId: string) => void;
}

export default function PostVisitFeedbackModal({ visible, note, isClient, userId, clientName, propertyId, clientId, profileId, listingPrice, maxDiscountPercent = 10, onClose, onSaved, onSentimentInvalidated }: PostVisitFeedbackModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [scores, setScores] = useState<[number, number, number]>([0, 0, 0]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notesText, setNotesText] = useState("");
  const [secondVisitChoice, setSecondVisitChoice] = useState<SecondVisitChoice | null>(null);
  const [hasOralOffer, setHasOralOffer] = useState(false);
  const [oralOfferAmount, setOralOfferAmount] = useState("");
  const [followUpIntent, setFollowUpIntent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const notesVoice = useVoiceInputPreview(notesText, setNotesText);
  const { onAbort: resetNotesVoice } = notesVoice;
  const listingValue = listingPrice ?? note?.apartmentPrice ?? 0;
  const offerNum = Number.parseFloat(oralOfferAmount) || 0;
  const minAcceptablePrice = listingValue * (1 - maxDiscountPercent / 100);
  const isBelowMaxDiscount = !isClient && hasOralOffer && offerNum > 0 && offerNum < minAcceptablePrice;
  const calculatedDiscountPercent = listingValue > 0 && offerNum > 0 ? Math.round(((listingValue - offerNum) / listingValue) * 100) : 0;

  useEffect(() => {
    if (!visible) return;
    resetNotesVoice();
    setScores([0, 0, 0]);
    setSelectedTags([]);
    setNotesText("");
    setSecondVisitChoice(null);
    setHasOralOffer(false);
    setOralOfferAmount("");
    setFollowUpIntent("");
    setErrorText(null);
  }, [note?.id, resetNotesVoice, visible]);

  useEffect(() => {
    if (!visible || !propertyId || !clientId || !profileId) return;
    const profileUpdates = {
      pipelineStage: "showing_completed",
      isVisitCompleted: true,
      hasVisitRequest: true,
      visitCompletedAt: Date.now(),
      updatedAt: Date.now(),
    };
    void (async () => {
      try {
        await updateDoc(doc(db, "brokerClientProfiles", profileId), profileUpdates);
        const brokerId = clientId && profileId.endsWith(`_${clientId}`) ? profileId.slice(0, -(clientId.length + 1)) : "";
        if (!brokerId) return;
        const initializeDeal = httpsCallable<Record<string, unknown>, { dealId: string }>(firebaseFunctions, "initializeDealCallable");
        const advanceDealStage = httpsCallable<Record<string, unknown>, { dealId: string; stage: number }>(firebaseFunctions, "advanceDealStageCallable");
        await initializeDeal({ apartmentId: propertyId, brokerId, clientId, initialStage: 0 });
        await advanceDealStage({ dealId: `${propertyId}_${clientId}`, targetStage: 35 });
      } catch (error) {
        console.warn("Auto-update deal stage on feedback open failed:", error);
      }
    })();
  }, [clientId, isClient, profileId, propertyId, visible]);

  const canSave = !!note && !!userId && (isClient ? scores.every((score) => score > 0) : notesText.trim().length > 0 && (!hasOralOffer || (offerNum > 0 && !isBelowMaxDiscount)));

  const handleSave = async () => {
    if (!note || !canSave || isSaving) return;
    setIsSaving(true);
    setErrorText(null);
    try {
      await savePostVisitFeedback({
        note,
        loggedByUserId: userId,
        isClient,
        clientName,
        clientPriceScore: isClient ? scores[0] : undefined,
        clientLayoutScore: isClient ? scores[1] : undefined,
        clientConditionScore: isClient ? scores[2] : undefined,
        selectedTags: isClient ? selectedTags : [],
        clientNotes: isClient ? notesText.trim() : "",
        secondVisitInterest: isClient ? secondVisitChoice ?? undefined : undefined,
        brokerAssessmentNotes: isClient ? "" : notesText.trim(),
        hasOralOffer: isClient ? false : hasOralOffer,
        oralOfferAmount: !isClient && hasOralOffer ? Number(oralOfferAmount) : null,
        followUpIntent: isClient ? undefined : followUpIntent || undefined,
        submittedByCoveringBrokerId: note?.coveringBrokerId === userId ? note.coveringBrokerId : undefined,
      });
      if (note.apartmentId) onSentimentInvalidated?.(note.apartmentId);
      onSaved?.();
      onClose();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("calendar.postVisit.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{isClient ? t("calendar.postVisit.clientTitle") : t("calendar.postVisit.brokerTitle")}</Text>
              <Text style={styles.subtitle}>{note?.apartmentTitle ?? t("calendar.postVisit.apartmentFallback")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="post-visit-feedback-close">
              <Ionicons name="close-outline" size={26} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: Math.max(insets.bottom, spacing.md) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {isClient ? (
              <>
                {["calendar.postVisit.ratings.price", "calendar.postVisit.ratings.layout", "calendar.postVisit.ratings.condition"].map((label, index) => (
                  <View key={label} style={styles.ratingBlock}>
                    <Text style={styles.label}>{t(label)}</Text>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Pressable key={value} onPress={() => setScores((previous) => previous.map((score, scoreIndex) => scoreIndex === index ? value : score) as [number, number, number])} testID={`feedback-rating-${index + 1}-${value}`}>
                          <Ionicons name="star" size={22} color={value <= scores[index] ? colors.warning : colors.onSurfaceTertiary} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                <Text style={styles.label}>{t("calendar.postVisit.quickRating")}</Text>
                <View style={styles.tagsWrap}>
                  {FEEDBACK_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag.value);
                    return <Pressable key={tag.value} style={[styles.tag, active && styles.tagActive]} onPress={() => setSelectedTags((previous) => active ? previous.filter((item) => item !== tag.value) : [...previous, tag.value])}><Text style={[styles.tagText, active && styles.tagTextActive]}>{t(tag.label)}</Text></Pressable>;
                  })}
                </View>
                <Text style={styles.label}>{t("calendar.postVisit.notesLabel")}</Text>
                <View style={styles.voiceInputWrap}><TextInput value={notesVoice.value} onChangeText={notesVoice.onChangeText} multiline textAlignVertical="top" style={[styles.input, styles.voiceInput]} placeholder={t("calendar.postVisit.clientNotesPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID="post-visit-client-notes" /><View style={styles.voiceButtonWrap}><VoiceInputButton onTextAppend={notesVoice.onFinalResult} onPartialResult={notesVoice.onPartialResult} onAbort={notesVoice.onAbort} color={colors.onSurfaceTertiary} disabled={isSaving} /></View></View>
                <Text style={styles.label}>{t("calendar.postVisit.secondVisitQuestion")}</Text>
                <ChoiceRow options={[{ value: "yes", label: t("common.actions.yes") }, { value: "no", label: t("common.actions.no") }, { value: "maybe", label: t("calendar.postVisit.maybe") }]} selected={secondVisitChoice} onSelect={(value) => setSecondVisitChoice(value as SecondVisitChoice)} styles={styles} />
              </>
            ) : (
              <>
                <Text style={styles.label}>{t("calendar.postVisit.brokerNotesLabel")}</Text>
                <View style={styles.voiceInputWrap}><TextInput value={notesVoice.value} onChangeText={notesVoice.onChangeText} multiline textAlignVertical="top" style={[styles.input, styles.voiceInput]} placeholder={t("calendar.postVisit.brokerNotesPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID="post-visit-broker-notes" /><View style={styles.voiceButtonWrap}><VoiceInputButton onTextAppend={notesVoice.onFinalResult} onPartialResult={notesVoice.onPartialResult} onAbort={notesVoice.onAbort} color={colors.onSurfaceTertiary} disabled={isSaving} /></View></View>
                <View style={styles.switchRow}><Text style={styles.label}>{t("calendar.postVisit.oralOfferQuestion")}</Text><Switch value={hasOralOffer} onValueChange={setHasOralOffer} trackColor={{ false: colors.surfaceTertiary, true: colors.brandTertiary }} thumbColor={hasOralOffer ? colors.brand : colors.onSurfaceTertiary} testID="post-visit-oral-offer-toggle" /></View>
                {hasOralOffer ? <><TextInput value={oralOfferAmount} onChangeText={setOralOfferAmount} keyboardType="decimal-pad" style={styles.amountInput} placeholder={t("calendar.postVisit.offerAmountPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID="post-visit-oral-offer-amount" />{isBelowMaxDiscount ? <View style={styles.discountWarningBanner}><Ionicons color="#EF4444" name="alert-circle-outline" size={18} /><View style={styles.discountWarningTextCol}><Text style={styles.discountWarningTitle}>{t("calendar.postVisit.discountWarningTitle")}</Text><Text style={styles.discountWarningDesc}>{t("calendar.postVisit.discountWarningDescription", { offer: offerNum.toLocaleString("el-GR"), discount: calculatedDiscountPercent, maxDiscount: maxDiscountPercent, minimum: minAcceptablePrice.toLocaleString("el-GR") })}</Text></View></View> : null}</> : null}
                <Text style={styles.label}>{t("calendar.postVisit.nextStep")}</Text>
                <ChoiceRow options={FOLLOW_UP_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} selected={followUpIntent} onSelect={setFollowUpIntent} styles={styles} />
              </>
            )}
            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
          </ScrollView>
          <Pressable style={[styles.saveButton, (!canSave || isSaving) && styles.disabled]} onPress={() => void handleSave()} disabled={!canSave || isSaving} testID="post-visit-feedback-save">
            {isSaving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>{t("common.actions.save")}</Text>}
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChoiceRow({ options, selected, onSelect, styles }: { options: { value: string; label: string }[]; selected: string | null; onSelect: (value: string) => void; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.choiceRow}>{options.map((option) => <Pressable key={option.value} onPress={() => onSelect(option.value)} style={[styles.choice, selected === option.value && styles.choiceActive]}><Text style={[styles.choiceText, selected === option.value && styles.choiceTextActive]}>{option.label}</Text></Pressable>)}</View>;
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    keyboardAvoiding: { flex: 1 },
    backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.48)" },
    card: { maxHeight: "90%", borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    headerCopy: { flex: 1, gap: 2 },
    title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
    content: { gap: spacing.md, paddingVertical: spacing.sm },
    ratingBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    starsRow: { flexDirection: "row", gap: 4 },
    star: { fontSize: 28, color: colors.surfaceTertiary },
    starActive: { color: colors.warning },
    tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    tag: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 7, backgroundColor: colors.surfaceSecondary },
    tagActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    tagText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurface },
    tagTextActive: { fontFamily: fonts.semibold },
    input: { minHeight: 110, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface },
    voiceInputWrap: { position: "relative" },
    voiceInput: { paddingRight: 48 },
    voiceButtonWrap: { position: "absolute", top: 4, right: 4 },
    amountInput: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface },
    discountWarningBanner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", marginTop: spacing.xs },
    discountWarningTextCol: { flex: 1, gap: 2 },
    discountWarningTitle: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: "#EF4444" },
    discountWarningDesc: { fontFamily: fonts.regular, fontSize: 11, color: colors.onSurface, lineHeight: 16 },
    choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    choice: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surfaceSecondary },
    choiceActive: { borderColor: colors.brand, backgroundColor: colors.brand },
    choiceText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
    choiceTextActive: { color: colors.onBrand },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    switch: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
    switchActive: { backgroundColor: colors.brand },
    error: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.error },
    saveButton: { minHeight: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
    disabled: { opacity: 0.45 },
    saveText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onBrand },
  });
}