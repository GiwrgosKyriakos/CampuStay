import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { claimAgencyLead, subscribeAgencyLeads, type AgencyLead } from "@/src/api/agencyCollaboration";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export default function LeadsPoolSection({ agencyId, brokerId, onChanged }: { agencyId: string; brokerId: string; onChanged?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  useEffect(() => {
    if (!agencyId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeAgencyLeads(agencyId, (nextLeads) => {
      setLeads(nextLeads.filter((lead) => lead.status === "unassigned_pool"));
      setLoading(false);
    });
  }, [agencyId]);
  const claim = async (lead: AgencyLead) => {
    if (claiming) return;
    setClaiming(lead.id);
    setLeads((previous) => previous.filter((item) => item.id !== lead.id));
    try { await claimAgencyLead({ leadId: lead.id, brokerId }); onChanged?.(); } catch (error) { setLeads((previous) => [...previous, lead]); Alert.alert("Η ανάληψη απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά."); } finally { setClaiming(null); }
  };
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.brand} /></View>;
  if (leads.length === 0) return <View style={styles.state}><Ionicons name="people-outline" size={32} color={colors.onSurfaceTertiary} /><Text style={styles.empty}>Δεν υπάρχουν αδιάθετα leads.</Text></View>;
  return <View style={styles.list}>{leads.map((lead) => <View key={lead.id} style={styles.row} testID={`lead-pool-${lead.id}`}><View style={styles.copy}><Text style={styles.name}>{lead.clientName}</Text><Text style={styles.meta}>{[lead.phone, lead.email, lead.budget ? `€${lead.budget}` : ""].filter(Boolean).join(" · ") || "Χωρίς στοιχεία επικοινωνίας"}</Text>{lead.apartmentId ? <Text style={styles.meta}>Ακίνητο: {lead.apartmentId}</Text> : null}</View><Pressable style={styles.claim} disabled={claiming === lead.id} onPress={() => void claim(lead)} testID={`lead-pool-claim-${lead.id}`}>{claiming === lead.id ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="person-add-outline" size={16} color={colors.onBrand} /><Text style={styles.claimText}>Ανάληψη Πελάτη</Text></>}</Pressable></View>)}</View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  list: { gap: spacing.sm },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  copy: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  claim: { minHeight: 38, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  claimText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  state: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  empty: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, textAlign: "center" },
});