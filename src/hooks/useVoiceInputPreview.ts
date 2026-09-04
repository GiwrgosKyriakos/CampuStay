import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

function appendText(current: string, spokenText: string) {
  const normalized = spokenText.trim();
  if (!normalized) return current;
  if (!current) return normalized;
  return /\s$/.test(current) ? `${current}${normalized}` : `${current} ${normalized}`;
}

export function useVoiceInputPreview(value: string, setValue: Dispatch<SetStateAction<string>>) {
  const [partialText, setPartialText] = useState("");
  const baselineRef = useRef<string | null>(null);

  const onPartialResult = useCallback((spokenText: string) => {
    if (baselineRef.current === null) baselineRef.current = value;
    setPartialText(spokenText.trim());
  }, [value]);

  const onFinalResult = useCallback((spokenText: string) => {
    setValue((current) => appendText(current, spokenText));
    baselineRef.current = null;
    setPartialText("");
  }, [setValue]);

  const onAbort = useCallback(() => {
    if (baselineRef.current !== null) setValue(baselineRef.current);
    baselineRef.current = null;
    setPartialText("");
  }, [setValue]);

  const onChangeText = useCallback((nextValue: string) => {
    const baseline = baselineRef.current;
    if (baseline !== null && partialText) {
      const previewSuffix = appendText(baseline, partialText).slice(baseline.length);
      const suffixIndex = previewSuffix ? nextValue.lastIndexOf(previewSuffix) : -1;
      const committedValue = suffixIndex >= 0
        ? `${nextValue.slice(0, suffixIndex)}${nextValue.slice(suffixIndex + previewSuffix.length)}`
        : nextValue;
      setValue(committedValue);
      baselineRef.current = null;
      setPartialText("");
      return;
    }
    setValue(nextValue);
  }, [partialText, setValue]);

  const displayValue = partialText && baselineRef.current !== null
    ? appendText(baselineRef.current, partialText)
    : value;

  return {
    value: displayValue,
    isPreviewing: partialText.length > 0,
    onChangeText,
    onPartialResult,
    onFinalResult,
    onAbort,
  };
}
