import React from "react";
import "@testing-library/react-native/dont-cleanup-after-each";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import VoiceInputButton from "@/src/components/common/VoiceInputButton";

const mockListeners = new Map<string, Set<(event: any) => void>>();
const mockReact = jest.requireActual("react") as typeof React;
let mockLocale = "en";
let mockPermission = { granted: true, canAskAgain: true };
let mockRequestedPermission = { granted: true, canAskAgain: true };
let mockRecognitionAvailable = true;
let mockRecordingSupported = true;
let mockSupportedLocales = { locales: ["en-US", "el-GR"], installedLocales: ["en-US", "el-GR"] };
let mockOnDeviceRecognition = false;

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(async () => mockRequestedPermission),
    getPermissionsAsync: jest.fn(async () => mockPermission),
    isRecognitionAvailable: jest.fn(() => mockRecognitionAvailable),
    supportsRecording: jest.fn(() => mockRecordingSupported),
    supportsOnDeviceRecognition: jest.fn(() => mockOnDeviceRecognition),
    getSupportedLocales: jest.fn(async () => mockSupportedLocales),
    start: jest.fn(),
    stop: jest.fn(async () => undefined),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: (eventName: string, listener: (event: any) => void) => {
    mockReact.useEffect(() => {
      const listeners = mockListeners.get(eventName) ?? new Set();
      listeners.add(listener);
      mockListeners.set(eventName, listeners);
      return () => {
        listeners.delete(listener);
      };
    }, [eventName, listener]);
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light" },
}));

jest.mock("@/src/context/locale", () => ({
  useLocale: () => ({ locale: mockLocale }),
}));

jest.mock("@/src/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      brand: "#000000",
      error: "#ff0000",
      onBrand: "#ffffff",
      onSurface: "#000000",
      onSurfaceTertiary: "#666666",
    },
  }),
}));

type HookResult = ReturnType<typeof useVoiceToText>;
let mockHookResult: HookResult | null = null;

function VoiceHookHarness() {
  mockHookResult = useVoiceToText();
  return null;
}

type SpeechModuleMock = {
  requestPermissionsAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  isRecognitionAvailable: jest.Mock;
  supportsRecording: jest.Mock;
  supportsOnDeviceRecognition: jest.Mock;
  getSupportedLocales: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
};

const speechModule = ExpoSpeechRecognitionModule as unknown as SpeechModuleMock;

async function emit(eventName: string, event: any = {}) {
  await act(async () => {
    mockListeners.get(eventName)?.forEach((listener) => listener(event));
  });
}

async function startHook(result: { current: ReturnType<typeof useVoiceToText> }, callbacks = {}) {
  await act(async () => {
    await result.current.startListening(callbacks);
  });
  await emit("start");
  await waitFor(() => expect(result.current.isListening).toBe(true));
}

async function renderVoiceHook() {
  mockHookResult = null;
  const rendered = await render(<VoiceHookHarness />);
  if (!mockHookResult) throw new Error("Voice hook did not render");
  return {
    ...rendered,
    result: {
      get current() {
        if (!mockHookResult) throw new Error("Voice hook is unmounted");
        return mockHookResult;
      },
    },
  };
}

describe("Native voice-to-text", () => {
  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    mockLocale = "en";
    mockPermission = { granted: true, canAskAgain: true };
    mockRequestedPermission = { granted: true, canAskAgain: true };
    mockRecognitionAvailable = true;
    mockRecordingSupported = true;
    mockSupportedLocales = { locales: ["en-US", "el-GR"], installedLocales: ["en-US", "el-GR"] };
    mockOnDeviceRecognition = false;
  });

  it("requests permission and starts listening when permission is granted", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    mockRequestedPermission = { granted: true, canAskAgain: true };
    const { result } = await renderVoiceHook();

    await startHook(result);

    expect(speechModule.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(speechModule.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "en-US", interimResults: true, continuous: true }));
    expect(result.current.isListening).toBe(true);
  });

  it("reports denied permission and does not start a native session", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    mockRequestedPermission = { granted: false, canAskAgain: false };
    const { result } = await renderVoiceHook();

    await act(async () => {
      await result.current.startListening();
    });

    await waitFor(() => expect(result.current.error?.code).toBe("permission_denied"));
    expect(speechModule.start).not.toHaveBeenCalled();
  });

  it("reports unavailable recognition and leaves the native session unstarted", async () => {
    mockRecognitionAvailable = false;
    const { result } = await renderVoiceHook();

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.error?.code).toBe("service_unavailable");
    expect(speechModule.start).not.toHaveBeenCalled();
  });

  it("streams partial results and commits one final transcript", async () => {
    const partial = jest.fn();
    const final = jest.fn();
    const { result } = await renderVoiceHook();

    await act(async () => {
      await result.current.startListening({ onPartialResult: partial, onFinalResult: final });
    });
    await emit("start");
    await emit("result", { results: [{ transcript: "find apartments" }], isFinal: false });

    expect(partial).toHaveBeenCalledWith("find apartments");
    expect(final).not.toHaveBeenCalled();
    expect(result.current.transcript).toBe("find apartments");

    await emit("result", { results: [{ transcript: "find apartments" }], isFinal: true });
    await emit("result", { results: [{ transcript: "find apartments" }], isFinal: true });

    expect(final).toHaveBeenCalledTimes(1);
    expect(final).toHaveBeenCalledWith("find apartments");
  });

  it("aborts without reporting an error and ignores later native events", async () => {
    const partial = jest.fn();
    const { result } = await renderVoiceHook();

    await startHook(result, { onPartialResult: partial });
    await emit("result", { results: [{ transcript: "discard me" }], isFinal: false });

    await act(async () => result.current.abortListening());
    await emit("error", { error: "network", message: "late event" });
    await emit("result", { results: [{ transcript: "late event" }], isFinal: true });

    expect(speechModule.abort).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(partial).toHaveBeenCalledTimes(1);
    expect(result.current.transcript).toBe("");
  });

  it("stops after 3.5 seconds of silence", async () => {
    jest.useFakeTimers();
    const { result } = await renderVoiceHook();

    await startHook(result);
    await act(async () => {
      jest.advanceTimersByTime(3500);
    });

    expect(speechModule.stop).toHaveBeenCalledTimes(1);
    expect(result.current.error?.code).toBe("silence_timeout");
    jest.useRealTimers();
  });

  it("falls back to en-US when the requested locale is unsupported", async () => {
    mockLocale = "el";
    mockSupportedLocales = { locales: ["en-US"], installedLocales: ["en-US"] };
    const { result } = await renderVoiceHook();

    await startHook(result);

    expect(speechModule.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "en-US" }));
    expect(result.current.resolvedLocale).toBe("en-US");
  });

  it("disables unavailable voice buttons and isolates the active button session", async () => {
    mockRecognitionAvailable = false;
    const unavailable = await render(<VoiceInputButton testID="unavailable-voice-button" onTextAppend={jest.fn()} />);
    const unavailableButton = unavailable.getByTestId("unavailable-voice-button");
    await waitFor(() => expect(unavailableButton.props.accessibilityState.disabled).toBe(true));
    expect(unavailableButton.props.accessibilityLabel).toBe("Speech recognition is not available on this device.");
    await unavailable.unmount();

    mockRecognitionAvailable = true;
    const firstText = jest.fn();
    const secondText = jest.fn();
    const mounted = await render(
      <>
        <VoiceInputButton testID="first-voice-button" onTextAppend={firstText} />
        <VoiceInputButton testID="second-voice-button" onTextAppend={secondText} />
      </>,
    );
    const firstButton = mounted.getByTestId("first-voice-button");
    const secondButton = mounted.getByTestId("second-voice-button");

    await fireEvent.press(firstButton);
    await waitFor(() => expect(speechModule.start).toHaveBeenCalledTimes(1));
    await emit("start");
    await fireEvent.press(secondButton);
    await emit("result", { results: [{ transcript: "only first" }], isFinal: true });

    expect(speechModule.start).toHaveBeenCalledTimes(1);
    expect(firstText).toHaveBeenCalledWith("only first");
    expect(secondText).not.toHaveBeenCalled();
    await mounted.unmount();
  });
});
