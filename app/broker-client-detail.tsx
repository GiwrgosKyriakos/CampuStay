import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import { type LossReasonKey, type PipelineStageKey } from "@/src/constants/pipeline";
import type { BrokerApartment } from "./(tabs)/broker";
import type { FilterSetPayload } from "@/src/types/filters";
import { calculateTenantCompatibilityScore, getCompatibilityDetails, type ListingFormData } from "@/src/utils/compatibilityScore";
import { t } from "@/src/locales";
import {
  addPropertyInteraction,
  subscribeClientInteractions,
  type InteractionType,
  type PropertyInteraction,
} from "@/src/api/propertyInteractions";
import { getBrokerClientDeals, upsertBrokerClientProfile } from "@/src/api/brokerClientProfiles";

export interface BrokerPropertyList {
  id: string;
  brokerId: string;
  clientUserId: string;
  title: string;
  apartmentIds: string[];
  createdAt: number;
  hasClientInteracted?: boolean;
}

type SharedSearchFilterSet = {
  id: string;
  title: string;
  data: FilterSetPayload;
};

export type LeadReadinessKey = "hot" | "warm" | "cold";
type ClientDetailSubView = "default" | "deal_stage" | "lead_readiness" | "purchasing_power";

const CLEAN_PIPELINE_STAGES = [
  { key: "new_lead", label: "Νέο Lead", percentage: 10, probability: 0.1 },
  { key: "showing_scheduled", label: "Προγραμματισμένη Υπόδειξη", percentage: 40, probability: 0.4 },
  { key: "offer_made", label: "Κατάθεση Προσφοράς", percentage: 60, probability: 0.6 },
  { key: "closed_won", label: "Ολοκλήρωση Συμφωνίας", percentage: 100, probability: 1 },
  { key: "closed_lost", label: "Χάθηκε / Ακυρώθηκε", percentage: 0, probability: 0 },
] as const;

type CleanPipelineStageKey = typeof CLEAN_PIPELINE_STAGES[number]["key"];

export interface ClientInteractedPropertyDeal {
  apartmentId: string;
  title: string;
  image: string;
  rent: number;
  area: string;
  city: string;
  compatibilityScore: number;
  pipelineStage: CleanPipelineStageKey;
  interactionType: "liked" | "chat" | "both";
  dealCommission: number;
}

function normalizePipelineStage(value: unknown): CleanPipelineStageKey {
  switch (value) {
    case "liked":
    case "lead":
    case "new_lead":
      return "new_lead";
    case "showing_planned":
    case "showing_completed":
    case "showing_scheduled":
      return "showing_scheduled";
    case "offer":
    case "negotiation_agreement":
    case "offer_made":
      return "offer_made";
    case "deal_closed":
    case "closed_won":
      return "closed_won";
    case "lost":
    case "closed_lost":
      return "closed_lost";
    default:
      return "new_lead";
  }
}

function getPropertyDealStageTone(stage: CleanPipelineStageKey, colors: ThemeColors) {
  if (stage === "closed_won") return { backgroundColor: "rgba(16,185,129,0.14)", textColor: "#059669" };
  if (stage === "closed_lost") return { backgroundColor: "rgba(239,68,68,0.12)", textColor: "#DC2626" };
  if (stage === "offer_made") return { backgroundColor: "rgba(245,158,11,0.14)", textColor: "#D97706" };
  if (stage === "showing_scheduled") return { backgroundColor: colors.brandTertiary, textColor: colors.brand };
  return { backgroundColor: colors.surfaceTertiary, textColor: colors.onSurface };
}

export interface LeadReadinessOption {
  key: LeadReadinessKey;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}

export const LEAD_READINESS_OPTIONS: LeadReadinessOption[] = [
  { key: "hot", label: "brokerClient.readiness.hot", iconName: "flame", iconColor: "#EF4444" },
  { key: "warm", label: "brokerClient.readiness.warm", iconName: "sunny", iconColor: "#F59E0B" },
  { key: "cold", label: "brokerClient.readiness.cold", iconName: "snow", iconColor: "#38BDF8" },
];

type InteractionTypeMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
};

function getTypeMeta(type: InteractionType, colors: ThemeColors): InteractionTypeMeta {
  switch (type) {
    case "call":
      return { icon: "call-outline", color: "#10B981", bg: "rgba(16,185,129,0.12)", label: "Κλήση" };
    case "showing":
      return { icon: "key-outline", color: colors.brand, bg: colors.brandTertiary, label: "Υπόδειξη" };
    case "email":
      return { icon: "mail-outline", color: "#38BDF8", bg: "rgba(56,189,248,0.12)", label: "Email" };
    case "comment":
    default:
      return { icon: "chatbubble-ellipses-outline", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: "Σχόλιο" };
  }
}

const INTERACTION_TYPES: InteractionType[] = ["call", "showing", "comment", "email"];

function formatDateTime(millis: number): string {
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

export interface ClientPurchasingPowerData {
  cashOnHand?: number | null;
  approvedMortgage?: number | null;
  moveInDeadline?: string;
  purchasePurpose?: string;
  updatedAt?: number;
  pipelineStage?: PipelineStageKey;
  stageUpdatedAt?: number;
  dealCommission?: number;
  lossReason?: LossReasonKey;
  lossCustomReason?: string;
  lossApartmentId?: string;
  lossApartmentTitle?: string;
  lossReportedAt?: number;
  brokerId?: string;
  clientUserId?: string;
  clientName?: string;
  chatRoomId?: string;
  leadReadiness?: LeadReadinessKey | null;
  activeApartmentId?: string | null;
  activeApartmentTitle?: string | null;
  sharedSearchQueries?: string[];
  sharedSearchFilterSets?: { id: string; title: string; data: FilterSetPayload }[];
}

export default function BrokerClientDetailScreen() {
  const insets = useSafeAreaInsets(); const router = useRouter(); const auth = useAuth(); const params = useLocalSearchParams<{ clientUserId?: string; clientName?: string; clientAvatar?: string; chatRoomId?: string; sharedFilterSet?: string }>(); const { colors } = useTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const [brokerManagedApartments, setBrokerManagedApartments] = useState<BrokerApartment[]>([]); const [loading, setLoading] = useState(true);
  const [activeSubView, setActiveSubView] = useState<ClientDetailSubView>("default");
  const [cashOnHand, setCashOnHand] = useState("");
  const [approvedMortgage, setApprovedMortgage] = useState("");
  const [moveInDeadline, setMoveInDeadline] = useState("");
  const [purchasePurpose, setPurchasePurpose] = useState("");
  const [savingPurchasingPower, setSavingPurchasingPower] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<CleanPipelineStageKey>("new_lead");
  const [stageUpdatedAt, setStageUpdatedAt] = useState(Date.now());
  const [leadReadiness, setLeadReadiness] = useState<LeadReadinessKey | null>(null);
  const [activeApartmentId, setActiveApartmentId] = useState<string | null>(null);
  const [isLossModalVisible, setIsLossModalVisible] = useState(false);
  const [lossReason, setLossReason] = useState<LossReasonKey>("high_price");
  const [lossCustomReason, setLossCustomReason] = useState("");
  const [lossApartmentId, setLossApartmentId] = useState<string | undefined>();
  const [lossApartmentTitle, setLossApartmentTitle] = useState<string | undefined>();
  const [expandedScoreListingId, setExpandedScoreListingId] = useState<string | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [selectedApartmentIds, setSelectedApartmentIds] = useState<Set<string>>(new Set());
  const [savedPropertyLists, setSavedPropertyLists] = useState<BrokerPropertyList[]>([]);
  const [isNameListModalVisible, setIsNameListModalVisible] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [shareFeedbackModal, setShareFeedbackModal] = useState<{ visible: boolean; title: string; description: string } | null>(null);
  const [interactions, setInteractions] = useState<PropertyInteraction[]>([]);
  const [selectedApartmentFilter, setSelectedApartmentFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<InteractionType | "all">("all");
  const [addInteractionModalVisible, setAddInteractionModalVisible] = useState(false);
  const [newInteractionType, setNewInteractionType] = useState<InteractionType>("call");
  const [newInteractionApartmentId, setNewInteractionApartmentId] = useState("");
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [isSavingInteraction, setIsSavingInteraction] = useState(false);
  const [clientPropertyDeals, setClientPropertyDeals] = useState<ClientInteractedPropertyDeal[]>([]);
  const [loadingPropertyDeals, setLoadingPropertyDeals] = useState(false);
  const [editingDealStageAptId, setEditingDealStageAptId] = useState<string | null>(null);
  const [sharedSearchQueries, setSharedSearchQueries] = useState<string[]>([]);
  const [sharedSearchFilterSets, setSharedSearchFilterSets] = useState<SharedSearchFilterSet[]>([]);
  const [selectedFilterSetId, setSelectedFilterSetId] = useState<string | null>(null);
  const filters = useMemo<FilterSetPayload | null>(() => { try { return params.sharedFilterSet ? JSON.parse(params.sharedFilterSet) as FilterSetPayload : null; } catch { return null; } }, [params.sharedFilterSet]);
  const activeFilterSet = useMemo(
    () => sharedSearchFilterSets.find((filterSet) => filterSet.id === selectedFilterSetId)?.data ?? filters,
    [filters, selectedFilterSetId, sharedSearchFilterSets],
  );
  const rankedPortfolio = useMemo(() => {
    const normalizedCity = activeFilterSet?.cityQuery?.trim().toLocaleLowerCase() || "";
    const filterWithBudget = activeFilterSet as (FilterSetPayload & { budget?: number | string }) | null;
    const maximumRent = Number(filterWithBudget?.rentMax ?? filterWithBudget?.budget ?? Number.POSITIVE_INFINITY);
    return brokerManagedApartments
      .filter((apartment) => {
        if (!activeFilterSet) return true;
        const cityMatches = !normalizedCity || apartment.city.trim().toLocaleLowerCase() === normalizedCity;
        const budgetMatches = !Number.isFinite(maximumRent) || apartment.rent <= maximumRent;
        return cityMatches && budgetMatches;
      })
      .map((apartment) => {
        const listingData: ListingFormData = {
          city: apartment.city,
          area: apartment.area,
          latitude: typeof apartment.latitude === "number" ? apartment.latitude : undefined,
          longitude: typeof apartment.longitude === "number" ? apartment.longitude : undefined,
          rent: apartment.rent,
          size: apartment.size,
          floor: typeof apartment.floor === "string" || typeof apartment.floor === "number" ? apartment.floor : undefined,
          petFriendly: apartment.tags?.includes("pet_friendly") || false,
          nearMetro: apartment.tags?.includes("near_metro") || false,
          tags: apartment.tags,
          amenities: Array.isArray(apartment.amenities) ? apartment.amenities.filter((item): item is string => typeof item === "string") : undefined,
          propertyType: typeof apartment.propertyType === "string" ? apartment.propertyType : undefined,
          propertyCategory: typeof apartment.propertyCategory === "string" ? apartment.propertyCategory : undefined,
        };
        const scoreBreakdown = getCompatibilityDetails(listingData, activeFilterSet);
        return { ...apartment, compatibilityScore: scoreBreakdown.score, scoreBreakdown };
      })
      .sort((first, second) => second.compatibilityScore - first.compatibilityScore);
  }, [activeFilterSet, brokerManagedApartments]);
  const availableApartmentOptions = useMemo(() => {
    const apartmentMap = new Map<string, string>();
    brokerManagedApartments.forEach((apartment) => apartmentMap.set(apartment.id, apartment.title));
    interactions.forEach((interaction) => {
      if (interaction.apartmentId && !apartmentMap.has(interaction.apartmentId)) {
        apartmentMap.set(interaction.apartmentId, interaction.apartmentTitle || "Ακίνητο");
      }
    });
    return Array.from(apartmentMap.entries()).map(([id, title]) => ({ id, title }));
  }, [brokerManagedApartments, interactions]);
  const interactionMetrics = useMemo(() => {
    const filteredByApartment = selectedApartmentFilter === "all"
      ? interactions
      : interactions.filter((interaction) => interaction.apartmentId === selectedApartmentFilter);
    return {
      calls: filteredByApartment.filter((interaction) => interaction.type === "call").length,
      showings: filteredByApartment.filter((interaction) => interaction.type === "showing").length,
      comments: filteredByApartment.filter((interaction) => interaction.type === "comment").length,
      emails: filteredByApartment.filter((interaction) => interaction.type === "email").length,
    };
  }, [interactions, selectedApartmentFilter]);
  const visibleInteractions = useMemo(
    () => interactions.filter((interaction) => {
      const matchesApartment = selectedApartmentFilter === "all" || interaction.apartmentId === selectedApartmentFilter;
      const matchesType = selectedTypeFilter === "all" || interaction.type === selectedTypeFilter;
      return matchesApartment && matchesType;
    }),
    [interactions, selectedApartmentFilter, selectedTypeFilter],
  );
  useEffect(() => {
    if (!auth.userId || !params.clientUserId) {
      setSavedPropertyLists([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const snapshot = await getDocs(collection(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`, "propertyLists"));
        if (!active) return;
        const lists = snapshot.docs.map((item) => {
          const data = item.data() as Partial<BrokerPropertyList>;
          return {
            id: item.id,
            brokerId: data.brokerId || auth.userId!,
            clientUserId: data.clientUserId || params.clientUserId!,
            title: data.title || t("brokerClient.listNameModalTitle"),
            apartmentIds: Array.isArray(data.apartmentIds) ? data.apartmentIds.filter((id): id is string => typeof id === "string") : [],
            createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            hasClientInteracted: data.hasClientInteracted === true,
          };
        }).sort((first, second) => second.createdAt - first.createdAt);
        if (!params.chatRoomId) {
          setSavedPropertyLists(lists);
          return;
        }

        const messagesSnapshot = await getDocs(collection(db, "chats", params.chatRoomId, "messages"));
        const feedbackByListId = new Map<string, boolean>();
        messagesSnapshot.docs.forEach((message) => {
          const data = message.data() as { listId?: unknown; hasClientInteracted?: boolean; proposalFeedback?: Record<string, unknown> };
          if (typeof data.listId !== "string") return;
          const hasFeedback = !!data.proposalFeedback && Object.keys(data.proposalFeedback).length > 0;
          feedbackByListId.set(data.listId, data.hasClientInteracted === true || hasFeedback);
        });
        if (active) setSavedPropertyLists(lists.map((list) => ({ ...list, hasClientInteracted: list.hasClientInteracted === true || feedbackByListId.get(list.id) === true })));
      } catch (error) {
        console.warn("[BrokerClientDetail] Error loading property lists:", error);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, params.chatRoomId, params.clientUserId]);
  useEffect(() => { let active = true; if (!auth.userId) return; void Promise.all([getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))), getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", auth.userId)))]).then(([ownedSnapshot, assignedSnapshot]) => { const listingDocs = new Map(ownedSnapshot.docs.map((item) => [item.id, item])); assignedSnapshot.docs.forEach((item) => listingDocs.set(item.id, item)); const mapped = Array.from(listingDocs.values()).map((item) => { const data = item.data() as Record<string, unknown>; return { ...data, id: item.id, title: String(data.title ?? "Ακίνητο"), rent: Number(data.rent ?? data.price ?? 0), city: String(data.city ?? ""), area: String(data.area ?? ""), size: Number(data.size ?? 0), image: String(data.image ?? data.imageUrl ?? ""), tags: Array.isArray(data.tags) ? data.tags.map(String) : [] } as BrokerApartment; }); if (active) setBrokerManagedApartments(mapped); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [auth.userId]);
  useEffect(() => {
    if (!params.clientUserId) {
      setInteractions([]);
      setSelectedApartmentFilter("all");
      setSelectedTypeFilter("all");
      return;
    }

    setSelectedApartmentFilter("all");
    setSelectedTypeFilter("all");
    return subscribeClientInteractions(params.clientUserId, setInteractions);
  }, [params.clientUserId]);
  useEffect(() => {
    if (!auth.userId || !params.clientUserId || brokerManagedApartments.length === 0) {
      setClientPropertyDeals([]);
      setLoadingPropertyDeals(false);
      return;
    }

    let active = true;
    setLoadingPropertyDeals(true);
    void (async () => {
      try {
        const [deals, likesSnapshot, chatsSnapshot] = await Promise.all([
          getBrokerClientDeals(auth.userId!, params.clientUserId!),
          getDocs(query(collection(db, "liked_apartments"), where("userId", "==", params.clientUserId))),
          getDocs(query(collection(db, "chats"), where("users", "array-contains", params.clientUserId), where("type", "==", "host"))),
        ]);

        const likedApartmentIds = new Set(
          likesSnapshot.docs
            .map((snapshot) => snapshot.data().apartmentId)
            .filter((apartmentId): apartmentId is string => typeof apartmentId === "string" && apartmentId.length > 0),
        );
        const chattedApartmentIds = new Set(
          chatsSnapshot.docs
            .map((snapshot) => snapshot.data().apartmentId)
            .filter((apartmentId): apartmentId is string => typeof apartmentId === "string" && apartmentId.length > 0),
        );
        const apartmentById = new Map(brokerManagedApartments.map((apartment) => [apartment.id, apartment]));
        const dealByApartmentId = new Map(deals.map((deal) => [deal.apartmentId, deal]));
        const interactedApartmentIds = new Set([...likedApartmentIds, ...chattedApartmentIds]);
        const rows: ClientInteractedPropertyDeal[] = [];

        interactedApartmentIds.forEach((apartmentId) => {
          const apartment = apartmentById.get(apartmentId);
          if (!apartment) return;

          const isLiked = likedApartmentIds.has(apartmentId);
          const isChatted = chattedApartmentIds.has(apartmentId);
          const listingData: ListingFormData = {
            city: apartment.city,
            area: apartment.area,
            latitude: typeof apartment.latitude === "number" ? apartment.latitude : undefined,
            longitude: typeof apartment.longitude === "number" ? apartment.longitude : undefined,
            rent: apartment.rent,
            size: apartment.size,
            floor: typeof apartment.floor === "string" || typeof apartment.floor === "number" ? apartment.floor : undefined,
            petFriendly: apartment.tags.includes("pet_friendly"),
            nearMetro: apartment.tags.includes("near_metro"),
            tags: apartment.tags,
            amenities: Array.isArray(apartment.amenities) ? apartment.amenities.filter((item): item is string => typeof item === "string") : undefined,
            propertyType: typeof apartment.propertyType === "string" ? apartment.propertyType : undefined,
            propertyCategory: typeof apartment.propertyCategory === "string" ? apartment.propertyCategory : undefined,
          };
          rows.push({
            apartmentId,
            title: apartment.title,
            image: apartment.image,
            rent: apartment.rent,
            area: apartment.area,
            city: apartment.city,
            compatibilityScore: filters ? calculateTenantCompatibilityScore(listingData, filters) : 0,
            pipelineStage: normalizePipelineStage(dealByApartmentId.get(apartmentId)?.pipelineStage),
            interactionType: isLiked && isChatted ? "both" : isLiked ? "liked" : "chat",
            dealCommission: apartment.rent,
          });
        });

        if (active) setClientPropertyDeals(rows);
      } catch (error) {
        console.error("[BrokerClientDetail] Error loading property deals:", error);
        if (active) setClientPropertyDeals([]);
      } finally {
        if (active) setLoadingPropertyDeals(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.userId, brokerManagedApartments, filters, params.clientUserId]);
  useEffect(() => {
    if (!auth.userId || !params.clientUserId) return;
    let active = true;
    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`));
        if (!snapshot.exists() || !active) return;
        const data = snapshot.data() as ClientPurchasingPowerData;
        setCashOnHand(typeof data.cashOnHand === "number" ? String(data.cashOnHand) : "");
        setApprovedMortgage(typeof data.approvedMortgage === "number" ? String(data.approvedMortgage) : "");
        setMoveInDeadline(data.moveInDeadline || "");
        setPurchasePurpose(data.purchasePurpose || "");
        setPipelineStage(normalizePipelineStage(data.pipelineStage));
        setLeadReadiness(data.leadReadiness ?? null);
        setActiveApartmentId(data.activeApartmentId ?? null);
        setStageUpdatedAt(typeof data.stageUpdatedAt === "number" ? data.stageUpdatedAt : Date.now());
        setLossReason(data.lossReason ?? "high_price");
        setLossCustomReason(data.lossCustomReason ?? "");
        setLossApartmentId(data.lossApartmentId);
        setLossApartmentTitle(data.lossApartmentTitle);
        setSharedSearchQueries(Array.isArray(data.sharedSearchQueries) ? data.sharedSearchQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0) : []);
        setSharedSearchFilterSets(Array.isArray(data.sharedSearchFilterSets) ? data.sharedSearchFilterSets.filter((filterSet): filterSet is SharedSearchFilterSet => Boolean(filterSet && typeof filterSet.id === "string" && typeof filterSet.title === "string" && filterSet.data && typeof filterSet.data === "object")) : []);
      } catch (error) {
        console.error("[BrokerClientDetail] Error loading purchasing power:", error);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, params.clientUserId]);

  useEffect(() => {
    if (!params.chatRoomId) return;
    void getDoc(doc(db, "chats", params.chatRoomId)).then((snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as { apartmentId?: unknown; apartmentTitle?: unknown };
      setLossApartmentId(typeof data.apartmentId === "string" ? data.apartmentId : undefined);
      setLossApartmentTitle(typeof data.apartmentTitle === "string" ? data.apartmentTitle : undefined);
    }).catch((error) => console.warn("[BrokerClientDetail] Could not load chat metadata for loss report:", error));
  }, [params.chatRoomId]);

  const currentStageConfig = CLEAN_PIPELINE_STAGES.find((stage) => stage.key === pipelineStage) ?? CLEAN_PIPELINE_STAGES[0];
  const selectedReadinessOption = LEAD_READINESS_OPTIONS.find((option) => option.key === leadReadiness);
  const realBudget = (Number(cashOnHand) || 0) + (Number(approvedMortgage) || 0);
  const elapsedDays = Math.max(0, Math.floor((Date.now() - stageUpdatedAt) / (1000 * 60 * 60 * 24)));
  const isStagnant = currentStageConfig.probability >= 0.5 && currentStageConfig.probability < 1 && elapsedDays >= 5;
  const stagnationColor = elapsedDays >= 10 ? "#EF4444" : elapsedDays >= 7 ? "#F97316" : "#EAB308";
  const stagnationIcon = elapsedDays >= 10 ? "warning-outline" : "alert-circle-outline";

  const handleUpdatePropertyDealStage = async (apartmentId: string, nextStage: CleanPipelineStageKey) => {
    if (!auth.userId || !params.clientUserId) return;
    const apartment = brokerManagedApartments.find((item) => item.id === apartmentId);
    const previousStage = clientPropertyDeals.find((item) => item.apartmentId === apartmentId)?.pipelineStage;
    setClientPropertyDeals((previous) => previous.map((item) => item.apartmentId === apartmentId ? { ...item, pipelineStage: nextStage } : item));
    setEditingDealStageAptId(null);

    try {
      await upsertBrokerClientProfile({
        brokerId: auth.userId,
        clientId: params.clientUserId,
        clientName: params.clientName || t("brokerClient.clientFallback"),
        role: "client",
        apartmentId,
        apartmentTitle: apartment?.title,
        rent: apartment?.rent,
        pipelineStage: nextStage,
      });
    } catch (error) {
      console.error("[BrokerClientDetail] Failed to update property deal stage:", error);
      if (previousStage) {
        setClientPropertyDeals((previous) => previous.map((item) => item.apartmentId === apartmentId ? { ...item, pipelineStage: previousStage } : item));
      }
    }
  };

  const handleSelectReadiness = async (key: LeadReadinessKey | null) => {
    if (!auth.userId || !params.clientUserId) return;
    setLeadReadiness(key);
    setActiveSubView("default");
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        leadReadiness: key,
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving lead readiness:", error);
    }
  };

  const handleSaveLossReport = async () => {
    if (!auth.userId || !params.clientUserId) return;
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        lossReason,
        ...(lossReason === "other" && lossCustomReason.trim() ? { lossCustomReason: lossCustomReason.trim() } : { lossCustomReason: null }),
        lossApartmentId: lossApartmentId ?? null,
        lossApartmentTitle: lossApartmentTitle ?? null,
        lossReportedAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });
      setIsLossModalVisible(false);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving closed-lost analysis:", error);
    }
  };

  const handleSavePurchasingPower = async () => {
    if (!auth.userId || !params.clientUserId || savingPurchasingPower) return;
    setSavingPurchasingPower(true);
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        cashOnHand: cashOnHand.trim().length > 0 ? Number(cashOnHand.replace(/[^0-9]/g, "")) : null,
        approvedMortgage: approvedMortgage.trim().length > 0 ? Number(approvedMortgage.replace(/[^0-9]/g, "")) : null,
        moveInDeadline: moveInDeadline.trim(),
        purchasePurpose: purchasePurpose.trim(),
        updatedAt: Date.now(),
      }, { merge: true });
      setActiveSubView("default");
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving purchasing power to brokerClientProfiles (permission or network issue):", error);
    } finally {
      setSavingPurchasingPower(false);
    }
  };
  const handleSetActiveApartment = async (apartment: BrokerApartment) => {
    if (!auth.userId || !params.clientUserId) return;
    const isCurrentActive = activeApartmentId === apartment.id;
    const nextActiveId = isCurrentActive ? null : apartment.id;
    const nextActiveTitle = isCurrentActive ? null : apartment.title;
    setActiveApartmentId(nextActiveId);
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        activeApartmentId: nextActiveId,
        activeApartmentTitle: nextActiveTitle,
        updatedAt: Date.now(),
      }, { merge: true });
      if (params.chatRoomId) {
        await setDoc(doc(db, "chats", params.chatRoomId), {
          apartmentId: nextActiveId,
          apartmentTitle: nextActiveTitle,
          type: nextActiveId ? "host" : "roommate",
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (error) {
      console.error("[BrokerClientDetail] Error setting active apartment:", error);
    }
  };
  const handleSavePropertyList = async () => {
    if (!auth.userId || !params.clientUserId || selectedApartmentIds.size === 0 || savingList) return;
    setSavingList(true);
    const title = newListName.trim() || t("brokerClient.createList", { count: selectedApartmentIds.size });
    const createdAt = Date.now();
    try {
      const listRef = await addDoc(
        collection(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`, "propertyLists"),
        { brokerId: auth.userId, clientUserId: params.clientUserId, title, apartmentIds: Array.from(selectedApartmentIds), createdAt },
      );
      setSavedPropertyLists((previous) => [{ id: listRef.id, brokerId: auth.userId!, clientUserId: params.clientUserId!, title, apartmentIds: Array.from(selectedApartmentIds), createdAt }, ...previous]);
      setSelectedApartmentIds(new Set());
      setIsCreatingList(false);
      setIsNameListModalVisible(false);
      setNewListName("");
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving property list:", error);
    } finally {
      setSavingList(false);
    }
  };
  const handleSendListToChat = async (list: BrokerPropertyList) => {
    if (!auth.userId || !params.chatRoomId) return;
    const previewImages = list.apartmentIds
      .map((id) => rankedPortfolio.find((apartment) => apartment.id === id)?.image)
      .filter((image): image is string => !!image)
      .slice(0, 3);
    const finalNoticeText = `[Κοινοποίηση Λίστας Ακινήτων: ${list.title}]`;
    try {
      await addDoc(collection(db, "chats", params.chatRoomId, "messages"), {
        senderId: auth.userId,
        type: "property_list_share",
        listId: list.id,
        listTitle: list.title,
        apartmentIds: list.apartmentIds,
        apartmentCount: list.apartmentIds.length,
        previewImages,
        text: t("brokerClient.listShareMessage", { title: list.title }),
        createdAt: serverTimestamp(),
        isRead: false,
      });
      await setDoc(doc(db, "chats", params.chatRoomId), {
        lastMessage: finalNoticeText,
        lastMessageText: finalNoticeText,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setShareFeedbackModal({
        visible: true,
        title: "Η λίστα κοινοποιήθηκε!",
        description: `Η λίστα «${list.title}» στάλθηκε επιτυχώς στη συνομιλία με τον πελάτη.`,
      });
    } catch (error) {
      console.error("[BrokerClientDetail] Error sharing property list:", error);
      setShareFeedbackModal({
        visible: true,
        title: "Αποτυχία κοινοποίησης",
        description: "Δεν ήταν δυνατή η αποστολή της λίστας στη συνομιλία. Παρακαλώ δοκιμάστε ξανά.",
      });
    }
  };
  const handleSaveInteraction = async () => {
    if (!auth.userId || !params.clientUserId || !newInteractionApartmentId || !newInteractionNote.trim() || isSavingInteraction) return;
    const apartment = availableApartmentOptions.find((item) => item.id === newInteractionApartmentId);
    if (!apartment) return;

    setIsSavingInteraction(true);
    try {
      await addPropertyInteraction({
        apartmentId: apartment.id,
        apartmentTitle: apartment.title,
        clientId: params.clientUserId,
        clientName: params.clientName || t("brokerClient.clientFallback"),
        type: newInteractionType,
        note: newInteractionNote.trim(),
        loggedByUserId: auth.userId,
      });
      setNewInteractionType("call");
      setNewInteractionApartmentId("");
      setNewInteractionNote("");
      setAddInteractionModalVisible(false);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving property interaction:", error);
      setShareFeedbackModal({
        visible: true,
        title: t("common.messages.tryAgain"),
        description: "Δεν ήταν δυνατή η αποθήκευση της αλληλεπίδρασης.",
      });
    } finally {
      setIsSavingInteraction(false);
    }
  };
  return <View style={[styles.container, { paddingTop: insets.top }]} testID="broker-client-detail-screen">
    <View style={[styles.headerRow, { paddingTop: spacing.sm }]}>
      <Pressable style={styles.headerBackBtn} onPress={() => router.back()} hitSlop={8} testID="broker-client-back-btn">
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{t("brokerClient.headerTitle")}</Text>
      <View style={styles.headerActionsGroup}>
        <Pressable
          style={[styles.headerActionBtn, activeSubView === "deal_stage" && styles.headerActionBtnActive]}
          onPress={() => setActiveSubView((previous) => previous === "deal_stage" ? "default" : "deal_stage")}
          hitSlop={6}
          testID="broker-client-toggle-deal-stage"
        >
          <Ionicons color={activeSubView === "deal_stage" ? colors.onBrand : colors.onSurface} name="trending-up-outline" size={18} />
        </Pressable>
        <Pressable
          style={[styles.headerActionBtn, activeSubView === "lead_readiness" && styles.headerActionBtnActive]}
          onPress={() => setActiveSubView((previous) => previous === "lead_readiness" ? "default" : "lead_readiness")}
          hitSlop={6}
          testID="broker-client-toggle-readiness"
        >
          <Ionicons color={activeSubView === "lead_readiness" ? colors.onBrand : colors.onSurface} name="speedometer-outline" size={18} />
        </Pressable>
        <Pressable
          style={[styles.headerActionBtn, activeSubView === "purchasing_power" && styles.headerActionBtnActive]}
          onPress={() => setActiveSubView((previous) => previous === "purchasing_power" ? "default" : "purchasing_power")}
          hitSlop={6}
          testID="broker-client-toggle-purchasing-power"
        >
          <Ionicons color={activeSubView === "purchasing_power" ? colors.onBrand : colors.onSurface} name="wallet-outline" size={18} />
        </Pressable>
      </View>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        {params.clientAvatar ? <Image source={{ uri: params.clientAvatar }} style={styles.avatar} /> : <DefaultProfileAvatar size={64} iconSize={28} />}
        <Text numberOfLines={1} style={styles.clientName}>{params.clientName || t("brokerClient.clientFallback")}</Text>
        <Pressable style={styles.chatButton} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: params.clientUserId || "", chatRoomId: params.chatRoomId || "" } })} testID="broker-client-open-chat">
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onBrand} />
          <Text style={styles.chatButtonText}>{t("brokerClient.goToChat")}</Text>
        </Pressable>
        <View style={styles.singleLineStatusRow}>
          <View style={[styles.statusPillItem, styles.statusPillFlex]}>
            <Ionicons color={colors.brand} name="layers-outline" size={13} />
            <Text numberOfLines={1} style={[styles.statusPillText, { color: colors.brand }]}>{`${currentStageConfig.label} (${currentStageConfig.percentage}%)`}</Text>
          </View>
          <View style={[styles.statusIconPill, selectedReadinessOption ? { backgroundColor: `${selectedReadinessOption.iconColor}18` } : null]}>
            <Ionicons color={selectedReadinessOption?.iconColor ?? colors.onSurfaceTertiary} name={selectedReadinessOption?.iconName ?? "speedometer-outline"} size={16} />
          </View>
          <View style={[styles.statusPillItem, styles.statusPillFlex]}>
            <Ionicons color="#FFFFFF" name="wallet-outline" size={13} />
            <Text numberOfLines={1} style={[styles.statusPillText, { color: "#FFFFFF" }]}>{realBudget > 0 ? `€${realBudget.toLocaleString("el-GR")}/mo` : "— €"}</Text>
          </View>
        </View>
      </View>
      {activeSubView === "deal_stage" ? (
        <View style={styles.inPlaceSectionCard} testID="broker-client-property-deals-section">
          <View style={styles.inPlaceHeaderRow}>
            <View style={styles.inPlaceTitleWithIcon}>
              <Ionicons color={colors.brand} name="trending-up-outline" size={20} />
              <Text style={styles.inPlaceTitle}>Ακίνητα Ενδιαφέροντος &amp; Pipeline</Text>
            </View>
            <Pressable onPress={() => setActiveSubView("default")} hitSlop={8}>
              <Ionicons color={colors.onSurfaceTertiary} name="close-circle-outline" size={22} />
            </Pressable>
          </View>
          {loadingPropertyDeals ? (
            <ActivityIndicator color={colors.brand} size="small" />
          ) : clientPropertyDeals.length === 0 ? (
            <View style={styles.emptyFilterBox}>
              <Ionicons color={colors.onSurfaceTertiary} name="home-outline" size={22} />
              <Text style={styles.emptyFilterText}>Δεν υπάρχουν ακόμη ακίνητα στα οποία να έχει εκδηλώσει ενδιαφέρον ο πελάτης (Likes ή Μηνύματα).</Text>
            </View>
          ) : (
            <View style={styles.propertyDealsList}>
              {clientPropertyDeals.map((item) => {
                const stage = CLEAN_PIPELINE_STAGES.find((option) => option.key === item.pipelineStage) ?? CLEAN_PIPELINE_STAGES[0];
                const stageTone = getPropertyDealStageTone(item.pipelineStage, colors);
                const isEditing = editingDealStageAptId === item.apartmentId;
                return (
                  <View key={item.apartmentId} style={styles.propertyDealCard}>
                    <View style={styles.propertyDealTopRow}>
                      {item.image ? <Image source={{ uri: item.image }} contentFit="cover" style={styles.propertyDealThumb} /> : <View style={styles.propertyDealThumb}><Ionicons color={colors.onSurfaceTertiary} name="home-outline" size={20} /></View>}
                      <View style={styles.propertyDealMetaCol}>
                        <Text numberOfLines={1} style={styles.propertyDealTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={styles.propertyDealSubtitle}>{`${item.area}, ${item.city} · €${item.rent}/mo`}</Text>
                      </View>
                      <View style={styles.interactionTypeBadge}>
                        <Ionicons color={item.interactionType === "liked" ? "#EF4444" : colors.brand} name={item.interactionType === "liked" ? "heart" : item.interactionType === "chat" ? "chatbubble-ellipses" : "heart-circle"} size={12} />
                        <Text style={styles.interactionTypeBadgeText}>{item.interactionType === "both" ? "Like & Chat" : item.interactionType === "liked" ? "Like" : "Chat"}</Text>
                      </View>
                    </View>
                    <View style={styles.propertyDealBottomRow}>
                      {item.compatibilityScore > 0 ? <View style={styles.matchBadgePill}><Ionicons color={colors.brand} name="sparkles" size={12} /><Text style={styles.matchBadgePillText}>{`${item.compatibilityScore}% Match`}</Text></View> : <View style={styles.noMatchPill}><Text style={styles.noMatchPillText}>— Match</Text></View>}
                      <Pressable style={[styles.stageSelectorPill, { backgroundColor: stageTone.backgroundColor }]} onPress={() => setEditingDealStageAptId(isEditing ? null : item.apartmentId)} hitSlop={6} testID={`broker-client-stage-selector-${item.apartmentId}`}>
                        <Text numberOfLines={1} style={[styles.stageSelectorPillText, { color: stageTone.textColor }]}>{stage.label}</Text>
                        <Ionicons color={stageTone.textColor} name={isEditing ? "chevron-up" : "chevron-down"} size={14} />
                      </Pressable>
                    </View>
                    {isEditing ? (
                      <View style={styles.inlineStagePicker}>
                        <Text style={styles.inlineStagePickerTitle}>Επιλέξτε Στάδιο για το ακίνητο:</Text>
                        {CLEAN_PIPELINE_STAGES.map((option) => {
                          const isSelected = item.pipelineStage === option.key;
                          return (
                            <Pressable key={option.key} style={[styles.inlineStageOptRow, isSelected && styles.inlineStageOptRowSelected]} onPress={() => void handleUpdatePropertyDealStage(item.apartmentId, option.key)} testID={`broker-client-stage-opt-${item.apartmentId}-${option.key}`}>
                              <Text style={[styles.inlineStageOptText, isSelected && styles.inlineStageOptTextSelected]}>{`${option.label} (${option.percentage}%)`}</Text>
                              {isSelected ? <Ionicons color={colors.brand} name="checkmark-circle" size={16} /> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {activeSubView === "lead_readiness" ? (
        <View style={styles.inPlaceSectionCard} testID="broker-client-inplace-readiness">
          <View style={styles.inPlaceHeaderRow}>
            <Text style={styles.inPlaceTitle}>Lead Readiness &amp; Priority</Text>
            <Pressable onPress={() => setActiveSubView("default")} hitSlop={8}>
              <Ionicons color={colors.onSurfaceTertiary} name="close-circle-outline" size={22} />
            </Pressable>
          </View>
          {LEAD_READINESS_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              style={[styles.stageOptionRow, leadReadiness === option.key && styles.stageOptionRowActive]}
              onPress={() => void handleSelectReadiness(option.key)}
              testID={`broker-client-inplace-readiness-${option.key}`}
            >
              <View style={styles.readinessOptionLabelWrap}>
                <Ionicons color={option.iconColor} name={option.iconName} size={18} />
                <Text style={[styles.stageOptionText, leadReadiness === option.key && styles.stageOptionTextActive]}>{t(option.label)}</Text>
              </View>
              {leadReadiness === option.key ? <Ionicons color={colors.brand} name="checkmark-circle" size={18} /> : null}
            </Pressable>
          ))}
          <Pressable style={styles.clearReadinessButton} onPress={() => void handleSelectReadiness(null)} testID="broker-client-inplace-readiness-clear">
            <Text style={styles.clearReadinessText}>Καθαρισμός προτεραιότητας</Text>
          </Pressable>
        </View>
      ) : null}

      {activeSubView === "purchasing_power" ? (
        <View style={styles.inPlaceSectionCard} testID="broker-client-inplace-purchasing-power">
          <View style={styles.inPlaceHeaderRow}>
            <Text style={styles.inPlaceTitle}>Πραγματική Αγοραστική Δύναμη</Text>
            <Pressable onPress={() => setActiveSubView("default")} hitSlop={8}>
              <Ionicons color={colors.onSurfaceTertiary} name="close-circle-outline" size={22} />
            </Pressable>
          </View>
          <Text style={styles.fieldLabel}>Μετρητά στο χέρι (€)</Text>
          <View style={styles.budgetInputRow}>
            <TextInput value={cashOnHand} onChangeText={(value) => setCashOnHand(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 650" placeholderTextColor={colors.onSurfaceTertiary} style={styles.budgetInput} testID="broker-client-inplace-budget-input" />
            <Text style={styles.budgetCurrencyText}>€</Text>
          </View>
          <View style={styles.presetButtonsRow}>
            <Pressable onPress={() => setCashOnHand(String((Number(cashOnHand) || 0) + 50))} style={styles.presetBtn} testID="broker-client-inplace-budget-plus-50"><Text style={styles.presetBtnText}>+50 €</Text></Pressable>
            <Pressable onPress={() => setCashOnHand(String((Number(cashOnHand) || 0) + 100))} style={styles.presetBtn} testID="broker-client-inplace-budget-plus-100"><Text style={styles.presetBtnText}>+100 €</Text></Pressable>
          </View>
          <Text style={styles.fieldLabel}>Εγκεκριμένο στεγαστικό δάνειο (€)</Text>
          <TextInput value={approvedMortgage} onChangeText={(value) => setApprovedMortgage(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="π.χ. 120000" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-inplace-mortgage-input" />
          <Text style={styles.fieldLabel}>Προθεσμία μετακόμισης</Text>
          <TextInput value={moveInDeadline} onChangeText={setMoveInDeadline} placeholder="π.χ. Άμεσα" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-inplace-deadline-input" />
          <Text style={styles.fieldLabel}>Σκοπός αγοράς / ενοικίασης</Text>
          <TextInput value={purchasePurpose} onChangeText={setPurchasePurpose} placeholder="π.χ. Ιδιοκατοίκηση" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-client-inplace-purpose-input" />
          <Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSavePurchasingPower()} disabled={savingPurchasingPower} testID="broker-client-inplace-purchasing-power-save">
            {savingPurchasingPower ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="bookmark-outline" size={18} color={colors.onBrand} />}
            <Text style={styles.purchasingPowerSaveText}>Αποθήκευση στοιχείων</Text>
          </Pressable>
        </View>
      ) : null}

      {activeSubView === "default" ? <>
        {isStagnant ? <View style={[styles.stagnationBanner, { backgroundColor: `${stagnationColor}22`, borderColor: stagnationColor }]} testID="broker-deal-stagnation-banner"><View style={styles.stagnationHeaderRow}><Ionicons name={stagnationIcon} size={22} color={stagnationColor} /><Text style={[styles.stagnationTitle, { color: stagnationColor }]}>{t("brokerClient.stagnationWarning")}</Text></View><Text style={[styles.stagnationBody, { color: colors.onSurface }]}>{t("brokerClient.stagnationBody", { days: elapsedDays, stage: currentStageConfig.label })}</Text></View> : null}
      <View style={styles.interactionLogCard} testID="broker-client-interaction-log">
        <View style={styles.interactionHeaderRow}>
          <View style={styles.interactionTitleWrap}>
            <Ionicons color={colors.brand} name="newspaper-outline" size={20} />
            <Text style={styles.interactionMainTitle}>Ιστορικό Αλληλεπιδράσεων</Text>
          </View>
          <Pressable
            style={styles.addInteractionBtn}
            onPress={() => {
              if (availableApartmentOptions.length > 0 && !newInteractionApartmentId) {
                setNewInteractionApartmentId(availableApartmentOptions[0].id);
              }
              setAddInteractionModalVisible(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Προσθήκη αλληλεπίδρασης"
            testID="broker-client-add-interaction-btn"
          >
            <Ionicons color={colors.onBrand} name="add" size={20} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.clientFilterChipsWrap} horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.clientFilterChip, selectedApartmentFilter === "all" && styles.clientFilterChipActive]}
            onPress={() => setSelectedApartmentFilter("all")}
            testID="broker-client-interaction-apartment-all"
          >
            <Text style={[styles.clientFilterChipText, selectedApartmentFilter === "all" && styles.clientFilterChipTextActive]}>Όλα τα ακίνητα</Text>
          </Pressable>
          {availableApartmentOptions.map((apartment) => {
            const isSelected = selectedApartmentFilter === apartment.id;
            return (
              <Pressable
                key={apartment.id}
                style={[styles.clientFilterChip, isSelected && styles.clientFilterChipActive]}
                onPress={() => setSelectedApartmentFilter(isSelected ? "all" : apartment.id)}
                testID={`broker-client-interaction-apartment-${apartment.id}`}
              >
                <Text numberOfLines={1} style={[styles.clientFilterChipText, isSelected && styles.clientFilterChipTextActive]}>{apartment.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.metricsSummaryBar}>
          {(["call", "showing", "comment", "email"] as const).map((type, index) => {
            const typeTone = getTypeMeta(type, colors);
            const count = type === "call" ? interactionMetrics.calls : type === "showing" ? interactionMetrics.showings : type === "comment" ? interactionMetrics.comments : interactionMetrics.emails;
            return (
              <React.Fragment key={type}>
                {index > 0 ? <View style={styles.metricCounterDivider} /> : null}
                <Pressable
                  style={[styles.metricCounterItem, selectedTypeFilter === type && styles.metricCounterItemActive]}
                  onPress={() => setSelectedTypeFilter(selectedTypeFilter === type ? "all" : type)}
                  testID={`broker-client-interaction-filter-${type}`}
                >
                  <Ionicons color={typeTone.color} name={typeTone.icon} size={16} />
                  <Text style={styles.metricCounterNumber}>{count}</Text>
                  <Text style={styles.metricCounterLabel}>{type === "call" ? "Κλήσεις" : type === "showing" ? "Υποδείξεις" : type === "comment" ? "Σχόλια" : "Emails"}</Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>

        <View style={styles.itemLogList}>
          {visibleInteractions.length === 0 ? (
            <Text style={styles.emptyLogText}>Δεν υπάρχουν καταγεγραμμένες αλληλεπιδράσεις για τα επιλεγμένα κριτήρια.</Text>
          ) : (
            visibleInteractions.map((item) => {
              const typeTone = getTypeMeta(item.type, colors);
              return (
                <View key={item.id} style={styles.logEntryRow}>
                  <View style={[styles.logTypeIconWrap, { backgroundColor: typeTone.bg }]}>
                    <Ionicons color={typeTone.color} name={typeTone.icon} size={15} />
                  </View>
                  <View style={styles.logEntryContent}>
                    <View style={styles.logEntryTopLine}>
                      <Text numberOfLines={1} style={styles.logApartmentName}>{item.apartmentTitle || "Ακίνητο"}</Text>
                      <Text style={styles.logDateText}>{formatDateTime(item.createdAtMillis)}</Text>
                    </View>
                    <Text style={styles.logNoteText}>{item.note || typeTone.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
      <View style={styles.searchCriteriaContainer}>
        <Text style={styles.sectionTitle}>Κριτήρια Αναζήτησης</Text>
        {sharedSearchQueries.length > 0 ? (
          <View style={styles.sharedSearchesRow}>
            {sharedSearchQueries.map((query) => (
              <View key={query} style={styles.sharedSearchChip}>
                <Ionicons color={colors.brand} name="search-outline" size={14} />
                <Text numberOfLines={1} style={styles.sharedSearchChipText}>{query}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {filters ? (
          <View style={styles.criteriaCard}>
            <View style={styles.criteriaHeaderRow}>
              <Ionicons color={colors.brand} name="options-outline" size={18} />
              <Text style={styles.criteriaTitle}>{filters.title || "Κριτήρια Αναζήτησης Πελάτη"}</Text>
            </View>
            <View style={styles.chipsRow}>
              {[`${filters.rentMin || "0"} - ${filters.rentMax || "∞"} €`, `${filters.sizeMin || "0"} - ${filters.sizeMax || "∞"} m²`, `${filters.minSqmPrice || "0"} - ${filters.maxSqmPrice || "∞"} €/m²`, filters.cityQuery || "Όλες οι περιοχές", `Κατοικίδια: ${filters.petFriendly ? "Ναι" : "Όχι"}`, `Μετρό: ${filters.nearMetro ? "Ναι" : "Όχι"}`].map((chip) => <Text key={chip} style={styles.criteriaChip}>{chip}</Text>)}
            </View>
            {filters.summary ? <Text style={styles.body}>{filters.summary}</Text> : null}
          </View>
        ) : null}
        {sharedSearchFilterSets.map((filterSet) => {
          const isSelected = selectedFilterSetId === filterSet.id;
          const city = filterSet.data.cityQuery || "Όλες οι περιοχές";
          const budget = filterSet.data.rentMax ? `έως ${filterSet.data.rentMax} €` : "χωρίς όριο τιμής";
          return (
            <Pressable key={filterSet.id} style={[styles.sharedFilterSetCard, isSelected && styles.sharedFilterSetCardActive]} onPress={() => setSelectedFilterSetId(isSelected ? null : filterSet.id)} testID={`broker-client-filter-set-${filterSet.id}`}>
              <Ionicons color={isSelected ? colors.brand : colors.onSurfaceTertiary} name={isSelected ? "checkmark-circle" : "options-outline"} size={20} />
              <View style={styles.sharedFilterSetTextCol}>
                <Text style={styles.sharedFilterSetTitle} numberOfLines={1}>{filterSet.title}</Text>
                <Text style={styles.sharedFilterSetMeta}>{`${city} · ${budget}`}</Text>
              </View>
              {isSelected ? <Text style={styles.activeFilterLabel}>Ενεργό</Text> : null}
            </Pressable>
          );
        })}
        {!filters && sharedSearchQueries.length === 0 && sharedSearchFilterSets.length === 0 ? (
          <View style={styles.emptyFilterBox} testID="broker-client-empty-filters">
            <Ionicons color={colors.onSurfaceTertiary} name="search-outline" size={22} />
            <Text style={styles.emptyFilterText}>Δεν υπάρχει διαμοιρασμένο ιστορικό αναζητήσεων για αυτόν τον πελάτη.</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.proposalsContainer}>
        <View style={styles.proposalsHeaderRow}>
          <Text numberOfLines={2} style={styles.proposalsHeaderTitle}>Προτεινόμενα Ακίνητα από το Χαρτοφυλάκιο</Text>
          <Pressable onPress={() => { setIsCreatingList((previous) => !previous); setSelectedApartmentIds(new Set()); }} hitSlop={8} style={styles.proposalsAddBtn} testID="broker-client-add-proposal-btn">
            <Ionicons color={colors.onBrand} name={isCreatingList ? "close" : "add"} size={18} />
            <Text style={styles.proposalsAddBtnText}>{isCreatingList ? "Κλείσιμο" : "Προσθήκη"}</Text>
          </Pressable>
        </View>
        {savedPropertyLists.map((list) => <View key={list.id} style={styles.savedListCard}><View style={styles.savedListIconWrap}><Ionicons color={colors.brand} name="list" size={20} /></View><View style={styles.savedListTextCol}><Text numberOfLines={1} style={styles.savedListTitle}>{list.title}</Text><Text style={styles.savedListSub}>{list.apartmentIds.length} ακίνητα</Text></View><View style={list.hasClientInteracted ? styles.seenBadgePill : styles.unseenBadgePill}>{list.hasClientInteracted ? <Ionicons color={colors.brand} name="checkmark-done" size={14} /> : <Ionicons color={colors.onSurfaceTertiary} name="time-outline" size={13} />}<Text style={list.hasClientInteracted ? styles.seenBadgeText : styles.unseenBadgeText}>{list.hasClientInteracted ? "Προβλήθηκε" : "Σε αναμονή"}</Text></View><Pressable onPress={() => void handleSendListToChat(list)} hitSlop={8} style={styles.sendListChatBtn} testID={`send-list-btn-${list.id}`}><Ionicons color={colors.onBrand} name="paper-plane-outline" size={18} /></Pressable></View>)}
        {loading ? <ActivityIndicator color={colors.brand} /> : rankedPortfolio.map((apartment) => <View key={apartment.id} style={styles.portfolioItemContainer} testID={`broker-matched-apartment-${apartment.id}`}><Pressable style={styles.portfolioCardMain} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}><View>{apartment.image ? <Image source={{ uri: apartment.image }} contentFit="cover" style={styles.portfolioThumb} /> : <View style={[styles.portfolioThumb, styles.portfolioThumbPlaceholder]}><Ionicons color={colors.onSurfaceTertiary} name="home-outline" size={20} /></View>}</View><View style={styles.portfolioTextColumn}><Text numberOfLines={1} style={styles.portfolioTitle}>{apartment.title}</Text><Text style={styles.portfolioSubtitle}>{apartment.area}, {apartment.city} · {apartment.rent}€ · {apartment.size}m²</Text></View><View style={styles.scoreActionRow}><View style={styles.compatibilityBadge}><Text style={styles.compatibilityBadgeText}>{apartment.compatibilityScore}% Match</Text></View><Pressable onPress={() => setExpandedScoreListingId((previous) => previous === apartment.id ? null : apartment.id)} hitSlop={8} style={styles.infoIconButton} testID={`toggle-score-info-${apartment.id}`}><Ionicons color={expandedScoreListingId === apartment.id ? colors.brand : colors.onSurfaceTertiary} name={expandedScoreListingId === apartment.id ? "information-circle" : "information-circle-outline"} size={20} /></Pressable></View>{isCreatingList && <Pressable onPress={() => setSelectedApartmentIds((previous) => { const next = new Set(previous); if (next.has(apartment.id)) next.delete(apartment.id); else next.add(apartment.id); return next; })} hitSlop={8} style={styles.selectionDotBtn} testID={`select-apartment-${apartment.id}`}><Ionicons color={selectedApartmentIds.has(apartment.id) ? colors.brand : colors.onSurfaceTertiary} name={selectedApartmentIds.has(apartment.id) ? "checkmark-circle" : "ellipse-outline"} size={24} /></Pressable>}</Pressable>{expandedScoreListingId === apartment.id ? <View style={styles.justificationBox} testID={`score-justification-${apartment.id}`}><Text style={styles.justificationMainTitle}>Αιτιολόγηση Σκορ Συμβατότητας ({apartment.compatibilityScore}%)</Text><View style={styles.criteriaGroup}><View style={styles.groupHeaderRow}><Ionicons color="#EF4444" name="shield-checkmark" size={14} /><Text style={styles.hardGroupTitle}>Πολύ σημαντικό (Βασικά Κριτήρια):</Text></View>{apartment.scoreBreakdown.hardMet.length ? apartment.scoreBreakdown.hardMet.map((item, index) => <View key={`${apartment.id}-hard-${index}`} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.criteriaItemText}>{item}</Text></View>) : <Text style={styles.emptyCriteriaText}>Δεν πληρούνται βασικά κριτήρια.</Text>}</View><View style={styles.criteriaGroup}><View style={styles.groupHeaderRow}><Ionicons color="#10B981" name="checkmark-circle-outline" size={14} /><Text style={styles.softGroupTitle}>Σημαντικό (Επιπλέον Προτιμήσεις):</Text></View>{apartment.scoreBreakdown.softMet.length ? apartment.scoreBreakdown.softMet.map((item, index) => <View key={`${apartment.id}-soft-${index}`} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.criteriaItemText}>{item}</Text></View>) : <Text style={styles.emptyCriteriaText}>Δεν έχουν οριστεί ή δεν πληρούνται επιπλέον προτιμήσεις.</Text>}</View></View> : null}</View>)}
        {isCreatingList && <Pressable disabled={selectedApartmentIds.size === 0} onPress={() => { setNewListName(`Προτάσεις (${selectedApartmentIds.size})`); setIsNameListModalVisible(true); }} style={[styles.createListSubmitBtn, selectedApartmentIds.size === 0 && styles.createListSubmitBtnDisabled]} testID="submit-create-property-list"><Ionicons color={colors.onBrand} name="bookmark-outline" size={18} /><Text style={styles.createListSubmitBtnText}>{`Δημιουργία λίστας (${selectedApartmentIds.size})`}</Text></Pressable>}
        {!loading && rankedPortfolio.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν διαθέσιμα ακίνητα στο χαρτοφυλάκιό σας που να πληρούν όλα τα κριτήρια.</Text> : null}
      </View>
      </> : null}
      </ScrollView>
    <Modal visible={addInteractionModalVisible} transparent animationType="fade" onRequestClose={() => { if (!isSavingInteraction) setAddInteractionModalVisible(false); }}>
      <Pressable style={styles.modalBackdrop} onPress={() => { if (!isSavingInteraction) setAddInteractionModalVisible(false); }}>
        <Pressable style={styles.interactionModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.interactionModalHeader}>
            <Text style={styles.modalTitle}>Νέα αλληλεπίδραση</Text>
            <Pressable onPress={() => setAddInteractionModalVisible(false)} disabled={isSavingInteraction} hitSlop={8} testID="broker-client-add-interaction-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView style={styles.interactionModalScroll} contentContainerStyle={styles.interactionModalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.interactionModalLabel}>Ακίνητο</Text>
            {availableApartmentOptions.length === 0 ? (
              <Text style={styles.emptyHint}>Δεν υπάρχουν διαθέσιμα ακίνητα για καταγραφή.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clientFilterChipsWrap}>
                {availableApartmentOptions.map((apartment) => {
                  const isSelected = newInteractionApartmentId === apartment.id;
                  return (
                    <Pressable key={apartment.id} style={[styles.clientFilterChip, isSelected && styles.clientFilterChipActive]} onPress={() => setNewInteractionApartmentId(apartment.id)} testID={`broker-client-add-interaction-apartment-${apartment.id}`}>
                      <Text numberOfLines={1} style={[styles.clientFilterChipText, isSelected && styles.clientFilterChipTextActive]}>{apartment.title}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Text style={styles.interactionModalLabel}>Τύπος</Text>
            <View style={styles.interactionTypeChipsWrap}>
              {INTERACTION_TYPES.map((type) => {
                const typeTone = getTypeMeta(type, colors);
                const isSelected = newInteractionType === type;
                return (
                  <Pressable key={type} style={[styles.interactionTypeChip, isSelected && styles.interactionTypeChipActive]} onPress={() => setNewInteractionType(type)} testID={`broker-client-add-interaction-type-${type}`}>
                    <Ionicons name={typeTone.icon} size={16} color={isSelected ? colors.brand : typeTone.color} />
                    <Text style={[styles.interactionTypeChipText, isSelected && styles.interactionTypeChipTextActive]}>{typeTone.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.interactionModalLabel}>Σημείωση</Text>
            <TextInput value={newInteractionNote} onChangeText={setNewInteractionNote} style={styles.interactionNoteInput} placeholder="Προσθέστε λεπτομέρειες..." placeholderTextColor={colors.onSurfaceTertiary} multiline textAlignVertical="top" maxLength={1000} testID="broker-client-add-interaction-note" />
          </ScrollView>
          <View style={styles.interactionModalActions}>
            <Pressable style={styles.modalCancelButton} onPress={() => setAddInteractionModalVisible(false)} disabled={isSavingInteraction} testID="broker-client-add-interaction-cancel"><Text style={styles.modalCancelText}>Ακύρωση</Text></Pressable>
            <Pressable style={[styles.interactionSaveButton, (!newInteractionApartmentId || !newInteractionNote.trim() || isSavingInteraction) && styles.interactionSaveButtonDisabled]} onPress={() => void handleSaveInteraction()} disabled={!newInteractionApartmentId || !newInteractionNote.trim() || isSavingInteraction} testID="broker-client-add-interaction-save">
              {isSavingInteraction ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="checkmark" size={18} color={colors.onBrand} />}
              <Text style={styles.interactionSaveText}>Αποθήκευση</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={isLossModalVisible} transparent animationType="fade" onRequestClose={() => setIsLossModalVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setIsLossModalVisible(false)}><Pressable style={styles.stageModal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>Γιατί χάθηκε η συμφωνία;</Text>{([{ key: "high_price", label: "Υψηλή τιμή" }, { key: "loan_rejected", label: "Απόρριψη δανείου από τράπεζα" }, { key: "chose_another_property", label: "Προτίμησε άλλο ακίνητο" }, { key: "owner_withdrew", label: "Υπαναχώρηση ιδιοκτήτη" }, { key: "other", label: "Άλλο" }] as const).map((reason) => <Pressable key={reason.key} style={styles.stageOption} onPress={() => setLossReason(reason.key)} testID={`broker-loss-reason-${reason.key}`}><Text style={styles.stageOptionLabel}>{reason.label}</Text><Ionicons name={lossReason === reason.key ? "checkmark-circle" : "ellipse-outline"} size={21} color={lossReason === reason.key ? colors.brand : colors.onSurfaceTertiary} /></Pressable>)}{lossReason === "other" ? <TextInput value={lossCustomReason} onChangeText={setLossCustomReason} placeholder="Περιγράψτε τον λόγο" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="broker-loss-custom-reason" /> : null}<Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSaveLossReport()} testID="broker-loss-confirm"><Text style={styles.purchasingPowerSaveText}>Αποθήκευση λόγου</Text></Pressable></Pressable></Pressable></Modal>
    <Modal visible={isNameListModalVisible} transparent animationType="fade" onRequestClose={() => setIsNameListModalVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setIsNameListModalVisible(false)}><Pressable style={styles.stageModal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>Όνομα λίστας ακινήτων</Text><TextInput value={newListName} onChangeText={setNewListName} autoFocus placeholder="π.χ. Επιλογές για τον πελάτη" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="property-list-name-input" /><Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSavePropertyList()} disabled={savingList} testID="save-property-list"><Ionicons name="save-outline" size={18} color={colors.onBrand} /><Text style={styles.purchasingPowerSaveText}>{savingList ? "Αποθήκευση..." : "Αποθήκευση λίστας"}</Text></Pressable></Pressable></Pressable></Modal>
    <CenteredActionModal
      visible={!!shareFeedbackModal?.visible}
      title={shareFeedbackModal?.title ?? ""}
      description={shareFeedbackModal?.description}
      onDismiss={() => setShareFeedbackModal(null)}
      actions={[{
        label: t("common.actions.gotIt") || "OK",
        iconName: "checkmark-circle-outline",
        onPress: () => setShareFeedbackModal(null),
      }]}
      testID="broker-list-shared-feedback-modal"
    />
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerBackBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface, marginLeft: spacing.xs },
  headerActionsGroup: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  headerActionBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  content: { paddingBottom: spacing["3xl"] },
  profileCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
  stageModal: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalTitle: { marginBottom: spacing.sm, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  stageOption: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stageOptionLabel: { flex: 1, fontFamily: fonts.semibold, color: colors.onSurface },
  probabilityBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, fontFamily: fonts.bold, color: colors.brand },
  stagnationBanner: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  stagnationHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stagnationTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.base },
  stagnationBody: { marginTop: spacing.sm, fontFamily: fonts.regular, fontSize: fontSize.sm },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, marginBottom: spacing.xs },
  clientName: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface, textAlign: "center" },
  chatButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.brand, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, width: "100%", marginTop: spacing.md, marginBottom: spacing.md },
  chatButtonText: { fontFamily: fonts.semibold, color: colors.onBrand },
  singleLineStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, width: "100%" },
  statusPillItem: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  statusPillFlex: { flex: 1, justifyContent: "center", minWidth: 0 },
  statusIconPill: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  statusPillText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  inPlaceSectionCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  inPlaceHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  inPlaceTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  inPlaceTitleWithIcon: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  propertyDealsList: { gap: spacing.sm, marginTop: spacing.xs },
  propertyDealCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  propertyDealTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, width: "100%" },
  propertyDealThumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  propertyDealMetaCol: { flex: 1, gap: 2, minWidth: 0 },
  propertyDealTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  propertyDealSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  matchBadgePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  matchBadgePillText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  noMatchPill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  noMatchPillText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  interactionTypeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
  interactionTypeBadgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  propertyDealBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stageSelectorPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, maxWidth: "60%" },
  stageSelectorPillText: { fontFamily: fonts.bold, fontSize: fontSize.xs, flexShrink: 1 },
  inlineStagePicker: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 4 },
  inlineStagePickerTitle: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary, marginBottom: 2 },
  inlineStageOptRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  inlineStageOptRowSelected: { backgroundColor: colors.brandTertiary },
  inlineStageOptText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurface },
  inlineStageOptTextSelected: { fontFamily: fonts.bold, color: colors.brand },
  stageOptionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stageOptionRowActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  stageOptionText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  stageOptionTextActive: { color: colors.brand },
  readinessOptionLabelWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clearReadinessButton: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  clearReadinessText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  budgetInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  budgetInput: { flex: 1, minHeight: 46, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, fontFamily: fonts.semibold, color: colors.onSurface },
  budgetCurrencyText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  presetButtonsRow: { flexDirection: "row", gap: spacing.xs },
  presetBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  presetBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  interactionLogCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  interactionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.xs },
  interactionTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  interactionMainTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  addInteractionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  clientFilterChipsWrap: { flexDirection: "row", gap: spacing.xs, paddingVertical: 2 },
  clientFilterChip: { maxWidth: 220, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  clientFilterChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  clientFilterChipText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  clientFilterChipTextActive: { color: colors.brand, fontFamily: fonts.bold },
  metricsSummaryBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: colors.surface, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  metricCounterItem: { alignItems: "center", gap: 2 },
  metricCounterItemActive: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm, paddingHorizontal: 4 },
  metricCounterNumber: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  metricCounterLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  metricCounterDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  itemLogList: { gap: 3, marginTop: 2 },
  logEntryRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  logTypeIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 2 },
  logEntryContent: { flex: 1, gap: 2 },
  logEntryTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  logApartmentName: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  logDateText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  logNoteText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurface, lineHeight: 18 },
  emptyLogText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textAlign: "center", paddingVertical: spacing.md },
  interactionModal: { width: "100%", maxHeight: "88%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.md },
  interactionModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  interactionModalScroll: { flexShrink: 1 },
  interactionModalContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  interactionModalLabel: { marginTop: spacing.xs, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  interactionTypeChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  interactionTypeChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  interactionTypeChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  interactionTypeChipText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  interactionTypeChipTextActive: { fontFamily: fonts.bold, color: colors.brand },
  interactionNoteInput: { minHeight: 104, maxHeight: 160, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.regular, fontSize: fontSize.base },
  interactionModalActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  modalCancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  modalCancelText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  interactionSaveButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brand },
  interactionSaveButtonDisabled: { opacity: 0.45 },
  interactionSaveText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  leadScoreBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  leadScoreText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  interactionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  interactionCategoryBlock: { gap: spacing.xs },
  categoryHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  categoryTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  chipsContainer: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
  interactionChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurface },
  bulletList: { gap: 3, marginTop: 2 },
  interactionBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingLeft: 2 },
  bulletSymbol: { fontSize: fontSize.xs, color: colors.onSurfaceTertiary, lineHeight: 16 },
  bulletText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurface, lineHeight: 16 },
  cancellationWarningBox: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: "rgba(239, 68, 68, 0.08)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)", alignSelf: "flex-start", marginTop: 2 },
  cancellationText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: "#EF4444" },
  purchasingPowerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  purchasingPowerTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  purchasingPowerTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  purchasingPowerContent: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  fieldLabel: { marginTop: spacing.sm, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  input: { minHeight: 46, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, fontFamily: fonts.semibold, color: colors.onSurface },
  purchasingPowerSaveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand },
  purchasingPowerSaveText: { fontFamily: fonts.semibold, color: colors.onBrand },
  purchasingPowerSuccess: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingTop: spacing.xs },
  purchasingPowerSuccessText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.success },
  searchCriteriaContainer: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  proposalsContainer: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  emptyFilterBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  emptyFilterText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textAlign: "center" },
  sharedSearchesRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  sharedSearchChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  sharedSearchChipText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
  criteriaHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sharedFilterSetCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  sharedFilterSetCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  sharedFilterSetTextCol: { flex: 1, minWidth: 0, gap: 2 },
  sharedFilterSetTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  sharedFilterSetMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  activeFilterLabel: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  proposalsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, width: "100%", marginBottom: spacing.xs },
  proposalsHeaderTitle: { flex: 1, fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  proposalsAddBtn: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  proposalsAddBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  addListToggleBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  addListToggleBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  savedListCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  savedListIconWrap: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  savedListTextCol: { flex: 1, gap: 2 },
  savedListTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  savedListSub: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  seenBadgePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  seenBadgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.brand },
  unseenBadgePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  unseenBadgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.onSurfaceTertiary },
  sendListChatBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  createListSubmitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brand },
  createListSubmitBtnDisabled: { opacity: 0.5 },
  createListSubmitBtnText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onBrand },
  selectionDotBtn: { padding: 2, alignItems: "center", justifyContent: "center" },
  criteriaCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  criteriaTitle: { fontFamily: fonts.semibold, color: colors.onSurface },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  criteriaChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  body: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  portfolioItemContainer: { width: "100%", maxWidth: "100%", flexShrink: 1, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  activeDealBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brand, zIndex: 10 },
  activeDealBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  portfolioCardMain: { width: "100%", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  portfolioThumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  portfolioThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  portfolioTextColumn: { flex: 1, minWidth: 0, gap: 2 },
  portfolioTitle: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.onSurface },
  portfolioSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  scoreActionRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  compatibilityBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  compatibilityBadgeText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.brand },
  infoIconButton: { padding: 4, alignItems: "center", justifyContent: "center" },
  justificationBox: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm },
  justificationMainTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.onSurface },
  criteriaGroup: { gap: 3 },
  groupHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  hardGroupTitle: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onSurface },
  softGroupTitle: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingLeft: spacing.xs },
  bulletDot: { fontSize: fontSize.xs, color: colors.onSurfaceTertiary, lineHeight: 16 },
  criteriaItemText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurface, lineHeight: 16 },
  emptyCriteriaText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.onSurfaceTertiary, fontStyle: "italic", paddingLeft: spacing.xs },
  apartmentRow: { padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.semibold, color: colors.onSurface },
  price: { marginTop: spacing.xs, fontFamily: fonts.bold, color: colors.brand },
  emptyHint: { padding: spacing.md, textAlign: "center", fontFamily: fonts.regular, color: colors.onSurfaceTertiary },
});
