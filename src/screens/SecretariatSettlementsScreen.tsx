import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import {
  calculateCommissionSplits,
  getAgencyClosedDeals,
  issueCommissionSettlement,
  subscribeAgencyClosedDeals,
} from "@/src/api/agencyCollaboration";
import type { Deal } from "@/src/types/deal";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

const TAB_BAR_BOTTOM_SPACE = 90;
const CURRENCY = "€";

type SplitInputs = {
  agency: string;
  listing: string;
  buyer: string;
  covering: string;
  invoice: string;
};

function defaultInputs(deal: Deal): SplitInputs {
  const listing = deal.brokerSplits.find((split) => split.role === "listing_agent");
  const buyer = deal.brokerSplits.find((split) => split.role === "buyer_agent");
  const covering = deal.brokerSplits.find((split) => split.role === "covering_agent");

  const agency = Number.isFinite(deal.agencyCutPercentage) ? deal.agencyCutPercentage : 50;
  const coveringPercentage = covering?.percentage ?? 0;
  const storedListing = listing?.percentage ?? 0;
  const storedBuyer = buyer?.percentage ?? 0;
  const storedTotal = agency + storedListing + storedBuyer + coveringPercentage;

  if (Math.round(storedTotal * 100) === 10000) {
    return {
      agency: String(agency),
      listing: String(storedListing),
      buyer: String(storedBuyer),
      covering: String(coveringPercentage),
      invoice: "",
    };
  }

  const brokerRemainder = Math.max(0, 100 - agency - coveringPercentage);
  return {
    agency: String(agency),
    listing: String(brokerRemainder / 2),
    buyer: String(brokerRemainder / 2),
    covering: String(coveringPercentage),
    invoice: "",
  };
}

function getSettlementCalculation(deal: Deal, values: SplitInputs) {
  const listing = deal.brokerSplits.find((split) => split.role === "listing_agent");
  const buyer = deal.brokerSplits.find((split) => split.role === "buyer_agent");
  const covering = deal.brokerSplits.find((split) => split.role === "covering_agent");

  try {
    return calculateCommissionSplits({
      totalCommission: deal.commissionTotal,
      agencyCutPercentage: Number(values.agency),
      listingPercentage: Number(values.listing),
      buyerPercentage: Number(values.buyer),
      listingBroker: { id: deal.listingBrokerId, name: listing?.brokerName || "Listing broker" },
      buyerBroker: { id: deal.buyerBrokerId, name: buyer?.brokerName || "Buyer broker" },
      ...(deal.coveringBrokerId
        ? {
            coveringBroker: {
              id: deal.coveringBrokerId,
              name: covering?.brokerName || "Covering broker",
              percentage: Number(values.covering),
            },
          }
        : {}),
    });
  } catch {
    return null;
  }
}

function settlementStatusMeta(
  status: Deal["settlementStatus"],
  colors: ThemeColors,
): { label: string; bg: string; text: string } {
  switch (status) {
    case "settled":
      return { label: "Εξοφλημένο", bg: "rgba(34, 197, 94, 0.12)", text: colors.success };
    case "issued":
      return { label: "Τιμολόγιο εκδόθηκε", bg: colors.brandTertiary, text: colors.brand };
    case "approved":
      return { label: "Εγκεκριμένο", bg: "rgba(234, 179, 8, 0.12)", text: colors.warning };
    default:
      return { label: "Υπό έλεγχο", bg: colors.surfaceTertiary, text: colors.onSurfaceTertiary };
  }
}

export default function SecretariatSettlementsScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [inputs, setInputs] = useState<Record<string, SplitInputs>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const isExecutive =
    Boolean(auth.agencyId) &&
    ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  const loadData = useCallback(async () => {
    if (!isExecutive || !auth.agencyId) {
      setDeals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const loaded = await getAgencyClosedDeals(auth.agencyId);
      setDeals(loaded);
      setInputs((previous) =>
        Object.fromEntries(
          loaded.map((deal) => [deal.id, previous[deal.id] ?? defaultInputs(deal)]),
        ),
      );
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [auth.agencyId, isExecutive]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isExecutive || !auth.agencyId) return;

    return subscribeAgencyClosedDeals(auth.agencyId, (loaded) => {
      setDeals(loaded);
      setInputs((previous) =>
        Object.fromEntries(
          loaded.map((deal) => [deal.id, previous[deal.id] ?? defaultInputs(deal)]),
        ),
      );
      setLoading(false);
    });
  }, [auth.agencyId, isExecutive]);

  const updateInput = (dealId: string, key: keyof SplitInputs, value: string) => {
    setInputs((previous) => ({
      ...previous,
      [dealId]: {
        ...(previous[dealId] ?? {
          agency: "50",
          listing: "50",
          buyer: "50",
          covering: "0",
          invoice: "",
        }),
        [key]: value,
      },
    }));
  };

  const handleSettle = async (deal: Deal) => {
    if (!auth.agencyId || workingId) return;

    const values = inputs[deal.id] ?? defaultInputs(deal);
    const calculated = getSettlementCalculation(deal, values);

    if (!calculated) {
      Alert.alert(
        "Μη έγκυρα ποσοστά διανομής",
        "Τα ποσοστά πρέπει να είναι θετικοί αριθμοί και το συνολικό άθροισμα (Agency + Listing + Buyer + Covering) πρέπει να ισούται ακριβώς με 100%.",
      );
      return;
    }

    setWorkingId(deal.id);
    try {
      await issueCommissionSettlement({
        agencyId: auth.agencyId,
        deal,
        apartmentTitle: String(
          (deal as Deal & { apartmentTitle?: string }).apartmentTitle || "Ακίνητο",
        ),
        invoiceNumber: values.invoice.trim(),
        agencyShare: calculated.agencyAmount,
        agencyCutPercentage: Number(values.agency),
        brokerSplits: calculated.brokerSplits,
      });

      Alert.alert("Επιτυχής Εκκαθάριση", "Η εκκαθάριση ολοκληρώθηκε και καταγράφηκε επιτυχώς.");
      await loadData();
    } catch (error) {
      Alert.alert(
        "Ανεπιτυχής Εκκαθάριση",
        error instanceof Error ? error.message : "Παρουσιάστηκε σφάλμα κατά την εκκαθάριση.",
      );
    } finally {
      setWorkingId(null);
    }
  };

  if (!isExecutive) {
    return (
      <View style={styles.stateCenter}>
        <View style={styles.iconCircleMuted}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Περιορισμένη Πρόσβαση</Text>
        <Text style={styles.emptySubtitle}>
          Η οθόνη εκκαθαρίσεων και τιμολόγησης είναι διαθέσιμη αποκλειστικά στη Γραμματεία και τη Διοίκηση (CEO) του γραφείου.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="secretariat-settlements-screen">
      {/* Curved Elevated Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Εκκαθαρίσεις & Τιμολόγια
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Διαχείριση προμηθειών για ολοκληρωμένες συμφωνίες
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.stateCenter}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Φόρτωση κλειστών deals...</Text>
        </View>
      ) : deals.length === 0 ? (
        <View style={styles.stateCenter}>
          <View style={styles.iconCircleMuted}>
            <Ionicons name="receipt-outline" size={34} color={colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>Καμία Εκκρεμής Εκκαθάριση</Text>
          <Text style={styles.emptySubtitle}>
            Δεν υπάρχουν ολοκληρωμένες συμφωνίες (100%) προς έκδοση τιμολογίου ή εκκαθάριση προμήθειας αυτή τη στιγμή.
          </Text>
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              ΟΛΟΚΛΗΡΩΜΕΝΑ DEALS ΠΡΟΣ ΕΚΚΑΘΑΡΙΣΗ ({deals.length})
            </Text>
          </View>

          {deals.map((deal) => {
            const values = inputs[deal.id] ?? defaultInputs(deal);
            const calculated = getSettlementCalculation(deal, values);
            const settlementStatus = deal.settlementStatus ?? "pending_review";
            const statusMeta = settlementStatusMeta(settlementStatus, colors);
            const isSettled = settlementStatus === "settled";
            const isActionDisabled = workingId === deal.id || !calculated || isSettled;

            return (
              <View
                key={deal.id}
                style={styles.dealCard}
                testID={`settlement-deal-${deal.id}`}
              >
                {/* Header Row of Deal Card */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {String((deal as Deal & { apartmentTitle?: string }).apartmentTitle || `Ακίνητο #${deal.apartmentId}`)}
                    </Text>
                    <Text style={styles.commissionTotalText}>
                      Συνολική προμήθεια:{" "}
                      <Text style={styles.commissionTotalValue}>
                        {CURRENCY}{deal.commissionTotal.toLocaleString("el-GR", { minimumFractionDigits: 2 })}
                      </Text>
                    </Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>
                      {statusMeta.label}
                    </Text>
                  </View>
                </View>

                {/* Percentage Distribution Inputs */}
                <Text style={styles.inputSectionLabel}>Ποσοστά Διανομής (%)</Text>
                <View style={styles.inputsRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Γραφείο</Text>
                    <View style={styles.inputBoxWrap}>
                      <TextInput
                        value={values.agency}
                        onChangeText={(val) =>
                          updateInput(deal.id, "agency", val.replace(/[^0-9.]/g, ""))
                        }
                        keyboardType="decimal-pad"
                        style={styles.inputField}
                        placeholder="50"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                      <Text style={styles.inputAdornment}>%</Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Listing</Text>
                    <View style={styles.inputBoxWrap}>
                      <TextInput
                        value={values.listing}
                        onChangeText={(val) =>
                          updateInput(deal.id, "listing", val.replace(/[^0-9.]/g, ""))
                        }
                        keyboardType="decimal-pad"
                        style={styles.inputField}
                        placeholder="25"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                      <Text style={styles.inputAdornment}>%</Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Buyer</Text>
                    <View style={styles.inputBoxWrap}>
                      <TextInput
                        value={values.buyer}
                        onChangeText={(val) =>
                          updateInput(deal.id, "buyer", val.replace(/[^0-9.]/g, ""))
                        }
                        keyboardType="decimal-pad"
                        style={styles.inputField}
                        placeholder="25"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                      <Text style={styles.inputAdornment}>%</Text>
                    </View>
                  </View>

                  {deal.coveringBrokerId ? (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Covering</Text>
                      <View style={styles.inputBoxWrap}>
                        <TextInput
                          value={values.covering}
                          onChangeText={(val) =>
                            updateInput(deal.id, "covering", val.replace(/[^0-9.]/g, ""))
                          }
                          keyboardType="decimal-pad"
                          style={styles.inputField}
                          placeholder="0"
                          placeholderTextColor={colors.onSurfaceTertiary}
                        />
                        <Text style={styles.inputAdornment}>%</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Real-time Calculation Breakdown Box */}
                {calculated ? (
                  <View style={styles.calcContainer}>
                    <View style={styles.calcRow}>
                      <View style={styles.calcLabelGroup}>
                        <Ionicons name="business-outline" size={13} color={colors.brand} />
                        <Text style={styles.calcPartyName}>Μερίδιο Γραφείου (Agency):</Text>
                      </View>
                      <Text style={styles.calcAmountAgency}>
                        {CURRENCY}{calculated.agencyAmount.toLocaleString("el-GR", { minimumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {calculated.brokerSplits.map((split) => (
                      <View key={split.brokerId} style={styles.calcRow}>
                        <View style={styles.calcLabelGroup}>
                          <Ionicons name="person-outline" size={13} color={colors.onSurfaceTertiary} />
                          <Text style={styles.calcPartyName} numberOfLines={1}>
                            {split.brokerName}:
                          </Text>
                        </View>
                        <Text style={styles.calcAmountBroker}>
                          {CURRENCY}{split.amount.toLocaleString("el-GR", { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.validationErrorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
                    <Text style={styles.validationErrorText}>
                      Το άθροισμα των μεριδίων πρέπει να ισούται ακριβώς με 100%.
                    </Text>
                  </View>
                )}

                {/* Invoice Number Input */}
                <View style={styles.invoiceRow}>
                  <Ionicons name="document-text-outline" size={16} color={colors.onSurfaceTertiary} />
                  <TextInput
                    value={values.invoice}
                    onChangeText={(val) => updateInput(deal.id, "invoice", val)}
                    placeholder="Αριθμός τιμολογίου / Παραστατικού (προαιρετικό)"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={styles.invoiceInputField}
                  />
                </View>

                {/* Settle / Issue Action Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.settleActionButton,
                    isActionDisabled && styles.settleActionButtonDisabled,
                    pressed && !isActionDisabled && styles.btnPressed,
                  ]}
                  disabled={isActionDisabled}
                  onPress={() => void handleSettle(deal)}
                  hitSlop={6}
                >
                  {workingId === deal.id ? (
                    <ActivityIndicator size="small" color={colors.onBrand} />
                  ) : (
                    <>
                      <Ionicons
                        name={isSettled ? "checkmark-done-circle" : "receipt-outline"}
                        size={18}
                        color={isActionDisabled ? colors.onSurfaceTertiary : colors.onBrand}
                      />
                      <Text
                        style={[
                          styles.settleActionText,
                          isActionDisabled && styles.settleActionTextDisabled,
                        ]}
                      >
                        {isSettled ? "Εκκαθάριση Ολοκληρώθηκε" : "Έκδοση Τιμολογίου & Εκκαθάριση"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
      zIndex: 2,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    titleWrap: {
      flex: 1,
      width: "100%",
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.md,
    },
    counterRow: {
      paddingVertical: spacing.xs,
      paddingHorizontal: 2,
    },
    counterText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      letterSpacing: 0.8,
    },
    dealCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      gap: spacing.sm + 2,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    cardTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    cardTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    commissionTotalText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    commissionTotalValue: {
      fontFamily: fonts.bold,
      color: colors.brand,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      alignSelf: "flex-start",
    },
    statusBadgeText: {
      fontFamily: fonts.bold,
      fontSize: 10,
    },
    inputSectionLabel: {
      fontFamily: fonts.semibold,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 2,
    },
    inputsRow: {
      flexDirection: "row",
      gap: spacing.xs,
    },
    inputGroup: {
      flex: 1,
      gap: 3,
    },
    inputLabel: {
      fontFamily: fonts.regular,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    inputBoxWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 6,
      height: 38,
    },
    inputField: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      textAlign: "center",
      paddingVertical: 0,
    },
    inputAdornment: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    calcContainer: {
      borderRadius: radius.md,
      padding: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    calcRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    calcLabelGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flex: 1,
      minWidth: 0,
    },
    calcPartyName: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    calcAmountAgency: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    calcAmountBroker: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    validationErrorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: "rgba(239, 68, 68, 0.08)",
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.2)",
    },
    validationErrorText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.error,
    },
    invoiceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      height: 42,
    },
    invoiceInputField: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurface,
      paddingVertical: 0,
    },
    settleActionButton: {
      height: 44,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      backgroundColor: colors.brand,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    settleActionButtonDisabled: {
      backgroundColor: colors.surfaceTertiary,
      elevation: 0,
      shadowOpacity: 0,
    },
    settleActionText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onBrand,
    },
    settleActionTextDisabled: {
      color: colors.onSurfaceTertiary,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    stateCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing["2xl"],
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    iconCircleMuted: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: colors.onSurface,
      textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
      lineHeight: 19,
      maxWidth: 310,
    },
    loadingText: {
      marginTop: spacing.xs,
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
  });
}