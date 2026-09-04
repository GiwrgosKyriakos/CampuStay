import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

export type ChecklistCategory = "engineering" | "legal" | "tax" | "closing";
export type ChecklistRole = "client" | "owner" | "broker" | "secretariat";
export type ChecklistStatus = "pending" | "uploaded" | "verified" | "rejected";

export interface DealChecklistItem extends DocumentData {
  id: string;
  category: ChecklistCategory;
  title: string;
  description?: string;
  requiredForStage: 90 | 100;
  assignedToRole: ChecklistRole;
  status: ChecklistStatus;
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

export async function seedDealChecklist(dealId: string): Promise<void> {
  const batch = db.batch();
  DEFAULT_DEAL_CHECKLIST.forEach((item) => {
    batch.set(db.doc(`deals/${dealId}/checklist/${item.id}`), item, { merge: true });
  });
  await batch.commit();
}

export async function getChecklistItems(dealId: string): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snapshot = await db.collection(`deals/${dealId}/checklist`).get();
  return snapshot.docs;
}

export async function assertChecklistVerified(dealId: string, targetStage: number): Promise<void> {
  const items = await getChecklistItems(dealId);
  const requiredItems = items.filter((item) => Number(item.data().requiredForStage) <= targetStage);
  if (targetStage === 90 && requiredItems.some((item) => item.data().status !== "verified")) {
    throw new Error("Cannot advance to Stage 90%: Missing verified technical or legal documents.");
  }
  if (targetStage === 100 && (items.length === 0 || items.some((item) => item.data().status !== "verified"))) {
    throw new Error("Cannot advance to Stage 100%: All checklist documents must be verified.");
  }
}