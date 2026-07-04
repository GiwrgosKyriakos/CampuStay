import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";

import { colors, radius, spacing, fonts, fontSize } from "@/src/theme";
import type { RoommateProfile } from "@/src/data/profiles";
import { getUserId } from "@/src/utils/userId";
import { getMyMatches, acceptChatRequest } from "@/src/api/discover";
import { useAuth } from "@/src/context/auth";

const TAB_BAR_SPACE = 100;

function isDeletedCounterpart(profile: RoommateProfile): boolean {
  return !!profile.deleted || !profile.name?.trim();
}

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [matches, setMatches] = useState<RoommateProfile[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  React.useEffect(() => {
    if (auth.isGuest) setMatches([]);
  }, [auth.isGuest]);

  useFocusEffect(
    useCallback(() => {
      if (auth.isGuest) {
        setMatches([]);
        return;
      }
      (async () => {
        try {
          const uid = await getUserId();
          setCurrentUserId(uid);
          setMatches(await getMyMatches(uid));
        } catch {
          setMatches([]);
        }
      })();
    }, [auth.isGuest]),
  );

  const handleAcceptChat = async (profile: RoommateProfile) => {
    if (!currentUserId || !profile.id) return;
    setAcceptingId(profile.id);
    try {
      const chatRoomId = [currentUserId, profile.id].sort().join("_");
      const success = await acceptChatRequest(chatRoomId, currentUserId);
      if (success) {
        // Update the local state to reflect the accepted status
        setMatches((prev) =>
          prev.map((p) =>
            p.id === profile.id ? { ...p, chat_status: "active" } : p,
          ),
        );
      }
    } catch (err) {
      console.error("Accept chat failed:", err);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleNavigateToChat = (profile: RoommateProfile) => {
    // Only allow navigation if chat is active or if there's no status (fallback to active)
    const chatStatus = profile.chat_status ?? "active";
    if (chatStatus === "active") {
      router.push({ pathname: "/chat/[id]", params: { id: profile.id } });
    }
  };

  return (
    <View style={styles.container} testID="matches-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.subtitle}>
          {auth.isGuest
            ? "Sign in to see your matches"
            : matches.length > 0
            ? `${matches.length} roommate${matches.length > 1 ? "s" : ""} you liked`
            : "People you like will show up here"}
        </Text>
      </View>

      {auth.isGuest ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Sign in to see your matches</Text>
          <Text style={styles.emptySub}>Your likes, matches, and chats appear here after you log in.</Text>
          <Pressable style={styles.ctaBtn} onPress={() => router.push("/auth-landing")} testID="matches-signin-button">
            <Text style={styles.ctaText}>Sign Up / Log In</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.empty} testID="matches-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={42} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptySub}>Start swiping to find your future flatmate!</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {matches.map((p) => {
            const isDeleted = isDeletedCounterpart(p);
            const displayName = isDeleted ? "Deleted Account" : p.name;
            const hasAvatar = !isDeleted && !!p.photo?.trim();
            const chatStatus = p.chat_status ?? "active";
            const isPending = chatStatus === "pending";
            const isInitiator = isPending && p.chat_initiated_by === currentUserId;
            const isReceiver = isPending && p.chat_initiated_by !== currentUserId;

            return (
              <Pressable
                key={p.id}
                style={styles.row}
                testID={`chat-row-${p.id}`}
                onPress={() => handleNavigateToChat(p)}
                disabled={isPending && isInitiator}
              >
                {hasAvatar ? (
                  <Image source={{ uri: p.photo }} style={styles.avatar} contentFit="cover" transition={150} />
                ) : (
                  <View style={styles.avatarFallback} testID={`chat-row-avatar-fallback-${p.id}`}>
                    <Ionicons name="person" size={28} color={colors.onSurfaceTertiary} />
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {isInitiator ? (
                    <Text style={styles.rowMsg} numberOfLines={1}>
                      Pending approval
                    </Text>
                  ) : (
                    <Text style={styles.rowMsg} numberOfLines={1}>
                      Hey there! 👋
                    </Text>
                  )}
                </View>
                {isReceiver && acceptingId !== p.id ? (
                  <Pressable
                    style={styles.acceptBtn}
                    onPress={() => handleAcceptChat(p)}
                    testID={`accept-btn-${p.id}`}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </Pressable>
                ) : isReceiver && acceptingId === p.id ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="paper-plane-outline" size={22} color={colors.onSurfaceTertiary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  title: { fontFamily: fonts.displayExtra, fontSize: fontSize["3xl"], color: colors.onSurface },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: { width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: { flex: 1, gap: 3 },
  rowName: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onSurface },
  rowMsg: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  acceptBtn: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  acceptBtnText: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontFamily: fonts.displayExtra, fontSize: fontSize["2xl"], color: colors.onSurface },
  emptySub: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.onSurfaceTertiary, textAlign: "center" },
  ctaBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: fontSize.lg, color: colors.onBrand },
});
