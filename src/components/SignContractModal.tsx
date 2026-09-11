import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import SignatureCanvas, { type SignatureViewRef } from "react-native-signature-canvas";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";

import IdCameraCapture from "@/src/components/IdCameraCapture";
import ContractPreviewModal from "@/src/components/ContractPreviewModal";
import { ensureFirebaseAuthSession } from "@/src/api/imageUpload";
import {
  createContractDocument,
  getContractDownloadUrl,
  getContractDocument,
  recordContractSignature,
  updateContractSignerIdentity,
  updateContractPayload,
  uploadContractPdf,
} from "@/src/api/contracts";
import { db, firebaseAuth } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { getContractTitle, buildContractHtml } from "@/src/services/contractTemplates";
import { generateContractTemplatePdf } from "@/src/services/pdfGenerator";
import {
  normalizeE164PhoneNumber,
  NativeFirebaseRecaptchaHost,
  startSigningOtp,
  verifySigningOtpSession,
  type SigningOtpSession,
} from "@/src/services/signingOtp";
import { logOtpTerminalDiagnostic } from "@/src/services/otpDiagnostics";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing, type ThemeColors } from "@/src/theme";
import type {
  ContractAgencyData,
  ContractDraftContext,
  ContractParticipant,
  ContractPropertyData,
  DigitalContractDocument,
  IdCaptureMetadata,
  IdDocumentType,
  SignatureSignerEvidence,
} from "@/src/types/esignature";

type UserContactRecord = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  phoneNumber?: unknown;
  afm?: unknown;
  taxNumber?: unknown;
  idCardNumber?: unknown;
  id_card_number?: unknown;
  photoUrl?: unknown;
  avatar?: unknown;
  photos?: unknown;
};

type CoordinateEvidence = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export interface ContractSigningScreenProps {
  draft?: ContractDraftContext;
  contractId?: string;
  signerId?: string;
  onClose: () => void;
  onCreated?: (contract: DigitalContractDocument) => void;
  onCompleted?: (contract: DigitalContractDocument) => void;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPhone(data: UserContactRecord): string {
  return asString(data.phone) || asString(data.phone_number) || asString(data.phoneNumber);
}

function getAvatar(data: UserContactRecord): string {
  const photos = Array.isArray(data.photos) ? data.photos.filter((photo): photo is string => typeof photo === "string") : [];
  return asString(data.photoUrl) || asString(data.avatar) || photos[0] || "";
}

function getSignerEvidence(participant: ContractParticipant): SignatureSignerEvidence {
  return {
    signerId: participant.id,
    signerName: participant.fullName,
    signerRole: participant.role,
    ...(participant.afm ? { signerAfm: participant.afm } : {}),
    ...(participant.idCardNumber ? { signerIdCardNumber: participant.idCardNumber } : {}),
    signerPhone: participant.phone,
    signerEmail: participant.email,
    signatureBase64: "",
    signedAt: 0,
    locationCoords: { latitude: 0, longitude: 0, accuracyMeters: 0 },
    otpVerified: false,
    ...(participant.avatarUrl ? { deviceInfo: `avatar:${participant.avatarUrl}` } : {}),
  };
}

function participantFromSigner(signer: SignatureSignerEvidence): ContractParticipant {
  return {
    id: signer.signerId,
    fullName: signer.signerName,
    role: signer.signerRole,
    afm: signer.signerAfm,
    idCardNumber: signer.signerIdCardNumber,
    phone: signer.signerPhone,
    email: signer.signerEmail,
  };
}

function makeProperty(id: string, data: Record<string, unknown>, fallbackAddress?: string): ContractPropertyData {
  const price = typeof data.price === "number" ? data.price : typeof data.rent === "number" ? data.rent : undefined;
  return {
    id,
    title: asString(data.title) || "Ακίνητο",
    code: asString(data.code) || asString(data.propertyCode) || undefined,
    exactAddress: asString(data.exactAddress) || asString(data.address) || fallbackAddress || [asString(data.area), asString(data.city)].filter(Boolean).join(", "),
    price,
    monthlyRentOrPrice: price,
  };
}

function makeAgency(id: string, data: Record<string, unknown>): ContractAgencyData {
  return {
    id,
    name: asString(data.name) || asString(data.title) || "CampuStay Agency",
    logoUrl: asString(data.logoUrl) || asString(data.logo) || undefined,
    email: asString(data.email) || undefined,
    phone: asString(data.phone) || asString(data.phoneNumber) || undefined,
    address: asString(data.address) || undefined,
    taxNumber: asString(data.afm) || asString(data.taxNumber) || undefined,
  };
}

function getSignerFromContract(contract: DigitalContractDocument | null, signerId: string): SignatureSignerEvidence | null {
  return contract?.signers.find((signer) => signer.signerId === signerId) ?? null;
}

function getCallableErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.replace(/^functions\//, "") : "";
}

function getCallableErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message.toLowerCase() : "";
}

function getOtpErrorText(error: unknown, action: "send" | "verify"): string {
  const code = getCallableErrorCode(error);
  const message = getCallableErrorMessage(error);

  if (code === "otp-provider-unavailable") return t(action === "send" ? "esign.errors.otpSend" : "esign.errors.otpVerify");
  if (code === "unauthenticated") return t("esign.errors.authRequired");
  if (code === "permission-denied") return t("esign.errors.otpPermission");
  if (code === "resource-exhausted") return t(action === "send" ? "esign.errors.otpRateLimit" : "esign.errors.otpAttempts");
  if (code === "deadline-exceeded") return t("esign.errors.otpExpired");
  if (code === "auth/invalid-verification-code") return t("esign.errors.otpInvalid");
  if (code === "auth/code-expired") return t("esign.errors.otpExpired");
  if (code === "auth/too-many-requests" || code === "auth/quota-exceeded") return t("esign.errors.otpRateLimit");
  if (code === "auth/captcha-check-failed" || code === "auth/network-request-failed" || code === "auth/operation-not-supported-in-this-environment" || code === "unavailable" || code === "internal") {
    return t(action === "send" ? "esign.errors.otpSend" : "esign.errors.otpVerify");
  }
  if (code === "invalid-argument" && action === "verify") return t("esign.errors.otpInvalid");
  if (code === "failed-precondition") {
    if (action === "send" && message.includes("phone")) return t("esign.errors.otpPhone");
    if (action === "send" && (message.includes("delivery") || message.includes("sms"))) return t("esign.errors.otpDelivery");
    if (action === "verify") return t("esign.errors.otpNoRequest");
  }
  return t(action === "send" ? "esign.errors.otpSend" : "esign.errors.otpVerify");
}

const contractPreviewRendererStyles = StyleSheet.create({
  wrap: { flex: 1 },
  webView: { flex: 1, backgroundColor: "#FFFFFF" },
});

const ContractWebViewPreview = React.memo(function ContractWebViewPreview({ html }: { html: string }) {
  return (
    <View pointerEvents="none" style={contractPreviewRendererStyles.wrap}>
      <WebView source={{ html }} originWhitelist={["*"]} style={contractPreviewRendererStyles.webView} />
    </View>
  );
});

type ContractInputProps = Omit<TextInputProps, "value" | "onChangeText" | "onBlur" | "style"> & {
  value: string;
  onChangeText: NonNullable<TextInputProps["onChangeText"]>;
  onBlur?: TextInputProps["onBlur"];
  borderColor: string;
  textColor: string;
  backgroundColor: string;
};

const ContractInput = React.memo(function ContractInput({
  value,
  onChangeText,
  onBlur,
  borderColor,
  textColor,
  backgroundColor,
  multiline,
  ...props
}: ContractInputProps) {
  return (
    <TextInput
      {...props}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      multiline={multiline}
      style={[
        styles.baseInput,
        multiline && styles.multilineInput,
        { borderColor, color: textColor, backgroundColor },
      ]}
    />
  );
});

export default function ContractSigningScreen({
  draft,
  contractId,
  signerId: signerIdProp,
  onClose,
  onCreated,
  onCompleted,
}: ContractSigningScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const dynamicStyles = useMemo(() => createDynamicStyles(colors), [colors]);

  const defaultSignerId = signerIdProp?.trim() || auth.userId || "";
  const [selectedSignerId, setSelectedSignerId] = useState("");
  const signerId = selectedSignerId || defaultSignerId;
  const [contract, setContract] = useState<DigitalContractDocument | null>(null);
  const [participants, setParticipants] = useState<ContractParticipant[]>([]);
  const [agency, setAgency] = useState<ContractAgencyData | null>(null);
  const [property, setProperty] = useState<ContractPropertyData | undefined>();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [signerAfm, setSignerAfm] = useState("");
  const [signerIdCardNumber, setSignerIdCardNumber] = useState("");
  const [holdingDepositAmount, setHoldingDepositAmount] = useState("");
  const [houseRulesText, setHouseRulesText] = useState("");
  const [utilitySplitPercentage, setUtilitySplitPercentage] = useState("50");
  const [bankReference, setBankReference] = useState("");
  const [cashReceiptNote, setCashReceiptNote] = useState("");
  const [refundabilityConditions, setRefundabilityConditions] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");
  const [idCaptureMetadata, setIdCaptureMetadata] = useState<IdCaptureMetadata>({});
  const [idCaptureTimestamp, setIdCaptureTimestamp] = useState(0);
  const [idDocumentType, setIdDocumentType] = useState<IdDocumentType>("national_id");
  const [cameraVisible, setCameraVisible] = useState(false);
  const [signerPhone, setSignerPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [otpSession, setOtpSession] = useState<SigningOtpSession | null>(null);
  const [signatureData, setSignatureData] = useState("");
  const [locationCoords, setLocationCoords] = useState<CoordinateEvidence | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [isSavingPayload, setIsSavingPayload] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successContract, setSuccessContract] = useState<DigitalContractDocument | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const signatureRef = useRef<SignatureViewRef>(null);
  const formScrollRef = useRef<ScrollView | null>(null);
  const previewInputValuesRef = useRef({
    signerAfm: "",
    signerIdCardNumber: "",
    holdingDepositAmount: "",
    bankReference: "",
    cashReceiptNote: "",
    refundabilityConditions: "",
    houseRulesText: "",
    utilitySplitPercentage: "",
    idFrontUrl: "",
    idBackUrl: "",
  });

  previewInputValuesRef.current = {
    signerAfm,
    signerIdCardNumber,
    holdingDepositAmount,
    bankReference,
    cashReceiptNote,
    refundabilityConditions,
    houseRulesText,
    utilitySplitPercentage,
    idFrontUrl,
    idBackUrl,
  };

  const refreshPreview = useCallback(() => setPreviewRevision((revision) => revision + 1), []);
  const handleAfmChange = useCallback((value: string) => setSignerAfm(value.replace(/[^0-9]/g, "")), []);
  const handleDepositChange = useCallback((value: string) => setHoldingDepositAmount(value.replace(/[^0-9.,]/g, "")), []);
  const handleUtilitySplitChange = useCallback((value: string) => setUtilitySplitPercentage(value.replace(/[^0-9.,]/g, "")), []);
  const handleOtpChange = useCallback((value: string) => setOtpCode(value.replace(/[^0-9]/g, "")), []);

  const draftKey = useMemo(() => draft ? JSON.stringify({
    agencyId: draft.agencyId,
    contractType: draft.contractType,
    apartmentId: draft.apartmentId,
    participantIds: draft.participantIds,
    chatRoomId: draft.chatRoomId,
  }) : "", [draft]);

  const loadParticipant = useCallback(async (id: string, role: ContractParticipant["role"], fallback?: ContractParticipant): Promise<ContractParticipant> => {
    if (fallback && normalizeE164PhoneNumber(fallback.phone)) return fallback;
    try {
      const snapshot = await getDoc(doc(db, "users", id));
      const data = snapshot.exists() ? snapshot.data() as UserContactRecord : {};
      return {
        id,
        fullName: fallback?.fullName || asString(data.name) || "Συμβαλλόμενος",
        role: fallback?.role || role,
        afm: fallback?.afm || asString(data.afm) || asString(data.taxNumber) || undefined,
        idCardNumber: fallback?.idCardNumber || asString(data.idCardNumber) || asString(data.id_card_number) || undefined,
        phone: getPhone(data) || fallback?.phone || "",
        email: fallback?.email || asString(data.email),
        avatarUrl: fallback?.avatarUrl || getAvatar(data) || undefined,
      };
    } catch {
      return fallback ?? { id, fullName: "Συμβαλλόμενος", role, phone: "", email: "" };
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setIsLoading(true);
      setErrorText("");
      setSuccessContract(null);
      setPreviewVisible(false);
      setPreviewRevision(0);
      setStep(1);
      setSignatureData("");
      setLocationCoords(null);
      setOtpCode("");
      setOtpMessage("");
      setSignerPhone("");
      setVerificationToken("");
      setOtpVerificationId("");
      setOtpSession(null);
      setOtpVerified(false);
      setSelectedSignerId("");
      setHoldingDepositAmount("");
      setHouseRulesText("");
      setUtilitySplitPercentage("50");
      setBankReference("");
      setCashReceiptNote("");
      setRefundabilityConditions("");
      setIdCaptureMetadata({});
      setIdCaptureTimestamp(0);
      setIdDocumentType("national_id");
      try {
        const loadedContract = contractId ? await getContractDocument(contractId) : null;
        if (contractId && !loadedContract) throw new Error("Το έγγραφο δεν βρέθηκε.");

        const agencyId = loadedContract?.agencyId || draft?.agencyId || auth.agencyId || "";
        if (!agencyId) throw new Error("Δεν βρέθηκε agencyId για το έγγραφο.");
        const agencySnapshot = await getDoc(doc(db, "agencies", agencyId)).catch(() => null);
        const resolvedAgency = makeAgency(agencyId, agencySnapshot?.exists() ? agencySnapshot.data() as Record<string, unknown> : {});

        let resolvedParticipants: ContractParticipant[];
        if (loadedContract) {
          resolvedParticipants = await Promise.all(loadedContract.signers.map((signer) => loadParticipant(signer.signerId, signer.signerRole, participantFromSigner(signer))));
        } else {
          const supplied = new Map((draft?.participants ?? []).map((participant) => [participant.id, participant]));
          const participantIds = draft?.participantIds ?? [{ id: defaultSignerId, role: "broker" as const }];
          resolvedParticipants = await Promise.all(participantIds.map((participant) => loadParticipant(participant.id, participant.role, supplied.get(participant.id))));
        }
        if (!resolvedParticipants.some((participant) => participant.id === defaultSignerId)) {
          resolvedParticipants.push(await loadParticipant(defaultSignerId, "broker"));
        }

        let resolvedProperty: ContractPropertyData | undefined;
        if (loadedContract?.apartmentId || draft?.apartmentId) {
          const apartmentId = loadedContract?.apartmentId || draft?.apartmentId || "";
          const apartmentSnapshot = await getDoc(doc(db, "apartments", apartmentId)).catch(() => null);
          resolvedProperty = apartmentSnapshot?.exists()
            ? makeProperty(apartmentId, apartmentSnapshot.data() as Record<string, unknown>, loadedContract?.apartmentAddress || draft?.apartmentAddress)
            : { id: apartmentId, title: "Ακίνητο", exactAddress: loadedContract?.apartmentAddress || draft?.apartmentAddress || "" };
        }

        const resolvedContract = loadedContract ?? await createContractDocument({
          agencyId,
          contractType: draft?.contractType ?? "viewing_order",
          title: draft?.title || getContractTitle(draft?.contractType ?? "viewing_order"),
          createdByUserId: draft?.createdByUserId || auth.userId || defaultSignerId,
          brokerId: draft?.brokerId || (draft?.participantIds.find((participant) => participant.role === "broker")?.id ?? defaultSignerId),
          clientId: draft?.clientId,
          ownerId: draft?.ownerId,
          clientProfileId: draft?.clientProfileId,
          chatRoomId: draft?.chatRoomId,
          apartmentId: draft?.apartmentId,
          apartmentAddress: draft?.apartmentAddress || resolvedProperty?.exactAddress,
          propertyCode: resolvedProperty?.code,
          dealId: draft?.dealId,
          contractPayload: draft?.contractPayload,
          signers: resolvedParticipants.map(getSignerEvidence),
          requiredSignerIds: resolvedParticipants.map((participant) => participant.id),
        });
        if (!active) return;
        const currentSignerInstance = getSignerFromContract(resolvedContract, defaultSignerId);
        setContract(resolvedContract);
        setParticipants(resolvedParticipants);
        setAgency(resolvedAgency);
        setProperty(resolvedProperty);
        setSignerAfm(currentSignerInstance?.signerAfm ?? resolvedParticipants.find((participant) => participant.id === defaultSignerId)?.afm ?? "");
        setSignerIdCardNumber(currentSignerInstance?.signerIdCardNumber ?? resolvedParticipants.find((participant) => participant.id === defaultSignerId)?.idCardNumber ?? "");
        setIdFrontUrl(currentSignerInstance?.idCardPhotoUrl ?? "");
        setIdBackUrl(currentSignerInstance?.idCardBackPhotoUrl ?? "");
        setIdCaptureMetadata(currentSignerInstance?.idCaptureMetadata ?? {});
        setIdCaptureTimestamp(currentSignerInstance?.idCaptureTimestamp ?? 0);
        setIdDocumentType(currentSignerInstance?.idDocumentType ?? "national_id");
        const contractSignerPhone = normalizeE164PhoneNumber(currentSignerInstance?.signerPhone || "");
        const profileSignerPhone = normalizeE164PhoneNumber(resolvedParticipants.find((participant) => participant.id === defaultSignerId)?.phone || "");
        setSignerPhone(contractSignerPhone || profileSignerPhone || currentSignerInstance?.signerPhone || "");
        setOtpVerified(currentSignerInstance?.otpVerified === true);
        setOtpVerificationId(currentSignerInstance?.otpVerificationId ?? "");
        const deposit = resolvedContract.contractPayload.holdingDepositAmount ?? resolvedContract.contractPayload.holdingDepositTerms?.amount;
        setHoldingDepositAmount(typeof deposit === "number" && Number.isFinite(deposit) ? String(deposit) : "");
        const houseRules = resolvedContract.contractPayload.houseRulesConfig;
        setHouseRulesText(houseRules && typeof houseRules === "object" && Array.isArray(houseRules.houseRules) ? houseRules.houseRules.join("\n") : houseRules && typeof houseRules === "object" && typeof houseRules.houseRules === "string" ? houseRules.houseRules : "");
        const split = resolvedContract.contractPayload.utilitySplitPercentages;
        const ownSplit = split?.[defaultSignerId];
        setUtilitySplitPercentage(typeof ownSplit === "number" && Number.isFinite(ownSplit) ? String(ownSplit) : "50");
        setBankReference(resolvedContract.contractPayload.bankReference ?? "");
        setCashReceiptNote(resolvedContract.contractPayload.cashReceiptNote ?? "");
        setRefundabilityConditions(resolvedContract.contractPayload.refundabilityConditions ?? resolvedContract.contractPayload.holdingDepositTerms?.refundabilityConditions ?? "");
        setPreviewRevision((revision) => revision + 1);
        if (resolvedContract.status === "signed") setSuccessContract(resolvedContract);
        if (!loadedContract) onCreated?.(resolvedContract);
      } catch (error) {
        if (active) setErrorText(error instanceof Error ? error.message : t("esign.errors.initialization"));
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [auth.agencyId, auth.userId, contractId, defaultSignerId, draft?.agencyId, draft?.apartmentAddress, draft?.apartmentId, draft?.clientId, draft?.clientProfileId, draft?.contractType, draft?.createdByUserId, draft?.dealId, draft?.ownerId, draft?.brokerId, draft?.chatRoomId, draft?.contractPayload, draft?.participantIds, draft?.participants, draft?.title, draftKey, loadParticipant, onCreated]);

  useEffect(() => () => {
    if (otpSession?.provider === "firebase") otpSession.cleanup();
  }, [otpSession]);

  const currentSigner = useMemo(() => getSignerFromContract(contract, signerId), [contract, signerId]);

  const previewHtml = useMemo(() => {
    void previewRevision;
    if (step !== 1 || !contract || !agency) return "<html><body></body></html>";
    const previewInputs = previewInputValuesRef.current;
    const previewSigners = contract.signers.map((signer) => signer.signerId === signerId ? {
      ...signer,
      signerAfm: previewInputs.signerAfm.trim() || signer.signerAfm,
      signerIdCardNumber: previewInputs.signerIdCardNumber.trim() || signer.signerIdCardNumber,
      idCardPhotoUrl: previewInputs.idFrontUrl || signer.idCardPhotoUrl,
      idCardBackPhotoUrl: previewInputs.idBackUrl || signer.idCardBackPhotoUrl,
    } : signer);
    const previewParticipants = participants.map((participant) => participant.id === signerId ? {
      ...participant,
      afm: previewInputs.signerAfm.trim() || participant.afm,
      idCardNumber: previewInputs.signerIdCardNumber.trim() || participant.idCardNumber,
    } : participant);
    const previewPayload = {
      ...contract.contractPayload,
      ...(contract.contractType === "holding_deposit_viewing" ? { holdingDepositAmount: Number(previewInputs.holdingDepositAmount.replace(",", ".")), bankReference: previewInputs.bankReference, cashReceiptNote: previewInputs.cashReceiptNote, refundabilityConditions: previewInputs.refundabilityConditions } : {}),
      ...(contract.contractType === "roommate_agreement" ? { houseRulesConfig: { ...contract.contractPayload.houseRulesConfig, houseRules: previewInputs.houseRulesText.split("\n").map((rule) => rule.trim()).filter(Boolean) }, utilitySplitPercentages: { [signerId]: Number(previewInputs.utilitySplitPercentage.replace(",", ".")), ...(contract.signers.find((signer) => signer.signerId !== signerId) ? { [contract.signers.find((signer) => signer.signerId !== signerId)!.signerId]: 100 - Number(previewInputs.utilitySplitPercentage.replace(",", ".")) } : {}) }, holdingDepositTerms: { amount: Number(previewInputs.holdingDepositAmount.replace(",", ".")), refundabilityConditions: previewInputs.refundabilityConditions } } : {}),
    };
    try {
      return buildContractHtml({ document: { ...contract, signers: previewSigners, contractPayload: previewPayload }, agency, property, participants: previewParticipants });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Το πρότυπο απαιτεί συμπληρωμένα στοιχεία.";
      return `<html><body style="font-family: sans-serif; padding: 20px"><strong>${message}</strong></body></html>`;
    }
  }, [agency, contract, participants, previewRevision, property, signerId, step]);

  const captureLocation = useCallback(async () => {
    if (isCapturingLocation || locationCoords) return;
    setIsCapturingLocation(true);
    setErrorText("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error(t("esign.errors.locationPermission"));
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy } = location.coords;
      if (![latitude, longitude, accuracy ?? 0].every(Number.isFinite)) throw new Error(t("esign.errors.locationCapture"));
      setLocationCoords({ latitude, longitude, accuracyMeters: Math.max(0, accuracy ?? 0) });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("esign.errors.locationCapture"));
    } finally {
      setIsCapturingLocation(false);
    }
  }, [isCapturingLocation, locationCoords]);

  useEffect(() => {
    if (step === 4 && !locationCoords) void captureLocation();
  }, [captureLocation, locationCoords, step]);

  useEffect(() => {
    formScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const handleSendOtp = async () => {
    if (!contract || !signerId || isSendingOtp) return;
    const normalizedPhone = normalizeE164PhoneNumber(signerPhone || currentSigner?.signerPhone || "");
    if (!normalizedPhone) {
      setErrorText(t("esign.errors.otpPhoneInput"));
      return;
    }
    setIsSendingOtp(true);
    setErrorText("");
    try {
      if (otpSession?.provider === "firebase") otpSession.cleanup();
      if (currentSigner?.signerPhone !== normalizedPhone) {
        await updateContractSignerIdentity(contract.id, signerId, { signerPhone: normalizedPhone });
      }
      setSignerPhone(normalizedPhone);
      setContract((current) => current ? { ...current, signers: current.signers.map((signer) => signer.signerId === signerId ? { ...signer, signerPhone: normalizedPhone } : signer) } : current);
      setParticipants((current) => current.map((participant) => participant.id === signerId ? { ...participant, phone: normalizedPhone } : participant));
      const result = await startSigningOtp({ contractId: contract.id, signerId, phone: normalizedPhone });
      setOtpSession(result.session);
      setOtpCode("");
      setOtpVerified(false);
      setVerificationToken("");
      setOtpVerificationId("");
      setOtpMessage(t("esign.otpSent"));
      setContract((current) => current ? { ...current, signers: current.signers.map((signer) => signer.signerId === signerId ? { ...signer, otpVerified: false, otpVerifiedAt: undefined } : signer) } : current);
    } catch (error) {
      logOtpTerminalDiagnostic({
        phase: "modal-send",
        targetPhoneNumber: normalizedPhone,
        authMethod: "signInWithPhoneNumber / configured OTP provider",
        error,
        details: { contractId: contract.id, signerId },
      });
      setErrorText(getOtpErrorText(error, "send"));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!contract || !signerId || !otpSession || isVerifyingOtp) return;
    setIsVerifyingOtp(true);
    setErrorText("");
    try {
      const result = await verifySigningOtpSession({ contractId: contract.id, signerId, code: otpCode, session: otpSession });
      setOtpSession(null);
      setOtpVerified(result.verified);
      setVerificationToken(result.verificationToken ?? "");
      setOtpVerificationId(result.verificationId ?? "");
      setOtpMessage(t("esign.otpVerified"));
      setContract((current) => current ? { ...current, signers: current.signers.map((signer) => signer.signerId === signerId ? { ...signer, otpVerified: true, otpVerifiedAt: result.verifiedAt } : signer) } : current);
    } catch (error) {
      logOtpTerminalDiagnostic({
        phase: "modal-confirm",
        targetPhoneNumber: otpSession.phone,
        authMethod: otpSession.provider === "firebase" ? "signInWithPhoneNumber.confirm" : "httpsCallable.verifySigningOtp",
        error,
        details: { contractId: contract.id, signerId, provider: otpSession.provider },
      });
      setErrorText(getOtpErrorText(error, "verify"));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleFinalize = async () => {
    if (!contract || !currentSigner || !locationCoords || !signatureData.trim() || !idFrontUrl || !idBackUrl || !idCaptureTimestamp || !idCaptureMetadata.front || !idCaptureMetadata.back || !signerIdCardNumber.trim() || (currentSigner.signerRole !== "broker" && !otpVerified) || isFinalizing) return;
    setIsFinalizing(true);
    setErrorText("");
    try {
      const evidence: SignatureSignerEvidence = {
        ...currentSigner,
        signerAfm: signerAfm.trim() || undefined,
        signerIdCardNumber: signerIdCardNumber.trim(),
        signatureBase64: signatureData,
        signedAt: 0,
        locationCoords,
        otpVerified: currentSigner.signerRole !== "broker" && otpVerified,
        ...(otpVerificationId ? { otpVerificationId } : {}),
        ...(currentSigner.otpVerifiedAt ? { otpVerifiedAt: currentSigner.otpVerifiedAt } : {}),
        idCardPhotoUrl: idFrontUrl,
        idCardBackPhotoUrl: idBackUrl,
        idCaptureTimestamp,
        idDocumentType,
        idCaptureMetadata,
        deviceInfo: `${Platform.OS}${Device.modelName ? ` · ${Device.modelName}` : ""}`,
      };
      const nextSigners = contract.signers.map((signer) => signer.signerId === signerId ? evidence : signer);
      const signedParticipants = participants.map((participant) => participant.id === signerId ? {
        ...participant,
        afm: evidence.signerAfm,
        idCardNumber: evidence.signerIdCardNumber,
      } : participant);
      const templateData = { document: { ...contract, signers: nextSigners }, agency: agency!, property, participants: signedParticipants };
      const generatedPdf = await generateContractTemplatePdf(templateData);
      const uploadedPdf = await uploadContractPdf({ contractId: contract.id, base64: generatedPdf.base64, sha256Hash: generatedPdf.sha256Hash });
      const updated = await recordContractSignature({
        contractId: contract.id,
        signerId,
        evidence,
        pdfStoragePath: uploadedPdf.storagePath,
        pdfSha256Hash: generatedPdf.sha256Hash,
        verificationToken,
      });
      setContract(updated);
      if (updated.status === "signed") {
        setSuccessContract(updated);
        onCompleted?.(updated);
      } else {
        setErrorText(t("esign.signatureRecorded"));
        const nextSigner = updated.requiredSignerIds
          .map((requiredId) => updated.signers.find((signer) => signer.signerId === requiredId))
          .find((signer) => signer && !signer.signatureBase64.trim());
        const canSwitchSigner = auth.userId === updated.brokerId || auth.userId === updated.createdByUserId;
        if (nextSigner && canSwitchSigner) {
          setSelectedSignerId(nextSigner.signerId);
          const nextSignerPhone = nextSigner.signerPhone || participants.find((participant) => participant.id === nextSigner.signerId)?.phone || "";
          setSignerPhone(normalizeE164PhoneNumber(nextSignerPhone) || nextSignerPhone);
          setSignerAfm(nextSigner.signerAfm ?? "");
          setSignerIdCardNumber(nextSigner.signerIdCardNumber ?? "");
          setIdFrontUrl(nextSigner.idCardPhotoUrl ?? "");
          setIdBackUrl(nextSigner.idCardBackPhotoUrl ?? "");
          setIdCaptureMetadata(nextSigner.idCaptureMetadata ?? {});
          setIdCaptureTimestamp(nextSigner.idCaptureTimestamp ?? 0);
          setIdDocumentType(nextSigner.idDocumentType ?? "national_id");
          setOtpSession(null);
          setOtpVerified(nextSigner.otpVerified === true);
          setVerificationToken("");
          setOtpVerificationId(nextSigner.otpVerificationId ?? "");
          const nextDeposit = updated.contractPayload.holdingDepositAmount;
          setHoldingDepositAmount(typeof nextDeposit === "number" && Number.isFinite(nextDeposit) ? String(nextDeposit) : "");
          const nextRules = updated.contractPayload.houseRulesConfig;
          setHouseRulesText(nextRules && typeof nextRules === "object" && typeof nextRules.houseRules === "string" ? nextRules.houseRules : "");
          signatureRef.current?.clearSignature();
          setSignatureData("");
        }
        setStep(1);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("esign.errors.finalize"));
    } finally {
      setIsFinalizing(false);
    }
  };

  const sharePhone = useMemo(() => {
    const preferred = contract?.signers.find((signer) => signer.signerId !== signerId && signer.signerPhone.trim());
    return preferred?.signerPhone || currentSigner?.signerPhone || "";
  }, [contract?.signers, currentSigner?.signerPhone, signerId]);

  const handleWhatsAppShare = async () => {
    if (!successContract || !sharePhone) return;
    try {
      const { url } = await getContractDownloadUrl(successContract.id);
      const propertyCode = successContract.propertyCode || "χωρίς κωδικό";
      const message = `Υπογεγραμμένο έγγραφο για το ακίνητο ${propertyCode}. Ασφαλής σύνδεσμος προβολής (ισχύει 1 ώρα): ${url}`;
      await Linking.openURL(`whatsapp://send?phone=${encodeURIComponent(sharePhone)}&text=${encodeURIComponent(message)}`);
    } catch {
      setErrorText(t("esign.errors.whatsapp"));
    }
  };

  const ensureSigningUploadAuth = useCallback(async () => {
    if (!firebaseAuth.currentUser?.uid) {
      const message = t("esign.errors.authRequired");
      setErrorText(message);
      throw new Error(message);
    }

    try {
      await ensureFirebaseAuthSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("esign.errors.authRequired");
      setErrorText(message);
      throw error;
    }
  }, []);

  const contractPayloadValid = contract?.contractType === "holding_deposit_viewing"
    ? Number(holdingDepositAmount.replace(",", ".")) > 0 && Boolean(bankReference.trim() || cashReceiptNote.trim()) && refundabilityConditions.trim().length > 0
    : contract?.contractType === "roommate_agreement"
      ? houseRulesText.split("\n").some((rule) => rule.trim().length > 0) && Number(utilitySplitPercentage.replace(",", ".")) >= 0 && Number(utilitySplitPercentage.replace(",", ".")) <= 100 && Number(holdingDepositAmount.replace(",", ".")) > 0 && refundabilityConditions.trim().length > 0
      : true;
  const currentSignerAlreadySigned = Boolean(currentSigner?.signatureBase64.trim());
  const canContinueFromStep = step === 1
    ? signerIdCardNumber.trim().length > 0 && contractPayloadValid && !currentSignerAlreadySigned
    : step === 2
      ? idFrontUrl.length > 0 && idBackUrl.length > 0 && idCaptureTimestamp > 0 && Boolean(idCaptureMetadata.front && idCaptureMetadata.back)
      : step === 3
        ? currentSigner?.signerRole === "broker" || otpVerified
        : Boolean(signatureData && locationCoords && idFrontUrl && idBackUrl && idCaptureTimestamp > 0 && idCaptureMetadata.front && idCaptureMetadata.back && signerIdCardNumber.trim() && (currentSigner?.signerRole === "broker" || otpVerified));
  const stepValidationMessage = step === 1
    ? t("esign.errors.requiredFields")
    : step === 2
      ? t("esign.errors.idRequired")
      : step === 3
        ? t("esign.errors.otpRequired")
        : t("esign.errors.signatureRequired");

  const goNext = async () => {
    if (!canContinueFromStep) {
      setErrorText(stepValidationMessage);
      return;
    }
    Keyboard.dismiss();
    const hasEditablePayload = contract?.contractType === "holding_deposit_viewing" || contract?.contractType === "roommate_agreement";
    if (step === 1 && hasEditablePayload && contract && !contract.signers.some((signer) => signer.signatureBase64.trim())) {
      setIsSavingPayload(true);
      setErrorText("");
      try {
        const payload = {
          ...contract.contractPayload,
          ...(contract.contractType === "holding_deposit_viewing" ? { holdingDepositAmount: Number(holdingDepositAmount.replace(",", ".")), bankReference: bankReference.trim(), cashReceiptNote: cashReceiptNote.trim(), refundabilityConditions: refundabilityConditions.trim() } : {}),
          ...(contract.contractType === "roommate_agreement" ? { houseRulesConfig: { ...contract.contractPayload.houseRulesConfig, houseRules: houseRulesText.split("\n").map((rule) => rule.trim()).filter(Boolean) }, utilitySplitPercentages: { [signerId]: Number(utilitySplitPercentage.replace(",", ".")), ...(contract.signers.find((signer) => signer.signerId !== signerId) ? { [contract.signers.find((signer) => signer.signerId !== signerId)!.signerId]: 100 - Number(utilitySplitPercentage.replace(",", ".")) } : {}) }, holdingDepositTerms: { amount: Number(holdingDepositAmount.replace(",", ".")), refundabilityConditions: refundabilityConditions.trim() } } : {}),
        };
        const updated = await updateContractPayload(contract.id, signerId, payload);
        setContract(updated);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : t("esign.errors.payload"));
        setIsSavingPayload(false);
        return;
      } finally {
        setIsSavingPayload(false);
      }
    }
    if (step < 4) setStep((current) => (current + 1) as 1 | 2 | 3 | 4);
  };

  const previewTitle = contract?.title || (contract ? getContractTitle(contract.contractType) : t("esign.title"));
  const signerOptions = useMemo(
    () => contract?.requiredSignerIds
      .map((requiredId) => contract.signers.find((entry) => entry.signerId === requiredId))
      .filter((signer): signer is DigitalContractDocument["signers"][number] => Boolean(signer)) ?? [],
    [contract],
  );
  const canChooseSigner = Boolean(
    contract &&
    (auth.userId === contract.brokerId || auth.userId === contract.createdByUserId) &&
    contract.status !== "signed",
  );

  // Embedded Action Card sitting cleanly at the bottom of the scrollable body
  const actionFooter = !isLoading && !successContract ? (
    <View style={[dynamicStyles.footerCard, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.footerRow}>
        <View style={styles.footerActionSlot}>
          {step > 1 ? (
            <Pressable
              style={[dynamicStyles.footerButton, { borderColor: colors.border }]}
              onPress={() => {
                Keyboard.dismiss();
                setStep((current) => (current - 1) as 1 | 2 | 3 | 4);
              }}
              testID="esign-back"
            >
              <Ionicons name="arrow-back" size={17} color={colors.onSurface} />
              <Text style={[styles.footerButtonText, { color: colors.onSurface }]}>
                {t("common.actions.back")}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.footerActionPlaceholder} />
          )}
        </View>

        <View style={styles.footerIndicator} accessibilityRole="text">
          <Text style={[styles.footerIndicatorText, { color: colors.onSurfaceTertiary }]}>
            {t("esign.stepProgress", { step, total: 4 })}
          </Text>
          <View style={styles.footerDots}>
            {[1, 2, 3, 4].map((item) => (
              <View
                key={item}
                style={[
                  styles.footerDot,
                  { backgroundColor: item <= step ? colors.brand : colors.surfaceTertiary },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={[styles.footerActionSlot, styles.footerActionSlotEnd]}>
          {step < 4 ? (
            <Pressable
              style={[
                dynamicStyles.footerButton,
                dynamicStyles.footerPrimary,
                isSavingPayload && styles.disabledButton,
              ]}
              onPress={() => void goNext()}
              disabled={isSavingPayload}
              testID="esign-next"
            >
              {isSavingPayload ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Text style={[styles.footerButtonText, { color: colors.onBrand }]}>
                    {t("common.actions.continue")}
                  </Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.onBrand} />
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[
                dynamicStyles.footerButton,
                dynamicStyles.footerPrimary,
                isFinalizing && styles.disabledButton,
              ]}
              onPress={() => {
                if (!canContinueFromStep) {
                  setErrorText(stepValidationMessage);
                  return;
                }
                Keyboard.dismiss();
                void handleFinalize();
              }}
              disabled={isFinalizing}
              testID="esign-finalize"
            >
              {isFinalizing ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={17} color={colors.onBrand} />
                  <Text style={[styles.footerButtonText, { color: colors.onBrand }]}>
                    {t("esign.finalize")}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  ) : null;

  return (
    <>
      <NativeFirebaseRecaptchaHost />
      <View style={[styles.screen, { backgroundColor: colors.surface }]}>
        {/* Signature Curved Elevated Header */}
        <View style={[dynamicStyles.curvedHeader, { paddingTop: insets.top + spacing.xs }]}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={onClose} hitSlop={8} style={dynamicStyles.circularBtn} testID="esign-close">
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>

            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
                {contract?.title || t("esign.title")}
              </Text>
              <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
                {t("esign.stepProgress", { step, total: 4 })}
              </Text>
            </View>

            <View style={styles.circularBtnPlaceholder} />
          </View>

          {/* Curved Header Embedded Progress Bar */}
          <View style={styles.progressRow}>
            {[1, 2, 3, 4].map((item) => (
              <View
                key={item}
                style={[
                  styles.progressBar,
                  { backgroundColor: item <= step ? colors.brand : colors.surfaceTertiary },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Dynamic Multi-Signer Picker */}
        {canChooseSigner && signerOptions.length > 1 ? (
          <View style={[dynamicStyles.signerPickerBar, { borderBottomColor: colors.border }]}>
            <ScrollView
              horizontal
              style={styles.signerPickerScroll}
              contentContainerStyle={styles.signerPickerRow}
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled
            >
              {signerOptions.map((signer) => {
                const hasSigned = Boolean(signer.signatureBase64.trim());
                const active = signer.signerId === signerId;
                return (
                  <Pressable
                    key={signer.signerId}
                    style={({ pressed }) => [
                      styles.signerPicker,
                      {
                        borderColor: active ? colors.brand : colors.border,
                        backgroundColor: active ? `${colors.brand}18` : colors.surfaceSecondary,
                        opacity: hasSigned ? 0.72 : pressed ? 0.82 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (hasSigned) return;
                      setSelectedSignerId(signer.signerId);
                      setSignerAfm(signer.signerAfm ?? "");
                      setSignerIdCardNumber(signer.signerIdCardNumber ?? "");
                      setIdFrontUrl(signer.idCardPhotoUrl ?? "");
                      setIdBackUrl(signer.idCardBackPhotoUrl ?? "");
                      setOtpVerified(signer.otpVerified === true);
                      setOtpVerificationId(signer.otpVerificationId ?? "");
                      setVerificationToken("");
                      signatureRef.current?.clearSignature();
                      setSignatureData("");
                      setLocationCoords(null);
                      setStep(1);
                    }}
                    disabled={hasSigned}
                    accessibilityState={{ disabled: hasSigned, selected: active }}
                    hitSlop={4}
                    testID={`esign-signer-${signer.signerId}`}
                  >
                    <Ionicons
                      name={active ? "person" : "person-outline"}
                      size={15}
                      color={active ? colors.brand : colors.onSurfaceTertiary}
                    />
                    <Text style={[styles.signerPickerText, { color: active ? colors.brand : colors.onSurfaceTertiary }]} numberOfLines={1}>
                      {signer.signerName}
                    </Text>
                    {hasSigned ? <Ionicons name="checkmark-circle" size={15} color={colors.success} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : successContract ? (
          <View style={styles.successState}>
            <View style={[styles.successIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="checkmark-circle" size={54} color={colors.brand} />
            </View>
            <Text style={[styles.successTitle, { color: colors.onSurface }]}>
              {t("esign.contractSignedSuccess")}
            </Text>
            <Text style={[styles.successMeta, { color: colors.onSurfaceTertiary }]}>
              {successContract.pdfSha256Hash ? `SHA-256: ${successContract.pdfSha256Hash}` : ""}
            </Text>
            <Pressable
              style={[dynamicStyles.primaryButton]}
              onPress={() => void handleWhatsAppShare()}
              disabled={!sharePhone}
              testID="esign-share-whatsapp"
            >
              <Ionicons name="logo-whatsapp" size={19} color={colors.onBrand} />
              <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>
                {t("esign.shareViaWhatsApp")}
              </Text>
            </Pressable>
            <Pressable style={[dynamicStyles.secondaryButton]} onPress={onClose} testID="esign-success-close">
              <Text style={[styles.secondaryButtonText, { color: colors.onSurface }]}>
                {t("common.actions.done")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <KeyboardAwareScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            ref={formScrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bottomOffset={spacing.lg}
            extraKeyboardSpace={spacing.lg}
            showsVerticalScrollIndicator={false}
          >
            {step === 1 ? (
              <>
                <View style={styles.sectionHeading}>
                  <Ionicons name="document-text-outline" size={20} color={colors.brand} />
                  <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.reviewTitle")}</Text>
                </View>

                {/* Elevated Document Preview Card */}
                <Pressable
                  style={({ pressed }) => [
                    dynamicStyles.previewCard,
                    pressed && styles.previewFramePressed,
                  ]}
                  onPress={() => {
                    refreshPreview();
                    setPreviewVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Άνοιγμα πλήρους προεπισκόπησης συμβολαίου"
                  testID="esign-open-contract-preview"
                >
                  <ContractWebViewPreview html={previewHtml} />
                  <View style={[styles.previewFloatingBadge, { backgroundColor: colors.surface }]}>
                    <Ionicons name="expand-outline" size={13} color={colors.brand} />
                    <Text style={[styles.previewBadgeText, { color: colors.brand }]}>
                      Πατήστε για πλήρη προβολή
                    </Text>
                  </View>
                </Pressable>

                <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>
                  {t("esign.verifyIdentityHint")}
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.afmLabel")}</Text>
                  <ContractInput
                    value={signerAfm}
                    onChangeText={handleAfmChange}
                    onBlur={refreshPreview}
                    keyboardType="number-pad"
                    borderColor={colors.border}
                    textColor={colors.onSurface}
                    backgroundColor={colors.surfaceSecondary}
                    placeholder={t("esign.afmPlaceholder")}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    maxLength={9}
                    testID="esign-afm-input"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.idCardLabel")}</Text>
                  <ContractInput
                    value={signerIdCardNumber}
                    onChangeText={setSignerIdCardNumber}
                    onBlur={refreshPreview}
                    borderColor={colors.border}
                    textColor={colors.onSurface}
                    backgroundColor={colors.surfaceSecondary}
                    placeholder={t("esign.idCardPlaceholder")}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    autoCapitalize="characters"
                    testID="esign-id-card-input"
                  />
                </View>

                {currentSignerAlreadySigned ? (
                  <Text style={[styles.sectionHint, { color: colors.warning }]}>{t("esign.alreadySigned")}</Text>
                ) : null}

                {contract?.contractType === "holding_deposit_viewing" ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.holdingDepositAmountLabel")}</Text>
                      <ContractInput
                        value={holdingDepositAmount}
                        onChangeText={handleDepositChange}
                        onBlur={refreshPreview}
                        keyboardType="decimal-pad"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder={t("esign.holdingDepositAmountPlaceholder")}
                        placeholderTextColor={colors.onSurfaceTertiary}
                        testID="esign-holding-deposit-input"
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>Τραπεζική αναφορά</Text>
                      <ContractInput
                        value={bankReference}
                        onChangeText={setBankReference}
                        onBlur={refreshPreview}
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="Αριθμός συναλλαγής"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>Σημείωση απόδειξης μετρητών</Text>
                      <ContractInput
                        value={cashReceiptNote}
                        onChangeText={setCashReceiptNote}
                        onBlur={refreshPreview}
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="Αριθμός ή περιγραφή απόδειξης"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>Όροι επιστροφής προκαταβολής</Text>
                      <ContractInput
                        value={refundabilityConditions}
                        onChangeText={setRefundabilityConditions}
                        onBlur={refreshPreview}
                        multiline
                        textAlignVertical="top"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="Πότε επιστρέφεται ή παρακρατείται"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>
                  </>
                ) : null}

                {contract?.contractType === "roommate_agreement" ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.houseRulesLabel")}</Text>
                      <ContractInput
                        value={houseRulesText}
                        onChangeText={setHouseRulesText}
                        onBlur={refreshPreview}
                        multiline
                        textAlignVertical="top"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder={t("esign.houseRulesPlaceholder")}
                        placeholderTextColor={colors.onSurfaceTertiary}
                        maxLength={2000}
                        testID="esign-house-rules-input"
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>
                        Ποσοστό κοινόχρηστων εξόδων του υπογράφοντος (%)
                      </Text>
                      <ContractInput
                        value={utilitySplitPercentage}
                        onChangeText={handleUtilitySplitChange}
                        onBlur={refreshPreview}
                        keyboardType="decimal-pad"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="50"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>Ποσό εγγύησης</Text>
                      <ContractInput
                        value={holdingDepositAmount}
                        onChangeText={handleDepositChange}
                        onBlur={refreshPreview}
                        keyboardType="decimal-pad"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="Ποσό σε EUR"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.label, { color: colors.onSurface }]}>Όροι επιστροφής εγγύησης</Text>
                      <ContractInput
                        value={refundabilityConditions}
                        onChangeText={setRefundabilityConditions}
                        onBlur={refreshPreview}
                        multiline
                        textAlignVertical="top"
                        borderColor={colors.border}
                        textColor={colors.onSurface}
                        backgroundColor={colors.surfaceSecondary}
                        placeholder="Πότε επιστρέφεται ή παρακρατείται"
                        placeholderTextColor={colors.onSurfaceTertiary}
                      />
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View style={styles.sectionHeading}>
                  <Ionicons name="camera-outline" size={20} color={colors.brand} />
                  <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.idVerificationTitle")}</Text>
                </View>
                <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>
                  {t("esign.idVerificationSubtitle")}
                </Text>
                <View style={styles.evidenceRow}>
                  <View style={[dynamicStyles.evidenceItem]}>
                    <Ionicons
                      name={idFrontUrl ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={idFrontUrl ? colors.success : colors.onSurfaceTertiary}
                    />
                    <Text style={[styles.evidenceText, { color: colors.onSurface }]}>{t("esign.idFront")}</Text>
                  </View>
                  <View style={[dynamicStyles.evidenceItem]}>
                    <Ionicons
                      name={idBackUrl ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={idBackUrl ? colors.success : colors.onSurfaceTertiary}
                    />
                    <Text style={[styles.evidenceText, { color: colors.onSurface }]}>{t("esign.idBack")}</Text>
                  </View>
                </View>
                <Pressable
                  style={[dynamicStyles.primaryButton]}
                  onPress={() => setCameraVisible(true)}
                  testID="esign-open-id-camera"
                >
                  <Ionicons name="camera-outline" size={19} color={colors.onBrand} />
                  <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("esign.openCamera")}</Text>
                </Pressable>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View style={styles.sectionHeading}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} />
                  <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.otpTitle")}</Text>
                </View>
                {currentSigner?.signerRole !== "broker" ? (
                  <>
                    {!normalizeE164PhoneNumber(signerPhone) && (
                      <>
                        <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>{t("esign.phoneLabel")}</Text>
                        <ContractInput
                          value={signerPhone}
                          onChangeText={setSignerPhone}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                          borderColor={colors.border}
                          textColor={colors.onSurface}
                          backgroundColor={colors.surfaceSecondary}
                          placeholder={t("esign.phonePlaceholder")}
                          placeholderTextColor={colors.onSurfaceTertiary}
                          testID="esign-signer-phone-input"
                        />
                      </>
                    )}
                    <Pressable
                      style={[dynamicStyles.secondaryButton]}
                      onPress={() => void handleSendOtp()}
                      disabled={isSendingOtp}
                      testID="esign-send-otp"
                    >
                      {isSendingOtp ? (
                        <ActivityIndicator color={colors.brand} />
                      ) : (
                        <>
                          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
                          <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>{t("esign.sendOtp")}</Text>
                        </>
                      )}
                    </Pressable>
                    <ContractInput
                      value={otpCode}
                      onChangeText={handleOtpChange}
                      keyboardType="number-pad"
                      maxLength={6}
                      borderColor={colors.border}
                      textColor={colors.onSurface}
                      backgroundColor={colors.surfaceSecondary}
                      placeholder={t("esign.otpPlaceholder")}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      testID="esign-otp-input"
                    />
                    <Pressable
                      style={[
                        dynamicStyles.primaryButton,
                        (!/^\d{6}$/.test(otpCode) || !otpSession || isVerifyingOtp) && styles.disabledButton,
                      ]}
                      onPress={() => void handleVerifyOtp()}
                      disabled={!/^\d{6}$/.test(otpCode) || !otpSession || isVerifyingOtp}
                      testID="esign-verify-otp"
                    >
                      {isVerifyingOtp ? (
                        <ActivityIndicator color={colors.onBrand} />
                      ) : (
                        <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("esign.verifyOtp")}</Text>
                      )}
                    </Pressable>
                    {!!otpMessage && (
                      <Text style={[styles.statusText, { color: otpVerified ? colors.success : colors.onSurfaceTertiary }]}>
                        {otpMessage}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>{t("esign.otpSkipped")}</Text>
                )}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <View style={styles.sectionHeading}>
                  <Ionicons name="create-outline" size={20} color={colors.brand} />
                  <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.signOnScreen")}</Text>
                </View>
                <View style={[dynamicStyles.signatureFrame]}>
                  <SignatureCanvas
                    ref={signatureRef}
                    style={styles.signatureCanvas}
                    dataURL={signatureData}
                    onOK={setSignatureData}
                    onEmpty={() => setErrorText(t("esign.errors.emptySignature"))}
                    descriptionText=""
                    clearText=""
                    confirmText=""
                    webStyle={`.m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: 0; } body { background: transparent; }`}
                  />
                </View>
                <View style={styles.signatureActions}>
                  <Pressable
                    style={[dynamicStyles.toolButton]}
                    onPress={() => {
                      signatureRef.current?.clearSignature();
                      setSignatureData("");
                    }}
                    testID="esign-clear-signature"
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.brand} />
                    <Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.clearSignature")}</Text>
                  </Pressable>
                  <Pressable
                    style={[dynamicStyles.toolButton]}
                    onPress={() => signatureRef.current?.undo()}
                    testID="esign-undo-signature"
                  >
                    <Ionicons name="arrow-undo-outline" size={16} color={colors.brand} />
                    <Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.undoSignature")}</Text>
                  </Pressable>
                  <Pressable
                    style={[dynamicStyles.toolButton]}
                    onPress={() => signatureRef.current?.readSignature()}
                    testID="esign-confirm-signature"
                  >
                    <Ionicons name="checkmark-outline" size={16} color={colors.brand} />
                    <Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.confirmSignature")}</Text>
                  </Pressable>
                </View>
                <View style={[dynamicStyles.locationRow]}>
                  <Ionicons
                    name={locationCoords ? "location" : "location-outline"}
                    size={20}
                    color={locationCoords ? colors.success : colors.brand}
                  />
                  <View style={styles.locationCopy}>
                    {locationCoords ? (
                      <Text style={[styles.locationText, { color: colors.onSurface }]}>
                        {t("esign.gpsCaptured", {
                          lat: locationCoords.latitude.toFixed(6),
                          lng: locationCoords.longitude.toFixed(6),
                          acc: locationCoords.accuracyMeters.toFixed(1),
                        })}
                      </Text>
                    ) : (
                      <Text style={[styles.locationText, { color: colors.onSurfaceTertiary }]}>
                        {isCapturingLocation ? t("esign.capturingGps") : t("esign.gpsPending")}
                      </Text>
                    )}
                  </View>
                  {!locationCoords ? (
                    <Pressable onPress={() => void captureLocation()} hitSlop={8}>
                      <Ionicons name="refresh-outline" size={19} color={colors.brand} />
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}

            {!!errorText && <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>}
            {actionFooter}
          </KeyboardAwareScrollView>
        )}
      </View>

      {contract ? (
        <IdCameraCapture
          visible={cameraVisible}
          contractId={contract.id}
          signerId={signerId}
          frontUrl={idFrontUrl}
          backUrl={idBackUrl}
          documentType={idDocumentType}
          onBeforeUpload={ensureSigningUploadAuth}
          onUploaded={(side, url, metadata) => {
            if (side === "front") setIdFrontUrl(url);
            else setIdBackUrl(url);
            setIdCaptureMetadata((current) => ({ ...current, [side]: metadata }));
            setIdCaptureTimestamp((current) => Math.max(current, metadata.idCaptureTimestamp));
            setIdDocumentType(metadata.idDocumentType);
          }}
          onClose={() => setCameraVisible(false)}
        />
      ) : null}

      {previewVisible ? (
        <ContractPreviewModal visible title={previewTitle} html={previewHtml} onClose={() => setPreviewVisible(false)} />
      ) : null}
    </>
  );
}

const createDynamicStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    curvedHeader: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 5,
      zIndex: 10,
    },
    signerPickerBar: {
      width: "100%",
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      overflow: "hidden",
    },
    circularBtn: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    previewCard: {
      height: 300,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
      position: "relative",
    },
    evidenceItem: {
      flex: 1,
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceSecondary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    secondaryButton: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSecondary,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    signatureFrame: {
      height: 210,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    toolButton: {
      flex: 1,
      minHeight: 40,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingHorizontal: 4,
    },
    locationRow: {
      minHeight: 60,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    footerCard: {
      marginTop: spacing.xl,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 6,
    },
    footerButton: {
      minHeight: 46,
      flex: 1,
      borderWidth: 1,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.surfaceSecondary,
    },
    footerPrimary: {
      backgroundColor: colors.brand,
      borderWidth: 0,
    },
  });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  circularBtnPlaceholder: { width: 38 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  progressRow: { flexDirection: "row", gap: 4, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  progressBar: { height: 4, flex: 1, borderRadius: radius.pill },
  signerPickerScroll: { flexGrow: 0, flexShrink: 0 },
  signerPickerRow: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  signerPicker: { minHeight: 44, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  signerPickerText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  loadingState: { minHeight: 360, alignItems: "center", justifyContent: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSize.lg, flex: 1, letterSpacing: -0.3 },
  sectionHint: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20 },
  previewFramePressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  previewFloatingBadge: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  previewBadgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  fieldGroup: { gap: 6 },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  baseInput: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: fontSize.base },
  multilineInput: { minHeight: 110, paddingTop: spacing.sm },
  evidenceRow: { flexDirection: "row", gap: spacing.sm },
  evidenceText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  secondaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  debugText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  statusText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  signatureCanvas: { flex: 1 },
  signatureActions: { flexDirection: "row", gap: spacing.xs },
  toolText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  locationCopy: { flex: 1 },
  locationText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, lineHeight: 18 },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, lineHeight: 19 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerActionSlot: { flex: 1, minWidth: 0 },
  footerActionSlotEnd: { alignItems: "flex-end" },
  footerActionPlaceholder: { minHeight: 46 },
  footerIndicator: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs, minWidth: 0 },
  footerIndicatorText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  footerDots: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerDot: { width: 6, height: 6, borderRadius: radius.pill },
  footerButtonText: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  disabledButton: { opacity: 0.5 },
  successState: { padding: spacing.xl, alignItems: "center", gap: spacing.md, flex: 1, justifyContent: "center" },
  successIcon: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center" },
  successTitle: { fontFamily: fonts.bold, fontSize: fontSize.xl, textAlign: "center", letterSpacing: -0.3 },
  successMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, textAlign: "center" },
});