export type ChecklistCategory = "engineering" | "legal" | "tax" | "closing";
export type ChecklistRole = "client" | "owner" | "broker" | "secretariat";
export type ChecklistStatus = "pending" | "uploaded" | "verified" | "rejected";

export interface DealChecklistItem {
  id: string;
  category: ChecklistCategory;
  title: string;
  description?: string;
  requiredForStage: 90 | 100;
  assignedToRole: ChecklistRole;
  status: ChecklistStatus;
  fileUrl?: string;
  fileName?: string;
  storagePath?: string;
  uploadedAt?: number;
  uploadedBy?: string;
  verifiedBy?: string;
  verifiedAt?: number;
  rejectionReason?: string;
}

export const DEFAULT_DEAL_CHECKLIST: readonly DealChecklistItem[] = [
  { id: "engineering_identity_and_engineer_certificate", category: "engineering", title: "Ηλεκτρονική Ταυτότητα Κτιρίου (ΗΤΚ) & Βεβαίωση Μηχανικού", requiredForStage: 90, assignedToRole: "owner", status: "pending" },
  { id: "engineering_energy_performance_certificate", category: "engineering", title: "Πιστοποιητικό Ενεργειακής Απόδοσης (ΠΕΑ)", requiredForStage: 90, assignedToRole: "owner", status: "pending" },
  { id: "engineering_approved_floor_plans", category: "engineering", title: "Επικυρωμένα Σχέδια / Κατόψεις Πολεοδομίας", requiredForStage: 90, assignedToRole: "owner", status: "pending" },
  { id: "legal_title_and_registration_certificate", category: "legal", title: "Τίτλοι Κτήσης & Πιστοποιητικό Μεταγραφής", requiredForStage: 90, assignedToRole: "owner", status: "pending" },
  { id: "legal_land_registry_search", category: "legal", title: "Νομικός Έλεγχος Υποθηκοφυλακείου / Κτηματολογίου", requiredForStage: 90, assignedToRole: "broker", status: "pending" },
  { id: "legal_preliminary_notarial_agreement", category: "legal", title: "Συμβολαιογραφικό Προσύμφωνο (αν απαιτείται)", requiredForStage: 90, assignedToRole: "secretariat", status: "pending" },
  { id: "tax_five_year_enfia_certificate", category: "tax", title: "Πιστοποιητικό ΕΝΦΙΑ 5ετίας", requiredForStage: 100, assignedToRole: "owner", status: "pending" },
  { id: "tax_municipal_tap_clearance", category: "tax", title: "Βεβαίωση μη οφειλής ΤΑΠ Δήμου", requiredForStage: 100, assignedToRole: "owner", status: "pending" },
  { id: "tax_myproperty_transfer_tax_declaration", category: "tax", title: "Δήλωση Φόρου Μεταβίβασης (myPROPERTY / ΦΜΑ)", requiredForStage: 100, assignedToRole: "secretariat", status: "pending" },
  { id: "tax_taxisnet_lease", category: "tax", title: "Ηλεκτρονικό Μισθωτήριο Taxisnet (αν πρόκειται για ενοικίαση)", requiredForStage: 100, assignedToRole: "owner", status: "pending" },
  { id: "closing_final_contract_draft", category: "closing", title: "Σχέδιο Οριστικού Συμβολαίου", requiredForStage: 100, assignedToRole: "secretariat", status: "pending" },
  { id: "closing_payment_evidence", category: "closing", title: "Αποδεικτικό Εξόφλησης Τιμήματος & Τραπεζικών Επιταγών", requiredForStage: 100, assignedToRole: "client", status: "pending" },
  { id: "closing_signed_contract_and_registration", category: "closing", title: "Υπογεγραμμένο Συμβόλαιο & Πιστοποιητικό Καταχώρισης Κτηματολογίου", requiredForStage: 100, assignedToRole: "secretariat", status: "pending" },
];