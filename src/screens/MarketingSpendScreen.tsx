import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import MarketingSpendEntry from "@/src/components/MarketingSpendEntry";
import { useAuth } from "@/src/context/auth";
import { useTheme } from "@/src/context/ThemeContext";
import { fonts, fontSize, spacing } from "@/src/theme";

export default function MarketingSpendScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const allowed = !!auth.agencyId && ["ceo", "secretary", "secretariat"].includes(auth.agencyRole ?? "");
  if (!allowed) return <View style={styles.center}><Ionicons name="lock-closed-outline" size={34} color={colors.onSurfaceTertiary} /><Text style={styles.muted}>Η οθόνη είναι διαθέσιμη μόνο στη Γραμματεία και τον CEO.</Text></View>;
  const agencyId = auth.agencyId ?? "";
  return <View style={styles.container} testID="marketing-spend-screen"><View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><View><Text style={styles.title}>Marketing spend</Text><Text style={styles.subtitle}>Μηνιαία παρακολούθηση επενδύσεων ανά κανάλι</Text></View></View><MarketingSpendEntry agencyId={agencyId} recordedBy={auth.userId ?? ""} /></View>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize.xl, color: colors.onSurface },
  subtitle: { marginTop: spacing.xs, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  muted: { textAlign: "center", fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
});