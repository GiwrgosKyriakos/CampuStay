import { t } from "@/src/locales";

export interface ChatPreviewMessage {
  text?: string;
  type?: string;
  apartmentIds?: readonly string[];
  apartmentCount?: number;
}

const PROPERTY_LIST_MESSAGE_TYPES = new Set([
  "property_list",
  "property_list_share",
  "property_cards",
  "recommendation_list",
]);

export function isPropertyListMessageType(type: string | undefined): boolean {
  return typeof type === "string" && PROPERTY_LIST_MESSAGE_TYPES.has(type.trim().toLowerCase());
}

function isLegacyPropertyListText(text: string): boolean {
  return /^\[(?:Κοινοποίηση Λίστας Ακινήτων|Property list)/i.test(text.trim());
}

function getPropertyCount(message: ChatPreviewMessage): number | null {
  if (typeof message.apartmentCount === "number" && Number.isInteger(message.apartmentCount) && message.apartmentCount > 0) {
    return message.apartmentCount;
  }
  if (Array.isArray(message.apartmentIds) && message.apartmentIds.length > 0) {
    return message.apartmentIds.length;
  }
  return null;
}

export function formatChatPreviewMessage(message: ChatPreviewMessage): string {
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const isPropertyList = isPropertyListMessageType(message.type) || (!message.type && isLegacyPropertyListText(text));
  if (!isPropertyList) return text;

  const count = getPropertyCount(message);
  return count === null
    ? t("chat.lastMessage.propertyList")
    : t("chat.lastMessage.propertyListWithCount", { count });
}
