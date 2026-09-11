import React, { useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { sendContractChatRequest } from "@/src/api/contracts";
import ContractSigningScreen from "@/src/components/SignContractModal";
import { useAuth } from "@/src/context/auth";
import type { ContractDraftContext, DigitalContractDocument } from "@/src/types/esignature";

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseDraft(value: string): ContractDraftContext | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as ContractDraftContext;
  } catch {
    return undefined;
  }
}

export default function ContractRoute() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{
    id?: string | string[];
    contractId?: string | string[];
    draft?: string | string[];
    signerId?: string | string[];
  }>();
  const draft = useMemo(() => parseDraft(getParam(params.draft)), [params.draft]);
  const routeId = getParam(params.id);
  const contractId = getParam(params.contractId) || (routeId && routeId !== "new" ? routeId : undefined);
  const signerId = getParam(params.signerId) || auth.userId || undefined;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);

  const handleCreated = useCallback((contract: DigitalContractDocument) => {
    const chatRoomId = contract.chatRoomId || draft?.chatRoomId;
    const senderId = auth.userId || draft?.createdByUserId;
    if (!chatRoomId || !senderId) return;
    void sendContractChatRequest({ chatRoomId, senderId, contract }).catch(() => undefined);
  }, [auth.userId, draft]);

  return (
    <ContractSigningScreen
      draft={draft}
      contractId={contractId}
      signerId={signerId}
      onCreated={draft ? handleCreated : undefined}
      onCompleted={goBack}
      onClose={goBack}
    />
  );
}
