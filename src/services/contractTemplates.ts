import type {
  ContractParticipant,
  ContractTemplateData,
  ContractType,
  DigitalContractDocument,
  SignatureSignerEvidence,
} from "@/src/types/esignature";

const VAT_RATE = 0.24;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(timestamp: number, locale: "el" | "en"): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function getContractTitle(type: ContractType, locale: "el" | "en" = "el"): string {
  const titles: Record<ContractType, { el: string; en: string }> = {
    viewing_order: { el: "Εντολή Υπόδειξης Ακινήτου", en: "Property Viewing Order" },
    property_assignment: { el: "Εντολή Ανάθεσης Ακινήτου", en: "Property Assignment Agreement" },
    roommate_agreement: { el: "Συμφωνητικό Συγκατοίκησης", en: "Roommate Living Agreement" },
    holding_deposit_viewing: { el: "Επιβεβαίωση Κράτησης & Προκαταβολής", en: "Holding Deposit & Viewing Confirmation" },
  };
  return titles[type][locale];
}

export function calculateCommissionTotals(payload: DigitalContractDocument["contractPayload"]): {
  commission: number;
  vat: number;
  totalPayable: number;
} {
  const baseValue = typeof payload.commissionAmountCalculated === "number" && Number.isFinite(payload.commissionAmountCalculated)
    ? payload.commissionAmountCalculated
    : typeof payload.monthlyRentOrPrice === "number" && typeof payload.commissionRatePercentage === "number"
      ? payload.monthlyRentOrPrice * payload.commissionRatePercentage / 100
      : 0;
  const commission = Math.max(0, baseValue);
  const vat = commission * VAT_RATE;
  return { commission, vat, totalPayable: commission + vat };
}

function renderParticipant(participant: ContractParticipant, locale: "el" | "en"): string {
  const labels = locale === "el"
    ? { afm: "ΑΦΜ", id: "ΑΔΤ / Διαβατήριο", phone: "Τηλέφωνο", email: "Email" }
    : { afm: "Tax number", id: "ID / Passport", phone: "Phone", email: "Email" };
  return `<div class="participant">
    <strong>${escapeHtml(participant.fullName)}</strong>
    <span>${escapeHtml(participant.role)}</span>
    <span>${labels.afm}: ${escapeHtml(participant.afm || "-")}</span>
    <span>${labels.id}: ${escapeHtml(participant.idCardNumber || "-")}</span>
    <span>${labels.phone}: ${escapeHtml(participant.phone || "-")}</span>
    <span>${labels.email}: ${escapeHtml(participant.email || "-")}</span>
  </div>`;
}

function renderSignatureBox(signer: SignatureSignerEvidence, locale: "el" | "en"): string {
  const signedLabel = locale === "el" ? "Υπογραφή / Ηλεκτρονικό ίχνος" : "Signature / electronic evidence";
  const signerLabel = locale === "el" ? "Συμβαλλόμενος" : "Signer";
  const signedAt = signer.signedAt > 0 ? formatDate(signer.signedAt, locale) : "-";
  return `<div class="signature-box">
    <div class="signature-label">${escapeHtml(signerLabel)}: ${escapeHtml(signer.signerName)}</div>
    ${signer.signatureBase64 ? `<img class="signature-image" src="${escapeHtml(signer.signatureBase64)}" />` : '<div class="signature-empty"></div>'}
    <div class="signature-caption">${escapeHtml(signedLabel)}</div>
    <div class="signature-meta">${escapeHtml(signedAt)} · GPS ${signer.locationCoords.latitude.toFixed(6)}, ${signer.locationCoords.longitude.toFixed(6)}</div>
  </div>`;
}

function renderContractBody(data: ContractTemplateData, locale: "el" | "en"): string {
  const { document, property, participants } = data;
  const payload = document.contractPayload;
  const totals = calculateCommissionTotals(payload);
  const labels = locale === "el"
    ? {
      parties: "Συμβαλλόμενα μέρη",
      property: "Στοιχεία ακινήτου",
      address: "Ακριβής διεύθυνση",
      price: "Τίμημα / Μίσθωμα",
      commission: "Προμήθεια",
      vat: "ΦΠΑ 24%",
      total: "Συνολικό πληρωτέο",
      terms: "Ειδικοί όροι",
      agreement: "Δήλωση συμφωνίας",
      viewingText: "Ο πελάτης δηλώνει ότι έλαβε υπόδειξη του ανωτέρω ακινήτου από το γραφείο και αναγνωρίζει τους συμφωνημένους όρους συνεργασίας.",
      assignmentText: "Ο ιδιοκτήτης αναθέτει στο γραφείο την υπόδειξη και προώθηση του ακινήτου με τους όρους που αναγράφονται στο παρόν.",
      roommateText: "Οι συγκάτοικοι συμφωνούν στους ακόλουθους κανόνες κοινής διαβίωσης και στην καλή πίστη κατά την τήρησή τους.",
      holdingText: "Τα μέρη επιβεβαιώνουν την κράτηση και την καταβολή της αναφερόμενης προκαταβολής με την επιφύλαξη των ειδικών όρων.",
    }
    : {
      parties: "Contracting parties",
      property: "Property details",
      address: "Exact address",
      price: "Price / rent",
      commission: "Commission",
      vat: "VAT 24%",
      total: "Total payable",
      terms: "Special terms",
      agreement: "Statement of agreement",
      viewingText: "The client confirms that the above property was introduced by the agency and acknowledges the agreed terms of cooperation.",
      assignmentText: "The owner assigns the agency to introduce and promote the property under the terms stated herein.",
      roommateText: "The roommates agree to the following house rules and to observe them in good faith.",
      holdingText: "The parties confirm the reservation and payment of the stated holding deposit subject to the special terms.",
    };
  const agreementText = document.contractType === "viewing_order"
    ? labels.viewingText
    : document.contractType === "property_assignment"
      ? labels.assignmentText
      : document.contractType === "roommate_agreement"
        ? labels.roommateText
        : labels.holdingText;
  const customTerms = Array.isArray(payload.customTerms) ? payload.customTerms : [];
  const houseRules = payload.houseRulesConfig && typeof payload.houseRulesConfig === "object"
    ? Object.entries(payload.houseRulesConfig).filter(([, value]) => value !== undefined && value !== null && value !== "")
    : [];

  return `<section class="section">
    <h2>${escapeHtml(labels.parties)}</h2>
    <div class="participants">${participants.map((participant) => renderParticipant(participant, locale)).join("")}</div>
  </section>
  <section class="section">
    <h2>${escapeHtml(labels.property)}</h2>
    <table><tbody>
      <tr><th>${escapeHtml("Τίτλος / Title")}</th><td>${escapeHtml(property?.title || "-")}</td></tr>
      <tr><th>${escapeHtml("Κωδικός / Code")}</th><td>${escapeHtml(property?.code || "-")}</td></tr>
      <tr><th>${escapeHtml(labels.address)}</th><td>${escapeHtml(property?.exactAddress || "-")}</td></tr>
      <tr><th>${escapeHtml(labels.price)}</th><td>${formatCurrency(property?.price ?? payload.monthlyRentOrPrice)}</td></tr>
    </tbody></table>
  </section>
  <section class="section agreement"><h2>${escapeHtml(labels.agreement)}</h2><p>${escapeHtml(agreementText)}</p></section>
  ${document.contractType === "property_assignment" ? `<section class="section"><h2>Τύπος ανάθεσης / Assignment type</h2><p>${escapeHtml(payload.assignmentMode === "exclusive" ? "Αποκλειστική / Exclusive" : "Απλή / Simple")}</p></section>` : ""}
  ${document.contractType === "property_assignment" || document.contractType === "viewing_order" ? `<section class="section"><h2>Οικονομικοί όροι / Financial terms</h2><table><tbody>
    <tr><th>${escapeHtml(labels.commission)}</th><td>${formatCurrency(totals.commission)} (${escapeHtml(payload.commissionRatePercentage ?? 0)}%)</td></tr>
    <tr><th>${escapeHtml(labels.vat)}</th><td>${formatCurrency(totals.vat)}</td></tr>
    <tr class="total-row"><th>${escapeHtml(labels.total)}</th><td>${formatCurrency(totals.totalPayable)}</td></tr>
  </tbody></table></section>` : ""}
  ${document.contractType === "holding_deposit_viewing" ? `<section class="section"><h2>Holding deposit</h2><p>${formatCurrency(payload.holdingDepositAmount)}.</p></section>` : ""}
  ${houseRules.length > 0 ? `<section class="section"><h2>House rules</h2><ul>${houseRules.map(([key, value]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`).join("")}</ul></section>` : ""}
  ${customTerms.length > 0 ? `<section class="section"><h2>${escapeHtml(labels.terms)}</h2><ul>${customTerms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ul></section>` : ""}`;
}

export function buildContractHtml(data: ContractTemplateData): string {
  const locale = data.locale ?? "el";
  const title = data.document.title || getContractTitle(data.document.contractType, locale);
  const agency = data.agency;
  const signatureBoxes = data.document.signers.map((signer) => renderSignatureBox(signer, locale)).join("");
  const auditLabel = locale === "el" ? "eIDAS Audit Trail" : "eIDAS Audit Trail";
  const createdLabel = locale === "el" ? "Δημιουργήθηκε" : "Created";

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 18mm 16mm 20mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #17252b; background: #fff; font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.55; }
      .page { border: 1.5px solid #17252b; padding: 18px 20px 22px; min-height: 250mm; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 2px solid #e07a2f; padding-bottom: 14px; }
      .agency { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .logo { width: 64px; height: 48px; object-fit: contain; }
      .agency-name { font-size: 17px; font-weight: 700; }
      .agency-meta { color: #52636a; font-size: 10px; }
      .document-meta { text-align: right; font-size: 10px; color: #52636a; }
      h1 { margin: 22px 0 6px; font-size: 23px; line-height: 1.15; letter-spacing: 0; }
      h2 { margin: 0 0 8px; color: #07404c; font-size: 14px; border-bottom: 1px solid #d7e0e2; padding-bottom: 4px; }
      .section { margin-top: 18px; page-break-inside: avoid; }
      .participants { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .participant { border: 1px solid #c7d1d4; padding: 9px; display: grid; gap: 2px; }
      .participant strong { font-size: 13px; }
      .participant span { color: #52636a; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #c7d1d4; padding: 7px 8px; text-align: left; vertical-align: top; }
      th { width: 34%; background: #f1f5f5; font-weight: 700; }
      .total-row th, .total-row td { background: #fff1e7; font-weight: 700; }
      .agreement { border-left: 3px solid #e07a2f; padding: 10px 12px; background: #fffaf6; }
      .agreement p { margin: 0; }
      ul { margin: 6px 0 0 18px; padding: 0; }
      .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 22px; page-break-inside: avoid; }
      .signature-box { border: 1px solid #9aaeb3; min-height: 112px; padding: 8px; }
      .signature-label { font-weight: 700; font-size: 10px; }
      .signature-image { display: block; max-width: 100%; height: 58px; object-fit: contain; margin: 5px auto 1px; }
      .signature-empty { height: 64px; border-bottom: 1px dashed #75898e; margin-bottom: 2px; }
      .signature-caption, .signature-meta { font-size: 8px; color: #52636a; }
      .audit { margin-top: 20px; padding-top: 9px; border-top: 1px solid #9aaeb3; color: #52636a; font-size: 8px; page-break-inside: avoid; }
      .audit strong { color: #07404c; }
    </style></head><body><main class="page">
      <header class="header"><div class="agency">${agency.logoUrl ? `<img class="logo" src="${escapeHtml(agency.logoUrl)}" />` : ""}<div><div class="agency-name">${escapeHtml(agency.name)}</div><div class="agency-meta">${escapeHtml([agency.address, agency.phone, agency.email, agency.taxNumber ? `ΑΦΜ ${agency.taxNumber}` : ""].filter(Boolean).join(" · "))}</div></div></div><div class="document-meta">ID: ${escapeHtml(data.document.id)}<br />${escapeHtml(createdLabel)}: ${escapeHtml(formatDate(data.document.createdAt, locale))}</div></header>
      <h1>${escapeHtml(title)}</h1>
      ${renderContractBody(data, locale)}
      <section class="signatures"><h2 style="grid-column: 1 / -1">Υπογραφές / Signatures</h2>${signatureBoxes}</section>
      <footer class="audit"><strong>${escapeHtml(auditLabel)}</strong><br />${escapeHtml("Το παρόν αντίγραφο περιλαμβάνει τα στοιχεία ταυτοποίησης, τον χρόνο, τη θέση GPS και το ηλεκτρονικό ίχνος της υπογραφής κάθε συμβαλλομένου. Η ακεραιότητα του αρχείου αποτυπώνεται με SHA-256 κατά την οριστικοποίηση.")}</footer>
    </main></body></html>`;
}