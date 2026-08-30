import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";

export interface PriceProposalModalProps {
  visible: boolean;
  isSubmitting: boolean;
  minRecommendedPrice: number;
  hostDiscountPercentage: number;
  onClose: () => void;
  onSubmit: (price: number) => void;
}

export default function PriceProposalModal({
  visible,
  isSubmitting,
  minRecommendedPrice,
  hostDiscountPercentage,
  onClose,
  onSubmit,
}: PriceProposalModalProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!visible) setInput("");
  }, [visible]);

  const price = Number(input.replace(/,/g, ".").replace(/[^0-9.]/g, ""));
  const isValid = Number.isFinite(price) && price > 0;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => { if (!isSubmitting) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Υπόβαλλε πρόταση τιμής στον αγγελιοδότη</Text>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="0"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="numeric"
            editable={!isSubmitting}
            testID="chat-price-proposal-input"
          />
          <Text style={styles.hint}>
            {`Η πρόταση τιμής θα ήταν καλό να μην είναι λιγότερο από ${minRecommendedPrice.toFixed(0)}€ (${hostDiscountPercentage}% κάτω)`}
          </Text>
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={isSubmitting} testID="chat-price-proposal-cancel">
              <Text style={styles.cancelText}>{t("common.actions.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.submit, (!isValid || isSubmitting) && styles.disabled]}
              onPress={() => onSubmit(price)}
              disabled={!isValid || isSubmitting}
              testID="chat-price-proposal-submit"
            >
              <Ionicons name="checkmark-circle" size={30} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  actions: { marginTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  submit: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  disabled: { opacity: 0.45 },
});
