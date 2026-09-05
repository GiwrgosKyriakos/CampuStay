import React from "react";

import BrokerNoteModal, { type BrokerClientItem, type BrokerListingItem } from "@/src/components/BrokerNoteModal";
import type { BrokerNote } from "@/src/api/brokerCalendar";

interface CalendarNoteModalProps {
  visible: boolean;
  isBroker: boolean;
  userId: string;
  brokerId?: string;
  date: string;
  listings?: BrokerListingItem[];
  clients?: BrokerClientItem[];
  note?: BrokerNote | null;
  initialClientId?: string;
  initialClientName?: string;
  initialDate?: string;
  onClose: () => void;
  onSaved?: (noteId: string) => void;
  onUpdated?: (noteId: string) => void;
  onDeleted?: (noteId: string) => void;
}

export default function CalendarNoteModal({ visible, isBroker, userId, brokerId, date, initialClientId, initialClientName, initialDate, listings = [], clients = [], note, onClose, onSaved, onUpdated, onDeleted }: CalendarNoteModalProps) {
  return (
    <BrokerNoteModal
      visible={visible}
      isBroker={isBroker}
      brokerId={brokerId ?? userId}
      date={date}
      listings={listings}
      clients={clients}
      note={note}
      initialClientId={initialClientId}
      initialClientName={initialClientName}
      initialDate={initialDate}
      onClose={onClose}
      onSaved={onSaved}
      onUpdated={onUpdated}
      onDeleted={onDeleted}
    />
  );
}
