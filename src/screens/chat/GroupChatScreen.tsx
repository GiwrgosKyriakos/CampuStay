import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, orderBy } from "firebase/firestore";

import { db } from "@/src/config/firebase";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing, fonts, fontSize } from "@/src/theme";
import { subscribeUserLikedApartmentIds } from "@/src/api/apartmentLikes";
import { renameRoommateGroupChat } from "@/src/api/chat";
import { sendContractChatRequest } from "@/src/api/contracts";
import type { GroupChatMetadata } from "@/src/types/chat";
import RenameGroupModal from "@/src/components/chat/RenameGroupModal";
import CommonLikedListingsModal, { type CommonLikedListing } from "@/src/components/chat/CommonLikedListingsModal";
import RoommateContractPickerModal from "@/src/components/RoommateContractPickerModal";
import SignContractModal from "@/src/components/SignContractModal";
import { t } from "@/src/locales";
import type { ContractDraftContext, ContractType, DigitalContractDocument } from "@/src/types/esignature";

type GroupMessage = { id: string; senderId: string; text: string; type?: string; contractId?: string; contractType?: ContractType; contractTitle?: string; createdAt: number };
type Apartment = CommonLikedListing & { images?: string[] };

export default function GroupChatScreen({ chatRoomId, currentUserId, metadata }: { chatRoomId: string; currentUserId: string; metadata: GroupChatMetadata }) {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [groupName, setGroupName] = useState(metadata.groupName || "Ομαδική");
  const [renameVisible, setRenameVisible] = useState(false);
  const [commonVisible, setCommonVisible] = useState(false);
  const [commonLoading, setCommonLoading] = useState(false);
  const [likedByMember, setLikedByMember] = useState<Record<string, Set<string>>>({});
  const [apartments, setApartments] = useState<Record<string, Apartment>>({});
  const [hostApartment, setHostApartment] = useState<Apartment | null>(null);
  const [agencyId, setAgencyId] = useState("independent");
  const [contractPickerVisible, setContractPickerVisible] = useState(false);
  const [contractDraft, setContractDraft] = useState<ContractDraftContext | null>(null);
  const [existingContractId, setExistingContractId] = useState<string | null>(null);
  const hasHost = Boolean(metadata.hostUserId || metadata.hostApartmentId);

  useEffect(() => {
    void getDoc(doc(db, "users", currentUserId)).then((snapshot) => {
      const data = snapshot.exists() ? snapshot.data() as { agencyId?: unknown } : {};
      setAgencyId(typeof data.agencyId === "string" && data.agencyId.trim() ? data.agencyId.trim() : "independent");
    }).catch(() => setAgencyId("independent"));
  }, [currentUserId]);

  useEffect(() => onSnapshot(query(collection(db, "chats", chatRoomId, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
    setMessages(snapshot.docs.map((message) => { const data = message.data() as { senderId?: string; text?: string; type?: string; contractId?: string; contractType?: ContractType; contractTitle?: string; createdAt?: { toMillis?: () => number } | number }; const createdAt = typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || 0; return { id: message.id, senderId: data.senderId || "", text: data.text || "", type: data.type, contractId: data.contractId, contractType: data.contractType, contractTitle: data.contractTitle, createdAt }; }));
  }), [chatRoomId]);

  useEffect(() => {
    const unsubscribers = metadata.memberIds.map((memberId) => subscribeUserLikedApartmentIds(memberId, (ids) => setLikedByMember((previous) => ({ ...previous, [memberId]: ids }))));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [metadata.memberIds]);

  useEffect(() => {
    if (!metadata.hostApartmentId) return;
    return onSnapshot(doc(db, "apartments", metadata.hostApartmentId), (snapshot) => {
      if (!snapshot.exists()) return setHostApartment(null);
      const data = snapshot.data() as { title?: string; area?: string; city?: string; rent?: number; price?: number; image?: string; imageUrl?: string; images?: string[] };
      setHostApartment({ id: snapshot.id, title: data.title || "Ακίνητο", area: data.area || "", city: data.city || "", rent: data.rent ?? data.price ?? 0, image: data.image || data.imageUrl || data.images?.[0] });
    });
  }, [metadata.hostApartmentId]);

  const commonIds = useMemo(() => {
    const sets = metadata.memberIds.map((id) => likedByMember[id]).filter(Boolean);
    if (sets.length !== metadata.memberIds.length || sets.length === 0) return [];
    return Array.from(sets[0]).filter((id) => sets.every((set) => set.has(id)));
  }, [likedByMember, metadata.memberIds]);

  useEffect(() => {
    if (!commonVisible || commonIds.length === 0) { if (!commonVisible) setApartments({}); return; }
    let active = true;
    setCommonLoading(true);
    void Promise.all(commonIds.map(async (id) => {
      const snapshot = await getDoc(doc(db, "apartments", id));
      if (!snapshot.exists()) return null;
      const data = snapshot.data() as { title?: string; area?: string; city?: string; rent?: number; price?: number; image?: string; imageUrl?: string; images?: string[] };
      return { id, title: data.title || "Ακίνητο", area: data.area || "", city: data.city || "", rent: data.rent ?? data.price ?? 0, image: data.image || data.imageUrl || data.images?.[0] };
    })).then((rows) => {
      const validRows = rows.filter((row) => row !== null);
      if (active) setApartments(Object.fromEntries(validRows.map((row) => [row.id, row as Apartment])));
    }).finally(() => {
      if (active) setCommonLoading(false);
    });
    return () => { active = false; };
  }, [commonIds, commonVisible]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    await addDoc(collection(db, "chats", chatRoomId, "messages"), { senderId: currentUserId, type: "text", text: value, createdAt: serverTimestamp(), isRead: false });
    await setDoc(doc(db, "chats", chatRoomId), { lastMessage: value, lastMessageText: value, lastMessageTimestamp: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  };
  const rename = async (name: string) => { await renameRoommateGroupChat(chatRoomId, currentUserId, name); setGroupName(name.trim()); setRenameVisible(false); };

  const startContract = (contractType: Extract<ContractType, "roommate_agreement" | "holding_deposit_viewing">) => {
    setContractPickerVisible(false);
    const participantIds = metadata.memberIds.map((id) => ({ id, role: id === metadata.hostUserId ? "owner" as const : "roommate" as const }));
    setExistingContractId(null);
    setContractDraft({
      agencyId,
      createdByUserId: currentUserId,
      contractType,
      title: t(contractType === "roommate_agreement" ? "esign.roommateAgreement" : "esign.holdingDeposit"),
      ownerId: metadata.hostUserId,
      apartmentId: metadata.hostApartmentId,
      chatRoomId,
      participantIds,
      contractPayload: contractType === "holding_deposit_viewing" ? { holdingDepositAmount: 0 } : { houseRulesConfig: {} },
    });
  };

  const handleContractCreated = (createdContract: DigitalContractDocument) => {
    void sendContractChatRequest({ chatRoomId, senderId: currentUserId, contract: createdContract }).catch(() => undefined);
  };

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><Pressable style={styles.nameButton} onPress={() => setRenameVisible(true)}><Ionicons name="people-circle-outline" size={24} color={colors.brand} /><Text style={styles.title} numberOfLines={1}>{groupName}</Text><Ionicons name="pencil-outline" size={16} color={colors.onSurfaceTertiary} /></Pressable><Pressable onPress={() => setContractPickerVisible(true)} hitSlop={8} testID="group-contract-button"><Ionicons name="document-text-outline" size={25} color={colors.brand} /></Pressable>{hasHost ? null : <Pressable onPress={() => setCommonVisible(true)} hitSlop={8} testID="group-common-likes-button"><Ionicons name="heart-circle-outline" size={26} color={colors.brand} /></Pressable>}</View>
    {hostApartment ? <Pressable style={styles.propertyBanner} onPress={() => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(hostApartment) } } as never)}><Image source={hostApartment.image ? { uri: hostApartment.image } : undefined} style={styles.propertyImage} /><View style={styles.propertyCopy}><Text style={styles.propertyTitle} numberOfLines={1}>{hostApartment.title}</Text><Text style={styles.propertyMeta}>{hostApartment.area}, {hostApartment.city} · €{hostApartment.rent}</Text><Text style={styles.propertyLink}>Προβολή Ακινήτου</Text></View><Ionicons name="chevron-forward" size={20} color={colors.brand} /></Pressable> : null}
    {messages.length === 0 ? <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View> : <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} renderItem={({ item }) => item.type === "contract_request" && item.contractId ? <Pressable style={[styles.contractMessage, item.senderId === currentUserId ? styles.mine : styles.theirs]} onPress={() => { setContractDraft(null); setExistingContractId(item.contractId ?? null); }} testID={`group-contract-message-${item.id}`}><Ionicons name="document-text-outline" size={20} color={item.senderId === currentUserId ? colors.onBrand : colors.brand} /><View style={styles.contractMessageCopy}><Text style={[styles.contractMessageTitle, { color: item.senderId === currentUserId ? colors.onBrand : colors.onSurface }]}>{item.contractTitle || item.text}</Text><Text style={[styles.contractMessageSubtitle, { color: item.senderId === currentUserId ? "rgba(255,255,255,0.78)" : colors.onSurfaceTertiary }]}>{t("esign.tapToSign")}</Text></View></Pressable> : <View style={[styles.message, item.senderId === currentUserId ? styles.mine : styles.theirs]}><Text style={item.type === "system" ? styles.system : styles.messageText}>{item.text}</Text></View>} />}
    <View style={styles.inputBar}><TextInput value={text} onChangeText={setText} style={styles.input} placeholder="Γράψε μήνυμα" placeholderTextColor={colors.onSurfaceTertiary} multiline /><Pressable style={styles.send} onPress={() => void send()}><Ionicons name="paper-plane" size={19} color={colors.onBrand} /></Pressable></View>
    <RenameGroupModal visible={renameVisible} initialName={groupName} onClose={() => setRenameVisible(false)} onSubmit={(name) => void rename(name)} />
    <CommonLikedListingsModal visible={commonVisible} loading={commonLoading} listings={commonIds.map((id) => apartments[id]).filter((listing): listing is Apartment => !!listing)} onClose={() => setCommonVisible(false)} onListingPress={(listing) => router.push({ pathname: "/apartment-detail", params: { data: JSON.stringify(listing) } } as never)} />
    <RoommateContractPickerModal visible={contractPickerVisible} onClose={() => setContractPickerVisible(false)} onSelect={startContract} />
    <SignContractModal visible={contractDraft !== null || existingContractId !== null} draft={contractDraft ?? undefined} contractId={existingContractId ?? undefined} signerId={currentUserId} onCreated={handleContractCreated} onClose={() => { setContractDraft(null); setExistingContractId(null); }} />
  </KeyboardAvoidingView>;
}

const createStyles = (colors: ReturnType<typeof useTheme>["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { minHeight: 76, paddingHorizontal: spacing.md, paddingTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  nameButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, color: colors.onSurface, fontFamily: fonts.bold, fontSize: fontSize.lg },
  propertyBanner: { margin: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  propertyImage: { width: 76, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  propertyCopy: { flex: 1, gap: 2 },
  propertyTitle: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.base },
  propertyMeta: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm },
  propertyLink: { color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.sm },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  messages: { padding: spacing.md, gap: spacing.xs },
  message: { maxWidth: "82%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brand },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary },
  messageText: { color: colors.onSurface, fontFamily: fonts.regular, fontSize: fontSize.base },
  system: { color: colors.onSurfaceTertiary, fontFamily: fonts.regular, fontSize: fontSize.sm, fontStyle: "italic" },
  contractMessage: { maxWidth: "88%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  contractMessageCopy: { flex: 1, gap: 2 },
  contractMessageTitle: { fontFamily: fonts.bold, fontSize: fontSize.sm },
  contractMessageSubtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs },
  inputBar: { padding: spacing.sm, paddingBottom: spacing.md, flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 100, minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontFamily: fonts.regular },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
});