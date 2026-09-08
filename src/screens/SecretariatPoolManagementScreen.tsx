import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getAgencyClaimRecords,
  getAgencyLeads,
  getAgencyPoolApartments,
  getAgencyStaff,
  reassignAgencyLead,
  resolveApartmentClaim,
  subscribeAgencyClaimRecords,
  subscribeAgencyLeads,
  type AgencyClaimRecord,
  type AgencyLead,
  type AgencyStaffMember,
} from "@/src/api/agencyCollaboration";
import LeadsPoolSection from "@/src/components/LeadsPoolSection";
import { FadeInView } from "@/src/components/ui/FadeInView";
import { SkeletonBox } from "@/src/components/ui/SkeletonBox";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";

type SubTab = "listings" | "leads";
type LeadFilterType = "all" | "overdue" | "active";
const INACTIVITY_WINDOW = 24 * 60 * 60 * 1000;
const TAB_BAR_BOTTOM_SPACE = 90;

function timestampMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") {
      return candidate.seconds * 1000 + Math.floor((candidate.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
}

function getLeadUrgency(lead: AgencyLead): {
  remainingMs: number;
  progressPercent: number;
  isOverdue: boolean;
  formattedTime: string;
} {
  const assignedAt = timestampMillis(lead.assignedAt);
  if (!assignedAt) {
    return { remainingMs: 0, progressPercent: 100, isOverdue: false, formattedTime: "Χωρίς ώρα" };
  }

  const elapsed = Date.now() - assignedAt;
  const remaining = Math.max(0, INACTIVITY_WINDOW - elapsed);
  const progressPercent = Math.min(100, Math.max(0, (elapsed / INACTIVITY_WINDOW) * 100));
  const isOverdue = remaining <= 0;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  return {
    remainingMs: remaining,
    progressPercent,
    isOverdue,
    formattedTime: isOverdue ? "Έληξε (>24ω)" : `${hours}ω ${minutes}λ`,
  };
}

export default function SecretariatPoolManagementScreen() {
  const auth = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<SubTab>("listings");
  const [claims, setClaims] = useState<AgencyClaimRecord[]>([]);
  const [poolApartments, setPoolApartments] = useState<(Record<string, unknown> & { id: string })[]>([]);
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [staff, setStaff] = useState<AgencyStaffMember[]>([]);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<LeadFilterType>("all");
  const [, setClock] = useState(() => Date.now());

  const isExecutive =
    Boolean(auth.agencyId) &&
    ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");

  const loadData = useCallback(async () => {
    if (!isExecutive || !auth.agencyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [claimRows, leadRows, staffRows, poolRows] = await Promise.all([
        getAgencyClaimRecords(auth.agencyId),
        getAgencyLeads(auth.agencyId),
        getAgencyStaff(auth.agencyId),
        getAgencyPoolApartments(auth.agencyId, auth.userId ?? ""),
      ]);

      setClaims(claimRows.filter((claim) => claim.status === "pending"));
      setPoolApartments(poolRows);
      setLeads(leadRows);
      setStaff(
        staffRows.filter(
          (member) =>
            member.id !== auth.userId &&
            member.agencyRole !== "secretary" &&
            member.agencyRole !== "secretariat",
        ),
      );
    } catch {
      setClaims([]);
      setPoolApartments([]);
      setLeads([]);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [auth.agencyId, auth.userId, isExecutive]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isExecutive || !auth.agencyId) return;

    const unsubscribeClaims = subscribeAgencyClaimRecords(auth.agencyId, (nextClaims) =>
      setClaims(nextClaims.filter((claim) => claim.status === "pending")),
    );
    const unsubscribeLeads = subscribeAgencyLeads(auth.agencyId, setLeads);

    return () => {
      unsubscribeClaims();
      unsubscribeLeads();
    };
  }, [auth.agencyId, isExecutive]);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleResolveClaim = async (claim: AgencyClaimRecord, approved: boolean) => {
    if (!auth.userId || workingId) return;
    setWorkingId(claim.id);

    try {
      await resolveApartmentClaim({
        claimId: claim.id,
        reviewerId: auth.userId,
        approved,
      });
      setClaims((previous) => previous.filter((item) => item.id !== claim.id));
    } catch (error) {
      Alert.alert("Η ενέργεια απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setWorkingId(null);
    }
  };

  const handleReassign = async (lead: AgencyLead, target: AgencyStaffMember) => {
    if (!auth.userId || workingId) return;
    setWorkingId(lead.id);

    try {
      await reassignAgencyLead({
        leadId: lead.id,
        reviewerId: auth.userId,
        targetBrokerId: target.id,
      });
      setExpandedLeadId(null);
      await loadData();
    } catch (error) {
      Alert.alert("Η ανάθεση απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setWorkingId(null);
    }
  };

  const staffWorkloadMap = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach((lead) => {
      if (lead.status === "assigned" && lead.assignedBrokerId) {
        map[lead.assignedBrokerId] = (map[lead.assignedBrokerId] || 0) + 1;
      }
    });
    return map;
  }, [leads]);

  const assignedLeads = useMemo(
    () => leads.filter((lead) => lead.status === "assigned"),
    [leads],
  );
  const filteredAssignedLeads = useMemo(() => {
    if (leadFilter === "overdue") {
      return assignedLeads.filter((lead) => getLeadUrgency(lead).isOverdue);
    }
    if (leadFilter === "active") {
      return assignedLeads.filter((lead) => !getLeadUrgency(lead).isOverdue);
    }
    return assignedLeads;
  }, [assignedLeads, leadFilter]);
  const overdueLeads = useMemo(
    () => assignedLeads.filter((lead) => getLeadUrgency(lead).isOverdue),
    [assignedLeads],
  );
  const overdueCount = overdueLeads.length;

  if (!isExecutive) {
    return (
      <View style={styles.stateCenter}>
        <View style={styles.iconCircleMuted}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Περιορισμένη Πρόσβαση</Text>
        <Text style={styles.emptySubtitle}>
          Η διαχείριση του κεντρικού Pool ακινήτων και leads επιτρέπεται αποκλειστικά στη Γραμματεία και τον CEO του γραφείου.
        </Text>
      </View>
    );
  }

  const handleAutoReassignOverdue = async () => {
    if (!auth.userId || workingId || overdueLeads.length === 0 || staff.length === 0) return;

    const reviewerId = auth.userId;
    setWorkingId("bulk-overdue");
    try {
      const workload: Record<string, number> = { ...staffWorkloadMap };
      const assignments = overdueLeads.flatMap((lead) => {
        const eligibleStaff = staff.filter((member) => member.id !== lead.assignedBrokerId);
        const candidates = eligibleStaff.length > 0 ? eligibleStaff : staff;
        const target = [...candidates].sort(
          (left, right) => (workload[left.id] || 0) - (workload[right.id] || 0),
        )[0];
        if (!target) return [];
        workload[target.id] = (workload[target.id] || 0) + 1;
        return [{ lead, target }];
      });

      const results = await Promise.allSettled(
        assignments.map(({ lead, target }) => reassignAgencyLead({
          leadId: lead.id,
          reviewerId,
          targetBrokerId: target.id,
        })),
      );
      const successfulCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successfulCount;

      setExpandedLeadId(null);
      await loadData();
      if (successfulCount === 0 && failedCount > 0) {
        Alert.alert("Η ανακατανομή απέτυχε", "Δεν ολοκληρώθηκε καμία ανάθεση. Δοκιμάστε ξανά.");
      } else if (failedCount > 0) {
        Alert.alert("Η ανακατανομή ολοκληρώθηκε", `Ολοκληρώθηκε η ανακατανομή ${successfulCount} leads. ${failedCount} απέτυχαν.`);
      } else {
        Alert.alert("Η ανακατανομή ολοκληρώθηκε", `Ολοκληρώθηκε η ανακατανομή ${successfulCount} leads.`);
      }
    } catch (error) {
      Alert.alert("Η ανακατανομή απέτυχε", error instanceof Error ? error.message : "Δοκιμάστε ξανά.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <View style={styles.container} testID="secretariat-pool-management-screen">
      {/* Curved Elevated Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Εποπτεία Pool
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Έγκριση αναθέσεων ακινήτων και εποπτεία leads
            </Text>
          </View>
        </View>

        {/* Thick Segmented Pill Tabs */}
        <View style={styles.tabsContainer}>
          {loading ? (
            <>
              <SkeletonBox width="48%" height={36} borderRadius={radius.pill} />
              <SkeletonBox width="48%" height={36} borderRadius={radius.pill} />
            </>
          ) : (
            <>
              <Pressable
                style={[styles.tabButton, tab === "listings" && styles.tabButtonActive]}
                onPress={() => setTab("listings")}
                testID="secretariat-pool-listings-tab"
              >
                <Ionicons
                  name={tab === "listings" ? "home" : "home-outline"}
                  size={15}
                  color={tab === "listings" ? colors.onBrand : colors.onSurfaceTertiary}
                />
                <Text style={[styles.tabButtonText, tab === "listings" && styles.tabButtonTextActive]}>
                  Ακίνητα ({claims.length})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.tabButton, tab === "leads" && styles.tabButtonActive]}
                onPress={() => setTab("leads")}
                testID="secretariat-pool-leads-tab"
              >
                <Ionicons
                  name={tab === "leads" ? "people" : "people-outline"}
                  size={15}
                  color={tab === "leads" ? colors.onBrand : colors.onSurfaceTertiary}
                />
                <Text style={[styles.tabButtonText, tab === "leads" && styles.tabButtonTextActive]}>
                  Leads ({assignedLeads.length})
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {loading ? (
        <SecretariatPoolSkeleton tab={tab} styles={styles} insetsBottom={insets.bottom} />
      ) : tab === "listings" ? (
        <FadeInView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
          {/* Section: Pending Claim Requests */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Εκκρεμή Αιτήματα Ανάθεσης ({claims.length})
            </Text>
          </View>

          {claims.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyCardText}>
                Όλα τα αιτήματα ανάληψης έχουν διευθετηθεί.
              </Text>
            </View>
          ) : (
            claims.map((claim) => (
              <View key={claim.id} style={styles.claimCard} testID={`secretariat-claim-${claim.id}`}>
                <View style={styles.claimInfoColumn}>
                  <Text style={styles.claimApartmentTitle} numberOfLines={1}>
                    {claim.apartmentTitle || "Ακίνητο"}
                  </Text>
                  <View style={styles.brokerTag}>
                    <Ionicons name="person-outline" size={12} color={colors.brand} />
                    <Text style={styles.brokerTagText}>
                      Αίτημα από: {claim.brokerName}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtonCluster}>
                  <Pressable
                    style={[styles.claimActionBtn, styles.approveBtn]}
                    disabled={workingId === claim.id}
                    onPress={() => void handleResolveClaim(claim, true)}
                    hitSlop={6}
                    accessibilityLabel="Έγκριση ανάθεσης"
                  >
                    {workingId === claim.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </Pressable>

                  <Pressable
                    style={[styles.claimActionBtn, styles.rejectBtn]}
                    disabled={workingId === claim.id}
                    onPress={() => void handleResolveClaim(claim, false)}
                    hitSlop={6}
                    accessibilityLabel="Απόρριψη ανάθεσης"
                  >
                    <Ionicons name="close" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {/* Section: Agency Pool Inventory */}
          <View style={[styles.sectionHeaderRow, { marginTop: spacing.md }]}>
            <Text style={styles.sectionTitle}>
              Αποθετήριο Pool ({poolApartments.length})
            </Text>
          </View>

          {poolApartments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="business-outline" size={32} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyCardText}>Το pool του γραφείου είναι άδειο.</Text>
            </View>
          ) : (
            poolApartments.map((apartment) => {
              const isPending = Boolean(apartment.pendingClaimBrokerId);
              return (
                <View
                  key={apartment.id}
                  style={styles.poolInventoryRow}
                  testID={`secretariat-pool-listing-${apartment.id}`}
                >
                  <View style={styles.inventoryIconBox}>
                    <Ionicons
                      name={isPending ? "time-outline" : "home-outline"}
                      size={18}
                      color={isPending ? colors.warning : colors.brand}
                    />
                  </View>

                  <View style={styles.inventoryTextWrap}>
                    <Text style={styles.inventoryTitle} numberOfLines={1}>
                      {String(apartment.title || "Ακίνητο")}
                    </Text>
                    <Text style={styles.inventoryMeta} numberOfLines={1}>
                      {String(apartment.area || "")}
                      {apartment.city ? `, ${String(apartment.city)}` : ""}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      isPending ? styles.statusPillPending : styles.statusPillAvailable,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isPending ? colors.warning : colors.brand },
                      ]}
                    >
                      {isPending ? "Σε αίτημα" : "Διαθέσιμο"}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Section: Unassigned Leads Section */}
          <View style={styles.leadsPoolWrapper}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Αδιάθετα Leads Γραφείου</Text>
            </View>
            {auth.agencyId && auth.userId ? (
              <LeadsPoolSection
                agencyId={auth.agencyId}
                brokerId={auth.userId}
                onChanged={() => void loadData()}
              />
            ) : null}
          </View>
          </ScrollView>
        </FadeInView>
      ) : (
        /* Leads SubTab */
        <FadeInView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
          {overdueCount > 0 ? (
            <View style={styles.overdueActionBanner}>
              <View style={styles.overdueBannerIcon}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
              </View>
              <View style={styles.overdueBannerTextWrap}>
                <Text style={styles.overdueBannerTitle}>Υπάρχουν {overdueCount} leads σε αδράνεια</Text>
                <Text style={styles.overdueBannerSubtitle}>Αναθέστε τα αυτόματα στους λιγότερο φορτωμένους μεσίτες.</Text>
              </View>
              <Pressable
                style={styles.overdueActionButton}
                disabled={workingId !== null || staff.length === 0}
                onPress={() => void handleAutoReassignOverdue()}
                accessibilityLabel="Αυτόματη ανακατανομή ανενεργών leads"
              >
                {workingId === "bulk-overdue" ? (
                  <ActivityIndicator size="small" color={colors.onBrand} />
                ) : (
                  <Ionicons name="shuffle-outline" size={16} color={colors.onBrand} />
                )}
                <Text style={styles.overdueActionButtonText}>Αυτόματη ανάθεση</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              Ενεργές Αναθέσεις Leads ({assignedLeads.length})
            </Text>
          </View>

          <View style={styles.leadFilterRow}>
            <Pressable
              style={[styles.leadFilterChip, leadFilter === "all" && styles.leadFilterChipActive]}
              onPress={() => setLeadFilter("all")}
            >
              <Text style={[styles.leadFilterText, leadFilter === "all" && styles.leadFilterTextActive]}>
                Όλα ({assignedLeads.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.leadFilterChip, leadFilter === "overdue" && styles.leadFilterChipActiveOverdue]}
              onPress={() => setLeadFilter("overdue")}
            >
              <Ionicons name="alert-circle" size={13} color={leadFilter === "overdue" ? colors.onBrand : colors.error} />
              <Text style={[styles.leadFilterText, leadFilter === "overdue" && styles.leadFilterTextActiveOverdue]}>
                Σε αδράνεια ({overdueCount})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.leadFilterChip, leadFilter === "active" && styles.leadFilterChipActive]}
              onPress={() => setLeadFilter("active")}
            >
              <Text style={[styles.leadFilterText, leadFilter === "active" && styles.leadFilterTextActive]}>
                Ενεργά ({assignedLeads.length - overdueCount})
              </Text>
            </Pressable>
          </View>

          {filteredAssignedLeads.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyCardText}>
                {assignedLeads.length === 0 ? "Δεν υπάρχουν εκχωρημένα leads αυτή τη στιγμή." : "Δεν υπάρχουν leads σε αυτό το φίλτρο."}
              </Text>
            </View>
          ) : (
            filteredAssignedLeads.map((lead) => {
              const urgency = getLeadUrgency(lead);
              const isExpanded = expandedLeadId === lead.id;

              return (
                <View key={lead.id} style={styles.leadCard} testID={`secretariat-lead-${lead.id}`}>
                  <View style={styles.leadHeaderRow}>
                    <View style={styles.leadMainDetails}>
                      <Text style={styles.leadClientName} numberOfLines={1}>
                        {lead.clientName}
                      </Text>

                      <View style={styles.leadMetaRow}>
                        <Ionicons name="person-circle-outline" size={13} color={colors.onSurfaceTertiary} />
                        <Text style={styles.leadMetaText} numberOfLines={1}>
                          {lead.assignedBrokerId || "Χωρίς ανάθεση"}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      style={[styles.reassignToggleBtn, isExpanded && styles.reassignToggleBtnActive]}
                      onPress={() => setExpandedLeadId((prev) => (prev === lead.id ? null : lead.id))}
                      hitSlop={6}
                    >
                      <Ionicons
                        name="swap-horizontal"
                        size={14}
                        color={isExpanded ? colors.onBrand : colors.brand}
                      />
                      <Text
                        style={[
                          styles.reassignToggleText,
                          isExpanded && styles.reassignToggleTextActive,
                        ]}
                      >
                        Ανάθεση
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.urgencyContainer}>
                    <View style={styles.urgencyLabelRow}>
                    <View
                      style={[
                        styles.timerBadge,
                        urgency.isOverdue ? styles.timerBadgeOverdue : styles.timerBadgeActive,
                      ]}
                    >
                      <Ionicons
                        name={urgency.isOverdue ? "alert-circle-outline" : "timer-outline"}
                        size={12}
                        color={urgency.isOverdue ? colors.error : colors.warning}
                      />
                      <Text
                        style={[
                          styles.timerBadgeText,
                          { color: urgency.isOverdue ? colors.error : colors.warning },
                        ]}
                      >
                        {urgency.formattedTime}
                      </Text>
                    </View>
                      <Text style={styles.urgencyMetaText}>Περιθώριο 24 ωρών</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${urgency.progressPercent}%`,
                            backgroundColor: urgency.isOverdue ? colors.error : colors.warning,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <View style={styles.leadStatusBadges}>
                    <View style={styles.contactStatusBadge}>
                      <Ionicons
                        name={lead.lastContactTimestamp ? "chatbubble-ellipses-outline" : "close-circle-outline"}
                        size={12}
                        color={lead.lastContactTimestamp ? colors.success : colors.onSurfaceTertiary}
                      />
                      <Text
                        style={[
                          styles.contactStatusText,
                          { color: lead.lastContactTimestamp ? colors.success : colors.onSurfaceTertiary },
                        ]}
                      >
                        {lead.lastContactTimestamp ? "Υπάρχει επαφή" : "Χωρίς επαφή"}
                      </Text>
                    </View>
                  </View>

                  {/* Reassignment Dropdown Drawer */}
                  {isExpanded && (
                    <View style={styles.staffDropdownContainer}>
                      <Text style={styles.staffDropdownTitle}>Επιλέξτε μεσίτη για ανάθεση (ταξινόμηση κατά φόρτο):</Text>
                      {staff.length === 0 ? (
                        <Text style={styles.emptyInlineMuted}>
                          Δεν υπάρχουν διαθέσιμοι μεσίτες στο γραφείο.
                        </Text>
                      ) : (
                        [...staff]
                          .sort((left, right) => (staffWorkloadMap[left.id] || 0) - (staffWorkloadMap[right.id] || 0))
                          .map((member) => {
                            const activeLeads = staffWorkloadMap[member.id] || 0;
                            return (
                              <Pressable
                                key={member.id}
                                style={styles.staffOptionRow}
                                disabled={workingId !== null}
                                onPress={() => void handleReassign(lead, member)}
                              >
                                <View style={styles.staffAvatarPlaceholder}>
                                  <Ionicons name="person" size={13} color={colors.brand} />
                                </View>
                                <View style={styles.staffNameWrap}>
                                  <Text style={styles.staffOptionName} numberOfLines={1}>
                                    {member.name}
                                  </Text>
                                  <Text style={styles.staffWorkloadText}>
                                    {activeLeads === 0 ? "Διαθέσιμος (0 leads)" : `${activeLeads} ενεργά leads`}
                                  </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceTertiary} />
                              </Pressable>
                            );
                          })
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
          </ScrollView>
        </FadeInView>
      )}
    </View>
  );
}

function SecretariatPoolSkeleton({
  tab,
  styles,
  insetsBottom,
}: {
  tab: SubTab;
  styles: ReturnType<typeof createStyles>;
  insetsBottom: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_BOTTOM_SPACE + insetsBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {tab === "listings" ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <SkeletonBox width="58%" height={14} borderRadius={radius.sm} />
          </View>
          {Array.from({ length: 3 }, (_item, index) => (
            <View key={`claim-skeleton-${index}`} style={styles.claimCard}>
              <View style={styles.claimInfoColumn}>
                <SkeletonBox width="72%" height={16} borderRadius={radius.sm} />
                <SkeletonBox width="54%" height={12} borderRadius={radius.sm} />
              </View>
              <View style={styles.actionButtonCluster}>
                <SkeletonBox width={36} height={36} borderRadius={radius.pill} />
                <SkeletonBox width={36} height={36} borderRadius={radius.pill} />
              </View>
            </View>
          ))}

          <View style={[styles.sectionHeaderRow, { marginTop: spacing.md }]}>
            <SkeletonBox width="52%" height={14} borderRadius={radius.sm} />
          </View>
          {Array.from({ length: 2 }, (_item, index) => (
            <View key={`inventory-skeleton-${index}`} style={styles.poolInventoryRow}>
              <SkeletonBox width={36} height={36} borderRadius={radius.md} />
              <View style={styles.inventoryTextWrap}>
                <SkeletonBox width="76%" height={14} borderRadius={radius.sm} />
                <SkeletonBox width="52%" height={10} borderRadius={radius.sm} />
              </View>
              <SkeletonBox width={50} height={20} borderRadius={radius.pill} />
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={styles.sectionHeaderRow}>
            <SkeletonBox width="64%" height={14} borderRadius={radius.sm} />
          </View>
          <View style={styles.leadFilterRow}>
            <SkeletonBox width={62} height={32} borderRadius={radius.pill} />
            <SkeletonBox width={86} height={32} borderRadius={radius.pill} />
            <SkeletonBox width={72} height={32} borderRadius={radius.pill} />
          </View>
          {Array.from({ length: 3 }, (_item, index) => (
            <View key={`lead-skeleton-${index}`} style={styles.leadCard}>
              <View style={styles.leadHeaderRow}>
                <View style={styles.leadMainDetails}>
                  <SkeletonBox width="68%" height={16} borderRadius={radius.sm} />
                  <SkeletonBox width="48%" height={12} borderRadius={radius.sm} />
                </View>
                <SkeletonBox width={76} height={28} borderRadius={radius.pill} />
              </View>
              <View style={styles.urgencyContainer}>
                <View style={styles.urgencyLabelRow}>
                  <SkeletonBox width={82} height={20} borderRadius={radius.pill} />
                  <SkeletonBox width={88} height={10} borderRadius={radius.sm} />
                </View>
                <SkeletonBox width="100%" height={4} borderRadius={radius.pill} />
              </View>
              <View style={styles.leadStatusBadges}>
                <SkeletonBox width={92} height={22} borderRadius={radius.pill} />
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
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
      gap: spacing.sm,
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
    tabsContainer: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSecondary,
      padding: 3,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    tabButton: {
      flex: 1,
      height: 36,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    tabButtonActive: {
      backgroundColor: colors.brand,
    },
    tabButtonText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    tabButtonTextActive: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    overdueActionBanner: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      backgroundColor: "rgba(239, 68, 68, 0.08)",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.24)",
      gap: spacing.sm,
    },
    overdueBannerIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(239, 68, 68, 0.12)",
    },
    overdueBannerTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    overdueBannerTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    overdueBannerSubtitle: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    overdueActionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      borderRadius: radius.pill,
      backgroundColor: colors.error,
      gap: 4,
    },
    overdueActionButtonText: {
      fontFamily: fonts.bold,
      fontSize: 10,
      color: colors.onBrand,
    },
    sectionHeaderRow: {
      paddingVertical: spacing.xs,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
      letterSpacing: 0.2,
    },
    emptyCard: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
      marginVertical: spacing.xs,
    },
    emptyCardText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      textAlign: "center",
    },
    claimCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    claimInfoColumn: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    claimApartmentTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    brokerTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    brokerTagText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.brand,
    },
    actionButtonCluster: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    claimActionBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
    approveBtn: {
      backgroundColor: colors.success,
    },
    rejectBtn: {
      backgroundColor: colors.error,
    },
    poolInventoryRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm + 2,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    inventoryIconBox: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    inventoryTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    inventoryTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    inventoryMeta: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    statusPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    statusPillPending: {
      backgroundColor: "rgba(234, 179, 8, 0.12)",
    },
    statusPillAvailable: {
      backgroundColor: colors.brandTertiary,
    },
    statusPillText: {
      fontFamily: fonts.bold,
      fontSize: 10,
    },
    leadsPoolWrapper: {
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    leadCard: {
      padding: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    leadHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    leadMainDetails: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    leadClientName: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    leadMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    leadMetaText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
    },
    reassignToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: colors.surface,
    },
    reassignToggleBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    reassignToggleText: {
      fontFamily: fonts.bold,
      fontSize: 11,
      color: colors.brand,
    },
    reassignToggleTextActive: {
      color: colors.onBrand,
    },
    leadStatusBadges: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      flexWrap: "wrap",
    },
    leadFilterRow: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingHorizontal: 2,
      marginBottom: spacing.xs,
    },
    leadFilterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    leadFilterChipActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    leadFilterChipActiveOverdue: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    leadFilterText: {
      fontFamily: fonts.semibold,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
    },
    leadFilterTextActive: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
    },
    leadFilterTextActiveOverdue: {
      color: colors.onBrand,
      fontFamily: fonts.bold,
    },
    urgencyContainer: {
      marginTop: 4,
      gap: 3,
    },
    urgencyLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    urgencyMetaText: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    progressBarTrack: {
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTertiary,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: radius.pill,
    },
    timerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    timerBadgeActive: {
      backgroundColor: "rgba(234, 179, 8, 0.12)",
    },
    timerBadgeOverdue: {
      backgroundColor: "rgba(239, 68, 68, 0.12)",
    },
    timerBadgeText: {
      fontFamily: fonts.semibold,
      fontSize: 10,
    },
    contactStatusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    contactStatusText: {
      fontFamily: fonts.regular,
      fontSize: 10,
    },
    staffDropdownContainer: {
      marginTop: spacing.xs,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: spacing.xs,
    },
    staffDropdownTitle: {
      fontFamily: fonts.semibold,
      fontSize: 11,
      color: colors.onSurfaceTertiary,
      marginBottom: 2,
    },
    staffOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    staffAvatarPlaceholder: {
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    staffOptionName: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurface,
    },
    staffNameWrap: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    staffWorkloadText: {
      fontFamily: fonts.regular,
      fontSize: 10,
      color: colors.onSurfaceTertiary,
    },
    emptyInlineMuted: {
      fontFamily: fonts.regular,
      fontSize: fontSize.xs,
      color: colors.onSurfaceTertiary,
      fontStyle: "italic",
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