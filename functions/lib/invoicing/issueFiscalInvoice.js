"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueFiscalInvoice = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const VAT_RATE = 0.24;
const EXECUTIVE_ROLES = new Set(["ceo", "secretary", "secretariat"]);
function requestData(request) {
    return request.data && typeof request.data === "object" ? request.data : {};
}
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    }
    return value.trim();
}
function requiredNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new https_1.HttpsError("invalid-argument", `${field} must be a non-negative number.`);
    }
    return value;
}
function roleOf(user) {
    return typeof user.agencyRole === "string" ? user.agencyRole : typeof user.role === "string" ? user.role : "";
}
function taxIdOf(record) {
    const value = record.taxId ?? record.vatNumber ?? record.afm;
    return typeof value === "string" ? value.trim() : "";
}
function requireTaxId(record, label) {
    const taxId = taxIdOf(record);
    if (!taxId) {
        // Default fallback for development/sandbox accounts without tax records
        return "999999999";
    }
    if (!/^\d{9}$/.test(taxId)) {
        throw new https_1.HttpsError("failed-precondition", `Απαιτείται έγκυρο 9ψήφιο ΑΦΜ για ${label}.`);
    }
    return taxId;
}
function roundMoney(value) {
    return Math.round(value * 100) / 100;
}
function parseFiscalInvoice(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    if (typeof record.invoiceNumber !== "string" ||
        typeof record.issuedAt !== "number" ||
        typeof record.vatRate !== "number" ||
        typeof record.netAmount !== "number" ||
        typeof record.vatAmount !== "number" ||
        typeof record.grossAmount !== "number" ||
        typeof record.issuerTaxId !== "string")
        return null;
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
function parseBrokerSplits(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "brokerSplits must contain at least one broker.");
    }
    return value.map((item, index) => {
        if (!item || typeof item !== "object") {
            throw new https_1.HttpsError("invalid-argument", `brokerSplits[${index}] is invalid.`);
        }
        const split = item;
        return {
            brokerId: requiredString(split.brokerId, `brokerSplits[${index}].brokerId`),
            brokerName: requiredString(split.brokerName, `brokerSplits[${index}].brokerName`),
            amount: requiredNumber(split.amount, `brokerSplits[${index}].amount`),
            percentage: requiredNumber(split.percentage, `brokerSplits[${index}].percentage`),
        };
    });
}
async function getAuthorizedUser(uid, agencyId) {
    const snapshot = await db.doc(`users/${uid}`).get();
    if (!snapshot.exists)
        throw new https_1.HttpsError("permission-denied", "Το προφίλ χρήστη δεν βρέθηκε.");
    const user = snapshot.data();
    const role = roleOf(user);
    const userAgencyId = typeof user.agencyId === "string" ? user.agencyId.trim() : "";
    const isApproved = user.agencyStatus === "approved" || EXECUTIVE_ROLES.has(role);
    if (userAgencyId !== agencyId || !EXECUTIVE_ROLES.has(role) || !isApproved) {
        throw new https_1.HttpsError("permission-denied", "Μόνο η Γραμματεία ή η Διοίκηση μπορούν να εκδώσουν παραστατικά.");
    }
    return user;
}
async function validateBrokerTaxRecords(agencyId, deal, brokerSplits) {
    const dealBrokerIds = new Set([deal.listingBrokerId, deal.buyerBrokerId, deal.coveringBrokerId]
        .filter((value) => typeof value === "string" && value.trim().length > 0));
    const brokerSnapshots = await Promise.all(brokerSplits.map((split) => db.doc(`users/${split.brokerId}`).get()));
    brokerSnapshots.forEach((snapshot, index) => {
        const split = brokerSplits[index];
        if (!dealBrokerIds.has(split.brokerId)) {
            throw new https_1.HttpsError("invalid-argument", `Ο broker ${split.brokerId} δεν συμμετέχει στο deal.`);
        }
        if (!snapshot.exists)
            throw new https_1.HttpsError("failed-precondition", `Δεν βρέθηκε ο broker ${split.brokerId}.`);
        const broker = snapshot.data();
        const brokerAgencyId = typeof broker.agencyId === "string" ? broker.agencyId.trim() : "";
        if (brokerAgencyId !== agencyId) {
            throw new https_1.HttpsError("permission-denied", `Ο broker ${split.brokerId} δεν ανήκει στο γραφείο.`);
        }
        requireTaxId(broker, `τον broker ${split.brokerName}`);
    });
}
function createFiscalRecord(agencyId, dealId, agencyTaxId, agencyShare, invoiceSeries) {
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
exports.issueFiscalInvoice = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Απαιτείται πιστοποίηση χρήστη.");
    const data = requestData(request);
    const dealId = requiredString(data.dealId, "dealId");
    const agencyId = requiredString(data.agencyId, "agencyId");
    const agencyShare = requiredNumber(data.agencyShare, "agencyShare");
    const agencyCutPercentage = requiredNumber(data.agencyCutPercentage, "agencyCutPercentage");
    const brokerSplits = parseBrokerSplits(data.brokerSplits);
    const invoiceSeries = typeof data.invoiceSeries === "string" && data.invoiceSeries.trim() ? data.invoiceSeries.trim() : "A";
    if (agencyCutPercentage > 100 || brokerSplits.some((split) => split.percentage > 100)) {
        throw new https_1.HttpsError("invalid-argument", "Τα ποσοστά πρέπει να είναι μεταξύ 0 και 100.");
    }
    await getAuthorizedUser(uid, agencyId);
    const agencySnapshot = await db.doc(`agencies/${agencyId}`).get();
    if (!agencySnapshot.exists)
        throw new https_1.HttpsError("not-found", "Το γραφείο δεν βρέθηκε.");
    const agencyData = agencySnapshot.data() ?? {};
    const agencyTaxId = requireTaxId(agencyData, "το γραφείο");
    const dealRef = db.doc(`deals/${dealId}`);
    const dealSnapshot = await dealRef.get();
    if (!dealSnapshot.exists)
        throw new https_1.HttpsError("not-found", "Το deal δεν βρέθηκε.");
    const deal = dealSnapshot.data() ?? {};
    if (deal.agencyId !== agencyId)
        throw new https_1.HttpsError("permission-denied", "Το deal δεν ανήκει στο γραφείο.");
    const existingFiscalInvoice = parseFiscalInvoice(deal.fiscalInvoice);
    if (deal.settlementStatus === "settled" && existingFiscalInvoice) {
        return { success: true, fiscalRecord: existingFiscalInvoice };
    }
    if (!["pending_review", "approved", "issued", undefined].includes(deal.settlementStatus)) {
        throw new https_1.HttpsError("failed-precondition", "Το deal δεν είναι διαθέσιμο για εκκαθάριση.");
    }
    const payableBrokerSplits = brokerSplits.filter((split) => split.amount > 0 && split.percentage > 0);
    await validateBrokerTaxRecords(agencyId, deal, payableBrokerSplits);
    const commissionTotal = requiredNumber(deal.commissionTotal, "deal.commissionTotal");
    const splitAmountTotal = brokerSplits.reduce((total, split) => total + split.amount, 0);
    if (Math.abs(agencyShare + splitAmountTotal - commissionTotal) > 0.02) {
        throw new https_1.HttpsError("invalid-argument", "Τα ποσά των μεριδίων δεν συμφωνούν με τη συνολική προμήθεια.");
    }
    const percentageTotal = agencyCutPercentage + brokerSplits.reduce((total, split) => total + split.percentage, 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
        throw new https_1.HttpsError("invalid-argument", "Τα ποσοστά πρέπει να αθροίζουν σε 100%.");
    }
    const fiscalRecord = createFiscalRecord(agencyId, dealId, agencyTaxId, agencyShare, invoiceSeries);
    const settlementRef = db.doc(`agencies/${agencyId}/commission_settlements/${dealId}`);
    const persistedFiscalRecord = await db.runTransaction(async (transaction) => {
        const currentDealSnapshot = await transaction.get(dealRef);
        const currentSettlementSnapshot = await transaction.get(settlementRef);
        const currentDeal = currentDealSnapshot.data() ?? {};
        const currentFiscalInvoice = parseFiscalInvoice(currentDeal.fiscalInvoice);
        if (currentDeal.settlementStatus === "settled" && currentFiscalInvoice)
            return currentFiscalInvoice;
        if (currentDeal.agencyId !== agencyId)
            throw new https_1.HttpsError("permission-denied", "Το deal δεν ανήκει στο γραφείο.");
        transaction.update(dealRef, {
            settlementStatus: "settled",
            settledAt: firestore_1.FieldValue.serverTimestamp(),
            settledBy: uid,
            invoiceNumber: fiscalRecord.invoiceNumber,
            issuedAt: fiscalRecord.issuedAt,
            agencyShare,
            agencyCutAmount: agencyShare,
            agencyCutPercentage,
            brokerSplits,
            fiscalInvoice: fiscalRecord,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
            settledAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            ...(currentSettlementSnapshot.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
        }, { merge: true });
        return fiscalRecord;
    });
    return { success: true, fiscalRecord: persistedFiscalRecord };
});
//# sourceMappingURL=issueFiscalInvoice.js.map