export type ChatMessageType =
  | "text"
  | "visit_request"
  | "visit_confirmed"
  | "visit_rescheduled"
  | "visit_cancelled"
  | "filter_share"
  | "assignment_request"
  | "contract_request"
  | "shared_roommate_profile"
  | "system";

export interface GroupChatMetadata {
  isGroup: true;
  groupName: string;
  hostUserId?: string;
  hostApartmentId?: string;
  memberIds: string[];
  createdBy: string;
}

export interface Conversation {
  id: string;
  type: "direct" | "roommate_group";
  participants: string[];
  groupMetadata?: GroupChatMetadata;
  lastMessageText: string;
  lastMessageTimestamp: number;
  unreadCounts: Record<string, number>;
}

export interface SharedProfileMessageMetadata {
  sharedUserId: string;
  sharedUserData: {
    fullName: string;
    avatarUrl?: string;
    photos?: string[];
    age?: number;
    budget?: number;
    gender?: string;
    university?: string;
    program?: string;
    compatibilityScore?: number;
    occupation?: string;
    compatibilityQuizAnswers?: Record<string, any>;
    lifestyleBadges?: string[];
    bio?: string;
    hardCriteria?: Record<string, any>;
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  type: ChatMessageType;
  text?: string;
  metadata?: {
    appointmentId?: string;
    apartmentId?: string;
    apartmentTitle?: string;
    apartmentAddress?: string;
    appointmentDate?: string;
    filterPayload?: Record<string, any>;
    sharedProfile?: SharedProfileMessageMetadata;
    contractId?: string;
    contractType?: string;
    contractTitle?: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed";
  };
  createdAt: number;
}

export interface ConversationInboxSummary {
  id: string;
  lastMessageText: string;
  lastMessageType: ChatMessageType;
  lastMessageTimestamp: number;
  unreadCount: number;
  activePinnedAppointment?: {
    appointmentId: string;
    messageId: string;
    date: string;
    apartmentTitle: string;
    apartmentAddress: string;
  };
}