import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import SignatureCanvas, { type SignatureViewRef } from "react-native-signature-canvas";
import { Ionicons } from "@expo/vector-icons";

import IdCameraCapture from "@/src/components/IdCameraCapture";
import BaseBottomSheet from "@/src/components/common/BaseBottomSheet";
import {
  createContractDocument,
  getContractDownloadUrl,
  getContractDocument,
  recordContractSignature,
  sendSigningOtp,
  updateContractPayload,
  uploadContractPdf,
  verifySigningOtp,
} from "@/src/api/contracts";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { getContractTitle, buildContractHtml } from "@/src/services/contractTemplates";
import { generateContractTemplatePdf } from "@/src/services/pdfGenerator";
import { t } from "@/src/locales";
import { fontSize, fonts, radius, spacing } from "@/src/theme";
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
import { doc, getDoc } from "firebase/firestore";

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

export interface SignContractModalProps {
  visible: boolean;
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

export default function SignContractModal({ visible, draft, contractId, signerId: signerIdProp, onClose, onCreated, onCompleted }: SignContractModalProps) {
  const { colors } = useTheme();
  const auth = useAuth();
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
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [debugOtpCode, setDebugOtpCode] = useState("");
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
  const signatureRef = useRef<SignatureViewRef>(null);

  const draftKey = useMemo(() => draft ? JSON.stringify({
    agencyId: draft.agencyId,
    contractType: draft.contractType,
    apartmentId: draft.apartmentId,
    participantIds: draft.participantIds,
    chatRoomId: draft.chatRoomId,
  }) : "", [draft]);

  const loadParticipant = useCallback(async (id: string, role: ContractParticipant["role"], fallback?: ContractParticipant): Promise<ContractParticipant> => {
    if (fallback) return fallback;
    try {
      const snapshot = await getDoc(doc(db, "users", id));
      const data = snapshot.exists() ? snapshot.data() as UserContactRecord : {};
      return {
        id,
        fullName: asString(data.name) || "Συμβαλλόμενος",
        role,
        afm: asString(data.afm) || asString(data.taxNumber) || undefined,
        idCardNumber: asString(data.idCardNumber) || asString(data.id_card_number) || undefined,
        phone: getPhone(data),
        email: asString(data.email),
        avatarUrl: getAvatar(data) || undefined,
      };
    } catch {
      return { id, fullName: "Συμβαλλόμενος", role, phone: "", email: "" };
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const initialize = async () => {
      setIsLoading(true);
      setErrorText("");
      setSuccessContract(null);
      setStep(1);
      setSignatureData("");
      setLocationCoords(null);
      setOtpCode("");
      setOtpMessage("");
      setVerificationToken("");
      setOtpVerificationId("");
      setDebugOtpCode("");
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
          resolvedParticipants = loadedContract.signers.map(participantFromSigner);
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
        const currentSigner = getSignerFromContract(resolvedContract, defaultSignerId);
        setContract(resolvedContract);
        setParticipants(resolvedParticipants);
        setAgency(resolvedAgency);
        setProperty(resolvedProperty);
        setSignerAfm(currentSigner?.signerAfm ?? resolvedParticipants.find((participant) => participant.id === defaultSignerId)?.afm ?? "");
        setSignerIdCardNumber(currentSigner?.signerIdCardNumber ?? resolvedParticipants.find((participant) => participant.id === defaultSignerId)?.idCardNumber ?? "");
        setIdFrontUrl(currentSigner?.idCardPhotoUrl ?? "");
        setIdBackUrl(currentSigner?.idCardBackPhotoUrl ?? "");
        setIdCaptureMetadata(currentSigner?.idCaptureMetadata ?? {});
        setIdCaptureTimestamp(currentSigner?.idCaptureTimestamp ?? 0);
        setIdDocumentType(currentSigner?.idDocumentType ?? "national_id");
        setOtpVerified(currentSigner?.otpVerified === true);
        setOtpVerificationId(currentSigner?.otpVerificationId ?? "");
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
  }, [auth.agencyId, auth.userId, contractId, defaultSignerId, draft?.agencyId, draft?.apartmentAddress, draft?.apartmentId, draft?.clientId, draft?.clientProfileId, draft?.contractType, draft?.createdByUserId, draft?.dealId, draft?.ownerId, draft?.brokerId, draft?.chatRoomId, draft?.contractPayload, draft?.participantIds, draft?.participants, draft?.title, draftKey, loadParticipant, onCreated, visible]);

  const currentSigner = useMemo(() => getSignerFromContract(contract, signerId), [contract, signerId]);
  const previewHtml = useMemo(() => {
    if (!contract || !agency) return "<html><body></body></html>";
    const previewSigners = contract.signers.map((signer) => signer.signerId === signerId ? {
      ...signer,
      signerAfm: signerAfm.trim() || signer.signerAfm,
      signerIdCardNumber: signerIdCardNumber.trim() || signer.signerIdCardNumber,
      idCardPhotoUrl: idFrontUrl || signer.idCardPhotoUrl,
      idCardBackPhotoUrl: idBackUrl || signer.idCardBackPhotoUrl,
    } : signer);
    const previewParticipants = participants.map((participant) => participant.id === signerId ? {
      ...participant,
      afm: signerAfm.trim() || participant.afm,
      idCardNumber: signerIdCardNumber.trim() || participant.idCardNumber,
    } : participant);
    const previewPayload = {
      ...contract.contractPayload,
      ...(contract.contractType === "holding_deposit_viewing" ? { holdingDepositAmount: Number(holdingDepositAmount.replace(",", ".")), bankReference, cashReceiptNote, refundabilityConditions } : {}),
      ...(contract.contractType === "roommate_agreement" ? { houseRulesConfig: { ...contract.contractPayload.houseRulesConfig, houseRules: houseRulesText.split("\n").map((rule) => rule.trim()).filter(Boolean) }, utilitySplitPercentages: { [signerId]: Number(utilitySplitPercentage.replace(",", ".")), ...(contract.signers.find((signer) => signer.signerId !== signerId) ? { [contract.signers.find((signer) => signer.signerId !== signerId)!.signerId]: 100 - Number(utilitySplitPercentage.replace(",", ".")) } : {}) }, holdingDepositTerms: { amount: Number(holdingDepositAmount.replace(",", ".")), refundabilityConditions } } : {}),
    };
    try {
      return buildContractHtml({ document: { ...contract, signers: previewSigners, contractPayload: previewPayload }, agency, property, participants: previewParticipants });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Το πρότυπο απαιτεί συμπληρωμένα στοιχεία.";
      return `<html><body style="font-family: sans-serif; padding: 20px"><strong>${message}</strong></body></html>`;
    }
  }, [agency, bankReference, cashReceiptNote, contract, holdingDepositAmount, houseRulesText, idBackUrl, idFrontUrl, participants, property, refundabilityConditions, signerAfm, signerIdCardNumber, signerId, utilitySplitPercentage]);

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
    if (visible && step === 4 && !locationCoords) void captureLocation();
  }, [captureLocation, locationCoords, step, visible]);

  const handleSendOtp = async () => {
    if (!contract || !signerId || isSendingOtp) return;
    setIsSendingOtp(true);
    setErrorText("");
    try {
      const result = await sendSigningOtp(contract.id, signerId);
      setOtpMessage(t("esign.otpSent"));
      setDebugOtpCode(result.debugCode ?? "");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("esign.errors.otpSend"));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!contract || !signerId || isVerifyingOtp) return;
    setIsVerifyingOtp(true);
    setErrorText("");
    try {
      const result = await verifySigningOtp(contract.id, signerId, otpCode);
      setOtpVerified(result.verified);
      setVerificationToken(result.verificationToken ?? "");
      setOtpVerificationId(result.verificationId ?? "");
      setOtpMessage(t("esign.otpVerified"));
      setContract((current) => current ? { ...current, signers: current.signers.map((signer) => signer.signerId === signerId ? { ...signer, otpVerified: true, otpVerifiedAt: result.verifiedAt } : signer) } : current);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("esign.errors.otpVerify"));
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
          setSignerAfm(nextSigner.signerAfm ?? "");
          setSignerIdCardNumber(nextSigner.signerIdCardNumber ?? "");
          setIdFrontUrl(nextSigner.idCardPhotoUrl ?? "");
          setIdBackUrl(nextSigner.idCardBackPhotoUrl ?? "");
          setIdCaptureMetadata(nextSigner.idCaptureMetadata ?? {});
          setIdCaptureTimestamp(nextSigner.idCaptureTimestamp ?? 0);
          setIdDocumentType(nextSigner.idDocumentType ?? "national_id");
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

  const goNext = async () => {
    if (!canContinueFromStep) return;
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

  return (
    <BaseBottomSheet visible={visible} onClose={onClose} scrollable={false} maxHeight="94%">
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.onSurface }]}>{contract?.title || t("esign.title")}</Text>
              <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>{t("esign.stepProgress", { step, total: 4 })}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="esign-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.progressRow}>{[1, 2, 3, 4].map((item) => <View key={item} style={[styles.progressBar, { backgroundColor: item <= step ? colors.brand : colors.surfaceTertiary }]} />)}</View>

          {contract && (auth.userId === contract.brokerId || auth.userId === contract.createdByUserId) && contract.status !== "signed" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.signerPickerRow}>
              {contract.requiredSignerIds.map((requiredId) => {
                const signer = contract.signers.find((entry) => entry.signerId === requiredId);
                if (!signer || signer.signatureBase64.trim()) return null;
                const active = signer.signerId === signerId;
                return <Pressable key={signer.signerId} style={[styles.signerPicker, { borderColor: active ? colors.brand : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }]} onPress={() => { setSelectedSignerId(signer.signerId); setSignerAfm(signer.signerAfm ?? ""); setSignerIdCardNumber(signer.signerIdCardNumber ?? ""); setIdFrontUrl(signer.idCardPhotoUrl ?? ""); setIdBackUrl(signer.idCardBackPhotoUrl ?? ""); setOtpVerified(signer.otpVerified === true); setOtpVerificationId(signer.otpVerificationId ?? ""); setVerificationToken(""); signatureRef.current?.clearSignature(); setSignatureData(""); setLocationCoords(null); setStep(1); }} testID={`esign-signer-${signer.signerId}`}><Ionicons name={active ? "person" : "person-outline"} size={15} color={active ? colors.brand : colors.onSurfaceTertiary} /><Text style={[styles.signerPickerText, { color: active ? colors.brand : colors.onSurface }]}>{signer.signerName}</Text></Pressable>;
              })}
            </ScrollView>
          ) : null}

          {isLoading ? <View style={styles.loadingState}><ActivityIndicator size="large" color={colors.brand} /></View> : successContract ? (
            <View style={styles.successState}>
              <View style={[styles.successIcon, { backgroundColor: colors.brandTertiary }]}><Ionicons name="checkmark-circle" size={48} color={colors.brand} /></View>
              <Text style={[styles.successTitle, { color: colors.onSurface }]}>{t("esign.contractSignedSuccess")}</Text>
              <Text style={[styles.successMeta, { color: colors.onSurfaceTertiary }]}>{successContract.pdfSha256Hash ? `SHA-256: ${successContract.pdfSha256Hash}` : ""}</Text>
              <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }]} onPress={() => void handleWhatsAppShare()} disabled={!sharePhone} testID="esign-share-whatsapp">
                <Ionicons name="logo-whatsapp" size={19} color={colors.onBrand} />
                <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("esign.shareViaWhatsApp")}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={onClose} testID="esign-success-close"><Text style={[styles.secondaryButtonText, { color: colors.onSurface }]}>{t("common.actions.done")}</Text></Pressable>
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {step === 1 ? (
                <>
                  <View style={styles.sectionHeading}><Ionicons name="document-text-outline" size={20} color={colors.brand} /><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.reviewTitle")}</Text></View>
                  <View style={[styles.previewFrame, { borderColor: colors.border }]}><WebView source={{ html: previewHtml }} originWhitelist={["*"]} style={styles.previewWebView} /></View>
                  <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>{t("esign.verifyIdentityHint")}</Text>
                  <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.afmLabel")}</Text>
                  <TextInput value={signerAfm} onChangeText={(value) => setSignerAfm(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder={t("esign.afmPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} maxLength={9} testID="esign-afm-input" />
                  <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.idCardLabel")}</Text>
                  <TextInput value={signerIdCardNumber} onChangeText={setSignerIdCardNumber} style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder={t("esign.idCardPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="characters" testID="esign-id-card-input" />
                  {currentSignerAlreadySigned ? <Text style={[styles.sectionHint, { color: colors.warning }]}>{t("esign.alreadySigned")}</Text> : null}
                  {contract?.contractType === "holding_deposit_viewing" ? <>
                    <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.holdingDepositAmountLabel")}</Text>
                    <TextInput value={holdingDepositAmount} onChangeText={(value) => setHoldingDepositAmount(value.replace(/[^0-9.,]/g, ""))} keyboardType="decimal-pad" style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder={t("esign.holdingDepositAmountPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID="esign-holding-deposit-input" />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Τραπεζική αναφορά</Text>
                    <TextInput value={bankReference} onChangeText={setBankReference} style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="Αριθμός συναλλαγής" placeholderTextColor={colors.onSurfaceTertiary} />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Σημείωση απόδειξης μετρητών</Text>
                    <TextInput value={cashReceiptNote} onChangeText={setCashReceiptNote} style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="Αριθμός ή περιγραφή απόδειξης" placeholderTextColor={colors.onSurfaceTertiary} />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Όροι επιστροφής προκαταβολής</Text>
                    <TextInput value={refundabilityConditions} onChangeText={setRefundabilityConditions} multiline textAlignVertical="top" style={[styles.input, styles.multilineInput, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="Πότε επιστρέφεται ή παρακρατείται" placeholderTextColor={colors.onSurfaceTertiary} />
                  </> : null}
                  {contract?.contractType === "roommate_agreement" ? <>
                    <Text style={[styles.label, { color: colors.onSurface }]}>{t("esign.houseRulesLabel")}</Text>
                    <TextInput value={houseRulesText} onChangeText={setHouseRulesText} multiline textAlignVertical="top" style={[styles.input, styles.multilineInput, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder={t("esign.houseRulesPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} maxLength={2000} testID="esign-house-rules-input" />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Ποσοστό κοινόχρηστων εξόδων του υπογράφοντος</Text>
                    <TextInput value={utilitySplitPercentage} onChangeText={(value) => setUtilitySplitPercentage(value.replace(/[^0-9.,]/g, ""))} keyboardType="decimal-pad" style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="50" placeholderTextColor={colors.onSurfaceTertiary} />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Ποσό εγγύησης</Text>
                    <TextInput value={holdingDepositAmount} onChangeText={(value) => setHoldingDepositAmount(value.replace(/[^0-9.,]/g, ""))} keyboardType="decimal-pad" style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="Ποσό σε EUR" placeholderTextColor={colors.onSurfaceTertiary} />
                    <Text style={[styles.label, { color: colors.onSurface }]}>Όροι επιστροφής εγγύησης</Text>
                    <TextInput value={refundabilityConditions} onChangeText={setRefundabilityConditions} multiline textAlignVertical="top" style={[styles.input, styles.multilineInput, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder="Πότε επιστρέφεται ή παρακρατείται" placeholderTextColor={colors.onSurfaceTertiary} />
                  </> : null}
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <View style={styles.sectionHeading}><Ionicons name="camera-outline" size={20} color={colors.brand} /><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.idVerificationTitle")}</Text></View>
                  <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>{t("esign.idVerificationSubtitle")}</Text>
                  <View style={styles.evidenceRow}>
                    <View style={[styles.evidenceItem, { borderColor: colors.border }]}><Ionicons name={idFrontUrl ? "checkmark-circle" : "ellipse-outline"} size={20} color={idFrontUrl ? colors.success : colors.onSurfaceTertiary} /><Text style={[styles.evidenceText, { color: colors.onSurface }]}>{t("esign.idFront")}</Text></View>
                    <View style={[styles.evidenceItem, { borderColor: colors.border }]}><Ionicons name={idBackUrl ? "checkmark-circle" : "ellipse-outline"} size={20} color={idBackUrl ? colors.success : colors.onSurfaceTertiary} /><Text style={[styles.evidenceText, { color: colors.onSurface }]}>{t("esign.idBack")}</Text></View>
                  </View>
                  <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }]} onPress={() => setCameraVisible(true)} testID="esign-open-id-camera"><Ionicons name="camera-outline" size={19} color={colors.onBrand} /><Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("esign.openCamera")}</Text></Pressable>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <View style={styles.sectionHeading}><Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} /><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.otpTitle")}</Text></View>
                  {currentSigner?.signerRole !== "broker" ? <>
                    <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => void handleSendOtp()} disabled={isSendingOtp} testID="esign-send-otp">{isSendingOtp ? <ActivityIndicator color={colors.brand} /> : <><Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} /><Text style={[styles.secondaryButtonText, { color: colors.brand }]}>{t("esign.sendOtp")}</Text></>}</Pressable>
                    <TextInput value={otpCode} onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" maxLength={6} style={[styles.input, { borderColor: colors.border, color: colors.onSurface, backgroundColor: colors.surfaceSecondary }]} placeholder={t("esign.otpPlaceholder")} placeholderTextColor={colors.onSurfaceTertiary} testID="esign-otp-input" />
                    <Pressable style={[styles.primaryButton, { backgroundColor: colors.brand }, (!/^\d{6}$/.test(otpCode) || isVerifyingOtp) && styles.disabledButton]} onPress={() => void handleVerifyOtp()} disabled={!/^\d{6}$/.test(otpCode) || isVerifyingOtp} testID="esign-verify-otp">{isVerifyingOtp ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{t("esign.verifyOtp")}</Text>}</Pressable>
                    {!!debugOtpCode && <Text style={[styles.debugText, { color: colors.warning }]}>{t("esign.debugOtp", { code: debugOtpCode })}</Text>}
                    {!!otpMessage && <Text style={[styles.statusText, { color: otpVerified ? colors.success : colors.onSurfaceTertiary }]}>{otpMessage}</Text>}
                  </> : <Text style={[styles.sectionHint, { color: colors.onSurfaceTertiary }]}>{t("esign.otpSkipped")}</Text>}
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <View style={styles.sectionHeading}><Ionicons name="create-outline" size={20} color={colors.brand} /><Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{t("esign.signOnScreen")}</Text></View>
                  <View style={[styles.signatureFrame, { borderColor: colors.border }]}><SignatureCanvas ref={signatureRef} style={styles.signatureCanvas} onOK={setSignatureData} onEmpty={() => setErrorText(t("esign.errors.emptySignature"))} descriptionText="" clearText="" confirmText="" webStyle={`.m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: 0; } body { background: transparent; }`} /></View>
                  <View style={styles.signatureActions}><Pressable style={[styles.toolButton, { borderColor: colors.border }]} onPress={() => { signatureRef.current?.clearSignature(); setSignatureData(""); }} testID="esign-clear-signature"><Ionicons name="trash-outline" size={17} color={colors.brand} /><Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.clearSignature")}</Text></Pressable><Pressable style={[styles.toolButton, { borderColor: colors.border }]} onPress={() => signatureRef.current?.undo()} testID="esign-undo-signature"><Ionicons name="arrow-undo-outline" size={17} color={colors.brand} /><Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.undoSignature")}</Text></Pressable><Pressable style={[styles.toolButton, { borderColor: colors.border }]} onPress={() => signatureRef.current?.readSignature()} testID="esign-confirm-signature"><Ionicons name="checkmark-outline" size={17} color={colors.brand} /><Text style={[styles.toolText, { color: colors.brand }]}>{t("esign.confirmSignature")}</Text></Pressable></View>
                  <View style={[styles.locationRow, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><Ionicons name={locationCoords ? "location" : "location-outline"} size={20} color={locationCoords ? colors.success : colors.brand} /><View style={styles.locationCopy}>{locationCoords ? <Text style={[styles.locationText, { color: colors.onSurface }]}>{t("esign.gpsCaptured", { lat: locationCoords.latitude.toFixed(6), lng: locationCoords.longitude.toFixed(6), acc: locationCoords.accuracyMeters.toFixed(1) })}</Text> : <Text style={[styles.locationText, { color: colors.onSurfaceTertiary }]}>{isCapturingLocation ? t("esign.capturingGps") : t("esign.gpsPending")}</Text>}</View>{!locationCoords ? <Pressable onPress={() => void captureLocation()} hitSlop={8}><Ionicons name="refresh-outline" size={19} color={colors.brand} /></Pressable> : null}</View>
                </>
              ) : null}

              {!!errorText && <Text style={[styles.errorText, { color: colors.error }]}>{errorText}</Text>}
            </ScrollView>
          )}

          {!isLoading && !successContract ? <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable style={[styles.footerButton, { borderColor: colors.border }]} onPress={step === 1 ? onClose : () => setStep((current) => (current - 1) as 1 | 2 | 3 | 4)} testID="esign-back"><Text style={[styles.footerButtonText, { color: colors.onSurface }]}>{step === 1 ? t("common.actions.cancel") : t("common.actions.back")}</Text></Pressable>
            {step < 4 ? <Pressable style={[styles.footerButton, styles.footerPrimary, { backgroundColor: colors.brand }, (!canContinueFromStep || isSavingPayload) && styles.disabledButton]} onPress={() => void goNext()} disabled={!canContinueFromStep || isSavingPayload} testID="esign-next">{isSavingPayload ? <ActivityIndicator color={colors.onBrand} /> : <><Text style={[styles.footerButtonText, { color: colors.onBrand }]}>{t("common.actions.continue")}</Text><Ionicons name="arrow-forward" size={17} color={colors.onBrand} /></>}</Pressable> : <Pressable style={[styles.footerButton, styles.footerPrimary, { backgroundColor: colors.brand }, !canContinueFromStep && styles.disabledButton]} onPress={() => void handleFinalize()} disabled={!canContinueFromStep || isFinalizing} testID="esign-finalize">{isFinalizing ? <ActivityIndicator color={colors.onBrand} /> : <><Ionicons name="shield-checkmark-outline" size={17} color={colors.onBrand} /><Text style={[styles.footerButtonText, { color: colors.onBrand }]}>{t("esign.finalize")}</Text></>}</Pressable>}
          </View> : null}
        </View>
      {contract ? <IdCameraCapture visible={cameraVisible} contractId={contract.id} signerId={signerId} frontUrl={idFrontUrl} backUrl={idBackUrl} documentType={idDocumentType} onUploaded={(side, url, metadata) => { if (side === "front") setIdFrontUrl(url); else setIdBackUrl(url); setIdCaptureMetadata((current) => ({ ...current, [side]: metadata })); setIdCaptureTimestamp((current) => Math.max(current, metadata.idCaptureTimestamp)); setIdDocumentType(metadata.idDocumentType); }} onClose={() => setCameraVisible(false)} /> : null}
    </BaseBottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.display, fontSize: fontSize.xl },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.sm },
  progressRow: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  progressBar: { height: 4, flex: 1, borderRadius: radius.pill },
  signerPickerRow: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  signerPicker: { minHeight: 34, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: 4 },
  signerPickerText: { fontFamily: fonts.semibold, fontSize: fontSize.xs },
  body: { flexShrink: 1 },
  bodyContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  loadingState: { minHeight: 360, alignItems: "center", justifyContent: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: fontSize.lg, flex: 1 },
  sectionHint: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 19 },
  previewFrame: { height: 300, borderWidth: 1, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#FFFFFF" },
  previewWebView: { flex: 1, backgroundColor: "#FFFFFF" },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: fontSize.base },
  multilineInput: { minHeight: 110, paddingTop: spacing.sm },
  evidenceRow: { flexDirection: "row", gap: spacing.sm },
  evidenceItem: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  evidenceText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  primaryButton: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  secondaryButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  switchRow: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  switchCopy: { flex: 1, gap: 2 },
  debugText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  statusText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  signatureFrame: { height: 210, borderWidth: 1, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#FFFFFF" },
  signatureCanvas: { flex: 1 },
  signatureActions: { flexDirection: "row", gap: spacing.xs },
  toolButton: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 4 },
  toolText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  locationRow: { minHeight: 60, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  locationCopy: { flex: 1 },
  locationText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, lineHeight: 18 },
  errorText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, lineHeight: 19 },
  footer: { borderTopWidth: 1, padding: spacing.lg, flexDirection: "row", gap: spacing.sm },
  footerButton: { minHeight: 48, flex: 1, borderWidth: 1, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  footerPrimary: { borderWidth: 0 },
  footerButtonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
  disabledButton: { opacity: 0.5 },
  successState: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  successIcon: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center" },
  successTitle: { fontFamily: fonts.display, fontSize: fontSize.xl, textAlign: "center" },
  successMeta: { fontFamily: fonts.regular, fontSize: fontSize.xs, textAlign: "center" },
});