import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Switch } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import DefaultProfileAvatar from "@/src/components/DefaultProfileAvatar";
import CenteredActionModal from "@/src/components/CenteredActionModal";
import KeyboardAwareModal from "@/src/components/common/KeyboardAwareModal";
import { type LossReasonKey, type PipelineStageKey } from "@/src/constants/pipeline";
import type { LostDealReason } from "@/src/types/analytics";
import type { BrokerApartment } from "./(tabs)/broker";
import type { FilterSetPayload, HardCriteriaKey } from "@/src/types/filters";
import { calculateSuggestedApartments, calculateTenantCompatibilityScore, getCompatibilityDetails, type ListingFormData } from "@/src/utils/compatibilityScore";
import { t } from "@/src/locales";
import {
  addPropertyInteraction,
  subscribeClientInteractions,
  type InteractionType,
  type PropertyInteraction,
} from "@/src/api/propertyInteractions";
import { getBrokerClientDeals } from "@/src/api/brokerClientProfiles";
import { BrokerModificationBadge } from "@/src/components/BrokerModificationBadge";
import AssignClientEmailModal from "@/src/components/AssignClientEmailModal";
import { settleClosedDeal } from "@/src/utils/dealAutomations";
import { calculateDynamicDealStage } from "@/src/utils/dealPipeline";
import ClientCalendarNotesModal from "@/src/components/calendar/ClientCalendarNotesModal";
import CloseLostDealModal from "@/src/components/CloseLostDealModal";
import { recordLostDeal } from "@/src/api/lostDeals";
import DealChecklistSection from "@/src/components/DealChecklistSection";
import DocumentPreviewModal from "@/src/components/DocumentPreviewModal";
import { uploadImageAsync } from "@/src/api/imageUpload";
import { DEFAULT_DEAL_CHECKLIST, type DealChecklistItem } from "@/src/types/checklist";

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

export interface BrokerClientFilterSet {
  id: string;
  clientUserId?: string;
  title: string;
  origin: "client_created" | "broker_created";
  version: number;
  brokerModCount: number;
  lastModifiedByBrokerId?: string;
  lastModifiedByBrokerName?: string;
  lastModifiedAt: number;
  isSharedWithClient: boolean;
  userHardCriteria?: HardCriteriaKey[];
  updatedAt?: number;
  cityQuery?: string;
  rentMin?: number;
  rentMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  propertyTypes?: string[];
  propertyCategories?: string[];
  bedroomsMin?: number;
  bathroomsMin?: number;
  floors?: string[];
  furnishedStatus?: string;
  heatingTypes?: string[];
  petFriendly?: boolean;
  nearMetro?: boolean;
  selectedAmenities?: string[];
  showMatchScore?: boolean;
  minSqmPrice?: number;
  maxSqmPrice?: number;
  sortBy?: string;
  summary?: string;
  energyClasses?: string[];
  constructionYearMin?: number;
  renovationYearMin?: number;
  polygonCoordinates?: FilterSetPayload["polygonCoordinates"];
}

type FilterSetForm = {
  title: string;
  cityQuery: string;
  rentMin: string;
  rentMax: string;
  sizeMin: string;
  sizeMax: string;
  bedroomsMin: string;
  bathroomsMin: string;
  propertyTypes: string;
  propertyCategories: string;
  floors: string;
  furnishedStatus: string;
  heatingTypes: string;
  selectedAmenities: string;
  petFriendly: boolean;
  nearMetro: boolean;
  showMatchScore: boolean;
};

const EMPTY_FILTER_SET_FORM: FilterSetForm = {
  title: "",
  cityQuery: "",
  rentMin: "",
  rentMax: "",
  sizeMin: "",
  sizeMax: "",
  bedroomsMin: "",
  bathroomsMin: "",
  propertyTypes: "",
  propertyCategories: "",
  floors: "",
  furnishedStatus: "all",
  heatingTypes: "",
  selectedAmenities: "",
  petFriendly: false,
  nearMetro: false,
  showMatchScore: false,
};

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
}

function listOrUndefined(value: string): string[] | undefined {
  const list = value.split(",").map((item) => item.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function formFromFilterSet(filterSet: BrokerClientFilterSet): FilterSetForm {
  return {
    title: filterSet.title,
    cityQuery: filterSet.cityQuery || "",
    rentMin: filterSet.rentMin == null ? "" : String(filterSet.rentMin),
    rentMax: filterSet.rentMax == null ? "" : String(filterSet.rentMax),
    sizeMin: filterSet.sizeMin == null ? "" : String(filterSet.sizeMin),
    sizeMax: filterSet.sizeMax == null ? "" : String(filterSet.sizeMax),
    bedroomsMin: filterSet.bedroomsMin == null ? "" : String(filterSet.bedroomsMin),
    bathroomsMin: filterSet.bathroomsMin == null ? "" : String(filterSet.bathroomsMin),
    propertyTypes: filterSet.propertyTypes?.join(", ") || "",
    propertyCategories: filterSet.propertyCategories?.join(", ") || "",
    floors: filterSet.floors?.join(", ") || "",
    furnishedStatus: filterSet.furnishedStatus || "all",
    heatingTypes: filterSet.heatingTypes?.join(", ") || "",
    selectedAmenities: filterSet.selectedAmenities?.join(", ") || "",
    petFriendly: filterSet.petFriendly === true,
    nearMetro: filterSet.nearMetro === true,
    showMatchScore: filterSet.showMatchScore === true,
  };
}

function formToFilterFields(form: FilterSetForm): Partial<BrokerClientFilterSet> {
  const fields: Partial<BrokerClientFilterSet> = {
    cityQuery: form.cityQuery.trim() || undefined,
    rentMin: numberOrUndefined(form.rentMin),
    rentMax: numberOrUndefined(form.rentMax),
    sizeMin: numberOrUndefined(form.sizeMin),
    sizeMax: numberOrUndefined(form.sizeMax),
    bedroomsMin: numberOrUndefined(form.bedroomsMin),
    bathroomsMin: numberOrUndefined(form.bathroomsMin),
    propertyTypes: listOrUndefined(form.propertyTypes),
    propertyCategories: listOrUndefined(form.propertyCategories),
    floors: listOrUndefined(form.floors),
    furnishedStatus: form.furnishedStatus || "all",
    heatingTypes: listOrUndefined(form.heatingTypes),
    selectedAmenities: listOrUndefined(form.selectedAmenities),
    petFriendly: form.petFriendly,
    nearMetro: form.nearMetro,
    showMatchScore: form.showMatchScore,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<BrokerClientFilterSet>;
}

function storedNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function mapStoredFilterSet(id: string, raw: Record<string, unknown>, origin: BrokerClientFilterSet["origin"], sharedDefault: boolean): BrokerClientFilterSet {
  return {
    ...raw,
    id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Κριτήρια Αναζήτησης",
    origin: raw.origin === "broker_created" || raw.origin === "client_created" ? raw.origin : origin,
    version: storedNumber(raw.version) || 1,
    brokerModCount: storedNumber(raw.brokerModCount) || 0,
    lastModifiedAt: storedNumber(raw.lastModifiedAt) || storedNumber(raw.updatedAt) || storedNumber(raw.createdAt) || 0,
    isSharedWithClient: typeof raw.isSharedWithClient === "boolean" ? raw.isSharedWithClient : sharedDefault,
    rentMin: storedNumber(raw.rentMin),
    rentMax: storedNumber(raw.rentMax),
    sizeMin: storedNumber(raw.sizeMin),
    sizeMax: storedNumber(raw.sizeMax),
    bedroomsMin: storedNumber(raw.bedroomsMin),
    bathroomsMin: storedNumber(raw.bathroomsMin),
    minSqmPrice: storedNumber(raw.minSqmPrice),
    maxSqmPrice: storedNumber(raw.maxSqmPrice),
    constructionYearMin: storedNumber(raw.constructionYearMin),
    renovationYearMin: storedNumber(raw.renovationYearMin),
  };
}

function apartmentToListingData(apartment: ListingFormData): ListingFormData {
  const extraInformation = (apartment as ListingFormData & { extraInformation?: { bathrooms?: unknown; heatingSystem?: unknown } }).extraInformation;
  return {
    city: apartment.city,
    area: apartment.area,
    latitude: typeof apartment.latitude === "number" ? apartment.latitude : undefined,
    longitude: typeof apartment.longitude === "number" ? apartment.longitude : undefined,
    rent: apartment.rent,
    size: apartment.size,
    floor: typeof apartment.floor === "string" || typeof apartment.floor === "number" ? apartment.floor : undefined,
    bedrooms: apartment.bedrooms,
    bathrooms: typeof extraInformation?.bathrooms === "number" ? extraInformation.bathrooms : undefined,
    furnishedStatus: apartment.tags?.includes("furnished") ? "furnished" : undefined,
    heatingSystem: typeof extraInformation?.heatingSystem === "string" ? extraInformation.heatingSystem : undefined,
    petFriendly: apartment.tags?.includes("pet_friendly"),
    nearMetro: apartment.tags?.includes("near_metro"),
    tags: apartment.tags,
    amenities: Array.isArray(apartment.amenities) ? apartment.amenities.filter((item): item is string => typeof item === "string") : undefined,
    propertyType: typeof apartment.propertyType === "string" ? apartment.propertyType : undefined,
    propertyCategory: typeof apartment.propertyCategory === "string" ? apartment.propertyCategory : undefined,
  };
}

export type LeadReadinessKey = "hot" | "warm" | "cold";
type ClientDetailSubView = "default" | "deal_stage" | "lead_readiness" | "purchasing_power";

const HARD_CRITERIA_LABELS: Record<HardCriteriaKey, string> = {
  rent: "Τιμή",
  size: "Εμβαδόν",
  floor: "Όροφος",
  propertyType: "Τύπος Ακινήτου",
  bedrooms: "Υπνοδωμάτια",
  bathrooms: "Μπάνια",
  furnished: "Επίπλωση",
  heating: "Θέρμανση",
  petFriendly: "Κατοικίδια",
  nearMetro: "Μετρό",
  amenities: "Παροχές",
};

const CLEAN_PIPELINE_STAGES = [
  { key: "new_lead", label: "Νέο Lead", percentage: 10, probability: 0.1 },
  { key: "showing_scheduled", label: "Πραγματοποίηση Υπόδειξης", percentage: 35, probability: 0.35 },
  { key: "offer_made", label: "Κατάθεση Προσφοράς", percentage: 65, probability: 0.65 },
  { key: "negotiation_agreement", label: "Υπό Διαπραγμάτευση / Προσύμφωνο", percentage: 90, probability: 0.9 },
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
  clientRating?: number;
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
    case "offer_made":
      return "offer_made";
    case "negotiation_agreement":
      return "negotiation_agreement";
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
  if (stage === "negotiation_agreement") return { backgroundColor: "rgba(234,179,8,0.18)", textColor: "#A16207" };
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
  const insets = useSafeAreaInsets(); const router = useRouter(); const auth = useAuth(); const params = useLocalSearchParams<{ clientUserId?: string; clientId?: string; profileId?: string; clientName?: string; clientAvatar?: string; chatRoomId?: string; sharedFilterSet?: string; scrollTo?: string; dealId?: string; highlightItemId?: string }>(); const { colors } = useTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollViewRef = useRef<React.ElementRef<typeof KeyboardAwareScrollView> | null>(null);
  const [suggestedSectionY, setSuggestedSectionY] = useState(0);
  const [brokerManagedApartments, setBrokerManagedApartments] = useState<BrokerApartment[]>([]); const [loading, setLoading] = useState(true);
  const resolvedClientUserId = params.clientUserId || params.clientId || (params.profileId?.includes("_") ? params.profileId.split("_").slice(1).join("_") : undefined);
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
  const [pendingLostDeal, setPendingLostDeal] = useState<{ apartmentId: string; apartmentTitle: string; stageBeforeLoss: number; potentialRevenueLoss: number } | null>(null);
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
  const [checklistsByDealId, setChecklistsByDealId] = useState<Record<string, DealChecklistItem[]>>({});
  const [checklistUploadItemKey, setChecklistUploadItemKey] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DealChecklistItem | null>(null);
  const [rejectionPrompt, setRejectionPrompt] = useState<{ dealId: string; item: DealChecklistItem } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionReasonError, setRejectionReasonError] = useState("");
  const [reviewingChecklistItemKey, setReviewingChecklistItemKey] = useState<string | null>(null);
  const [stageGateModal, setStageGateModal] = useState<{ stageLabel: string; missingItems: string[] } | null>(null);
  const [highlightedDealY, setHighlightedDealY] = useState<number | null>(null);
  const [sharedSearchQueries, setSharedSearchQueries] = useState<string[]>([]);
  const [sharedSearchFilterSets, setSharedSearchFilterSets] = useState<SharedSearchFilterSet[]>([]);
  const [selectedFilterSetId, setSelectedFilterSetId] = useState<string | null>(null);
  const [filterSets, setFilterSets] = useState<BrokerClientFilterSet[]>([]);
  const [editingFilterSet, setEditingFilterSet] = useState<BrokerClientFilterSet | null>(null);
  const [isNewFilterSetModalOpen, setIsNewFilterSetModalOpen] = useState(false);
  const [filterSetForm, setFilterSetForm] = useState<FilterSetForm>(EMPTY_FILTER_SET_FORM);
  const [savingFilterSet, setSavingFilterSet] = useState(false);
  const [isManualClient, setIsManualClient] = useState(false);
  const [isAddEmailModalOpen, setIsAddEmailModalOpen] = useState(false);
  const [calendarNotesVisible, setCalendarNotesVisible] = useState(false);
  const profileId = auth.userId && params.clientUserId ? `${auth.userId}_${params.clientUserId}` : null;
  const filters = useMemo<FilterSetPayload | null>(() => { try { return params.sharedFilterSet ? JSON.parse(params.sharedFilterSet) as FilterSetPayload : null; } catch { return null; } }, [params.sharedFilterSet]);
  const activeFilterSet = useMemo(
    () => {
      const brokerSet = filterSets.find((filterSet) => filterSet.id === selectedFilterSetId);
      if (brokerSet) {
        return {
          ...brokerSet,
          rentMin: brokerSet.rentMin == null ? undefined : String(brokerSet.rentMin),
          rentMax: brokerSet.rentMax == null ? undefined : String(brokerSet.rentMax),
          sizeMin: brokerSet.sizeMin == null ? undefined : String(brokerSet.sizeMin),
          sizeMax: brokerSet.sizeMax == null ? undefined : String(brokerSet.sizeMax),
          bedroomsMin: brokerSet.bedroomsMin == null ? undefined : String(brokerSet.bedroomsMin),
          bathroomsMin: brokerSet.bathroomsMin == null ? undefined : String(brokerSet.bathroomsMin),
        } as FilterSetPayload;
      }
      return sharedSearchFilterSets.find((filterSet) => filterSet.id === selectedFilterSetId)?.data ?? filters;
    },
    [filterSets, filters, selectedFilterSetId, sharedSearchFilterSets],
  );
  const rankedPortfolio = useMemo(() => {
    const normalizedCity = activeFilterSet?.cityQuery?.trim().toLocaleLowerCase() || "";
    const cityMatches = brokerManagedApartments
      .filter((apartment) => {
        if (!activeFilterSet) return true;
        return !normalizedCity || apartment.city.trim().toLocaleLowerCase() === normalizedCity;
      });
    if (!activeFilterSet) {
      return cityMatches.map((apartment) => {
        const listingData = apartmentToListingData(apartment);
        const scoreBreakdown = getCompatibilityDetails(listingData, null);
        return { ...apartment, compatibilityScore: scoreBreakdown.score, scoreBreakdown, failedHardCriteria: [] as HardCriteriaKey[] };
      });
    }
    const suggestions = calculateSuggestedApartments(cityMatches.map((apartment) => ({
      ...apartment,
      ...apartmentToListingData({
        ...apartment,
        bedrooms: typeof apartment.rooms === "number" ? apartment.rooms : undefined,
      }),
    })), activeFilterSet);
    return suggestions.map((suggestion) => {
      const apartment = suggestion.apartment;
      const listingData = apartmentToListingData(apartment);
      const scoreBreakdown = getCompatibilityDetails(listingData, activeFilterSet);
      return { ...apartment, compatibilityScore: suggestion.score, scoreBreakdown, failedHardCriteria: suggestion.failedCriteria };
    });
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
  const calendarListingOptions = useMemo(
    () => brokerManagedApartments.map((apartment) => ({ id: apartment.id, title: apartment.title, price: apartment.rent })),
    [brokerManagedApartments],
  );
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
  const loadFilterSets = useCallback(async () => {
    if (!profileId || !params.clientUserId) {
      setFilterSets([]);
      return;
    }
    try {
      const [clientSnapshot, brokerSnapshot] = await Promise.all([
        getDocs(collection(db, "users", params.clientUserId!, "savedFilterSets")),
        getDocs(collection(db, "brokerClientProfiles", profileId, "savedFilterSets")),
      ]);
      const byId = new Map<string, BrokerClientFilterSet>();
      clientSnapshot.docs.forEach((filterDoc) => {
        byId.set(filterDoc.id, mapStoredFilterSet(filterDoc.id, filterDoc.data(), "client_created", true));
      });
      sharedSearchFilterSets.forEach((filterSet) => {
        byId.set(filterSet.id, mapStoredFilterSet(filterSet.id, { ...filterSet.data, title: filterSet.title }, "client_created", true));
      });
      brokerSnapshot.docs.forEach((filterDoc) => {
        byId.set(filterDoc.id, mapStoredFilterSet(filterDoc.id, filterDoc.data(), "broker_created", false));
      });
      setFilterSets(Array.from(byId.values()).sort((first, second) => second.lastModifiedAt - first.lastModifiedAt));
    } catch (error) {
      console.error("[BrokerClientDetail] Error loading filter sets:", error);
      setFilterSets([]);
    }
  }, [resolvedClientUserId, profileId, sharedSearchFilterSets]);

  useEffect(() => {
    if (!resolvedClientUserId) {
      setIsManualClient(false);
      return;
    }
    void getDoc(doc(db, "users", resolvedClientUserId)).then((snapshot) => {
      setIsManualClient(snapshot.exists() && snapshot.data().is_manual_client === true);
    }).catch(() => setIsManualClient(false));
  }, [resolvedClientUserId]);

  useEffect(() => {
    void loadFilterSets();
  }, [loadFilterSets]);

  useEffect(() => {
    if (!auth.userId || !resolvedClientUserId) {
      setSavedPropertyLists([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const snapshot = await getDocs(collection(db, "brokerClientProfiles", `${auth.userId}_${resolvedClientUserId}`, "propertyLists"));
        if (!active) return;
        const lists = snapshot.docs.map((item) => {
          const data = item.data() as Partial<BrokerPropertyList>;
          return {
            id: item.id,
            brokerId: data.brokerId || auth.userId!,
            clientUserId: data.clientUserId || resolvedClientUserId,
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
  }, [auth.userId, params.chatRoomId, resolvedClientUserId]);
  useEffect(() => { let active = true; if (!auth.userId) return; void Promise.all([getDocs(query(collection(db, "apartments"), where("hostId", "==", auth.userId))), getDocs(query(collection(db, "apartments"), where("assignedBrokerIds", "array-contains", auth.userId)))]).then(([ownedSnapshot, assignedSnapshot]) => { const listingDocs = new Map(ownedSnapshot.docs.map((item) => [item.id, item])); assignedSnapshot.docs.forEach((item) => listingDocs.set(item.id, item)); const mapped = Array.from(listingDocs.values()).map((item) => { const data = item.data() as Record<string, unknown>; return { ...data, id: item.id, title: String(data.title ?? "Ακίνητο"), rent: Number(data.rent ?? data.price ?? 0), city: String(data.city ?? ""), area: String(data.area ?? ""), size: Number(data.size ?? 0), image: String(data.image ?? data.imageUrl ?? ""), tags: Array.isArray(data.tags) ? data.tags.map(String) : [] } as BrokerApartment; }); if (active) setBrokerManagedApartments(mapped); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [auth.userId]);
  useEffect(() => {
    if (!resolvedClientUserId) {
      setInteractions([]);
      setSelectedApartmentFilter("all");
      setSelectedTypeFilter("all");
      return;
    }

    setSelectedApartmentFilter("all");
    setSelectedTypeFilter("all");
    return subscribeClientInteractions(resolvedClientUserId, setInteractions);
  }, [resolvedClientUserId]);
  useEffect(() => {
    if (params.scrollTo !== "suggested_properties" || suggestedSectionY <= 0) return;
    const timer = setTimeout(() => scrollViewRef.current?.scrollTo({ y: Math.max(0, suggestedSectionY - 20), animated: true }), 350);
    return () => clearTimeout(timer);
  }, [params.scrollTo, suggestedSectionY]);
  useEffect(() => {
    if (!params.highlightItemId || !params.dealId) return;
    setActiveSubView("deal_stage");
    if (highlightedDealY === null) return;
    const timer = setTimeout(() => scrollViewRef.current?.scrollTo({ y: Math.max(0, highlightedDealY - 24), animated: true }), 350);
    return () => clearTimeout(timer);
  }, [highlightedDealY, params.dealId, params.highlightItemId]);
  useEffect(() => {
    if (!auth.userId || !resolvedClientUserId || brokerManagedApartments.length === 0) {
      setClientPropertyDeals([]);
      setLoadingPropertyDeals(false);
      return;
    }

    let active = true;
    setLoadingPropertyDeals(true);
    void (async () => {
      try {
        const [deals, likesSnapshot, chatsSnapshot] = await Promise.all([
          getBrokerClientDeals(auth.userId!, resolvedClientUserId, brokerManagedApartments.map((apartment) => apartment.id)),
          getDocs(query(collection(db, "liked_apartments"), where("userId", "==", resolvedClientUserId))),
          getDocs(query(collection(db, "chats"), where("users", "array-contains", resolvedClientUserId), where("type", "==", "host"))),
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
        const actionByApartmentId = new Map<string, { hasPriceProposal: boolean; hasVisitRequest: boolean; isVisitCompleted: boolean; proposalTimestamp?: number; visitCompletedTimestamp?: number }>();
        await Promise.all(chatsSnapshot.docs.map(async (chatSnapshot) => {
          const chatData = chatSnapshot.data();
          const chatApartmentId = typeof chatData.apartmentId === "string" ? chatData.apartmentId : undefined;
          if (!chatApartmentId) return;
          const messages = await getDocs(collection(db, "chats", chatSnapshot.id, "messages"));
          const proposal = messages.docs.map((message) => message.data()).find((message) => message.type === "price_proposal");
          const visitRequest = messages.docs.map((message) => message.data()).find((message) => message.type === "visit_request");
          const visitCompleted = chatData.visitCompleted === true;
          actionByApartmentId.set(chatApartmentId, {
            hasPriceProposal: !!proposal,
            hasVisitRequest: !!visitRequest,
            isVisitCompleted: visitCompleted,
            proposalTimestamp: proposal?.createdAt?.toMillis?.() ?? (typeof proposal?.createdAt === "number" ? proposal.createdAt : undefined),
            visitCompletedTimestamp: visitCompleted ? (typeof chatData.visitCompletedAt === "number" ? chatData.visitCompletedAt : undefined) : undefined,
          });
        }));
        const interactedApartmentIds = new Set([...likedApartmentIds, ...chattedApartmentIds]);
        const rows: ClientInteractedPropertyDeal[] = [];

        for (const apartmentId of interactedApartmentIds) {
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
          const dealStage = dealByApartmentId.get(apartmentId)?.pipelineStage;
          const action = actionByApartmentId.get(apartmentId) ?? { hasPriceProposal: false, hasVisitRequest: false, isVisitCompleted: false };
          const dynamicStage = calculateDynamicDealStage({
            isLead: true,
            hasVisitRequest: action.hasVisitRequest || dealStage === "showing_scheduled",
            isVisitCompleted: action.isVisitCompleted || dealStage === "showing_scheduled" && false,
            hasPriceProposal: action.hasPriceProposal || dealStage === "offer_made",
            isUnderNegotiation: dealStage === "negotiation_agreement",
            isDealClosed: dealStage === "deal_closed",
            proposalTimestamp: action.proposalTimestamp,
            visitCompletedTimestamp: action.visitCompletedTimestamp,
          });
          const dynamicStageKey = dynamicStage.stagePercent === 100 ? "closed_won" : dynamicStage.stagePercent === 90 ? "negotiation_agreement" : dynamicStage.stagePercent === 65 ? "offer_made" : dynamicStage.stagePercent === 35 ? "showing_scheduled" : normalizePipelineStage(dealStage);
          rows.push({
            apartmentId,
            title: apartment.title,
            image: apartment.image,
            rent: apartment.rent,
            area: apartment.area,
            city: apartment.city,
            compatibilityScore: filters ? calculateTenantCompatibilityScore(listingData, filters) : 0,
            pipelineStage: dynamicStageKey,
            interactionType: isLiked && isChatted ? "both" : isLiked ? "liked" : "chat",
            dealCommission: apartment.rent,
            clientRating: await (async () => {
              const ratingSnapshot = await getDoc(doc(db, "apartments", apartmentId, "ratings", resolvedClientUserId)).catch(() => null);
              const score = ratingSnapshot?.exists() ? Number(ratingSnapshot.data().score) : NaN;
              return Number.isInteger(score) && score >= 1 && score <= 10 ? score : undefined;
            })(),
          });
        }

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
  }, [auth.userId, brokerManagedApartments, filters, resolvedClientUserId]);
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
        setSharedSearchQueries(Array.isArray(data.sharedSearchQueries) ? data.sharedSearchQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0) : []);
        setSharedSearchFilterSets(Array.isArray(data.sharedSearchFilterSets) ? data.sharedSearchFilterSets.filter((filterSet): filterSet is SharedSearchFilterSet => Boolean(filterSet && typeof filterSet.id === "string" && typeof filterSet.title === "string" && filterSet.data && typeof filterSet.data === "object")) : []);
      } catch (error) {
        console.error("[BrokerClientDetail] Error loading purchasing power:", error);
      }
    })();
    return () => { active = false; };
  }, [auth.userId, params.clientUserId]);

  useEffect(() => {
    const subscriptions = clientPropertyDeals.map((deal) => {
      const dealId = `${deal.apartmentId}_${resolvedClientUserId || ""}`;
      return onSnapshot(
        collection(db, "deals", dealId, "checklist"),
        (snapshot) => {
          const storedItems = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
          const mergedItems = DEFAULT_DEAL_CHECKLIST.map((template) => ({
            ...template,
            ...(storedItems.get(template.id) ?? {}),
          })) as DealChecklistItem[];
          const templateIds = new Set(DEFAULT_DEAL_CHECKLIST.map((item) => item.id));
          const extraItems = snapshot.docs
            .filter((item) => !templateIds.has(item.id))
            .map((item) => ({ id: item.id, ...item.data() } as DealChecklistItem));
          setChecklistsByDealId((previous) => ({ ...previous, [dealId]: [...mergedItems, ...extraItems] }));
        },
        (error) => console.warn("[BrokerClientDetail] Error loading deal checklist:", error),
      );
    });
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [clientPropertyDeals, resolvedClientUserId]);

  const currentStageConfig = CLEAN_PIPELINE_STAGES.find((stage) => stage.key === pipelineStage) ?? CLEAN_PIPELINE_STAGES[0];
  const selectedReadinessOption = LEAD_READINESS_OPTIONS.find((option) => option.key === leadReadiness);
  const realBudget = (Number(cashOnHand) || 0) + (Number(approvedMortgage) || 0);
  const elapsedDays = Math.max(0, Math.floor((Date.now() - stageUpdatedAt) / (1000 * 60 * 60 * 24)));
  const isStagnant = currentStageConfig.probability >= 0.5 && currentStageConfig.probability < 1 && elapsedDays >= 5;
  const stagnationColor = elapsedDays >= 10 ? "#EF4444" : elapsedDays >= 7 ? "#F97316" : "#EAB308";
  const stagnationIcon = elapsedDays >= 10 ? "warning-outline" : "alert-circle-outline";
  const canReviewDocuments = auth.isBroker || ["ceo", "secretary", "secretariat", "admin"].includes(auth.agencyRole || "");

  const checklistItemsForDeal = (dealId: string): DealChecklistItem[] => (
    checklistsByDealId[dealId] ?? DEFAULT_DEAL_CHECKLIST.map((item) => ({ ...item }))
  );

  const showChecklistError = (title: string, error: unknown) => {
    const message = error instanceof Error && error.message ? error.message : "Δεν ήταν δυνατή η ολοκλήρωση της ενέργειας.";
    setShareFeedbackModal({ visible: true, title, description: message });
  };

  const handleUploadChecklistDocument = async (apartmentId: string, item: DealChecklistItem) => {
    if (!auth.userId || !params.clientUserId || checklistUploadItemKey) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    if (typeof asset.size === "number" && asset.size > 25 * 1024 * 1024) {
      setShareFeedbackModal({ visible: true, title: "Το αρχείο είναι πολύ μεγάλο", description: "Το μέγιστο επιτρεπόμενο μέγεθος είναι 25 MB." });
      return;
    }
    const fileName = (asset.name?.trim() || `document-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const extension = fileName.toLowerCase().split(".").pop();
    const mimeType = asset.mimeType || (extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : "image/jpeg");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
      setShareFeedbackModal({ visible: true, title: "Μη υποστηριζόμενο αρχείο", description: "Επιλέξτε αρχείο PDF, JPEG ή PNG." });
      return;
    }

    const dealId = `${apartmentId}_${params.clientUserId}`;
    const apartment = brokerManagedApartments.find((candidate) => candidate.id === apartmentId);
    setChecklistUploadItemKey(`${dealId}:${item.id}`);
    try {
      const initializeDeal = httpsCallable<Record<string, unknown>, { dealId: string }>(firebaseFunctions, "initializeDealCallable");
      await initializeDeal({
        apartmentId,
        brokerId: auth.userId,
        clientId: params.clientUserId,
        clientName: params.clientName || t("brokerClient.clientFallback"),
        apartmentTitle: apartment?.title || "Ακίνητο",
        ...(typeof apartment?.rent === "number" ? { dealAmount: apartment.rent } : {}),
      });
      const storagePath = `deals/${dealId}/${item.id}/${fileName}`;
      const fileUrl = await uploadImageAsync(asset.uri, storagePath, mimeType);
      const finalizeUpload = httpsCallable<Record<string, unknown>, { dealId: string; itemId: string; status: string }>(firebaseFunctions, "finalizeChecklistDocumentUploadCallable");
      await finalizeUpload({ dealId, itemId: item.id, fileUrl, fileName, storagePath });
    } catch (error) {
      console.error("[BrokerClientDetail] Failed to upload checklist document:", error);
      showChecklistError("Αποτυχία μεταφόρτωσης", error);
    } finally {
      setChecklistUploadItemKey(null);
    }
  };

  const submitChecklistReview = async (dealId: string, item: DealChecklistItem, action: "verify" | "reject", reason?: string) => {
    if (!auth.userId || reviewingChecklistItemKey) return;
    setReviewingChecklistItemKey(`${dealId}:${item.id}`);
    try {
      const reviewDocument = httpsCallable<Record<string, unknown>, { dealId: string; itemId: string; status: string }>(firebaseFunctions, "reviewChecklistDocumentCallable");
      await reviewDocument({ dealId, itemId: item.id, action, ...(action === "reject" ? { rejectionReason: reason } : {}) });
      setRejectionPrompt(null);
      setRejectionReason("");
      setRejectionReasonError("");
    } catch (error) {
      console.error("[BrokerClientDetail] Failed to review checklist document:", error);
      showChecklistError("Αποτυχία ελέγχου εγγράφου", error);
    } finally {
      setReviewingChecklistItemKey(null);
    }
  };

  const handleReviewChecklist = (dealId: string, item: DealChecklistItem, action: "verify" | "reject") => {
    if (action === "reject") {
      setRejectionReason("");
      setRejectionReasonError("");
      setRejectionPrompt({ dealId, item });
      return;
    }
    void submitChecklistReview(dealId, item, action);
  };

  const handleSelectDealStage = (apartmentId: string, nextStage: CleanPipelineStageKey) => {
    const targetStage = CLEAN_PIPELINE_STAGES.find((stage) => stage.key === nextStage)?.percentage ?? 0;
    if (targetStage >= 90) {
      const dealId = `${apartmentId}_${params.clientUserId || ""}`;
      const checklistItems = checklistItemsForDeal(dealId);
      const missingItems = checklistItems
        .filter((item) => (targetStage === 100 || item.requiredForStage <= 90) && item.status !== "verified")
        .map((item) => item.title);
      if (missingItems.length > 0) {
        setStageGateModal({
          stageLabel: `${nextStage === "closed_won" ? "Ολοκληρωμένη Συμφωνία" : "Προσύμφωνο"} (${targetStage}%)`,
          missingItems,
        });
        setEditingDealStageAptId(null);
        return;
      }
    }
    void handleUpdatePropertyDealStage(apartmentId, nextStage);
  };

  const handleUpdatePropertyDealStage = async (apartmentId: string, nextStage: CleanPipelineStageKey) => {
    if (!auth.userId || !params.clientUserId) return;
    const apartment = brokerManagedApartments.find((item) => item.id === apartmentId);
    const previousStage = clientPropertyDeals.find((item) => item.apartmentId === apartmentId)?.pipelineStage;
    if (nextStage === "closed_lost") {
      const previousStageConfig = CLEAN_PIPELINE_STAGES.find((stage) => stage.key === previousStage);
      setPendingLostDeal({
        apartmentId,
        apartmentTitle: apartment?.title || "Ακίνητο",
        stageBeforeLoss: previousStageConfig?.percentage ?? 0,
        potentialRevenueLoss: apartment?.rent ?? 0,
      });
      setIsLossModalVisible(true);
      setEditingDealStageAptId(null);
      return;
    }
    setEditingDealStageAptId(null);

    try {
      const initializeDeal = httpsCallable<Record<string, unknown>, { dealId: string }>(firebaseFunctions, "initializeDealCallable");
      const advanceDealStage = httpsCallable<Record<string, unknown>, { dealId: string; stage: number }>(firebaseFunctions, "advanceDealStageCallable");
      const dealId = `${apartmentId}_${params.clientUserId}`;
      await initializeDeal({
        apartmentId,
        brokerId: auth.userId,
        clientId: params.clientUserId,
        clientName: params.clientName || t("brokerClient.clientFallback"),
        apartmentTitle: apartment?.title || "Ακίνητο",
        ...(typeof apartment?.rent === "number" ? { dealAmount: apartment.rent } : {}),
      });
      const targetStage = CLEAN_PIPELINE_STAGES.find((stage) => stage.key === nextStage)?.percentage ?? 0;
      await advanceDealStage({ dealId, targetStage });
      setClientPropertyDeals((previous) => previous.map((item) => item.apartmentId === apartmentId ? { ...item, pipelineStage: nextStage } : item));
      if (nextStage === "negotiation_agreement" && apartmentId) {
        await updateDoc(doc(db, "apartments", apartmentId), {
          status: "under_negotiation",
          isOffMarket: true,
          withdrawnReason: "preliminary_agreement",
        });
      }
      if (nextStage === "closed_won" && previousStage !== "closed_won" && apartment) {
        await updateDoc(doc(db, "apartments", apartmentId), {
          status: "closed_deal",
          isOffMarket: true,
        });
        const apartmentRecord = apartment as BrokerApartment & { ownerId?: string; commissionRate?: number };
        await settleClosedDeal({
          apartmentId,
          apartmentTitle: apartment.title,
          dealAmount: apartment.rent,
          commissionRate: apartmentRecord.commissionRate,
          brokerId: auth.userId,
          brokerName: auth.user?.name || "Μεσίτης",
          clientId: params.clientUserId,
          clientName: params.clientName || t("brokerClient.clientFallback"),
          ownerId: apartmentRecord.ownerId,
          listingBrokerId: Array.isArray(apartmentRecord.assignedBrokerIds) ? apartmentRecord.assignedBrokerIds[0] : undefined,
          buyerBrokerId: auth.userId,
        });
      }
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

  const handleConfirmLostDeal = async (lostReason: LostDealReason, notes?: string) => {
    if (!auth.userId || !params.clientUserId || !pendingLostDeal) return;
    const lostDeal = pendingLostDeal;
    try {
      await setDoc(doc(db, "brokerClientProfiles", `${auth.userId}_${params.clientUserId}`), {
        pipelineStage: "closed_lost",
        lossReason: lostReason,
        lossNotes: notes ?? null,
        lossApartmentId: lostDeal.apartmentId,
        lossApartmentTitle: lostDeal.apartmentTitle,
        lossReportedAt: Date.now(),
        stageUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });
      const advanceDealStage = httpsCallable<Record<string, unknown>, { dealId: string; stage: number }>(firebaseFunctions, "advanceDealStageCallable");
      await advanceDealStage({
        dealId: `${lostDeal.apartmentId}_${params.clientUserId}`,
        targetStage: lostDeal.stageBeforeLoss,
        status: "lost",
        lostReason,
      });
      await recordLostDeal({
        agencyId: auth.agencyId || "",
        dealId: `${lostDeal.apartmentId}_${params.clientUserId}`,
        apartmentId: lostDeal.apartmentId,
        brokerId: auth.userId,
        clientId: params.clientUserId,
        lostReason,
        notes,
        stageBeforeLoss: lostDeal.stageBeforeLoss,
        potentialRevenueLoss: lostDeal.potentialRevenueLoss,
      });
      setClientPropertyDeals((previous) => previous.map((item) => item.apartmentId === lostDeal.apartmentId ? { ...item, pipelineStage: "closed_lost" } : item));
      setPendingLostDeal(null);
      setIsLossModalVisible(false);
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving lost deal:", error);
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
  const handleSaveFilterSet = async (formData: Partial<BrokerClientFilterSet>, isExisting: boolean) => {
    if (!profileId || !auth.userId || savingFilterSet) return;
    setSavingFilterSet(true);
    const now = Date.now();
    const brokerName = auth.user?.name?.trim() || "Μεσίτης";
    try {
      if (isExisting && editingFilterSet) {
        const updatedSet: Partial<BrokerClientFilterSet> = {
          ...formData,
          clientUserId: params.clientUserId,
          title: editingFilterSet.title,
          origin: "broker_created",
          version: (editingFilterSet.version || 1) + 1,
          brokerModCount: (editingFilterSet.brokerModCount || 0) + 1,
          lastModifiedByBrokerId: auth.userId,
          lastModifiedByBrokerName: brokerName,
          lastModifiedAt: now,
          isSharedWithClient: false,
          updatedAt: now,
        };
        await setDoc(doc(db, "brokerClientProfiles", profileId, "savedFilterSets", editingFilterSet.id), updatedSet, { merge: true });
      } else {
        const newSetId = `broker_fs_${Date.now()}`;
        const newSet: BrokerClientFilterSet = {
          ...(formData as Omit<BrokerClientFilterSet, "id" | "title" | "origin" | "version" | "brokerModCount" | "lastModifiedAt" | "isSharedWithClient">),
          id: newSetId,
          clientUserId: params.clientUserId,
          title: formData.title?.trim() || "Προτεινόμενα Κριτήρια",
          origin: "broker_created",
          version: 1,
          brokerModCount: 1,
          lastModifiedByBrokerId: auth.userId,
          lastModifiedByBrokerName: brokerName,
          lastModifiedAt: now,
          isSharedWithClient: false,
        };
        await setDoc(doc(db, "brokerClientProfiles", profileId, "savedFilterSets", newSetId), newSet);
      }
      setEditingFilterSet(null);
      setIsNewFilterSetModalOpen(false);
      await loadFilterSets();
    } catch (error) {
      console.error("[BrokerClientDetail] Error saving filter set:", error);
    } finally {
      setSavingFilterSet(false);
    }
  };
  const handleShareFilterSetToChat = async (filterSet: BrokerClientFilterSet) => {
    if (!params.chatRoomId || !params.clientUserId || !auth.userId || !profileId || !filterSet.id) return;
    try {
      const sharedAt = Date.now();
      const filterSetData = { ...filterSet, sharedAt };
      await addDoc(collection(db, "chats", params.chatRoomId, "messages"), {
        senderId: auth.userId,
        receiverId: params.clientUserId,
        type: "filter_set_share",
        filterSetId: filterSet.id,
        filterSetData,
        text: `[Κριτήρια Αναζήτησης: ${filterSet.title}]`,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      await setDoc(doc(db, "users", params.clientUserId, "savedFilterSets", filterSet.id), {
        ...filterSetData,
        clientUserId: params.clientUserId,
        isSharedWithClient: true,
        sharedByBrokerId: auth.userId,
      }, { merge: true });
      await updateDoc(doc(db, "brokerClientProfiles", profileId, "savedFilterSets", filterSet.id), { isSharedWithClient: true });
      setFilterSets((previous) => previous.map((item) => item.id === filterSet.id ? { ...item, isSharedWithClient: true } : item));
      setShareFeedbackModal({ visible: true, title: "Το set κοινοποιήθηκε!", description: `Τα κριτήρια «${filterSet.title}» στάλθηκαν στη συνομιλία με τον πελάτη.` });
    } catch (error) {
      console.error("[BrokerClientDetail] Failed to share filter set:", error);
      setShareFeedbackModal({ visible: true, title: "Αποτυχία κοινοποίησης", description: "Δεν ήταν δυνατή η αποστολή των κριτηρίων στη συνομιλία." });
    }
  };
  const openNewFilterSet = () => {
    setEditingFilterSet(null);
    setFilterSetForm(EMPTY_FILTER_SET_FORM);
    setIsNewFilterSetModalOpen(true);
  };
  const openFilterSetEditor = (filterSet: BrokerClientFilterSet) => {
    setEditingFilterSet(filterSet);
    setFilterSetForm(formFromFilterSet(filterSet));
    setIsNewFilterSetModalOpen(true);
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
        {resolvedClientUserId ? (
          <Pressable
            style={styles.headerActionBtn}
            onPress={() => setCalendarNotesVisible(true)}
            accessibilityLabel="Σημειώσεις Ημερολογίου"
            testID="broker-client-calendar-notes"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.onSurface} />
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.headerActionBtn, activeSubView === "deal_stage" && styles.headerActionBtnActive]}
          onPress={() => setActiveSubView((previous) => previous === "deal_stage" ? "default" : "deal_stage")}
          hitSlop={6}
          testID="broker-client-toggle-deal-stage"
        >

        {resolvedClientUserId && auth.userId ? (
          <ClientCalendarNotesModal
            visible={calendarNotesVisible}
            clientId={resolvedClientUserId}
            clientName={params.clientName ?? "Πελάτης"}
            brokerId={auth.userId}
            listings={calendarListingOptions}
            onClose={() => setCalendarNotesVisible(false)}
          />
        ) : null}
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
    <KeyboardAwareScrollView ref={scrollViewRef} contentContainerStyle={[styles.content, { flexGrow: 1, paddingBottom: spacing["3xl"] + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.profileCard}>
        {params.clientAvatar ? <Image source={{ uri: params.clientAvatar }} style={styles.avatar} /> : <DefaultProfileAvatar size={64} iconSize={28} />}
        <Text numberOfLines={1} style={styles.clientName}>{params.clientName || t("brokerClient.clientFallback")}</Text>
        <Pressable style={styles.chatButton} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: params.clientUserId || "", chatRoomId: params.chatRoomId || "" } })} testID="broker-client-open-chat">
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onBrand} />
          <Text style={styles.chatButtonText}>{t("brokerClient.goToChat")}</Text>
        </Pressable>
        {isManualClient ? <Pressable style={styles.addClientEmailButton} onPress={() => setIsAddEmailModalOpen(true)} testID="broker-client-add-email"><Ionicons name="mail-outline" size={16} color={colors.brand} /><Text style={styles.addClientEmailText}>Προσθήκη email</Text></Pressable> : null}
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
                const dealId = `${item.apartmentId}_${params.clientUserId || ""}`;
                return (
                  <View
                    key={item.apartmentId}
                    onLayout={(event) => {
                      if (dealId === params.dealId) setHighlightedDealY(event.nativeEvent.layout.y);
                    }}
                    style={styles.propertyDealCard}
                  >
                    <View style={styles.propertyDealTopRow}>
                      {item.image ? <Image source={{ uri: item.image }} contentFit="cover" style={styles.propertyDealThumb} /> : <View style={styles.propertyDealThumb}><Ionicons color={colors.onSurfaceTertiary} name="home-outline" size={20} /></View>}
                      <View style={styles.propertyDealMetaCol}>
                        <Text numberOfLines={1} style={styles.propertyDealTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={styles.propertyDealSubtitle}>{`${item.area}, ${item.city} · €${item.rent}/mo`}</Text>
                      </View>
                      {item.clientRating ? <View style={styles.dealRatingPill}><Ionicons color="#F59E0B" name="star" size={12} /><Text style={styles.dealRatingPillText}>{`${item.clientRating}/10`}</Text></View> : null}
                      <View style={styles.interactionTypeBadge}>
                        <Ionicons color={item.interactionType === "liked" ? "#EF4444" : colors.brand} name={item.interactionType === "liked" ? "heart" : item.interactionType === "chat" ? "chatbubble-ellipses" : "heart-circle"} size={12} />
                        <Text style={styles.interactionTypeBadgeText}>{item.interactionType === "both" ? "Like & Chat" : item.interactionType === "liked" ? "Like" : "Chat"}</Text>
                      </View>
                    </View>
                    <DealChecklistSection
                      items={checklistItemsForDeal(dealId)}
                      canReview={canReviewDocuments}
                      highlightItemId={dealId === params.dealId ? params.highlightItemId : undefined}
                      uploadingItemId={checklistUploadItemKey?.startsWith(`${dealId}:`) ? checklistUploadItemKey.slice(dealId.length + 1) : null}
                      onUpload={(checklistItem) => void handleUploadChecklistDocument(item.apartmentId, checklistItem)}
                      onPreview={(checklistItem) => setPreviewDocument(checklistItem)}
                      onReview={(checklistItem, action) => handleReviewChecklist(dealId, checklistItem, action)}
                    />
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
                            <Pressable key={option.key} style={[styles.inlineStageOptRow, isSelected && styles.inlineStageOptRowSelected]} onPress={() => handleSelectDealStage(item.apartmentId, option.key)} testID={`broker-client-stage-opt-${item.apartmentId}-${option.key}`}>
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
        <View style={styles.filterSetsHeaderRow}>
          <Text style={styles.sectionTitle}>Κριτήρια Αναζήτησης</Text>
          <Pressable onPress={openNewFilterSet} hitSlop={6} style={styles.addFilterSetBtn} testID="broker-client-new-filter-set">
            <Ionicons color={colors.onBrand} name="add" size={16} />
            <Text style={styles.addFilterSetBtnText}>Νέο Set</Text>
          </Pressable>
        </View>
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
            {filters.userHardCriteria?.length ? <View style={styles.hardCriteriaGroup}>
              <Text style={styles.hardCriteriaGroupTitle}>Μη Διαπραγματεύσιμα (Hard Criteria)</Text>
              <View style={styles.hardCriteriaBadgeRow}>{filters.userHardCriteria.map((criterion) => <Text key={criterion} style={styles.hardCriteriaBadge}>{HARD_CRITERIA_LABELS[criterion]}</Text>)}</View>
            </View> : null}
          </View>
        ) : null}
        {filterSets.map((filterSet) => {
          const isSelected = selectedFilterSetId === filterSet.id;
          const city = filterSet.cityQuery || "Όλες οι περιοχές";
          const budget = filterSet.rentMax != null ? `έως ${filterSet.rentMax} €` : "χωρίς όριο τιμής";
          return (
            <View key={filterSet.id} style={[styles.sharedFilterSetCard, isSelected && styles.sharedFilterSetCardActive]}>
              <Pressable style={styles.filterSetCardMain} onPress={() => setSelectedFilterSetId(isSelected ? null : filterSet.id)} testID={`broker-client-filter-set-${filterSet.id}`}>
                <Ionicons color={isSelected ? colors.brand : colors.onSurfaceTertiary} name={isSelected ? "checkmark-circle" : "options-outline"} size={20} />
                <View style={styles.sharedFilterSetTextCol}>
                  <Text style={styles.sharedFilterSetTitle} numberOfLines={1}>{filterSet.title}</Text>
                  <Text style={styles.sharedFilterSetMeta}>{`${city} · ${budget}`}</Text>
                </View>
              </Pressable>
              {filterSet.userHardCriteria?.length ? <View style={styles.hardCriteriaGroup}>
                <Text style={styles.hardCriteriaGroupTitle}>Μη Διαπραγματεύσιμα (Hard Criteria)</Text>
                <View style={styles.hardCriteriaBadgeRow}>
                  {filterSet.userHardCriteria.map((criterion) => <Text key={criterion} style={styles.hardCriteriaBadge}>{HARD_CRITERIA_LABELS[criterion]}</Text>)}
                </View>
              </View> : null}
              <View style={styles.filterSetActionsRow}>
                <Pressable onPress={() => openFilterSetEditor(filterSet)} hitSlop={6} style={styles.iconActionBtn} testID={`broker-client-edit-filter-set-${filterSet.id}`}>
                  <Ionicons color={colors.onSurface} name="pencil-outline" size={16} />
                </Pressable>
                {!filterSet.isSharedWithClient ? (
                  <Pressable onPress={() => void handleShareFilterSetToChat(filterSet)} hitSlop={6} style={styles.shareDraftBtn} testID={`broker-client-share-filter-set-${filterSet.id}`}>
                    <Ionicons color={colors.onBrand} name="paper-plane-outline" size={13} />
                    <Text style={styles.shareDraftBtnText}>Κοινοποίηση στο Chat</Text>
                  </Pressable>
                ) : (
                  <View style={styles.sharedBadge}>
                    <Ionicons color={colors.brand} name="checkmark-done" size={14} />
                    <Text style={styles.sharedBadgeText}>Κοινοποιήθηκε</Text>
                  </View>
                )}
              </View>
              <BrokerModificationBadge modCount={filterSet.brokerModCount} brokerName={filterSet.lastModifiedByBrokerName} modifiedAt={filterSet.lastModifiedAt} />
              {isSelected ? <Text style={styles.activeFilterLabel}>Ενεργό</Text> : null}
            </View>
          );
        })}
        {!filters && sharedSearchQueries.length === 0 && filterSets.length === 0 ? (
          <View style={styles.emptyFilterBox} testID="broker-client-empty-filters">
            <Ionicons color={colors.onSurfaceTertiary} name="search-outline" size={22} />
            <Text style={styles.emptyFilterText}>Δεν υπάρχει διαμοιρασμένο ιστορικό αναζητήσεων για αυτόν τον πελάτη.</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.proposalsContainer} onLayout={(event) => setSuggestedSectionY(event.nativeEvent.layout.y)} testID="broker-client-suggested-properties">
        <View style={styles.proposalsHeaderRow}>
          <Text numberOfLines={2} style={styles.proposalsHeaderTitle}>Προτεινόμενα Ακίνητα από το Χαρτοφυλάκιο</Text>
          <Pressable onPress={() => { setIsCreatingList((previous) => !previous); setSelectedApartmentIds(new Set()); }} hitSlop={8} style={styles.proposalsAddBtn} testID="broker-client-add-proposal-btn">
            <Ionicons color={colors.onBrand} name={isCreatingList ? "close" : "add"} size={18} />
            <Text style={styles.proposalsAddBtnText}>{isCreatingList ? "Κλείσιμο" : "Προσθήκη"}</Text>
          </Pressable>
        </View>
        {savedPropertyLists.map((list) => <View key={list.id} style={styles.savedListCard}><View style={styles.savedListIconWrap}><Ionicons color={colors.brand} name="list" size={20} /></View><View style={styles.savedListTextCol}><Text numberOfLines={1} style={styles.savedListTitle}>{list.title}</Text><Text style={styles.savedListSub}>{list.apartmentIds.length} ακίνητα</Text></View><View style={list.hasClientInteracted ? styles.seenBadgePill : styles.unseenBadgePill}>{list.hasClientInteracted ? <Ionicons color={colors.brand} name="checkmark-done" size={14} /> : <Ionicons color={colors.onSurfaceTertiary} name="time-outline" size={13} />}<Text style={list.hasClientInteracted ? styles.seenBadgeText : styles.unseenBadgeText}>{list.hasClientInteracted ? "Προβλήθηκε" : "Σε αναμονή"}</Text></View><Pressable onPress={() => void handleSendListToChat(list)} hitSlop={8} style={styles.sendListChatBtn} testID={`send-list-btn-${list.id}`}><Ionicons color={colors.onBrand} name="paper-plane-outline" size={18} /></Pressable></View>)}
        {loading ? <ActivityIndicator color={colors.brand} /> : rankedPortfolio.map((apartment) => <View key={apartment.id} style={styles.portfolioItemContainer} testID={`broker-matched-apartment-${apartment.id}`}><Pressable style={styles.portfolioCardMain} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(apartment) } } as never)}><View>{apartment.image ? <Image source={{ uri: apartment.image }} contentFit="cover" style={styles.portfolioThumb} /> : <View style={[styles.portfolioThumb, styles.portfolioThumbPlaceholder]}><Ionicons color={colors.onSurfaceTertiary} name="home-outline" size={20} /></View>}</View><View style={styles.portfolioTextColumn}><Text numberOfLines={1} style={styles.portfolioTitle}>{apartment.title}</Text><Text style={styles.portfolioSubtitle}>{apartment.area}, {apartment.city} · {apartment.rent}€ · {apartment.size}m²</Text></View><View style={styles.scoreActionRow}><View style={styles.compatibilityBadge}><Text style={styles.compatibilityBadgeText}>{apartment.compatibilityScore}% Match</Text></View><Pressable onPress={() => setExpandedScoreListingId((previous) => previous === apartment.id ? null : apartment.id)} hitSlop={8} style={styles.infoIconButton} testID={`toggle-score-info-${apartment.id}`}><Ionicons color={expandedScoreListingId === apartment.id ? colors.brand : colors.onSurfaceTertiary} name={expandedScoreListingId === apartment.id ? "information-circle" : "information-circle-outline"} size={20} /></Pressable></View>{apartment.failedHardCriteria?.length ? <View style={styles.hardOverridePill}><Text style={styles.hardOverrideText}>{`⚠ ${apartment.compatibilityScore}% Match (Εξαίρεση: ${apartment.failedHardCriteria.map((criterion) => HARD_CRITERIA_LABELS[criterion]).join(", ")})`}</Text></View> : null}{isCreatingList && <Pressable onPress={() => setSelectedApartmentIds((previous) => { const next = new Set(previous); if (next.has(apartment.id)) next.delete(apartment.id); else next.add(apartment.id); return next; })} hitSlop={8} style={styles.selectionDotBtn} testID={`select-apartment-${apartment.id}`}><Ionicons color={selectedApartmentIds.has(apartment.id) ? colors.brand : colors.onSurfaceTertiary} name={selectedApartmentIds.has(apartment.id) ? "checkmark-circle" : "ellipse-outline"} size={24} /></Pressable>}</Pressable>{expandedScoreListingId === apartment.id ? <View style={styles.justificationBox} testID={`score-justification-${apartment.id}`}><Text style={styles.justificationMainTitle}>Αιτιολόγηση Σκορ Συμβατότητας ({apartment.compatibilityScore}%)</Text><View style={styles.criteriaGroup}><View style={styles.groupHeaderRow}><Ionicons color="#EF4444" name="shield-checkmark" size={14} /><Text style={styles.hardGroupTitle}>Πολύ σημαντικό (Βασικά Κριτήρια):</Text></View>{apartment.scoreBreakdown.hardMet.length ? apartment.scoreBreakdown.hardMet.map((item, index) => <View key={`${apartment.id}-hard-${index}`} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.criteriaItemText}>{item}</Text></View>) : <Text style={styles.emptyCriteriaText}>Δεν πληρούνται βασικά κριτήρια.</Text>}</View><View style={styles.criteriaGroup}><View style={styles.groupHeaderRow}><Ionicons color="#10B981" name="checkmark-circle-outline" size={14} /><Text style={styles.softGroupTitle}>Σημαντικό (Επιπλέον Προτιμήσεις):</Text></View>{apartment.scoreBreakdown.softMet.length ? apartment.scoreBreakdown.softMet.map((item, index) => <View key={`${apartment.id}-soft-${index}`} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text><Text style={styles.criteriaItemText}>{item}</Text></View>) : <Text style={styles.emptyCriteriaText}>Δεν έχουν οριστεί ή δεν πληρούνται επιπλέον προτιμήσεις.</Text>}</View></View> : null}</View>)}
        {isCreatingList && <Pressable disabled={selectedApartmentIds.size === 0} onPress={() => { setNewListName(`Προτάσεις (${selectedApartmentIds.size})`); setIsNameListModalVisible(true); }} style={[styles.createListSubmitBtn, selectedApartmentIds.size === 0 && styles.createListSubmitBtnDisabled]} testID="submit-create-property-list"><Ionicons color={colors.onBrand} name="bookmark-outline" size={18} /><Text style={styles.createListSubmitBtnText}>{`Δημιουργία λίστας (${selectedApartmentIds.size})`}</Text></Pressable>}
        {!loading && rankedPortfolio.length === 0 ? <Text style={styles.emptyHint}>Δεν βρέθηκαν διαθέσιμα ακίνητα στο χαρτοφυλάκιό σας που να πληρούν όλα τα κριτήρια.</Text> : null}
      </View>
      </> : null}
      </KeyboardAwareScrollView>
    <KeyboardAwareModal visible={addInteractionModalVisible} transparent animationType="fade" onRequestClose={() => { if (!isSavingInteraction) setAddInteractionModalVisible(false); }}>
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
    </KeyboardAwareModal>
    <DocumentPreviewModal
      visible={!!previewDocument}
      fileUrl={previewDocument?.fileUrl}
      fileName={previewDocument?.fileName}
      onClose={() => setPreviewDocument(null)}
    />
    <CenteredActionModal
      visible={!!rejectionPrompt}
      title="Απόρριψη εγγράφου"
      description={rejectionPrompt ? `Αναφέρετε γιατί απορρίπτεται το «${rejectionPrompt.item.title}».` : undefined}
      onDismiss={() => {
        if (!reviewingChecklistItemKey) {
          setRejectionPrompt(null);
          setRejectionReasonError("");
        }
      }}
      actions={[
        {
          label: "Ακύρωση",
          iconName: "close-outline",
          variant: "muted",
          onPress: () => {
            setRejectionPrompt(null);
            setRejectionReasonError("");
          },
        },
        {
          label: reviewingChecklistItemKey ? "Αποστολή..." : "Απόρριψη",
          iconName: "alert-circle-outline",
          variant: "danger",
          onPress: () => {
            if (!rejectionPrompt) return;
            if (!rejectionReason.trim()) {
              setRejectionReasonError("Ο λόγος απόρριψης είναι υποχρεωτικός.");
              return;
            }
            void submitChecklistReview(rejectionPrompt.dealId, rejectionPrompt.item, "reject", rejectionReason.trim());
          },
        },
      ]}
      testID="checklist-rejection-modal"
    >
      <TextInput
        value={rejectionReason}
        onChangeText={(value) => {
          setRejectionReason(value);
          setRejectionReasonError("");
        }}
        placeholder="π.χ. Λείπει η υπογραφή του ιδιοκτήτη"
        placeholderTextColor={colors.onSurfaceTertiary}
        style={styles.interactionNoteInput}
        multiline
        textAlignVertical="top"
        maxLength={500}
        editable={!reviewingChecklistItemKey}
        testID="checklist-rejection-reason-input"
      />
      {rejectionReasonError ? <Text style={styles.rejectionReasonError}>{rejectionReasonError}</Text> : null}
    </CenteredActionModal>
    <CenteredActionModal
      visible={!!stageGateModal}
      title="Δεν είναι δυνατή η μετάβαση"
      description={stageGateModal ? `Δεν είναι δυνατή η μετάβαση στο στάδιο ${stageGateModal.stageLabel}. Εκκρεμούν τα παρακάτω έγγραφα:\n${stageGateModal.missingItems.map((title) => `• ${title}`).join("\n")}` : undefined}
      onDismiss={() => setStageGateModal(null)}
      actions={[{
        label: t("common.actions.gotIt") || "OK",
        iconName: "checkmark-circle-outline",
        onPress: () => setStageGateModal(null),
      }]}
      testID="deal-stage-gate-modal"
    />
    <CloseLostDealModal
      visible={isLossModalVisible}
      apartmentTitle={pendingLostDeal?.apartmentTitle ?? "Ακίνητο"}
      onClose={() => {
        setIsLossModalVisible(false);
        setPendingLostDeal(null);
      }}
      onConfirm={(lostReason, notes) => void handleConfirmLostDeal(lostReason, notes)}
    />
    <KeyboardAwareModal visible={isNameListModalVisible} transparent animationType="fade" onRequestClose={() => setIsNameListModalVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setIsNameListModalVisible(false)}><Pressable style={styles.stageModal} onPress={(event) => event.stopPropagation()}><Text style={styles.modalTitle}>Όνομα λίστας ακινήτων</Text><TextInput value={newListName} onChangeText={setNewListName} autoFocus placeholder="π.χ. Επιλογές για τον πελάτη" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="property-list-name-input" /><Pressable style={styles.purchasingPowerSaveButton} onPress={() => void handleSavePropertyList()} disabled={savingList} testID="save-property-list"><Ionicons name="save-outline" size={18} color={colors.onBrand} /><Text style={styles.purchasingPowerSaveText}>{savingList ? "Αποθήκευση..." : "Αποθήκευση λίστας"}</Text></Pressable></Pressable></Pressable></KeyboardAwareModal>
    <BrokerFilterSetEditorModal
      visible={isNewFilterSetModalOpen}
      draft={editingFilterSet}
      form={filterSetForm}
      editing={!!editingFilterSet}
      saving={savingFilterSet}
      onClose={() => { if (!savingFilterSet) setIsNewFilterSetModalOpen(false); }}
      onChange={(patch) => setFilterSetForm((previous) => ({ ...previous, ...patch }))}
      onSave={() => void handleSaveFilterSet({ ...formToFilterFields(filterSetForm), title: filterSetForm.title }, !!editingFilterSet)}
    />
    <AssignClientEmailModal
      visible={isAddEmailModalOpen}
      brokerId={auth.userId ?? ""}
      clientUserId={params.clientUserId ?? ""}
      onClose={() => setIsAddEmailModalOpen(false)}
    />
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

interface BrokerFilterSetEditorModalProps {
  visible: boolean;
  draft: BrokerClientFilterSet | null;
  form: FilterSetForm;
  editing: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<FilterSetForm>) => void;
  onSave: () => void;
}

function BrokerFilterSetEditorModal({ visible, draft, form, editing, saving, onClose, onChange, onSave }: BrokerFilterSetEditorModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fields: [keyof Pick<FilterSetForm, "cityQuery" | "rentMin" | "rentMax" | "sizeMin" | "sizeMax" | "bedroomsMin" | "bathroomsMin" | "propertyTypes" | "propertyCategories" | "floors" | "heatingTypes" | "selectedAmenities">, string, string][] = [
    ["cityQuery", "Πόλη / περιοχή", "π.χ. Αθήνα"],
    ["rentMin", "Ελάχιστο ενοίκιο", "0"],
    ["rentMax", "Μέγιστο ενοίκιο", "2000"],
    ["sizeMin", "Ελάχιστο εμβαδόν", ""],
    ["sizeMax", "Μέγιστο εμβαδόν", ""],
    ["bedroomsMin", "Ελάχιστα υπνοδωμάτια", ""],
    ["bathroomsMin", "Ελάχιστα μπάνια", ""],
    ["propertyTypes", "Τύποι ακινήτων", "Διαχωρίστε με κόμμα"],
    ["propertyCategories", "Κατηγορίες", "Διαχωρίστε με κόμμα"],
    ["floors", "Όροφοι", "Διαχωρίστε με κόμμα"],
    ["heatingTypes", "Θέρμανση", "Διαχωρίστε με κόμμα"],
    ["selectedAmenities", "Παροχές", "Διαχωρίστε με κόμμα"],
  ];

  return (
    <KeyboardAwareModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.filterSetEditorModal} testID="broker-filter-set-editor-modal">
          <View style={styles.interactionModalHeader}>
            <Text style={styles.modalTitle}>{editing ? "Επεξεργασία Set" : "Νέο Set Κριτηρίων"}</Text>
            <Pressable onPress={onClose} disabled={saving} hitSlop={8} testID="broker-filter-set-editor-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView style={styles.interactionModalScroll} contentContainerStyle={styles.filterSetEditorContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Τίτλος</Text>
            <TextInput value={form.title} onChangeText={(value) => onChange({ title: value })} editable={!editing} placeholder="π.χ. Κριτήρια για κέντρο" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, editing && styles.disabledInput]} testID="broker-filter-set-title-input" />
            {fields.map(([key, label, placeholder]) => (
              <View key={key}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput value={form[key]} onChangeText={(value) => onChange({ [key]: value } as Partial<FilterSetForm>)} keyboardType={key.includes("Min") || key.includes("Max") ? "number-pad" : "default"} placeholder={placeholder} placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID={`broker-filter-set-${key}-input`} />
              </View>
            ))}
            <View style={styles.switchRow}><Text style={styles.fieldLabel}>Επιπλωμένο</Text><Switch value={form.furnishedStatus === "furnished"} onValueChange={(value) => onChange({ furnishedStatus: value ? "furnished" : "unfurnished" })} /></View>
            <View style={styles.switchRow}><Text style={styles.fieldLabel}>Κατοικίδια</Text><Switch value={form.petFriendly} onValueChange={(value) => onChange({ petFriendly: value })} /></View>
            <View style={styles.switchRow}><Text style={styles.fieldLabel}>Κοντά σε μετρό</Text><Switch value={form.nearMetro} onValueChange={(value) => onChange({ nearMetro: value })} /></View>
            <View style={styles.switchRow}><Text style={styles.fieldLabel}>Εμφάνιση match score</Text><Switch value={form.showMatchScore} onValueChange={(value) => onChange({ showMatchScore: value })} /></View>
            {editing && draft ? <BrokerModificationBadge modCount={draft.brokerModCount} brokerName={draft.lastModifiedByBrokerName} modifiedAt={draft.lastModifiedAt} /> : null}
          </ScrollView>
          <View style={styles.interactionModalActions}>
            <Pressable style={styles.modalCancelButton} onPress={onClose} disabled={saving}><Text style={styles.modalCancelText}>Ακύρωση</Text></Pressable>
            <Pressable style={styles.interactionSaveButton} onPress={onSave} disabled={saving} testID="broker-filter-set-save">
              {saving ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="save-outline" size={18} color={colors.onBrand} />}
              <Text style={styles.interactionSaveText}>{saving ? "Αποθήκευση..." : "Αποθήκευση"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAwareModal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  hardCriteriaGroup: { gap: spacing.xs },
    hardCriteriaGroupTitle: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onSurfaceTertiary },
    hardCriteriaBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    hardCriteriaBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, color: colors.brand, fontFamily: fonts.bold, fontSize: fontSize.xs },
    hardOverridePill: { alignSelf: "flex-start", maxWidth: "100%", marginHorizontal: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(245, 158, 11, 0.14)", borderWidth: 1, borderColor: "rgba(245, 158, 11, 0.32)" },
    hardOverrideText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: "#B45309" },
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
  addClientEmailButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandTertiary, marginBottom: spacing.md },
  addClientEmailText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
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
  dealRatingPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.35)" },
  dealRatingPillText: { fontFamily: fonts.bold, fontSize: 11, color: "#F59E0B" },
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
  filterSetEditorModal: { width: "100%", maxHeight: "92%", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.md },
  filterSetEditorContent: { gap: spacing.xs, paddingBottom: spacing.xs },
  disabledInput: { opacity: 0.6 },
  interactionModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  interactionModalScroll: { flexShrink: 1 },
  interactionModalContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  interactionModalLabel: { marginTop: spacing.xs, fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  interactionTypeChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  interactionTypeChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  interactionTypeChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  interactionTypeChipText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  interactionTypeChipTextActive: { fontFamily: fonts.bold, color: colors.brand },
  interactionNoteInput: { minHeight: 104, maxHeight: 160, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.regular, fontSize: fontSize.base },
  rejectionReasonError: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.error },
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
  filterSetsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  addFilterSetBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
  addFilterSetBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  proposalsContainer: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  emptyFilterBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  emptyFilterText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, textAlign: "center" },
  sharedSearchesRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  sharedSearchChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  sharedSearchChipText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
  criteriaHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sharedFilterSetCard: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  sharedFilterSetCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  filterSetCardMain: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, minWidth: 0 },
  filterSetActionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs },
  iconActionBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface },
  shareDraftBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.brand },
  shareDraftBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs, color: colors.onBrand },
  sharedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  sharedBadgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.brand },
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
