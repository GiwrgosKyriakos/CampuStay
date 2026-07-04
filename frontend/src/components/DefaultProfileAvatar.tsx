import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/src/theme";

type Props = {
  size?: number;
  iconSize?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function DefaultProfileAvatar({
  size = 60,
  iconSize = 28,
  testID,
  style,
}: Props) {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <Ionicons name="person" size={iconSize} color={colors.onSurfaceTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
