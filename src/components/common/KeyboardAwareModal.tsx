import React from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardAwareModalProps = React.ComponentProps<typeof Modal>;

export default function KeyboardAwareModal({ children, ...modalProps }: KeyboardAwareModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal {...modalProps}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
