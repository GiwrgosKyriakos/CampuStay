import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { useApartmentResolvedPrice } from "@/src/hooks/useApartmentResolvedPrice";

interface ApartmentPriceDisplayProps {
  price: number;
  originalPrice?: number;
  currency?: string;
  variant: "badge" | "inline";
  isAcceptedOffer?: boolean;
}

export default function ApartmentPriceDisplay({ price, originalPrice, currency = "€", variant, isAcceptedOffer = false }: ApartmentPriceDisplayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formattedPrice = `${currency}${price.toLocaleString("el-GR")}${t("common.format.perMonthShort")}`;

  if (variant === "inline") {
    return <Text style={[styles.inline, isAcceptedOffer && styles.acceptedInline]}>{formattedPrice}</Text>;
  }

  return (
    <View style={[styles.badge, isAcceptedOffer && styles.acceptedBadge]}>
      {isAcceptedOffer ? <Text style={styles.acceptedLabel}>{t("apartmentDetail.acceptedOfferPrice")}</Text> : null}
      <Text style={[styles.badgePrice, isAcceptedOffer && styles.acceptedPrice]}>{formattedPrice}</Text>
      {isAcceptedOffer && typeof originalPrice === "number" && originalPrice !== price ? (
        <Text style={styles.originalPrice}>{`${t("apartmentDetail.originalPrice")}: ${currency}${originalPrice.toLocaleString("el-GR")}${t("common.format.perMonthShort")}`}</Text>
      ) : null}
    </View>
  );
}

export function ApartmentResolvedPriceDisplay({ apartmentId, basePrice, variant }: { apartmentId: string; basePrice: number; variant: "badge" | "inline" }) {
  const resolved = useApartmentResolvedPrice(apartmentId, basePrice);
  return <ApartmentPriceDisplay price={resolved.displayPrice} originalPrice={resolved.originalPrice} variant={variant} isAcceptedOffer={resolved.isAcceptedOffer} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    badge: { alignItems: "flex-end", gap: 2, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
    acceptedBadge: { backgroundColor: colors.surfaceTertiary },
    badgePrice: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
    acceptedPrice: { color: "#F97316" },
    acceptedLabel: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: "#F97316" },
    originalPrice: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    inline: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
    acceptedInline: { color: "#F97316" },
  });
}
