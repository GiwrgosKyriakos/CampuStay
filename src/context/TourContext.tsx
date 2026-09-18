import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRootNavigationState, useRouter, useSegments, type Href } from "expo-router";

import { TOUR_STEPS } from "@/src/data/tours";
import { getCompletedTourPersonas, markTourPersonaCompleted } from "@/src/api/tourProgress";
import { useAuth } from "@/src/context/auth";
import { useTourPersona } from "@/src/hooks/useTourPersona";
import type { TourAnchorBounds, TourAnchorKey, TourModalBridge, TourPersonaKey, TourPhase, TourStep } from "@/src/types/tour";

interface TourContextValue {
  activePersona: TourPersonaKey | null;
  completedTourPersonas: TourPersonaKey[];
  currentStep: TourStep | null;
  currentStepIndex: number;
  currentStepTotal: number;
  currentTarget: TourAnchorBounds | null;
  isTourActive: boolean;
  isTourLoading: boolean;
  registerAnchor: (targetKey: TourAnchorKey, bounds: TourAnchorBounds) => void;
  unregisterAnchor: (targetKey: TourAnchorKey) => void;
  registerModalBridge: (modalKey: string, bridge: TourModalBridge) => () => void;
  notifyAction: (targetKey: TourAnchorKey) => void;
  startTour: (persona?: TourPersonaKey) => void;
  next: () => void;
  skip: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const resolvedPersona = useTourPersona();
  const [completedTourPersonas, setCompletedTourPersonas] = useState<TourPersonaKey[]>([]);
  const [isTourLoading, setIsTourLoading] = useState(true);
  const [activePersona, setActivePersona] = useState<TourPersonaKey | null>(null);
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [anchors, setAnchors] = useState<Record<string, TourAnchorBounds>>({});
  const [modalRevision, setModalRevision] = useState(0);
  const modalBridgesRef = useRef<Record<string, TourModalBridge>>({});
  const currentModalRef = useRef<string | null>(null);
  const startedKeyRef = useRef<string | null>(null);
  const transitionedStepRef = useRef<string | null>(null);
  const guestCompletedRef = useRef<Set<TourPersonaKey>>(new Set());

  const currentSteps = activePersona ? TOUR_STEPS[activePersona] : [];
  const currentStep = currentSteps[currentStepIndex] ?? null;
  const currentTarget = currentStep ? anchors[currentStep.targetKey] ?? null : null;
  const currentTabRoute = segments[0] === "(tabs)" && segments[1]
    ? `/(tabs)/${segments[1]}`
    : null;

  useEffect(() => {
    let mounted = true;
    setIsTourLoading(true);

    void (async () => {
      if (auth.isGuest) {
        if (mounted) {
          setCompletedTourPersonas(Array.from(guestCompletedRef.current));
          setIsTourLoading(false);
        }
        return;
      }
      if (!auth.isLoggedIn || !auth.userId) {
        if (mounted) {
          setCompletedTourPersonas([]);
          setIsTourLoading(false);
        }
        return;
      }

      const completed = await getCompletedTourPersonas(auth.userId).catch(() => []);
      if (mounted) {
        setCompletedTourPersonas(completed);
        setIsTourLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [auth.isGuest, auth.isLoggedIn, auth.userId]);

  useEffect(() => {
    if (isTourLoading || auth.isLoading || !rootNavigationState?.key) return;
    if (!auth.isGuest && (!auth.isLoggedIn || !auth.userId || auth.needsProfileSetup)) return;

    const identity = auth.isGuest ? "guest" : auth.userId;
    if (!identity || completedTourPersonas.includes(resolvedPersona)) return;

    const launchKey = `${identity}:${resolvedPersona}`;
    if (startedKeyRef.current === launchKey) return;

    startedKeyRef.current = launchKey;
    setActivePersona(resolvedPersona);
    setCurrentStepIndex(0);
    setPhase("active");
  }, [auth.isGuest, auth.isLoading, auth.isLoggedIn, auth.needsProfileSetup, auth.userId, completedTourPersonas, isTourLoading, resolvedPersona, rootNavigationState?.key]);

  const registerAnchor = useCallback((targetKey: TourAnchorKey, bounds: TourAnchorBounds) => {
    setAnchors((previous) => ({ ...previous, [targetKey]: bounds }));
  }, []);

  const unregisterAnchor = useCallback((targetKey: string) => {
    setAnchors((previous) => {
      if (!previous[targetKey]) return previous;
      const next = { ...previous };
      delete next[targetKey];
      return next;
    });
  }, []);

  const registerModalBridge = useCallback((modalKey: string, bridge: TourModalBridge) => {
    modalBridgesRef.current[modalKey] = bridge;
    setModalRevision((revision) => revision + 1);
    return () => {
      if (modalBridgesRef.current[modalKey] === bridge) {
        delete modalBridgesRef.current[modalKey];
        setModalRevision((revision) => revision + 1);
      }
    };
  }, []);

  const closeCurrentModal = useCallback(() => {
    const modalKey = currentModalRef.current;
    if (!modalKey) return;
    modalBridgesRef.current[modalKey]?.close();
    currentModalRef.current = null;
  }, []);

  const conclude = useCallback(async () => {
    const persona = activePersona;
    if (!persona) return;

    closeCurrentModal();
    if (persona === "guest") {
      guestCompletedRef.current.add(persona);
    } else if (auth.userId) {
      await markTourPersonaCompleted(auth.userId, persona).catch((error) => {
        console.warn("[Tour] Could not persist completed persona:", error);
      });
    }

    setCompletedTourPersonas((previous) => previous.includes(persona) ? previous : [...previous, persona]);
    setPhase("idle");
    setActivePersona(null);
    setCurrentStepIndex(0);
  }, [activePersona, auth.userId, closeCurrentModal]);

  const startTour = useCallback((persona = resolvedPersona) => {
    if (completedTourPersonas.includes(persona)) return;
    startedKeyRef.current = `${auth.isGuest ? "guest" : auth.userId}:${persona}`;
    setActivePersona(persona);
    setCurrentStepIndex(0);
    setPhase("active");
  }, [auth.isGuest, auth.userId, completedTourPersonas, resolvedPersona]);

  const next = useCallback(() => {
    if (!currentStep) return;
    if (currentStepIndex >= currentSteps.length - 1) {
      void conclude();
      return;
    }
    closeCurrentModal();
    setCurrentStepIndex((index) => index + 1);
  }, [closeCurrentModal, conclude, currentStep, currentStepIndex, currentSteps.length]);

  const skip = useCallback(() => {
    void conclude();
  }, [conclude]);

  const notifyAction = useCallback((targetKey: TourAnchorKey) => {
    if (currentStep?.targetKey === targetKey) next();
  }, [currentStep, next]);

  useEffect(() => {
    if (phase !== "active" || !currentStep || !rootNavigationState?.key) return;

    const transitionKey = `${activePersona}:${currentStep.id}`;
    if (transitionedStepRef.current === transitionKey) return;
    transitionedStepRef.current = transitionKey;

    if (currentModalRef.current && currentModalRef.current !== currentStep.requiresModalOpen) {
      closeCurrentModal();
    }
    if (currentStep.tabRoute !== currentTabRoute) {
      router.push(currentStep.tabRoute as Href);
    }
    if (currentStep.screenRoute) {
      router.push(currentStep.screenRoute as Href);
    }
    if (currentStep.requiresModalOpen) {
      currentModalRef.current = currentStep.requiresModalOpen;
      modalBridgesRef.current[currentStep.requiresModalOpen]?.open();
    }
  }, [activePersona, closeCurrentModal, currentStep, currentTabRoute, modalRevision, phase, rootNavigationState?.key, router]);

  const value = useMemo<TourContextValue>(() => ({
    activePersona,
    completedTourPersonas,
    currentStep,
    currentStepIndex,
    currentStepTotal: currentSteps.length,
    currentTarget,
    isTourActive: phase === "active",
    isTourLoading,
    registerAnchor,
    unregisterAnchor,
    registerModalBridge,
    notifyAction,
    startTour,
    next,
    skip,
  }), [activePersona, completedTourPersonas, currentStep, currentStepIndex, currentTarget, isTourLoading, next, notifyAction, registerAnchor, registerModalBridge, skip, startTour, unregisterAnchor, phase]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour must be used within TourProvider");
  return value;
}