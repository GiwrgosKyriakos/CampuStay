import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize, type ThemeColors } from "@/src/theme";

const VISION_POINTS = [
  "Η εύρεση φοιτητικής στέγης και ο κατάλληλος συγκάτοικος είναι από τις πιο σημαντικές αποφάσεις της φοιτητικής ζωής.",
  "Συχνά η διαδικασία αυτή συνοδεύεται από άγχος, αβεβαιότητα και έλλειψη διαφάνειας.",
  "Στόχος μας είναι να κάνουμε τη φοιτητική στέγαση και τη συγκατοίκηση πιο απλή, ασφαλή και άμεση, συνδέοντας φοιτητές, συγκατοίκους και ιδιοκτήτες.",
];

const FEATURES = [
  "Βρες το ιδανικό φοιτητικό σπίτι με βάση το πανεπιστήμιο, την περιοχή και το budget σου.",
  "Ανακάλυψε συμβατούς συγκατοίκους μέσω του Compatibility Quiz και των αμοιβαίων matches.",
  "Επικοινώνησε άμεσα & με ασφάλεια με ιδιοκτήτες και υποψήφιους συγκατοίκους μέσω του ενσωματωμένου chat.",
  "Αποθήκευσε αγαπημένες αγγελίες και προφίλ για να τα βρίσκεις ανά πάσα στιγμή.",
  "Εξατομίκευσε την αναζήτησή σου ώστε να βλέπεις τις επιλογές που ταιριάζουν πραγματικά στις συνήθειές σου.",
];

export default function AboutUsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          style={styles.closeButton}
          onPress={() => router.back()}
          hitSlop={8}
          testID="about-us-close-button"
        >
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>About Us</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        testID="about-us-screen"
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>CampuStay</Text>
          <Text style={styles.heroTitle}>Μια πιο απλή εμπειρία αναζήτησης στέγης.</Text>
          <Text style={styles.heroSubtitle}>
            Χτίζουμε μια πλατφόρμα που βοηθά τους φοιτητές να βρίσκουν πιο γρήγορα το σωστό μέρος για να μείνουν.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Όραμά μας</Text>
          {VISION_POINTS.map((point) => (
            <Text key={point} style={styles.paragraph}>
              • {point}
            </Text>
          ))}
          <Text style={styles.highlight}>Καλή αναζήτηση &amp; καλή διαμονή!</Text>
        </View>

        <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Σχετικά με το CampuStay</Text>
        <Text style={styles.paragraph}>
            To CampuStay είναι η εξειδικευμένη πλατφόρμα φοιτητικής στέγης και εύρεσης συγκατοίκου.
            Σχεδιάστηκε με γνώμονα τις ανάγκες των νέων φοιτητών, συνδυάζοντας την αναζήτηση διαμερισμάτων
            με έναν προηγμένο αλγόριθμο συμβατότητας συγκατοίκων.
        </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Τι μπορείς να κάνεις στο CampuStay</Text>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{feature}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surfaceSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceTertiary,
    },
    headerTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize.xl,
      color: colors.onSurface,
    },
    headerSpacer: {
      width: 40,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    heroCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: colors.isDark ? 0.24 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    kicker: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.onSurfaceTertiary,
      marginBottom: spacing.sm,
    },
    heroTitle: {
      fontFamily: fonts.displayExtra,
      fontSize: fontSize["2xl"],
      color: colors.onSurface,
      marginBottom: spacing.sm,
      lineHeight: 30,
    },
    heroSubtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
    },
    sectionCard: {
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: colors.isDark ? 0.2 : 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    sectionTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: colors.onSurface,
      marginBottom: spacing.md,
    },
    paragraph: {
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
      marginBottom: spacing.sm,
    },
    highlight: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.lg,
      lineHeight: 24,
      color: colors.brand,
      marginTop: spacing.sm,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    bulletDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.brand,
      marginTop: 8,
    },
    bulletText: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: fontSize.base,
      lineHeight: 22,
      color: colors.onSurfaceTertiary,
    },
  });
}