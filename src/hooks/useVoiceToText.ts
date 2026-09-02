import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import * as Haptics from "expo-haptics";

import { useLocale } from "@/src/context/locale";
import { t } from "@/src/locales";

export interface VoiceToTextCallbacks {
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
}

const INACTIVITY_TIMEOUT_MS = 3500;

export function useVoiceToText() {
  const { locale } = useLocale();
  const activeLang = locale === "el" ? "el-GR" : "en-US";
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const transcriptRef = useRef("");
  const callbacksRef = useRef<VoiceToTextCallbacks>({});
  const committedTranscriptRef = useRef("");
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const commitTranscript = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized || normalized === committedTranscriptRef.current) return;
    committedTranscriptRef.current = normalized;
    callbacksRef.current.onFinalResult?.(normalized);
  }, []);

  const scheduleInactivityStop = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current.trim()) {
        void ExpoSpeechRecognitionModule.stop();
        return;
      }
      commitTranscript(transcriptRef.current);
      void ExpoSpeechRecognitionModule.stop();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer, commitTranscript]);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    scheduleInactivityStop();
  });

  useSpeechRecognitionEvent("end", () => {
    clearInactivityTimer();
    setIsListening(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const nextTranscript = event.results[0]?.transcript?.trim() ?? "";
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
    if (nextTranscript) callbacksRef.current.onPartialResult?.(nextTranscript);
    if (event.isFinal) commitTranscript(nextTranscript);
    scheduleInactivityStop();
  });

  useSpeechRecognitionEvent("error", (event) => {
    clearInactivityTimer();
    setError(event.error === "not-allowed" ? t("voice.errors.permissionDenied") : event.message || t("voice.errors.generic"));
    setIsListening(false);
  });

  const startListening = useCallback(async (callbacks: VoiceToTextCallbacks = {}) => {
    try {
      setError(null);
      callbacksRef.current = callbacks;
      transcriptRef.current = "";
      committedTranscriptRef.current = "";
      setTranscript("");

      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError(t("voice.errors.unavailable"));
        return;
      }

      if (hasPermission !== true) {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        setHasPermission(permission.granted);
        if (!permission.granted) {
          setError(t("voice.errors.permissionDenied"));
          return;
        }
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      ExpoSpeechRecognitionModule.start({
        lang: activeLang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : t("voice.errors.startFailed"));
      setIsListening(false);
    }
  }, [activeLang, hasPermission]);

  const stopListening = useCallback(async () => {
    clearInactivityTimer();
    commitTranscript(transcriptRef.current);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setIsListening(false);
    }
  }, [clearInactivityTimer, commitTranscript]);

  const cancelListening = useCallback(() => {
    clearInactivityTimer();
    transcriptRef.current = "";
    committedTranscriptRef.current = "";
    setTranscript("");
    setIsListening(false);
    ExpoSpeechRecognitionModule.abort();
  }, [clearInactivityTimer]);

  useEffect(() => {
    let mounted = true;
    void ExpoSpeechRecognitionModule.getPermissionsAsync().then((permission) => {
      if (mounted) setHasPermission(permission.granted);
    }).catch(() => undefined);

    return () => {
      mounted = false;
      clearInactivityTimer();
      ExpoSpeechRecognitionModule.abort();
    };
  }, [clearInactivityTimer]);

  return {
    isListening,
    transcript,
    error,
    hasPermission,
    startListening,
    stopListening,
    cancelListening,
  };
}
