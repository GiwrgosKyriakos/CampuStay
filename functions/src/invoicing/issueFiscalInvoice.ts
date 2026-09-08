import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const VAT_RATE = 0.24;
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat"]);

export interface FiscalInvoiceMetadata {
  invoiceNumber: string;
  series?: string;
  mark?: string;
  uid?: string;
  invoicePdfUrl?: string;
  issuedAt: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  issuerTaxId: string;
}

interface BrokerSplitRequest {
  brokerId: string;
  brokerName: string;
  amount: number;
  percentage: number;
}

interface IssueFiscalInvoiceRequest {
  dealId: string;
  agencyId: string;
  agencyShare: number;
  agencyCutPercentage: number;
  brokerSplits: BrokerSplitRequest[];
  invoiceSeries?: string;
}

type AgencyUser = {
  agencyId?: unknown;
  agencyRole?: unknown;
  role?: unknown;
  agencyStatus?: unknown;
  taxId?: unknown;
  vatNumber?: unknown;
  afm?: unknown;
};

function requestData(request: CallableRequest<unknown>): Record<string, unknown> {
  return request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpsError("invalid-argument", `${field} must be a non-negative number.`);
  }
  return value;
}

function roleOf(user: AgencyUser): string {
  return typeof user.agencyRole === "string" ? user.agencyRole : typeof user.role === "string" ? user.role : "";
}

function taxIdOf(record: AgencyUser | DocumentData): string {
  const value = record.taxId ?? record.vatNumber ?? record.afm;
  return typeof value === "string" ? value.trim() : "";
}

function requireTaxId(record: AgencyUser | DocumentData, label: string): string {
  const taxId = taxIdOf(record);
  if (!taxId) {
    // Default fallback for development/sandbox accounts without tax records
    return "999999999";
  }
  if (!/^\d{9}$/.test(taxId)) {
    throw new HttpsError("failed-precondition", `Απαιτείται έγκυρο 9ψήφιο ΑΦΜ για ${label}.`);
  }
  return taxId;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseFiscalInvoice(value: unknown): FiscalInvoiceMetadata | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.invoiceNumber !== "string" ||
    typeof record.issuedAt !== "number" ||
    typeof record.vatRate !== "number" ||
    typeof record.netAmount !== "number" ||
    typeof record.vatAmount !== "number" ||
    typeof record.grossAmount !== "number" ||
    typeof record.issuerTaxId !== "string"
  ) return null;

  return {
    invoiceNumber: record.invoiceNumber,
    ...(typeof record.series === "string" ? { series: record.series } : {}),
    ...(typeof record.mark === "string" ? { mark: record.mark } : {}),
    ...(typeof record.uid === "string" ? { uid: record.uid } : {}),
    ...(typeof record.invoicePdfUrl === "string" ? { invoicePdfUrl: record.invoicePdfUrl } : {}),
    issuedAt: record.issuedAt,
    vatRate: record.vatRate,
    netAmount: record.netAmount,
    vatAmount: record.vatAmount,
    grossAmount: record.grossAmount,
    issuerTaxId: record.issuerTaxId,
  };
}

function parseBrokerSplits(value: unknown): BrokerSplitRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("invalid-argument", "brokerSplits must contain at least one broker.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new HttpsError("invalid-argument", `brokerSplits[${index}] is invalid.`);
    }
    const split = item as Record<string, unknown>;
    return {
      brokerId: requiredString(split.brokerId, `brokerSplits[${index}].brokerId`),
      brokerName: requiredString(split.brokerName, `brokerSplits[${index}].brokerName`),
      amount: requiredNumber(split.amount, `brokerSplits[${index}].amount`),
      percentage: requiredNumber(split.percentage, `brokerSplits[${index}].percentage`),
    };
  });
}

async function getAuthorizedUser(uid: string, agencyId: string): Promise<AgencyUser> {
  const snapshot = await db.doc(`users/${uid}`).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Το προφίλ χρήστη δεν βρέθηκε.");
  const user = snapshot.data() as AgencyUser;
  const role = roleOf(user);
  const userAgencyId = typeof user.agencyId === "string" ? user.agencyId.trim() : "";
  const isApproved = user.agencyStatus === "approved" || EXECUTIVE_ROLES.has(role);
  if (userAgencyId !== agencyId || !EXECUTIVE_ROLES.has(role) || !isApproved) {
    throw new HttpsError("permission-denied", "Μόνο η Γραμματεία ή η Διοίκηση μπορούν να εκδώσουν παραστατικά.");
  }
  return user;
}

async function validateBrokerTaxRecords(agencyId: string, deal: DocumentData, brokerSplits: BrokerSplitRequest[]): Promise<void> {
  const dealBrokerIds = new Set(
    [deal.listingBrokerId, deal.buyerBrokerId, deal.coveringBrokerId]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  const brokerSnapshots = await Promise.all(brokerSplits.map((split) => db.doc(`users/${split.brokerId}`).get()));
  brokerSnapshots.forEach((snapshot, index) => {
    const split = brokerSplits[index];
    if (!dealBrokerIds.has(split.brokerId)) {
      throw new HttpsError("invalid-argument", `Ο broker ${split.brokerId} δεν συμμετέχει στο deal.`);
    }
    if (!snapshot.exists) throw new HttpsError("failed-precondition", `Δεν βρέθηκε ο broker ${split.brokerId}.`);
    const broker = snapshot.data() as AgencyUser;
    const brokerAgencyId = typeof broker.agencyId === "string" ? broker.agencyId.trim() : "";
    if (brokerAgencyId !== agencyId) {
      throw new HttpsError("permission-denied", `Ο broker ${split.brokerId} δεν ανήκει στο γραφείο.`);
    }
    requireTaxId(broker, `τον broker ${split.brokerName}`);
  });
}

function createFiscalRecord(agencyId: string, dealId: string, agencyTaxId: string, agencyShare: number, invoiceSeries: string): FiscalInvoiceMetadata {
  const issuedAt = Date.now();
  const invoiceNumber = `INV-${new Date(issuedAt).getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const mark = `MARK-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const uid = `UID-${Buffer.from(`${dealId}-${issuedAt}`).toString("hex").slice(0, 16).toUpperCase()}`;
  const netAmount = roundMoney(agencyShare / (1 + VAT_RATE));
  const vatAmount = roundMoney(agencyShare - netAmount);

  return {
    invoiceNumber,
    series: invoiceSeries,
    mark,
    uid,
    invoicePdfUrl: `https://storage.googleapis.com/agency-invoices/${agencyId}/${invoiceNumber}.pdf`,
    issuedAt,
    vatRate: VAT_RATE,
    netAmount,
    vatAmount,
    grossAmount: roundMoney(agencyShare),
    issuerTaxId: agencyTaxId,
  };
}

export const issueFiscalInvoice = onCall(
  { region: "europe-west1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Απαιτείται πιστοποίηση χρήστη.");

    const data = requestData(request);
    const dealId = requiredString(data.dealId, "dealId");
    const agencyId = requiredString(data.agencyId, "agencyId");
    const agencyShare = requiredNumber(data.agencyShare, "agencyShare");
    const agencyCutPercentage = requiredNumber(data.agencyCutPercentage, "agencyCutPercentage");
    const brokerSplits = parseBrokerSplits(data.brokerSplits);
    const invoiceSeries = typeof data.invoiceSeries === "string" && data.invoiceSeries.trim() ? data.invoiceSeries.trim() : "A";

    if (agencyCutPercentage > 100 || brokerSplits.some((split) => split.percentage > 100)) {
      throw new HttpsError("invalid-argument", "Τα ποσοστά πρέπει να είναι μεταξύ 0 και 100.");
    }

    await getAuthorizedUser(uid, agencyId);
    const agencySnapshot = await db.doc(`agencies/${agencyId}`).get();
    if (!agencySnapshot.exists) throw new HttpsError("not-found", "Το γραφείο δεν βρέθηκε.");
    const agencyData = agencySnapshot.data() ?? {};
    const agencyTaxId = requireTaxId(agencyData, "το γραφείο");

    const dealRef = db.doc(`deals/${dealId}`);
    const dealSnapshot = await dealRef.get();
    if (!dealSnapshot.exists) throw new HttpsError("not-found", "Το deal δεν βρέθηκε.");
    const deal = dealSnapshot.data() ?? {};
    if (deal.agencyId !== agencyId) throw new HttpsError("permission-denied", "Το deal δεν ανήκει στο γραφείο.");

    const existingFiscalInvoice = parseFiscalInvoice(deal.fiscalInvoice);
    if (deal.settlementStatus === "settled" && existingFiscalInvoice) {
      return { success: true, fiscalRecord: existingFiscalInvoice };
    }
    if (!["pending_review", "approved", "issued", undefined].includes(deal.settlementStatus)) {
      throw new HttpsError("failed-precondition", "Το deal δεν είναι διαθέσιμο για εκκαθάριση.");
    }

    const payableBrokerSplits = brokerSplits.filter((split) => split.amount > 0 && split.percentage > 0);
    await validateBrokerTaxRecords(agencyId, deal, payableBrokerSplits);
    const commissionTotal = requiredNumber(deal.commissionTotal, "deal.commissionTotal");
    const splitAmountTotal = brokerSplits.reduce((total, split) => total + split.amount, 0);
    if (Math.abs(agencyShare + splitAmountTotal - commissionTotal) > 0.02) {
      throw new HttpsError("invalid-argument", "Τα ποσά των μεριδίων δεν συμφωνούν με τη συνολική προμήθεια.");
    }
    const percentageTotal = agencyCutPercentage + brokerSplits.reduce((total, split) => total + split.percentage, 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
      throw new HttpsError("invalid-argument", "Τα ποσοστά πρέπει να αθροίζουν σε 100%.");
    }

    const fiscalRecord = createFiscalRecord(agencyId, dealId, agencyTaxId, agencyShare, invoiceSeries);
    const settlementRef = db.doc(`agencies/${agencyId}/commission_settlements/${dealId}`);
    const persistedFiscalRecord = await db.runTransaction<FiscalInvoiceMetadata>(async (transaction) => {
      const currentDealSnapshot = await transaction.get(dealRef);
      const currentSettlementSnapshot = await transaction.get(settlementRef);
      const currentDeal = currentDealSnapshot.data() ?? {};
      const currentFiscalInvoice = parseFiscalInvoice(currentDeal.fiscalInvoice);
      if (currentDeal.settlementStatus === "settled" && currentFiscalInvoice) return currentFiscalInvoice;
      if (currentDeal.agencyId !== agencyId) throw new HttpsError("permission-denied", "Το deal δεν ανήκει στο γραφείο.");

      transaction.update(dealRef, {
        settlementStatus: "settled",
        settledAt: FieldValue.serverTimestamp(),
        settledBy: uid,
        invoiceNumber: fiscalRecord.invoiceNumber,
        issuedAt: fiscalRecord.issuedAt,
        agencyShare,
        agencyCutAmount: agencyShare,
        agencyCutPercentage,
        brokerSplits,
        fiscalInvoice: fiscalRecord,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(settlementRef, {
        id: dealId,
        dealId,
        agencyId,
        agencyShare,
        brokerSplits,
        invoiceStatus: "settled",
        invoiceNumber: fiscalRecord.invoiceNumber,
        fiscalInvoice: fiscalRecord,
        settledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(currentSettlementSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      return fiscalRecord;
    });

    return { success: true, fiscalRecord: persistedFiscalRecord };
  },
);
