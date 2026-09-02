import AsyncStorage from "@react-native-async-storage/async-storage";

export const PENDING_CALL_INTERACTION_KEY = "@pending_call_interaction";
export const PENDING_CALL_MAX_AGE_MS = 30 * 60 * 1000;

export interface PendingCallInteraction {
  apartmentId: string;
  apartmentTitle: string;
  brokerId: string;
  brokerName: string;
  timestamp: number;
}

export async function persistPendingCallInteraction(interaction: PendingCallInteraction): Promise<void> {
  await AsyncStorage.setItem(PENDING_CALL_INTERACTION_KEY, JSON.stringify(interaction));
}

export async function getPendingCallInteraction(): Promise<PendingCallInteraction | null> {
  const raw = await AsyncStorage.getItem(PENDING_CALL_INTERACTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingCallInteraction>;
    if (typeof parsed.apartmentId !== "string" || typeof parsed.brokerId !== "string" || typeof parsed.timestamp !== "number") return null;
    return {
      apartmentId: parsed.apartmentId,
      apartmentTitle: typeof parsed.apartmentTitle === "string" ? parsed.apartmentTitle : "Διαμέρισμα",
      brokerId: parsed.brokerId,
      brokerName: typeof parsed.brokerName === "string" ? parsed.brokerName : "Μεσίτης",
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export async function clearPendingCallInteraction(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_CALL_INTERACTION_KEY);
}
