import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, radius, spacing } from "@/src/theme";

export interface AgencyItem {
  id: string;
  name: string;
  logo?: string;
  city?: string;
  activeListingsCount?: number;
  activeBrokerIds?: string[];
}

interface AgencyPickerModalProps {
  visible: boolean;
  selectedAgencyId: string | null;
  onSelectAgency: (agency: AgencyItem | null) => void;
}

export default function AgencyPickerModal({ visible, selectedAgencyId, onSelectAgency }: AgencyPickerModalProps) {
  const { colors } = useTheme();
  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const snapshot = await getDocs(collection(db, "agencies"));
        const list = snapshot.docs.map((agencyDoc) => {
          const data = agencyDoc.data() as Record<string, unknown>;
          return {
            id: agencyDoc.id,
            name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Μεσιτικό Γραφείο",
            logo: typeof data.logo === "string" ? data.logo : typeof data.photoUrl === "string" ? data.photoUrl : "",
            city: typeof data.city === "string" ? data.city : "",
            activeListingsCount: typeof data.activeListingsCount === "number" ? data.activeListingsCount : 0,
            activeBrokerIds: Array.isArray(data.activeBrokerIds) ? data.activeBrokerIds.filter((id): id is string => typeof id === "string") : [],
          } satisfies AgencyItem;
        });
        if (active) setAgencies(list);
      } catch (error) {
        console.warn("[AgencyPicker] Error fetching agencies:", error);
        if (active) setAgencies([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.content}>
      {selectedAgencyId ? (
        <Pressable style={[styles.clearBtn, { borderColor: colors.border }]} onPress={() => onSelectAgency(null)}>
          <Ionicons color={colors.error} name="trash-outline" size={16} />
          <Text style={[styles.clearBtnText, { color: colors.error }]}>Καθαρισμός φίλτρου γραφείου</Text>
        </Pressable>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.brand} style={styles.loading} />
      ) : (
        <FlatList
            data={agencies}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.onSurfaceTertiary }]}>Δεν βρέθηκαν μεσιτικά γραφεία.</Text>}
            renderItem={({ item }) => {
              const isSelected = selectedAgencyId === item.id;
              return (
                <Pressable
                  style={[styles.agencyRow, { borderColor: isSelected ? colors.brand : colors.border, backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => onSelectAgency(isSelected ? null : item)}
                  testID={`apartments-select-agency-${item.id}`}
                >
                  <View style={[styles.logoWrap, { backgroundColor: colors.surfaceTertiary }]}>
                    {item.logo ? <Image source={{ uri: item.logo }} style={styles.logo} contentFit="cover" /> : <Ionicons color={colors.brand} name="business" size={22} />}
                  </View>
                  <View style={styles.agencyInfo}>
                    <Text style={[styles.agencyName, { color: colors.onSurface }]} numberOfLines={1}>{item.name}</Text>
                    {item.city ? <Text style={[styles.agencyCity, { color: colors.onSurfaceTertiary }]}>{item.city}</Text> : null}
                    {typeof item.activeListingsCount === "number" ? <Text style={[styles.agencyCity, { color: colors.brand }]}>{`${item.activeListingsCount} ενεργές αγγελίες`}</Text> : null}
                  </View>
                  {isSelected ? <Ionicons color={colors.brand} name="checkmark-circle" size={20} /> : null}
                </Pressable>
              );
            }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { minHeight: 160, maxHeight: 420 },
  clearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  clearBtnText: { fontFamily: fonts.bold, fontSize: fontSize.xs },
  loading: { marginVertical: spacing.xl },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  agencyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  logoWrap: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 44, height: 44, borderRadius: radius.sm },
  agencyInfo: { flex: 1, gap: 2 },
  agencyName: { fontFamily: fonts.bold, fontSize: fontSize.base },
  agencyCity: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  emptyText: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.sm, paddingVertical: spacing.xl },
});
