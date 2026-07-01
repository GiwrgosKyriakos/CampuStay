import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";

import { colors, fonts, fontSize } from "@/src/theme";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Roomie</Text>
      <ActivityIndicator color={colors.brand} size="large" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  logo: {
    fontFamily: fonts.displayExtra,
    fontSize: fontSize["4xl"],
    color: colors.onSurface,
    marginBottom: 24,
  },
  loader: {
    marginTop: 24,
  },
});
