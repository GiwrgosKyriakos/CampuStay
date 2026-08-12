import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, fontSize, radius, spacing, type ThemeColors } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

type AddressSuggestion = {
  address: string;
  latitude: number;
  longitude: number;
};

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  residential?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  value: string;
  city?: string | null;
  area?: string;
  placeholder?: string;
  testID?: string;
  disabled?: boolean;
  onChangeAddressText: (text: string) => void;
  onAddressSelect: (selection: AddressSuggestion & { hasExactLocation: true }) => void;
};

function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
}

function formatAddressLabel(result: NominatimResult): string {
  const address = result.address ?? {};
  const street = [address.road ?? address.pedestrian ?? address.footway ?? address.residential, address.house_number]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(" ");

  if (street.trim().length > 0) {
    return street.trim();
  }

  const fallback = result.display_name.split(",").map((part) => part.trim()).filter(Boolean);
  return fallback[0] ?? result.display_name;
}

function formatContextLabel(result: NominatimResult): string {
  const address = result.address ?? {};
  const parts = [address.suburb, address.neighbourhood, address.city ?? address.town ?? address.village, address.state]
    .filter((part): part is string => !!part && part.trim().length > 0);

  return parts.slice(0, 3).join(" · ");
}

async function geocodeAddress(queryText: string, signal: AbortSignal): Promise<Coordinates | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", queryText);
  url.searchParams.set("countrycodes", "gr");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "el,en");

  const response = await fetch(url.toString(), {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "CampuStayApp/1.0 (contact@campustay.com)",
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as NominatimResult[];
  const firstResult = Array.isArray(payload) ? payload[0] : null;
  if (!firstResult) return null;

  const latitude = Number(firstResult.lat);
  const longitude = Number(firstResult.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

export default function AddressAutocompleteInput({
  value,
  city,
  area,
  placeholder = "Γράψε διεύθυνση (προαιρετικό)",
  testID,
  disabled,
  onChangeAddressText,
  onAddressSelect,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [results, setResults] = useState<NominatimResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [isResolvingManual, setIsResolvingManual] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualResolveControllerRef = useRef<AbortController | null>(null);

  const trimmedQuery = value.trim();
  const normalizedQuery = useMemo(() => normalizeSearchText(trimmedQuery), [trimmedQuery]);

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) return [];

    return results.filter((result) => {
      const addressLabel = formatAddressLabel(result);
      const contextLabel = formatContextLabel(result);
      const haystack = normalizeSearchText([addressLabel, contextLabel, result.display_name].join(" "));
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, results]);

  const visibleResults = useMemo(() => filteredResults.slice(0, visibleCount), [filteredResults, visibleCount]);

  useEffect(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (!focused || normalizedQuery.length < 2 || disabled) {
      setResults([]);
      setLoading(false);
      setShowDropdown(false);
      setVisibleCount(5);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const searchParts = [value.trim(), area?.trim(), city?.trim(), "Ελλάδα"].filter((part): part is string => !!part && part.length > 0);
      const queryText = searchParts.join(" ");
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", queryText);
      url.searchParams.set("countrycodes", "gr");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "20");
      url.searchParams.set("accept-language", "el,en");

      void fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "CampuStayApp/1.0 (contact@campustay.com)",
        },
      })
        .then(async (response) => {
          if (!response.ok) return [] as NominatimResult[];
          return (await response.json()) as NominatimResult[];
        })
        .then((payload) => {
          if (controller.signal.aborted) return;
          setResults(Array.isArray(payload) ? payload : []);
          setVisibleCount(5);
          setShowDropdown(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
            setShowDropdown(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [area, city, disabled, focused, normalizedQuery, value]);

  const hasMore = visibleCount < filteredResults.length;

  useEffect(() => {
    return () => {
      if (manualResolveControllerRef.current) {
        manualResolveControllerRef.current.abort();
        manualResolveControllerRef.current = null;
      }
    };
  }, []);

  const handleFocus = () => {
    if (disabled) return;
    setFocused(true);
    setShowDropdown(normalizedQuery.length >= 2);
  };

  const handleBlur = () => {
    const trimmedValue = value.trim();

    if (!disabled && trimmedValue.length >= 2) {
      if (manualResolveControllerRef.current) {
        manualResolveControllerRef.current.abort();
      }

      const controller = new AbortController();
      manualResolveControllerRef.current = controller;
      setIsResolvingManual(true);

      const queryText = [trimmedValue, area?.trim(), city?.trim(), "Ελλάδα"]
        .filter((part): part is string => !!part && part.length > 0)
        .join(", ");

      void geocodeAddress(queryText, controller.signal)
        .then((coordinates) => {
          if (!coordinates || controller.signal.aborted) return;

          onAddressSelect({
            address: trimmedValue,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            hasExactLocation: true,
          });
        })
        .catch(() => {
          // Keep existing manual text without crashing if geocoding fails.
        })
        .finally(() => {
          if (manualResolveControllerRef.current === controller) {
            manualResolveControllerRef.current = null;
          }
          if (!controller.signal.aborted) {
            setIsResolvingManual(false);
          }
        });
    }

    blurTimeoutRef.current = setTimeout(() => {
      setFocused(false);
      setShowDropdown(false);
    }, 120);
  };

  const handleSelect = (result: NominatimResult) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    const address = formatAddressLabel(result);

    onAddressSelect({ address, latitude, longitude, hasExactLocation: true });
    setShowDropdown(false);
    setFocused(false);
    setVisibleCount(5);
  };

  const handleShowMore = () => {
    setVisibleCount((current) => current + 5);
  };

  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={(text) => {
          onChangeAddressText(text);
          setShowDropdown(text.trim().length >= 2 && focused);
          setVisibleCount(5);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceTertiary}
        style={styles.input}
        editable={!disabled}
        testID={testID}
      />

      {showDropdown ? (
        <View style={styles.dropdownCard}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>Αναζήτηση διεύθυνσης</Text>
            {loading || isResolvingManual ? <ActivityIndicator size="small" color={colors.brandSecondary} /> : null}
          </View>

          <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent} keyboardShouldPersistTaps="handled">
            {visibleResults.length ? (
              visibleResults.map((result, index) => {
                const primary = formatAddressLabel(result);
                const secondary = formatContextLabel(result) || result.display_name;

                return (
                  <Pressable key={`${result.lat}-${result.lon}-${index}`} style={styles.resultRow} onPress={() => handleSelect(result)}>
                    <View style={styles.resultIcon}>
                      <Ionicons name="location-outline" size={16} color={colors.onBrandTertiary} />
                    </View>
                    <View style={styles.resultTextWrap}>
                      <Text style={styles.resultPrimary} numberOfLines={1}>
                        {primary}
                      </Text>
                      <Text style={styles.resultSecondary} numberOfLines={2}>
                        {secondary}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Δεν βρέθηκαν αποτελέσματα</Text>
                <Text style={styles.emptyStateText}>Δοκίμασε διαφορετική οδό, περιοχή ή πόλη.</Text>
              </View>
            )}

            {hasMore ? (
              <Pressable style={styles.showMoreButton} onPress={handleShowMore}>
                <Text style={styles.showMoreText}>Περισσότερα</Text>
                <Ionicons name="chevron-down" size={16} color={colors.brandSecondary} />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      position: "relative",
      zIndex: 20,
      overflow: "visible",
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      color: colors.onSurface,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
    },
    dropdownCard: {
      position: "absolute",
      top: 56,
      left: 0,
      right: 0,
      maxHeight: 220,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
      overflow: "hidden",
    },
    dropdownHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    dropdownTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.onSurface,
    },
    resultsScroll: {
      maxHeight: 220,
    },
    resultsContent: {
      paddingBottom: spacing.xs,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    resultIcon: {
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brandTertiary,
    },
    resultTextWrap: {
      flex: 1,
      gap: 2,
    },
    resultPrimary: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    resultSecondary: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    emptyState: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.xs,
    },
    emptyStateTitle: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: colors.onSurface,
    },
    emptyStateText: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: colors.onSurfaceTertiary,
    },
    showMoreButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    showMoreText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: colors.brandSecondary,
    },
  });
}