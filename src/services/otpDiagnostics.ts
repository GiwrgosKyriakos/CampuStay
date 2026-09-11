export function logOtpTerminalDiagnostic(params: {
  phase: string;
  targetPhoneNumber?: string;
  authMethod: string;
  error: unknown;
  details?: Record<string, unknown>;
}): void {
  const errorRecord = params.error && typeof params.error === "object"
    ? params.error as { code?: unknown; message?: unknown; stack?: unknown; details?: unknown; name?: unknown; cause?: unknown }
    : undefined;

  console.error("[OTP Terminal Diagnostic] Handshake / Dispatch Failed:", {
    timestamp: new Date().toISOString(),
    phase: params.phase,
    targetPhoneNumber: params.targetPhoneNumber ?? "",
    authMethod: params.authMethod,
    firebaseErrorCode: errorRecord?.code ?? "NO_CODE",
    firebaseErrorMessage: errorRecord?.message ?? "NO_MESSAGE",
    errorName: errorRecord?.name ?? "NO_NAME",
    errorDetails: errorRecord?.details ?? "NO_DETAILS",
    errorCause: errorRecord?.cause ?? "NO_CAUSE",
    ...params.details,
    rawError: params.error,
    stack: errorRecord?.stack,
  });
}
