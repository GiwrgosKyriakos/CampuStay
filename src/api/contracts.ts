import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadString } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

import { db, storage } from "@/src/config/firebase";
import { firebaseFunctions } from "@/src/config/functions";
import type {
  CreateContractInput,
  DigitalContractDocument,
  SignatureSignerEvidence,
} from "@/src/types/esignature";

function sanitizeEvidence(evidence: SignatureSignerEvidence): SignatureSignerEvidence {
  return {
    ...evidence,
    signerId: evidence.signerId.trim(),
    signerName: evidence.signerName.trim(),
    signerPhone: evidence.signerPhone.trim(),
    signerEmail: evidence.signerEmail.trim(),
    ...(evidence.signerAfm?.trim() ? { signerAfm: evidence.signerAfm.trim() } : {}),
    ...(evidence.signerIdCardNumber?.trim() ? { signerIdCardNumber: evidence.signerIdCardNumber.trim() } : {}),
    ...(evidence.idCardPhotoUrl?.trim() ? { idCardPhotoUrl: evidence.idCardPhotoUrl.trim() } : {}),
    ...(evidence.idCardBackPhotoUrl?.trim() ? { idCardBackPhotoUrl: evidence.idCardBackPhotoUrl.trim() } : {}),
  };
}

function mapContract(id: string, data: Record<string, unknown>): DigitalContractDocument {
  return {
    id,
    agencyId: typeof data.agencyId === "string" ? data.agencyId : "",
    contractType: data.contractType as DigitalContractDocument["contractType"],
    title: typeof data.title === "string" ? data.title : "Ψηφιακό έγγραφο",
    templateVersion: typeof data.templateVersion === "string" ? data.templateVersion : undefined,
    propertyCode: typeof data.propertyCode === "string" ? data.propertyCode : undefined,
    apartmentId: typeof data.apartmentId === "string" ? data.apartmentId : undefined,
    apartmentAddress: typeof data.apartmentAddress === "string" ? data.apartmentAddress : undefined,
    dealId: typeof data.dealId === "string" ? data.dealId : undefined,
    clientId: typeof data.clientId === "string" ? data.clientId : undefined,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : undefined,
    brokerId: typeof data.brokerId === "string" ? data.brokerId : undefined,
    createdByUserId: typeof data.createdByUserId === "string" ? data.createdByUserId : undefined,
    clientProfileId: typeof data.clientProfileId === "string" ? data.clientProfileId : undefined,
    chatRoomId: typeof data.chatRoomId === "string" ? data.chatRoomId : undefined,
    status: data.status as DigitalContractDocument["status"],
    contractPayload: (data.contractPayload && typeof data.contractPayload === "object" ? data.contractPayload : {}) as DigitalContractDocument["contractPayload"],
    signers: Array.isArray(data.signers) ? data.signers as SignatureSignerEvidence[] : [],
    requiredSignerIds: Array.isArray(data.requiredSignerIds) ? data.requiredSignerIds.filter((value): value is string => typeof value === "string") : [],
    pdfStoragePath: typeof data.pdfStoragePath === "string" ? data.pdfStoragePath : undefined,
    pdfStorageUrl: typeof data.pdfStorageUrl === "string" ? data.pdfStorageUrl : undefined,
    pdfSha256Hash: typeof data.pdfSha256Hash === "string" ? data.pdfSha256Hash : undefined,
    finalDocumentHash: typeof data.finalDocumentHash === "string" ? data.finalDocumentHash : undefined,
    finalPdfStoragePath: typeof data.finalPdfStoragePath === "string" ? data.finalPdfStoragePath : undefined,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    completedAt: typeof data.completedAt === "number" ? data.completedAt : undefined,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
    archivedAt: typeof data.archivedAt === "number" ? data.archivedAt : undefined,
    emailDispatchedAt: typeof data.emailDispatchedAt === "number" ? data.emailDispatchedAt : undefined,
  };
}

export async function createContractDocument(input: CreateContractInput): Promise<DigitalContractDocument> {
  if (!input.agencyId.trim() || !input.createdByUserId.trim()) throw new Error("Agency and creator are required");
  if (input.signers.length === 0 || input.requiredSignerIds.length === 0) throw new Error("At least one signer is required");

  const createdAt = Date.now();
  const contractPayload = {
    ...(input.contractPayload ?? {}),
    ...((input.contractType === "viewing_order" || input.contractType === "property_assignment") && input.contractPayload?.commissionRatePercentage === undefined ? { commissionRatePercentage: 2 } : {}),
  };
  const payload = {
    agencyId: input.agencyId.trim(),
    contractType: input.contractType,
    title: input.title.trim(),
    templateVersion: input.templateVersion ?? "v1.0-el",
    ...(input.propertyCode?.trim() ? { propertyCode: input.propertyCode.trim() } : {}),
    ...(input.apartmentId?.trim() ? { apartmentId: input.apartmentId.trim() } : {}),
    ...(input.apartmentAddress?.trim() ? { apartmentAddress: input.apartmentAddress.trim() } : {}),
    ...(input.dealId?.trim() ? { dealId: input.dealId.trim() } : {}),
    ...(input.clientId?.trim() ? { clientId: input.clientId.trim() } : {}),
    ...(input.ownerId?.trim() ? { ownerId: input.ownerId.trim() } : {}),
    ...(input.brokerId?.trim() ? { brokerId: input.brokerId.trim() } : {}),
    createdByUserId: input.createdByUserId.trim(),
    ...(input.clientProfileId?.trim() ? { clientProfileId: input.clientProfileId.trim() } : {}),
    ...(input.chatRoomId?.trim() ? { chatRoomId: input.chatRoomId.trim() } : {}),
    status: "pending_signatures" as const,
    contractPayload,
    signers: input.signers.map(sanitizeEvidence),
    requiredSignerIds: Array.from(new Set(input.requiredSignerIds.filter(Boolean))),
    createdAt,
    updatedAt: createdAt,
  };
  const contractSnapshot = await addDoc(collection(db, "contracts"), payload);
  return mapContract(contractSnapshot.id, payload);
}

export async function getContractDocument(contractId: string): Promise<DigitalContractDocument | null> {
  if (!contractId.trim()) return null;
  const snapshot = await getDoc(doc(db, "contracts", contractId));
  if (!snapshot.exists()) return null;
  const contract = mapContract(snapshot.id, snapshot.data() as Record<string, unknown>);
  const ledgerSnapshot = await getDocs(collection(db, "contracts", contractId, "signatures_ledger"));
  if (ledgerSnapshot.empty) return contract;
  const ledgerBySigner = new Map(ledgerSnapshot.docs.map((entry) => [entry.data().signerId as string, entry.data()]));
  return {
    ...contract,
    signers: contract.signers.map((signer) => {
      const ledger = ledgerBySigner.get(signer.signerId);
      if (!ledger) return signer;
      const serverTimestamp = ledger.serverTimestamp as { toMillis?: () => number } | undefined;
      return {
        ...signer,
        signatureBase64: typeof ledger.signatureBase64 === "string" ? ledger.signatureBase64 : signer.signatureBase64,
        signerAfm: typeof ledger.signerAfm === "string" ? ledger.signerAfm : signer.signerAfm,
        signerIdCardNumber: typeof ledger.signerIdCardNumber === "string" ? ledger.signerIdCardNumber : signer.signerIdCardNumber,
        signedAt: typeof serverTimestamp?.toMillis === "function" ? serverTimestamp.toMillis() : signer.signedAt,
        locationCoords: ledger.gpsCoordinates ?? signer.locationCoords,
        otpVerified: ledger.otpVerified === true,
        otpVerificationId: typeof ledger.otpVerificationId === "string" ? ledger.otpVerificationId : signer.otpVerificationId,
        otpVerifiedAt: typeof ledger.otpVerifiedAt === "number" ? ledger.otpVerifiedAt : signer.otpVerifiedAt,
        idCardPhotoUrl: typeof ledger.idCardPhotoUrl === "string" ? ledger.idCardPhotoUrl : signer.idCardPhotoUrl,
        idCardBackPhotoUrl: typeof ledger.idCardBackPhotoUrl === "string" ? ledger.idCardBackPhotoUrl : signer.idCardBackPhotoUrl,
        idCaptureTimestamp: typeof ledger.idCaptureTimestamp === "number" ? ledger.idCaptureTimestamp : signer.idCaptureTimestamp,
        idDocumentType: ledger.idDocumentType === "passport" || ledger.idDocumentType === "national_id" ? ledger.idDocumentType : signer.idDocumentType,
        idCaptureMetadata: ledger.idCaptureMetadata ?? signer.idCaptureMetadata,
        evidenceId: typeof ledger.evidenceId === "string" ? ledger.evidenceId : signer.evidenceId,
        ipAddress: typeof ledger.ipAddress === "string" ? ledger.ipAddress : signer.ipAddress,
        deviceAttestation: typeof ledger.deviceAttestation === "string" ? ledger.deviceAttestation : signer.deviceAttestation,
      };
    }),
  };
}

export async function uploadContractPdf(params: {
  contractId: string;
  base64: string;
  sha256Hash: string;
}): Promise<{ storagePath: string }> {
  const storagePath = `contracts/${params.contractId}/source/${params.sha256Hash}.pdf`;
  const fileRef = ref(storage, storagePath);
  await uploadString(fileRef, params.base64, "base64", {
    contentType: "application/pdf",
    customMetadata: { contractId: params.contractId, sha256Hash: params.sha256Hash },
  });
  return { storagePath };
}

export async function recordContractSignature(params: {
  contractId: string;
  signerId: string;
  evidence: SignatureSignerEvidence;
  pdfStoragePath?: string;
  pdfStorageUrl?: string;
  pdfSha256Hash?: string;
  verificationToken?: string;
}): Promise<DigitalContractDocument> {
  const callable = httpsCallable<{
    contractId: string;
    signerId: string;
    evidence: SignatureSignerEvidence;
    pdfStoragePath?: string;
    pdfStorageUrl?: string;
    pdfSha256Hash?: string;
    verificationToken?: string;
  }, Record<string, unknown>>(firebaseFunctions, "recordSigningEvidence");
  const result = await callable(params);
  return (await getContractDocument(params.contractId)) ?? mapContract(params.contractId, result.data);
}

export async function updateContractSignerIdentity(contractId: string, signerId: string, values: { signerAfm?: string; signerIdCardNumber?: string }): Promise<void> {
  const contract = await getContractDocument(contractId);
  if (!contract) throw new Error("Το έγγραφο δεν βρέθηκε.");
  const signers = contract.signers.map((signer) => signer.signerId === signerId ? {
    ...signer,
    ...(values.signerAfm?.trim() ? { signerAfm: values.signerAfm.trim() } : {}),
    ...(values.signerIdCardNumber?.trim() ? { signerIdCardNumber: values.signerIdCardNumber.trim() } : {}),
  } : signer);
  await updateDoc(doc(db, "contracts", contractId), { signers, updatedAt: serverTimestamp() });
}

export async function sendSigningOtp(contractId: string, signerId: string): Promise<{ delivered: boolean; expiresInSeconds: number; debugCode?: string }> {
  const callable = httpsCallable<{ contractId: string; signerId: string }, { delivered: boolean; expiresInSeconds: number; debugCode?: string }>(firebaseFunctions, "sendSigningOtp");
  const result = await callable({ contractId, signerId });
  return result.data;
}

export async function getContractDownloadUrl(contractId: string): Promise<{ url: string; expiresAt: number }> {
  const callable = httpsCallable<{ contractId: string }, { url: string; expiresAt: number }>(firebaseFunctions, "getContractDownloadUrl");
  const result = await callable({ contractId });
  return result.data;
}

export async function verifySigningOtp(contractId: string, signerId: string, code: string): Promise<{ verified: boolean; verifiedAt: number; verificationId?: string; verificationToken?: string }> {
  const callable = httpsCallable<{ contractId: string; signerId: string; code: string }, { verified: boolean; verifiedAt: number; verificationId?: string; verificationToken?: string }>(firebaseFunctions, "verifySigningOtp");
  const result = await callable({ contractId, signerId, code });
  return result.data;
}

export async function updateContractPayload(contractId: string, signerId: string, payload: DigitalContractDocument["contractPayload"]): Promise<DigitalContractDocument> {
  const callable = httpsCallable<{
    contractId: string;
    signerId: string;
    payload: DigitalContractDocument["contractPayload"];
  }, Record<string, unknown>>(firebaseFunctions, "updateContractPayload");
  const result = await callable({ contractId, signerId, payload });
  return mapContract(contractId, result.data);
}

export async function markContractRequestSent(contractId: string, chatRoomId: string): Promise<void> {
  await setDoc(doc(db, "contracts", contractId), { chatRoomId: chatRoomId.trim(), requestSentAt: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function sendContractChatRequest(params: {
  chatRoomId: string;
  senderId: string;
  contract: DigitalContractDocument;
}): Promise<void> {
  const text = `${params.contract.title} · ${params.contract.id}`;
  await addDoc(collection(db, "chats", params.chatRoomId, "messages"), {
    senderId: params.senderId,
    type: "contract_request",
    text,
    contractId: params.contract.id,
    contractType: params.contract.contractType,
    contractTitle: params.contract.title,
    metadata: {
      contractId: params.contract.id,
      contractType: params.contract.contractType,
      contractTitle: params.contract.title,
    },
    createdAt: serverTimestamp(),
    isRead: false,
  });
  await setDoc(doc(db, "chats", params.chatRoomId), {
    lastMessage: text,
    lastMessageText: text,
    lastMessageTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await markContractRequestSent(params.contract.id, params.chatRoomId);
}