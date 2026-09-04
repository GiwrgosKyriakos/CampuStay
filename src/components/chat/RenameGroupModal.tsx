import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import KeyboardAwareModal from "@/src/components/common/KeyboardAwareModal";

export default function RenameGroupModal({ visible, initialName, onClose, onSubmit }: { visible: boolean; initialName: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  React.useEffect(() => { if (visible) setName(initialName); }, [initialName, visible]);
  return <KeyboardAwareModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Όνομα ομαδικής</Text><Pressable onPress={onClose}><Ionicons name="close-outline" size={22} color={colors.onSurface} /></Pressable></View>
      <TextInput value={name} onChangeText={setName} autoFocus style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} placeholder="Ομαδική" placeholderTextColor={colors.onSurfaceTertiary} />
      <Pressable style={[styles.button, { backgroundColor: colors.brand }]} disabled={!name.trim()} onPress={() => onSubmit(name)}><Text style={[styles.buttonText, { color: colors.onBrand }]}>Αποθήκευση</Text></Pressable>
    </View></View>
  </KeyboardAwareModal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  card: { width: "88%", borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.bold, fontSize: fontSize.lg },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: fontSize.base },
  button: { minHeight: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: fontSize.base },
});