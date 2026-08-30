import React from "react";
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import ApartmentCardSkeleton from "@/src/components/skeletons/ApartmentCardSkeleton";
import { spacing } from "@/src/theme";

type Props = {
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ApartmentsFeedSkeleton({ testID, style }: Props) {
  return (
    <ScrollView
      style={style}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      {[0, 1, 2, 3].map((index) => (
        <ApartmentCardSkeleton key={index} testID={`${testID ?? "apartments-feed-skeleton"}-card-${index}`} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
});
