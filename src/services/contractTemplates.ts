import type {
  ContractParticipant,
  ContractTemplateData,
  ContractType,
  DigitalContractDocument,
  SignatureSignerEvidence,
} from "@/src/types/esignature";

export const CONTRACT_TEMPLATE_VERSION = "v1.0-el" as const;

export interface ContractAuditVariables {
  signingDateTime: string;
  signingGpsCoordinates: string;
  otpVerificationId: string;
  signerIp: string;
  documentHash: string;
}

export interface AgencyLegalVariables {
  agencyName: string;
  agencyLegalForm: string;
  agencyAddress: string;
  agencyAfm: string;
  agencyDoy: string;
  agencyGemi: string;
  agencyBrokerRegNo: string;
  agencyPhone: string;
  agencyEmail: string;
}

export interface ShowingMandateVariables extends ContractAuditVariables, AgencyLegalVariables {
  documentId: string;
  signingDateTime: string;
  propertyCity: string;
  brokerName: string;
  clientName: string;
  clientFatherName: string;
  clientAdt: string;
  clientAfm: string;
  clientDoy: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  transactionType: string;
  propertyCode: string;
  propertyAddress: string;
  propertyArea: string;
  propertyFloor: string;
  propertyType: string;
  propertySqm: string;
  propertyPrice: string;
  commissionRate: string;
  commissionAmount: string;
  vatRate: string;
  totalCommissionWithVat: string;
  brokerSignatureImage: string;
  clientSignatureImage: string;
}

export interface AssignmentMandateVariables extends ContractAuditVariables, AgencyLegalVariables {
  documentId: string;
  signingDateTime: string;
  propertyCity: string;
  assignmentType: string;
  brokerName: string;
  ownerName: string;
  ownerFatherName: string;
  ownerAdt: string;
  ownerAfm: string;
  ownerDoy: string;
  ownerAddress: string;
  ownerPhone: string;
  ownerEmail: string;
  ownershipPercentage: string;
  transactionType: string;
  propertyCode: string;
  propertyAddress: string;
  propertyArea: string;
  propertyFloor: string;
  propertyType: string;
  propertySqm: string;
  propertyKaek: string;
  askingPrice: string;
  minAcceptablePrice: string;
  storageSqm: string;
  parkingSlot: string;
  assignmentDurationMonths: string;
  expirationDate: string;
  commissionRate: string;
  commissionAmount: string;
  vatRate: string;
  totalCommissionWithVat: string;
  brokerSignatureImage: string;
  ownerSignatureImage: string;
}

export interface RoommateAgreementVariables extends ContractAuditVariables {
  documentId: string;
  signingDateTime: string;
  propertyCity: string;
  roommate1Name: string;
  roommate1FatherName: string;
  roommate1Adt: string;
  roommate1Afm: string;
  roommate1Doy: string;
  roommate1Phone: string;
  roommate1Email: string;
  roommate2Name: string;
  roommate2FatherName: string;
  roommate2Adt: string;
  roommate2Afm: string;
  roommate2Doy: string;
  roommate2Phone: string;
  roommate2Email: string;
  roommateExtraParties: string;
  propertyAddress: string;
  propertyArea: string;
  propertyFloor: string;
  propertySqm: string;
  propertyCode: string;
  roommate1RoomDesc: string;
  roommate2RoomDesc: string;
  totalMonthlyRent: string;
  roommate1RentShare: string;
  roommate2RentShare: string;
  rentPaymentDayOfMonth: string;
  totalSecurityDeposit: string;
  roommate1DepositShare: string;
  roommate2DepositShare: string;
  utilitiesSplitMode: string;
  billsPaymentDeadlineDays: string;
  quietHoursStart: string;
  cleaningSchedule: string;
  maxGuestOvernightDays: string;
  smokingPolicy: string;
  petPolicy: string;
  petPolicyTerms: string;
  departureNoticeDays: string;
  roommate1Gps: string;
  roommate2Gps: string;
  roommate1OtpId: string;
  roommate2OtpId: string;
  roommate1Ip: string;
  roommate2Ip: string;
  roommate1SignatureImage: string;
  roommate2SignatureImage: string;
}

export interface HoldingDepositVariables extends ContractAuditVariables {
  documentId: string;
  signingDateTime: string;
  propertyCity: string;
  reservationObjectType: string;
  receiverName: string;
  receiverCapacity: string;
  receiverAfm: string;
  receiverDoy: string;
  receiverIdOrGemi: string;
  receiverAddress: string;
  receiverPhone: string;
  receiverEmail: string;
  receiverIban: string;
  receiverBankName: string;
  clientName: string;
  clientFatherName: string;
  clientAdt: string;
  clientAfm: string;
  clientDoy: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  transactionType: string;
  propertyCode: string;
  propertyAddress: string;
  propertyArea: string;
  propertyFloor: string;
  roomOrUnitIdentifier: string;
  propertySqm: string;
  agreedRentalOrSalePrice: string;
  leaseDurationMonths: string;
  leaseStartDate: string;
  leaseEndDate: string;
  agreedSecurityDepositAmount: string;
  depositMonthsCount: string;
  holdingDepositAmount: string;
  holdingDepositWords: string;
  paymentMethod: string;
  paymentTransactionRef: string;
  depositAllocationTarget: string;
  finalContractDeadlineDate: string;
  finalContractDeadlineTime: string;
  receiverSignatureImage: string;
  clientSignatureImage: string;
}

export type ContractTemplateVariables = ShowingMandateVariables | AssignmentMandateVariables | RoommateAgreementVariables | HoldingDepositVariables;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function text(value: unknown, fallback = "Δεν έχει συμπληρωθεί"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function amount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return text(value);
}

function field(payload: DigitalContractDocument["contractPayload"], key: string, fallback?: string): string {
  return text(payload[key], fallback);
}

function imageSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("data:image/") ? trimmed : `data:image/png;base64,${trimmed}`;
}

function signatureImage(value: string): string {
  const source = imageSource(value);
  return source
    ? `<img class="signature-image" alt="Ψηφιακή υπογραφή" src="${escapeHtml(source)}" />`
    : `<div class="signature-empty">Χώρος ψηφιακής υπογραφής</div>`;
}

function table(rows: Array<[string, string]>, className = ""): string {
  return `<table class="${escapeHtml(className)}"><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`;
}

function propertyTable(headers: string[], values: string[]): string {
  return `<table class="property-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody><tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr></tbody></table>`;
}

function section(title: string, content: string): string {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function numbered(items: string[]): string {
  return `<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`;
}

function partiesTable(leftTitle: string, left: Array<[string, string]>, rightTitle: string, right: Array<[string, string]>): string {
  const render = (title: string, rows: Array<[string, string]>) => `<div class="party"><h3>${escapeHtml(title)}</h3>${table(rows)}</div>`;
  return `<div class="party-grid">${render(leftTitle, left)}${render(rightTitle, right)}</div>`;
}

function auditFooter(audit: ContractAuditVariables, extraRows: Array<[string, string]> = []): string {
  return `<footer class="audit"><h2>Τεχνικά στοιχεία ψηφιακής υπογραφής &amp; eIDAS compliance</h2><p>Το έγγραφο καταρτίστηκε και υπεγράφη ηλεκτρονικά. Τα παρακάτω στοιχεία αποτελούν το audit trail της διαδικασίας και αποτυπώνουν την ακεραιότητα και την ιχνηλασιμότητα του εγγράφου.</p>${table([
    ["Χρονοσήμανση συστήματος (Server Timestamp)", audit.signingDateTime],
    ["Συντεταγμένες Γεωεντοπισμού (GPS)", audit.signingGpsCoordinates],
    ["Αναγνωριστικό επαλήθευσης SMS OTP", audit.otpVerificationId],
    ["Διεύθυνση IP τερματικού", audit.signerIp],
    ["Μοναδικό ψηφιακό αποτύπωμα εγγράφου (SHA-256 Hash)", audit.documentHash],
    ...extraRows,
  ])}</footer>`;
}

function signatureGrid(columns: Array<{ title: string; image: string; name: string; afm?: string }>): string {
  return `<section class="signatures"><h2>Οι συμβαλλόμενοι</h2><div class="signature-grid">${columns.map((column) => `<div class="signature-box"><strong>${escapeHtml(column.title)}</strong>${signatureImage(column.image)}<span class="signature-caption">Ψηφιακή υπογραφή επί οθόνης</span><b>${escapeHtml(column.name)}</b>${column.afm ? `<span>Α.Φ.Μ.: ${escapeHtml(column.afm)}</span>` : ""}</div>`).join("")}</div></section>`;
}

function documentHtml(title: string, documentId: string, signingDateTime: string, city: string, body: string): string {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>
    @page { size: A4; margin: 14mm 13mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1b2930; background: #fff; font-family: Georgia, "Times New Roman", serif; font-size: 11px; line-height: 1.48; }
    .page { border: 1px solid #20343b; padding: 17px 19px 21px; }
    .masthead { border-bottom: 3px solid #d96c35; padding-bottom: 11px; margin-bottom: 16px; }
    .eyebrow { color: #d96c35; font: 700 9px Arial, sans-serif; letter-spacing: 1px; text-transform: uppercase; }
    h1 { margin: 5px 0 7px; color: #123e49; font-size: 21px; line-height: 1.15; }
    .meta { color: #596b71; font: 10px Arial, sans-serif; }
    .section { margin-top: 16px; page-break-inside: avoid; }
    h2 { margin: 0 0 7px; padding-bottom: 4px; border-bottom: 1px solid #cad5d8; color: #123e49; font-size: 13px; }
    h3 { margin: 0 0 6px; color: #123e49; font-size: 11px; }
    p { margin: 5px 0; }
    ol { margin: 5px 0 0 18px; padding: 0; }
    li { margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #c7d2d5; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { width: 35%; background: #f0f4f4; font-weight: 700; }
    .property-table { table-layout: fixed; font-size: 9px; }
    .property-table th { width: auto; text-align: center; }
    .property-table td { word-break: break-word; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .party { border: 1px solid #c7d2d5; padding: 7px; }
    .party table { font-size: 9px; }
    .party th { width: 39%; }
    .callout { border-left: 3px solid #d96c35; padding: 7px 10px; background: #fff7f1; }
    .signatures { margin-top: 19px; page-break-inside: avoid; }
    .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .signature-box { min-height: 126px; border: 1px solid #9aadb2; padding: 7px; display: flex; flex-direction: column; gap: 3px; }
    .signature-image { display: block; width: 100%; height: 61px; object-fit: contain; margin: 3px auto; }
    .signature-empty { height: 61px; border-bottom: 1px dashed #71868c; color: #71868c; font: 9px Arial, sans-serif; display: flex; align-items: end; justify-content: center; padding-bottom: 3px; }
    .signature-caption, .signature-box span { color: #596b71; font: 8px Arial, sans-serif; }
    .audit { margin-top: 18px; padding-top: 8px; border-top: 1px solid #9aadb2; color: #596b71; font: 8px Arial, sans-serif; page-break-inside: avoid; }
    .audit h2 { font-size: 11px; }
    .audit table { font-size: 8px; }
    .audit th { width: 38%; }
    .audit p { margin: 4px 0; }
  </style></head><body><main class="page"><header class="masthead"><div class="eyebrow">CampusStay · Νομικό έγγραφο</div><h1>${escapeHtml(title)}</h1><div class="meta">Αριθμός εγγράφου: ${escapeHtml(documentId)} · Ημερομηνία &amp; ώρα: ${escapeHtml(signingDateTime)} · Τόπος: ${escapeHtml(city)}</div></header>${body}</main></body></html>`;
}

function agencyRows(variables: AgencyLegalVariables): Array<[string, string]> {
  return [
    ["Επωνυμία / Διακριτικός τίτλος", `${variables.agencyName} (${variables.agencyLegalForm})`],
    ["Έδρα", variables.agencyAddress],
    ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.agencyAfm} · ${variables.agencyDoy}`],
    ["Αρ. Γ.Ε.ΜΗ. / Μητρώο μεσιτών", `${variables.agencyGemi} · ${variables.agencyBrokerRegNo}`],
    ["Τηλέφωνο / Email", `${variables.agencyPhone} · ${variables.agencyEmail}`],
  ];
}

export function generateShowingMandateHtml(variables: ShowingMandateVariables): string {
  const body = `${section("1. Συμβαλλόμενα μέρη", partiesTable(
    "Α. Η μεσιτική επιχείρηση («Ο Μεσίτης»)", agencyRows(variables),
    "Β. Ο εντολέας / υποψήφιος αγοραστής ή μισθωτής («Ο Εντολέας»)", [
      ["Ονοματεπώνυμο", variables.clientName], ["Όνομα πατρός", variables.clientFatherName], ["Α.Δ.Τ. / Διαβατήριο", variables.clientAdt], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.clientAfm} · ${variables.clientDoy}`], ["Διεύθυνση κατοικίας", variables.clientAddress], ["Τηλέφωνο / Email", `${variables.clientPhone} · ${variables.clientEmail}`],
    ],
  ))}
  ${section("2. Αντικείμενο εντολής & στοιχεία υποδειχθέντος ακινήτου", `<p>Ο Εντολέας αναθέτει στον Μεσίτη τη διαμεσολάβηση για την <b>${escapeHtml(variables.transactionType)}</b> και βεβαιώνει ότι ο Μεσίτης του υπέδειξε και επισκέφθηκαν από κοινού το παρακάτω ακίνητο.</p>${propertyTable(["Κωδικός", "Διεύθυνση / Περιοχή", "Όροφος & Τύπος", "Επιφάνεια", "Ζητούμενο τίμημα / μίσθωμα"], [variables.propertyCode, `${variables.propertyAddress}, ${variables.propertyArea}`, `${variables.propertyFloor} · ${variables.propertyType}`, `${variables.propertySqm} τ.μ.`, `${variables.propertyPrice} €`])}`)}
  ${section("3. Μεσιτική αμοιβή", numbered([
    `<b>Ποσοστό / ποσό:</b> ${escapeHtml(variables.commissionRate)}% επί του πραγματικού τιμήματος ή ${escapeHtml(variables.commissionAmount)} € για μίσθωση.`,
    `<b>Φ.Π.Α.:</b> πλέον του νόμιμου Φ.Π.Α. ${escapeHtml(variables.vatRate)}%, συνολικό ποσό ${escapeHtml(variables.totalCommissionWithVat)} €.`,
    "Η αμοιβή καθίσταται άμεσα απαιτητή κατά την υπογραφή του οριστικού συμβολαίου, προσυμφώνου ή ιδιωτικού συμφωνητικού μίσθωσης, όποιο λάβει χώρα πρώτο.",
  ]))}
  ${section("4. Ειδικοί όροι & προστασία Μεσίτη", numbered([
    "Η μεσιτική αμοιβή οφείλεται ακέραια εάν η σύμβαση συναφθεί από σύζυγο, συγγενή έως τέταρτου βαθμού, συνδεδεμένο νομικό πρόσωπο ή παρένθετο πρόσωπο που ενήργησε κατ’ εντολή του Εντολέα.",
    "Η παρούσα εντολή ισχύει για ένα (1) έτος από την ημερομηνία υπογραφής. Συμφωνία που καταρτίζεται εντός του διαστήματος τεκμαίρεται ότι προήλθε από την υπόδειξη.",
    "Ο Εντολέας υποχρεούται να μην κοινοποιεί σε τρίτους πληροφορίες του ακινήτου χωρίς έγγραφη συναίνεση του Μεσίτη.",
  ]))}
  ${section("5. Ενημέρωση για προσωπικά δεδομένα (GDPR)", `<p>Ο Εντολέας συναινεί στην επεξεργασία των στοιχείων ταυτότητας, Α.Φ.Μ., επικοινωνίας, φωτογραφίας ταυτότητας και γεωεντοπισμού κατά την υπογραφή, αποκλειστικά για την εκτέλεση της παρούσας σύμβασης, την ταυτοποίηση, τις φορολογικές υποχρεώσεις και τη νομική κατοχύρωση των μερών σύμφωνα με τον Κανονισμό (ΕΕ) 2016/679.</p>`)}
  ${signatureGrid([{ title: "Για τη μεσιτική επιχείρηση", image: variables.brokerSignatureImage, name: variables.brokerName, afm: variables.agencyAfm }, { title: "Ο Εντολέας / Υποψήφιος", image: variables.clientSignatureImage, name: variables.clientName, afm: variables.clientAfm }])}
  ${auditFooter(variables)}`;
  return documentHtml("Εντολή Υπόδειξης Ακινήτου & Μεσιτική Σύμβαση", variables.documentId, variables.signingDateTime, variables.propertyCity, body);
}

export function generateAssignmentMandateHtml(variables: AssignmentMandateVariables): string {
  const body = `${section("1. Συμβαλλόμενα μέρη", partiesTable(
    "Α. Η μεσιτική επιχείρηση («Ο Μεσίτης»)", agencyRows(variables),
    "Β. Ο εντολέας / ιδιοκτήτης («Ο Εντολέας»)", [
      ["Ονοματεπώνυμο", variables.ownerName], ["Όνομα πατρός", variables.ownerFatherName], ["Α.Δ.Τ. / Διαβατήριο", variables.ownerAdt], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.ownerAfm} · ${variables.ownerDoy}`], ["Διεύθυνση κατοικίας", variables.ownerAddress], ["Τηλέφωνο / Email", `${variables.ownerPhone} · ${variables.ownerEmail}`], ["Ιδιότητα / Συνιδιοκτησία", `${variables.ownershipPercentage}%`],
    ],
  ))}
  ${section("2. Στοιχεία ακινήτου & ζητούμενοι όροι", `<p>Ο Εντολέας δηλώνει ότι είναι νόμιμος κύριος ή εξουσιοδοτημένος εκπρόσωπος και αναθέτει στον Μεσίτη τη διαμεσολάβηση για την <b>${escapeHtml(variables.transactionType)}</b>.</p>${propertyTable(["Κωδικός", "Διεύθυνση / Περιοχή", "Όροφος & Τύπος", "Επιφάνεια", "Κ.Α.Ε.Κ.", "Ζητούμενο τίμημα / μίσθωμα"], [variables.propertyCode, `${variables.propertyAddress}, ${variables.propertyArea}`, `${variables.propertyFloor} · ${variables.propertyType}`, `${variables.propertySqm} τ.μ.`, variables.propertyKaek, `${variables.askingPrice} €`])}<p><b>Ελάχιστο αποδεκτό τίμημα:</b> ${escapeHtml(variables.minAcceptablePrice)} € · <b>Συνοδευτικοί χώροι:</b> Αποθήκη ${escapeHtml(variables.storageSqm)} τ.μ. · Θέση στάθμευσης ${escapeHtml(variables.parkingSlot)}.</p>`)}
  ${section("3. Διάρκεια & μορφή της εντολής", numbered([
    `Η σύμβαση ισχύει για ${escapeHtml(variables.assignmentDurationMonths)} μήνες, από ${escapeHtml(variables.signingDateTime)} έως ${escapeHtml(variables.expirationDate)}.`,
    `Η εντολή είναι <b>${escapeHtml(variables.assignmentType)}</b>. Σε αποκλειστική εντολή ο Εντολέας δεν αναθέτει σε άλλη μεσιτική επιχείρηση ούτε καταρτίζει απευθείας συμφωνία χωρίς τη συμμετοχή του Μεσίτη. Η παραβίαση συνεπάγεται την καταβολή της συμφωνηθείσας αμοιβής ως ποινική ρήτρα και αποζημίωση δαπανών προβολής.`,
  ]))}
  ${section("4. Μεσιτική αμοιβή & όροι πληρωμής", numbered([
    `Σε πώληση: ${escapeHtml(variables.commissionRate)}% επί του πραγματικού τιμήματος. Σε μίσθωση: ${escapeHtml(variables.commissionAmount)} € (ισόποσο ενός μηνιαίου μισθώματος).`,
    `Επί της αμοιβής προστίθεται Φ.Π.Α. ${escapeHtml(variables.vatRate)}%, συνολικό ποσό ${escapeHtml(variables.totalCommissionWithVat)} €.`,
    "Η αμοιβή καταβάλλεται κατά την υπογραφή προσυμφώνου, οριστικού συμβολαίου ή μισθωτηρίου στο Taxisnet. Σε αρραβώνα άνω του 10%, καταβάλλεται 50% κατά το προσύμφωνο και 50% κατά το οριστικό συμβόλαιο.",
  ]))}
  ${section("5. Υποχρεώσεις μερών & παρένθετα πρόσωπα", numbered([
    "Ο Μεσίτης προβάλλει επιμελώς το ακίνητο, συντονίζει τις υποδείξεις και ενημερώνει τακτικά τον Εντολέα.",
    "Ο Εντολέας παρέχει πρόσβαση στο ακίνητο και παραδίδει έγκαιρα τα αναγκαία έγγραφα μεταβίβασης.",
    "Εάν η σύμβαση συναφθεί εντός ενός (1) έτους από τη λήξη με υποδειχθέντα αγοραστή ή παρένθετο πρόσωπο, η αμοιβή οφείλεται ακέραιη.",
  ]))}
  ${section("6. Προσωπικά δεδομένα (GDPR)", `<p>Ο Εντολέας συναινεί στην τήρηση και επεξεργασία των προσωπικών του δεδομένων και των στοιχείων του ακινήτου για την εκτέλεση της εντολής, τους ελέγχους ταυτοπροσωπίας, τις φορολογικές υποχρεώσεις και το αρχείο εντολών, σύμφωνα με τον Κανονισμό (ΕΕ) 2016/679.</p>`)}
  ${signatureGrid([{ title: "Για τη μεσιτική επιχείρηση", image: variables.brokerSignatureImage, name: variables.brokerName, afm: variables.agencyAfm }, { title: "Ο Εντολέας / Ιδιοκτήτης", image: variables.ownerSignatureImage, name: variables.ownerName, afm: variables.ownerAfm }])}
  ${auditFooter(variables)}`;
  return documentHtml("Εντολή Ανάθεσης Ακινήτου & Μεσιτική Σύμβαση", variables.documentId, variables.signingDateTime, variables.propertyCity, body);
}

export function generateRoommateAgreementHtml(variables: RoommateAgreementVariables): string {
  const body = `${section("1. Συμβαλλόμενα μέρη (οι συγκάτοικοι)", partiesTable(
    "Α. Ο/Η πρώτος/-η συγκάτοικος", [["Ονοματεπώνυμο", variables.roommate1Name], ["Όνομα πατρός", variables.roommate1FatherName], ["Α.Δ.Τ. / Διαβατήριο", variables.roommate1Adt], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.roommate1Afm} · ${variables.roommate1Doy}`], ["Τηλέφωνο / Email", `${variables.roommate1Phone} · ${variables.roommate1Email}`]],
    "Β. Ο/Η δεύτερος/-η συγκάτοικος", [["Ονοματεπώνυμο", variables.roommate2Name], ["Όνομα πατρός", variables.roommate2FatherName], ["Α.Δ.Τ. / Διαβατήριο", variables.roommate2Adt], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.roommate2Afm} · ${variables.roommate2Doy}`], ["Τηλέφωνο / Email", `${variables.roommate2Phone} · ${variables.roommate2Email}`]],
  ))}<p><b>Επιπλέον συμβαλλόμενοι:</b> ${escapeHtml(variables.roommateExtraParties)}</p>
  ${section("2. Στοιχεία ακινήτου & κατανομή χώρων", `<p>Οι συμβαλλόμενοι συνοικούν στο μίσθιο επί της διεύθυνσης <b>${escapeHtml(variables.propertyAddress)}</b>, περιοχή ${escapeHtml(variables.propertyArea)}, όροφος ${escapeHtml(variables.propertyFloor)}, επιφάνεια ${escapeHtml(variables.propertySqm)} τ.μ. (κωδικός ${escapeHtml(variables.propertyCode)}).</p>${table([[`Ιδιωτικός χώρος ${variables.roommate1Name}`, variables.roommate1RoomDesc], [`Ιδιωτικός χώρος ${variables.roommate2Name}`, variables.roommate2RoomDesc], ["Κοινόχρηστοι χώροι", "Σαλόνι, κουζίνα, διάδρομοι, λουτρά και εξώστες, με ισότιμη χρήση από όλους."]])}`)}
  ${section("3. Οικονομικοί όροι & επιμερισμός δαπανών", table([["Συνολικό μηνιαίο μίσθωμα", `${variables.totalMonthlyRent} €`], [variables.roommate1Name, `${variables.roommate1RentShare} € / μήνα`], [variables.roommate2Name, `${variables.roommate2RentShare} € / μήνα`], ["Ημέρα καταβολής", `${variables.rentPaymentDayOfMonth}η ημέρα κάθε μήνα`], ["Συνολική εγγύηση", `${variables.totalSecurityDeposit} €`], [`Μερίδιο εγγύησης ${variables.roommate1Name}`, `${variables.roommate1DepositShare} €`], [`Μερίδιο εγγύησης ${variables.roommate2Name}`, `${variables.roommate2DepositShare} €`], ["Κοινόχρηστα / λογαριασμοί", `${variables.utilitiesSplitMode}. Εξόφληση εντός ${variables.billsPaymentDeadlineDays} ημερών.`]]))}
  ${section("4. Κανόνες σπιτιού & συμβίωσης", numbered([
    `Οι ώρες κοινής ησυχίας τηρούνται απαρέγκλιτα. Μετά τις ${escapeHtml(variables.quietHoursStart)} απαγορεύονται δυνατή μουσική, έντονος θόρυβος και συγκεντρώσεις.`,
    `Οι κοινόχρηστοι χώροι διατηρούνται καθαροί σύμφωνα με το πρόγραμμα: ${escapeHtml(variables.cleaningSchedule)}.`,
    `Επιτρέπεται η φιλοξενία με έγκαιρη προειδοποίηση. Διανυκτέρευση τρίτου προσώπου επιτρέπεται έως ${escapeHtml(variables.maxGuestOvernightDays)} συνεχόμενες ημέρες ανά μήνα.`,
    `Κάπνισμα: ${escapeHtml(variables.smokingPolicy)}. Κατοικίδια: ${escapeHtml(variables.petPolicy)}. Όροι: ${escapeHtml(variables.petPolicyTerms)}.`,
  ]))}
  ${section("5. Αποχώρηση συγκατοίκου & αντικατάσταση", numbered([`Πρόωρη αποχώρηση απαιτεί έγγραφη ενημέρωση ${escapeHtml(variables.departureNoticeDays)} ημέρες νωρίτερα.`, "Ο αποχωρών προτείνει αντικαταστάτη αποδεκτό από τους υπόλοιπους και τον ιδιοκτήτη, διαφορετικά παραμένει υπεύθυνος για το μερίδιό του.", "Το μερίδιο εγγύησης αποδίδεται από τον νέο συγκάτοικο ή από την εκκαθάριση της μίσθωσης, μετά την αφαίρεση οφειλών ή ζημιών."]))}
  ${section("6. Προσωπικά δεδομένα (GDPR)", `<p>Οι συμβαλλόμενοι συναινούν στην επεξεργασία των στοιχείων τους από την πλατφόρμα CampusStay αποκλειστικά για τη διαχείριση της συγκατοίκησης, των κοινών εξόδων και του παρόντος συμφωνητικού.</p>`)}
  ${signatureGrid([{ title: "Ο/Η 1ος συγκάτοικος", image: variables.roommate1SignatureImage, name: variables.roommate1Name, afm: variables.roommate1Afm }, { title: "Ο/Η 2ος συγκάτοικος", image: variables.roommate2SignatureImage, name: variables.roommate2Name, afm: variables.roommate2Afm }])}
  ${auditFooter(variables, [["GPS 1ου συγκατοίκου", variables.roommate1Gps], ["GPS 2ου συγκατοίκου", variables.roommate2Gps], ["OTP ID 1ου συγκατοίκου", variables.roommate1OtpId], ["OTP ID 2ου συγκατοίκου", variables.roommate2OtpId], ["IP τερματικού 1ου / 2ου", `${variables.roommate1Ip} / ${variables.roommate2Ip}`]])}`;
  return documentHtml("Ιδιωτικό Συμφωνητικό Συγκατοίκησης & Εσωτερικός Κανονισμός", variables.documentId, variables.signingDateTime, variables.propertyCity, body);
}

export function generateHoldingDepositHtml(variables: HoldingDepositVariables): string {
  const body = `${section("1. Συμβαλλόμενα μέρη", partiesTable(
    "Α. Ο λαβών την προκαταβολή", [["Ονοματεπώνυμο / Επωνυμία", variables.receiverName], ["Ιδιότητα", variables.receiverCapacity], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.receiverAfm} · ${variables.receiverDoy}`], ["Α.Δ.Τ. / Γ.Ε.ΜΗ.", variables.receiverIdOrGemi], ["Διεύθυνση", variables.receiverAddress], ["Τηλέφωνο / Email", `${variables.receiverPhone} · ${variables.receiverEmail}`], ["IBAN / Τράπεζα", `${variables.receiverIban} · ${variables.receiverBankName}`]],
    "Β. Ο καταβάλλων την προκαταβολή", [["Ονοματεπώνυμο", variables.clientName], ["Όνομα πατρός", variables.clientFatherName], ["Α.Δ.Τ. / Διαβατήριο", variables.clientAdt], ["Α.Φ.Μ. / Δ.Ο.Υ.", `${variables.clientAfm} · ${variables.clientDoy}`], ["Διεύθυνση", variables.clientAddress], ["Τηλέφωνο / Email", `${variables.clientPhone} · ${variables.clientEmail}`]],
  ))}
  ${section("2. Στοιχεία δεσμευόμενου ακινήτου / χώρου & συμφωνηθέντες όροι", `<p>Ο Ενδιαφερόμενος εξετάζει και κρατά το ακίνητο ή δωμάτιο για τη σύναψη οριστικής σύμβασης <b>${escapeHtml(variables.transactionType)}</b>.</p>${propertyTable(["Κωδικός", "Διεύθυνση / Περιοχή", "Όροφος & Χώρος", "Επιφάνεια", "Συμφωνηθέν τίμημα / μίσθωμα"], [variables.propertyCode, `${variables.propertyAddress}, ${variables.propertyArea}`, `${variables.propertyFloor} · ${variables.roomOrUnitIdentifier}`, `${variables.propertySqm} τ.μ.`, `${variables.agreedRentalOrSalePrice} €`])}<p><b>Διάρκεια μίσθωσης:</b> ${escapeHtml(variables.leaseDurationMonths)} μήνες, από ${escapeHtml(variables.leaseStartDate)} έως ${escapeHtml(variables.leaseEndDate)}. <b>Εγγύηση:</b> ${escapeHtml(variables.agreedSecurityDepositAmount)} € (${escapeHtml(variables.depositMonthsCount)} μισθώματα).</p>`)}
  ${section("3. Ποσό προκαταβολής / αρραβώνα", numbered([`Για τη δέσμευση καταβάλλεται το ποσό των <b>${escapeHtml(variables.holdingDepositAmount)} €</b> (${escapeHtml(variables.holdingDepositWords)} ευρώ).`, `Τρόπος πληρωμής: ${escapeHtml(variables.paymentMethod)} · Κωδικός συναλλαγής: ${escapeHtml(variables.paymentTransactionRef)}.`, `Με την οριστική σύμβαση συμψηφίζεται με ${escapeHtml(variables.depositAllocationTarget)}.`]))}
  ${section("4. Υποχρεώσεις μερών & απόσυρση από την αγορά", numbered(["Ο Λαβών αποσύρει το ακίνητο από κάθε διαφημιστικό μέσο και παύει τις υποδείξεις σε τρίτους μέχρι την καταληκτική ημερομηνία.", `Τα μέρη θα προσέλθουν για οριστική υπογραφή το αργότερο έως ${escapeHtml(variables.finalContractDeadlineDate)} και ώρα ${escapeHtml(variables.finalContractDeadlineTime)}.`]))}
  ${section("5. Ρήτρες υπαναχώρησης & τύχη προκαταβολής", numbered([`Αν ο Ενδιαφερόμενος υπαναχωρήσει αναιτιολόγητα ή δεν υπογράψει έως ${escapeHtml(variables.finalContractDeadlineDate)}, η προκαταβολή καταπίπτει υπέρ του Λαβόντος ως ποινική ρήτρα αποζημίωσης.`, "Αν ο Λαβών υπαναχωρήσει ή η σύμβαση καταστεί ανέφικτη από υπαιτιότητά του, επιστρέφει άμεσα και ατόκως την προκαταβολή, ή εις διπλούν αν έχει συμφωνηθεί επιβεβαιωτικός αρραβώνας.", "Αν η συμφωνία δεν καταρτιστεί λόγω ανυπαίτιου νομικού κωλύματος ή ανωτέρας βίας, το ποσό επιστρέφεται ακέραιο."]))}
  ${section("6. Προσωπικά δεδομένα (GDPR)", `<p>Τα μέρη συναινούν στην επεξεργασία των στοιχείων τους για την έκδοση του αποδεικτικού κράτησης, την τραπεζική διασταύρωση και τη σύνταξη της τελικής σύμβασης σύμφωνα με τον Κανονισμό (ΕΕ) 2016/679.</p>`)}
  ${signatureGrid([{ title: "Ο Λαβών την προκαταβολή", image: variables.receiverSignatureImage, name: variables.receiverName, afm: variables.receiverAfm }, { title: "Ο Ενδιαφερόμενος / Καταβάλλων", image: variables.clientSignatureImage, name: variables.clientName, afm: variables.clientAfm }])}
  ${auditFooter(variables)}`;
  return documentHtml("Έντυπο Κράτησης Ακινήτου / Δωματίου & Ιδιωτικό Συμφωνητικό Προκαταβολής", variables.documentId, variables.signingDateTime, variables.propertyCity, body);
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

export function calculateCommissionTotals(payload: DigitalContractDocument["contractPayload"]): { commission: number; vat: number; totalPayable: number } {
  const rate = payload.commissionRatePercentage ?? 2;
  const base = payload.commissionAmountCalculated ?? ((payload.monthlyRentOrPrice ?? payload.agreedListingPrice ?? 0) * rate / 100);
  if (!Number.isFinite(base) || base < 0) throw new Error("Απαιτούνται έγκυρα στοιχεία μεσιτικής αμοιβής.");
  const vat = base * 0.24;
  return { commission: base, vat, totalPayable: base + vat };
}

export function validateContractTemplate(data: ContractTemplateData): void {
  if (data.document.templateVersion && data.document.templateVersion !== CONTRACT_TEMPLATE_VERSION) throw new Error(`Η έκδοση προτύπου πρέπει να είναι ${CONTRACT_TEMPLATE_VERSION}.`);
  if (!data.document.id.trim()) throw new Error("Απαιτείται αριθμός εγγράφου.");
  if (!data.document.contractType) throw new Error("Απαιτείται τύπος εγγράφου.");
}

function signer(data: ContractTemplateData, role: SignatureSignerEvidence["signerRole"], index = 0): SignatureSignerEvidence {
  return data.document.signers.filter((entry) => entry.signerRole === role)[index] ?? data.document.signers[index] ?? {
    signerId: "",
    signerName: "",
    signerRole: role,
    signerPhone: "",
    signerEmail: "",
    signatureBase64: "",
    signedAt: 0,
    locationCoords: { latitude: 0, longitude: 0, accuracyMeters: 0 },
    otpVerified: false,
  };
}

function participant(data: ContractTemplateData, role: ContractParticipant["role"], index = 0): ContractParticipant {
  return data.participants.filter((entry) => entry.role === role)[index] ?? data.participants[index] ?? { id: "", fullName: "", role, phone: "", email: "" };
}

function gps(value: SignatureSignerEvidence): string {
  return `${value.locationCoords.latitude.toFixed(6)}, ${value.locationCoords.longitude.toFixed(6)} (±${value.locationCoords.accuracyMeters.toFixed(1)} m)`;
}

function dateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeStyle: "medium" }).format(new Date(timestamp || Date.now()));
}

function audit(data: ContractTemplateData, selected: SignatureSignerEvidence): ContractAuditVariables {
  return {
    signingDateTime: dateTime(data.document.createdAt),
    signingGpsCoordinates: gps(selected),
    otpVerificationId: selected.otpVerificationId || selected.evidenceId || (selected.otpVerified ? "Επαληθεύτηκε μέσω OTP" : "Δεν εφαρμόζεται"),
    signerIp: selected.ipAddress || "Δεν έχει καταγραφεί",
    documentHash: data.document.finalDocumentHash || data.document.pdfSha256Hash || "Θα καταχωριστεί κατά την οριστικοποίηση",
  };
}

function agency(data: ContractTemplateData): AgencyLegalVariables {
  const source = data.agency as ContractTemplateData["agency"] & Record<string, unknown>;
  return {
    agencyName: text(source.name), agencyLegalForm: text(source.legalForm), agencyAddress: text(source.address), agencyAfm: text(source.taxNumber), agencyDoy: text(source.doy), agencyGemi: text(source.gemi), agencyBrokerRegNo: text(source.brokerRegNo), agencyPhone: text(source.phone), agencyEmail: text(source.email),
  };
}

function commonProperty(data: ContractTemplateData): { city: string; address: string; area: string; floor: string; type: string; sqm: string; code: string; price: string } {
  const source = data.property as (ContractTemplateData["property"] & Record<string, unknown>) | undefined;
  const payload = data.document.contractPayload;
  return {
    city: field(payload, "propertyCity"), address: text(source?.exactAddress || data.document.apartmentAddress), area: field(payload, "propertyArea"), floor: field(payload, "propertyFloor"), type: field(payload, "propertyType"), sqm: field(payload, "propertySqm"), code: text(source?.code || data.document.propertyCode), price: amount(source?.price ?? source?.monthlyRentOrPrice ?? payload.monthlyRentOrPrice ?? payload.agreedListingPrice),
  };
}

function buildShowing(data: ContractTemplateData): ShowingMandateVariables {
  const p = commonProperty(data); const payload = data.document.contractPayload; const broker = signer(data, "broker"); const client = signer(data, "client"); const clientParty = participant(data, "client"); const totals = calculateCommissionTotals(payload); const a = agency(data);
  return { ...a, ...audit(data, client), documentId: data.document.id, signingDateTime: dateTime(data.document.createdAt), propertyCity: p.city, brokerName: text(broker.signerName), clientName: text(client.signerName || clientParty.fullName), clientFatherName: field(payload, "clientFatherName"), clientAdt: text(client.signerIdCardNumber || clientParty.idCardNumber), clientAfm: text(client.signerAfm || clientParty.afm), clientDoy: field(payload, "clientDoy"), clientAddress: field(payload, "clientAddress"), clientPhone: text(client.signerPhone || clientParty.phone), clientEmail: text(client.signerEmail || clientParty.email), transactionType: field(payload, "transactionType", "αγορά / μίσθωση"), propertyCode: p.code, propertyAddress: p.address, propertyArea: p.area, propertyFloor: p.floor, propertyType: p.type, propertySqm: p.sqm, propertyPrice: p.price, commissionRate: text(payload.commissionRatePercentage ?? 2), commissionAmount: amount(payload.commissionAmountCalculated ?? totals.commission), vatRate: "24", totalCommissionWithVat: amount(totals.totalPayable), brokerSignatureImage: broker.signatureBase64, clientSignatureImage: client.signatureBase64 };
}

function buildAssignment(data: ContractTemplateData): AssignmentMandateVariables {
  const p = commonProperty(data); const payload = data.document.contractPayload; const broker = signer(data, "broker"); const owner = signer(data, "owner"); const ownerParty = participant(data, "owner"); const totals = calculateCommissionTotals(payload); const a = agency(data);
  return { ...a, ...audit(data, owner), documentId: data.document.id, signingDateTime: dateTime(data.document.createdAt), propertyCity: p.city, assignmentType: payload.assignmentMode === "exclusive" ? "Αποκλειστική" : "Μη Αποκλειστική - Απλή", brokerName: text(broker.signerName), ownerName: text(owner.signerName || ownerParty.fullName), ownerFatherName: field(payload, "ownerFatherName"), ownerAdt: text(owner.signerIdCardNumber || ownerParty.idCardNumber), ownerAfm: text(owner.signerAfm || ownerParty.afm), ownerDoy: field(payload, "ownerDoy"), ownerAddress: field(payload, "ownerAddress"), ownerPhone: text(owner.signerPhone || ownerParty.phone), ownerEmail: text(owner.signerEmail || ownerParty.email), ownershipPercentage: field(payload, "ownershipPercentage", "100"), transactionType: field(payload, "transactionType", "πώληση / εκμίσθωση"), propertyCode: p.code, propertyAddress: p.address, propertyArea: p.area, propertyFloor: p.floor, propertyType: p.type, propertySqm: p.sqm, propertyKaek: field(payload, "propertyKaek"), askingPrice: amount(payload.agreedListingPrice ?? p.price), minAcceptablePrice: amount(payload.minAcceptablePrice), storageSqm: field(payload, "storageSqm"), parkingSlot: field(payload, "parkingSlot"), assignmentDurationMonths: text(payload.durationMonths ?? 6), expirationDate: field(payload, "expirationDate"), commissionRate: text(payload.commissionRatePercentage ?? 2), commissionAmount: amount(payload.commissionAmountCalculated ?? totals.commission), vatRate: "24", totalCommissionWithVat: amount(totals.totalPayable), brokerSignatureImage: broker.signatureBase64, ownerSignatureImage: owner.signatureBase64 };
}

function buildRoommate(data: ContractTemplateData): RoommateAgreementVariables {
  const p = commonProperty(data); const payload = data.document.contractPayload; const first = signer(data, "roommate", 0); const second = signer(data, "roommate", 1); const firstParty = participant(data, "roommate", 0); const secondParty = participant(data, "roommate", 1); const split = payload.utilitySplitPercentages ?? {}; const rules = payload.houseRulesConfig; const rulesObject = rules && typeof rules === "object" ? rules : {};
  return { ...audit(data, first), documentId: data.document.id, signingDateTime: dateTime(data.document.createdAt), propertyCity: p.city, roommate1Name: text(first.signerName || firstParty.fullName), roommate1FatherName: field(payload, "roommate1FatherName"), roommate1Adt: text(first.signerIdCardNumber || firstParty.idCardNumber), roommate1Afm: text(first.signerAfm || firstParty.afm), roommate1Doy: field(payload, "roommate1Doy"), roommate1Phone: text(first.signerPhone || firstParty.phone), roommate1Email: text(first.signerEmail || firstParty.email), roommate2Name: text(second.signerName || secondParty.fullName), roommate2FatherName: field(payload, "roommate2FatherName"), roommate2Adt: text(second.signerIdCardNumber || secondParty.idCardNumber), roommate2Afm: text(second.signerAfm || secondParty.afm), roommate2Doy: field(payload, "roommate2Doy"), roommate2Phone: text(second.signerPhone || secondParty.phone), roommate2Email: text(second.signerEmail || secondParty.email), roommateExtraParties: field(payload, "roommateExtraParties"), propertyAddress: p.address, propertyArea: p.area, propertyFloor: p.floor, propertySqm: p.sqm, propertyCode: p.code, roommate1RoomDesc: field(payload, "roommate1RoomDesc"), roommate2RoomDesc: field(payload, "roommate2RoomDesc"), totalMonthlyRent: amount(payload.monthlyRentOrPrice), roommate1RentShare: amount(payload.roommate1RentShare), roommate2RentShare: amount(payload.roommate2RentShare), rentPaymentDayOfMonth: field(payload, "rentPaymentDayOfMonth", "1"), totalSecurityDeposit: amount(payload.holdingDepositTerms?.amount), roommate1DepositShare: amount(payload.roommate1DepositShare), roommate2DepositShare: amount(payload.roommate2DepositShare), utilitiesSplitMode: `${text(split[first.signerId], "50")}% / ${text(split[second.signerId], "50")}%`, billsPaymentDeadlineDays: field(payload, "billsPaymentDeadlineDays", "7"), quietHoursStart: field(payload, "quietHoursStart", "23:00"), cleaningSchedule: text(rulesObject.cleaningSchedule), maxGuestOvernightDays: field(payload, "maxGuestOvernightDays", "3"), smokingPolicy: field(payload, "smokingPolicy"), petPolicy: field(payload, "petPolicy"), petPolicyTerms: field(payload, "petPolicyTerms"), departureNoticeDays: field(payload, "departureNoticeDays", "30"), roommate1Gps: gps(first), roommate2Gps: gps(second), roommate1OtpId: first.otpVerificationId || first.evidenceId || "Δεν εφαρμόζεται", roommate2OtpId: second.otpVerificationId || second.evidenceId || "Δεν εφαρμόζεται", roommate1Ip: first.ipAddress || "Δεν έχει καταγραφεί", roommate2Ip: second.ipAddress || "Δεν έχει καταγραφεί", roommate1SignatureImage: first.signatureBase64, roommate2SignatureImage: second.signatureBase64 };
}

function buildHolding(data: ContractTemplateData): HoldingDepositVariables {
  const p = commonProperty(data); const payload = data.document.contractPayload; const receiver = signer(data, "broker"); const client = signer(data, "client"); const clientParty = participant(data, "client"); const deposit = payload.holdingDepositAmount ?? 0;
  return { ...audit(data, client), documentId: data.document.id, signingDateTime: dateTime(data.document.createdAt), propertyCity: p.city, reservationObjectType: field(payload, "reservationObjectType", "Ολόκληρο ακίνητο / ιδιωτικό δωμάτιο"), receiverName: text(receiver.signerName), receiverCapacity: field(payload, "receiverCapacity", "Μεσίτης / νόμιμος εκπρόσωπος"), receiverAfm: text(receiver.signerAfm), receiverDoy: field(payload, "receiverDoy"), receiverIdOrGemi: field(payload, "receiverIdOrGemi"), receiverAddress: field(payload, "receiverAddress"), receiverPhone: text(receiver.signerPhone), receiverEmail: text(receiver.signerEmail), receiverIban: field(payload, "receiverIban"), receiverBankName: field(payload, "receiverBankName"), clientName: text(client.signerName || clientParty.fullName), clientFatherName: field(payload, "clientFatherName"), clientAdt: text(client.signerIdCardNumber || clientParty.idCardNumber), clientAfm: text(client.signerAfm || clientParty.afm), clientDoy: field(payload, "clientDoy"), clientAddress: field(payload, "clientAddress"), clientPhone: text(client.signerPhone || clientParty.phone), clientEmail: text(client.signerEmail || clientParty.email), transactionType: field(payload, "transactionType", "μίσθωσης / αγοραπωλησίας"), propertyCode: p.code, propertyAddress: p.address, propertyArea: p.area, propertyFloor: p.floor, roomOrUnitIdentifier: field(payload, "roomOrUnitIdentifier", p.type), propertySqm: p.sqm, agreedRentalOrSalePrice: amount(payload.monthlyRentOrPrice ?? p.price), leaseDurationMonths: field(payload, "leaseDurationMonths"), leaseStartDate: field(payload, "leaseStartDate"), leaseEndDate: field(payload, "leaseEndDate"), agreedSecurityDepositAmount: amount(payload.agreedSecurityDepositAmount), depositMonthsCount: field(payload, "depositMonthsCount", "1"), holdingDepositAmount: amount(deposit), holdingDepositWords: field(payload, "holdingDepositWords"), paymentMethod: field(payload, "paymentMethod", payload.bankReference ? "Τραπεζική κατάθεση" : "Μετρητά"), paymentTransactionRef: text(payload.bankReference || payload.cashReceiptNote), depositAllocationTarget: field(payload, "depositAllocationTarget", "το πρώτο μίσθωμα / την εγγύηση"), finalContractDeadlineDate: field(payload, "finalContractDeadlineDate"), finalContractDeadlineTime: field(payload, "finalContractDeadlineTime"), receiverSignatureImage: receiver.signatureBase64, clientSignatureImage: client.signatureBase64 };
}

export function buildContractTemplateVariables(data: ContractTemplateData): ContractTemplateVariables {
  validateContractTemplate(data);
  switch (data.document.contractType) {
    case "viewing_order": return buildShowing(data);
    case "property_assignment": return buildAssignment(data);
    case "roommate_agreement": return buildRoommate(data);
    case "holding_deposit_viewing": return buildHolding(data);
  }
}

export function buildContractHtml(data: ContractTemplateData): string {
  const variables = buildContractTemplateVariables(data);
  switch (data.document.contractType) {
    case "viewing_order": return generateShowingMandateHtml(variables as ShowingMandateVariables);
    case "property_assignment": return generateAssignmentMandateHtml(variables as AssignmentMandateVariables);
    case "roommate_agreement": return generateRoommateAgreementHtml(variables as RoommateAgreementVariables);
    case "holding_deposit_viewing": return generateHoldingDepositHtml(variables as HoldingDepositVariables);
  }
}
