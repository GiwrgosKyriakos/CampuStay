import React from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context/ThemeContext";
import { t } from "@/src/locales";
import { fonts, fontSize, radius, spacing } from "@/src/theme";
import type { ListingBrokerDraft } from "@/src/types/listingBroker";

export interface ListingBrokerSectionProps {
  draft: ListingBrokerDraft;
  onChange: (patch: Partial<ListingBrokerDraft>) => void;
}

const STATUS_OPTIONS: Array<{ key: ListingBrokerDraft["propertyStatus"]; label: string }> = [
  { key: "available", label: "Διαθέσιμο" },
  { key: "available_after_call", label: "Διαθέσιμο μετά από τηλέφωνο" },
  { key: "under_negotiation", label: "Υπό διαπραγμάτευση" },
  { key: "closed_deposit", label: "Κεκλεισμένο" },
  { key: "sold_rented", label: "Πωλήθηκε / Ενοικιάστηκε" },
  { key: "on_hold_owner_request", label: "Σε αναμονή" },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.onSurfaceTertiary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, { borderColor: colors.border, color: colors.onSurface }, multiline && styles.multilineInput]}
      />
    </View>
  );
}

export function BrokerAssignmentSection({ draft, onChange }: ListingBrokerSectionProps) {
  const { colors } = useTheme();
  return (
    <SectionCard title="Assignment & Pool Routing">
      <View style={styles.segmentRow}>
        {(["direct", "pool"] as const).map((mode) => {
          const active = draft.publishMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => onChange({ publishMode: mode, assignmentStatus: mode === "pool" ? "unassigned_pool" : "assigned" })}
              style={[styles.segment, { borderColor: active ? colors.brand : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surface }]}
              testID={`broker-view-publish-${mode}`}
            >
              <Text style={[styles.segmentText, { color: active ? colors.brand : colors.onSurfaceTertiary }]}>{mode === "direct" ? "Direct Manage" : "Apartment Pool"}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        label="Assigned broker IDs"
        value={draft.assignedBrokerIds.join(", ")}
        onChangeText={(value) => onChange({ assignedBrokerIds: value.split(",").map((item) => item.trim()).filter(Boolean) })}
        placeholder="broker-id-1, broker-id-2"
      />
      <Text style={[styles.statusText, { color: colors.onSurfaceTertiary }]}>{`Status: ${draft.assignmentStatus ?? "not assigned"}`}</Text>
    </SectionCard>
  );
}

export function BrokerTermsSection({ draft, onChange }: ListingBrokerSectionProps) {
  return (
    <SectionCard title="Commission & Financial Terms">
      <Field label="Max offer discount (%)" value={draft.maxDiscountPercent} onChangeText={(value) => onChange({ maxDiscountPercent: value.replace(/[^0-9]/g, "").slice(0, 3) })} keyboardType="number-pad" />
      <Field label="Commission rate (%)" value={draft.commissionRate} onChangeText={(value) => onChange({ commissionRate: value.replace(/[^0-9.]/g, "") })} keyboardType="number-pad" />
      <Field label="Expected broker split (%)" value={draft.expectedBrokerSplit} onChangeText={(value) => onChange({ expectedBrokerSplit: value.replace(/[^0-9.]/g, "") })} keyboardType="number-pad" />
      <Field label="Mandate notes" value={draft.mandateNotes} onChangeText={(value) => onChange({ mandateNotes: value })} placeholder="Internal mandate terms" multiline />
    </SectionCard>
  );
}

export function BrokerOwnerSection({ draft, onChange }: ListingBrokerSectionProps) {
  return (
    <SectionCard title="Owner & Internal Terms">
      <Field label="Owner name" value={draft.ownerName} onChangeText={(value) => onChange({ ownerName: value })} />
      <Field label="Owner phone" value={draft.ownerPhone} onChangeText={(value) => onChange({ ownerPhone: value })} keyboardType="phone-pad" />
      <Field label="Owner motivation" value={draft.ownerMotivationType ?? ""} onChangeText={(value) => onChange({ ownerMotivationType: value || null })} />
      <Field label="Owner motivation details" value={draft.customOwnerMotivation} onChangeText={(value) => onChange({ customOwnerMotivation: value })} multiline />
      <Field label="Expected owner price (€)" value={draft.ownerPriceExpectation} onChangeText={(value) => onChange({ ownerPriceExpectation: value.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
      <Field label="Closed deal price (€)" value={draft.closedDealPrice} onChangeText={(value) => onChange({ closedDealPrice: value.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
      <View style={styles.statusGrid}>
        {STATUS_OPTIONS.map((option) => {
          const active = draft.propertyStatus === option.key;
          return (
            <Pressable key={option.key} onPress={() => onChange({ propertyStatus: option.key })} style={[styles.statusOption, { borderColor: active ? colorsForStatus(option.key) : "#D9DEE3" }]}>
              <Text style={[styles.statusOptionText, { color: active ? colorsForStatus(option.key) : "#68737D" }]}>{option.label}</Text>
              <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={18} color={active ? colorsForStatus(option.key) : "#68737D"} />
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

function colorsForStatus(status: ListingBrokerDraft["propertyStatus"]): string {
  return status === "sold_rented" ? "#E55353" : status === "under_negotiation" ? "#C98A00" : "#00A95C";
}

export function BrokerPrivacySection({ draft, onChange }: ListingBrokerSectionProps) {
  const { colors } = useTheme();
  return (
    <SectionCard title="Off-Market & Privacy">
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: colors.onSurface }]}>{t("listings.brokerView.offMarketLabel")}</Text>
        <Switch value={draft.isOffMarket} onValueChange={(value) => onChange({ isOffMarket: value })} trackColor={{ false: colors.border, true: colors.brandSecondary }} thumbColor={draft.isOffMarket ? colors.brand : colors.onSurface} />
      </View>
      <Field
        label="Selective access user IDs"
        value={draft.offMarketAccessUserIds.join(", ")}
        onChangeText={(value) => onChange({ offMarketAccessUserIds: value.split(",").map((item) => item.trim()).filter(Boolean) })}
        placeholder="user-id-1, user-id-2"
      />
    </SectionCard>
  );
}

export function BrokerNotesSection({ draft, onChange }: ListingBrokerSectionProps) {
  return (
    <SectionCard title="Internal Notes & Matching Criteria">
      <Field label="Internal broker notes" value={draft.internalNotes} onChangeText={(value) => onChange({ internalNotes: value })} placeholder="Private property memo" multiline />
      <Field label="Client matching criteria" value={draft.clientCriteria} onChangeText={(value) => onChange({ clientCriteria: value })} placeholder="Tenant profile and suitability notes" multiline />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg },
  field: { gap: spacing.xs },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  input: { borderRadius: radius.sm, borderWidth: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  multilineInput: { minHeight: 88 },
  segmentRow: { flexDirection: "row", gap: spacing.sm },
  segment: { borderRadius: radius.pill, borderWidth: 1, flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, textAlign: "center" },
  statusText: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  statusGrid: { gap: spacing.sm },
  statusOption: { alignItems: "center", borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  statusOptionText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  switchRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
});
