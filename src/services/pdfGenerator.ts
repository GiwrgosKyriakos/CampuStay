import * as Crypto from "expo-crypto";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "@/src/config/firebase";
import { buildContractHtml } from "@/src/services/contractTemplates";
import type { ContractTemplateData } from "@/src/types/esignature";

export interface GeneratedContractPdf {
  uri: string;
  sha256Hash: string;
  base64: string;
}

export async function generateContractPdf(htmlContent: string): Promise<GeneratedContractPdf> {
  const { uri } = await Print.printToFileAsync({
    html: htmlContent,
    base64: true,
  });

  const base64Data = await new File(uri).base64();
  const sha256Hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64Data,
  );

  return { uri, sha256Hash, base64: base64Data };
}

export async function generateContractTemplatePdf(data: ContractTemplateData): Promise<GeneratedContractPdf> {
  return generateContractPdf(buildContractHtml(data));
}

export interface OwnerReportPdfInput {
  apartmentId: string;
  propertyTitle: string;
  propertyAddress: string;
  report: {
    reportPeriod: string;
    executiveSummary: string;
    totalViews: number;
    totalInquiries: number;
    averageRating: number;
    showingMetrics: { totalVisits: number; positiveSignalsCount: number; concernsCount: number };
    sentimentSummary: string;
    priceRecommendation: string;
    strategicRecommendations: string[];
    ownerActionItems: string[];
  };
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
}

export interface GeneratedOwnerReportPdf {
  uri: string;
  storagePath: string;
  generatedPdfUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function listHtml(items: string[]): string {
  return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p class=muted>Δεν υπάρχουν καταγεγραμμένες προτάσεις.</p>";
}

async function loadBrandLogoDataUri(): Promise<string> {
  const asset = Asset.fromModule(require("@/assets/campuStayLogoTransparent.png"));
  await asset.downloadAsync();
  if (!asset.localUri) return "";
  return `data:image/png;base64,${await new File(asset.localUri).base64()}`;
}

export async function buildOwnerActivityPdfReport(input: OwnerReportPdfInput): Promise<GeneratedOwnerReportPdf> {
  const generatedAt = new Date();
  const report = input.report;
  const logoDataUri = await loadBrandLogoDataUri().catch(() => "");
  const logoHtml = logoDataUri ? `<img class="logo" src="${logoDataUri}" />` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 28px; } body { font-family: Arial, sans-serif; color: #18323a; margin: 0; }
    .header { background: #0a4250; color: white; padding: 24px; border-radius: 12px; } .logo { width: 130px; height: 42px; object-fit: contain; object-position: left center; }
    .brand { font-size: 25px; font-weight: 700; letter-spacing: .5px; } h1 { font-size: 23px; margin: 18px 0 4px; } h2 { color: #0a4250; font-size: 16px; margin: 22px 0 8px; }
    .muted { color: #61777d; } .meta { margin-top: 8px; font-size: 12px; line-height: 1.5; } .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 18px; }
    .kpi { border: 1px solid #d8e7ea; border-radius: 9px; padding: 12px; } .kpi strong { display: block; color: #0a4250; font-size: 22px; } .kpi span { font-size: 10px; color: #61777d; }
    .callout { background: #e7f2f4; border-left: 4px solid #e76f51; padding: 13px; border-radius: 6px; line-height: 1.5; } p, li { font-size: 12px; line-height: 1.55; } ul { padding-left: 19px; }
    .footer { border-top: 1px solid #d8e7ea; margin-top: 26px; padding-top: 10px; font-size: 10px; color: #61777d; }
  </style></head><body>
    <section class="header">${logoHtml}<div class="brand">CampusStay</div><h1>Owner Performance Report</h1><div class="meta">${escapeHtml(input.propertyTitle)}<br>${escapeHtml(input.propertyAddress)}<br>${escapeHtml(report.reportPeriod)} · Έκδοση ${generatedAt.toLocaleDateString("el-GR")}</div></section>
    <div class="grid"><div class="kpi"><strong>${report.totalViews}</strong><span>Προβολές</span></div><div class="kpi"><strong>${report.totalInquiries}</strong><span>Ερωτήματα</span></div><div class="kpi"><strong>${report.showingMetrics.totalVisits}</strong><span>Υποδείξεις</span></div><div class="kpi"><strong>${report.averageRating.toFixed(1)}</strong><span>Μέση αξιολόγηση</span></div></div>
    <h2>Σύνοψη</h2><p>${escapeHtml(report.executiveSummary)}</p><h2>Συναισθηματική εικόνα</h2><p>${escapeHtml(report.sentimentSummary)}</p>
    <h2>Σήματα αγοράς</h2><div class="grid"><div class="kpi"><strong>${report.showingMetrics.positiveSignalsCount}</strong><span>Θετικά σήματα</span></div><div class="kpi"><strong>${report.showingMetrics.concernsCount}</strong><span>Ανησυχίες</span></div></div>
    <h2>Πρόταση τιμής</h2><div class="callout">${escapeHtml(report.priceRecommendation)}</div><h2>Στρατηγικές προτάσεις</h2>${listHtml(report.strategicRecommendations)}<h2>Επόμενες ενέργειες</h2>${listHtml(report.ownerActionItems)}
    <div class="footer">Στοιχεία συνεργάτη: ${escapeHtml(input.agentName || "CampusStay")}${input.agentEmail ? ` · ${escapeHtml(input.agentEmail)}` : ""}${input.agentPhone ? ` · ${escapeHtml(input.agentPhone)}` : ""}</div>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html, base64: true });
  const base64 = await new File(uri).base64();
  const storagePath = `apartments/${input.apartmentId}/reports/owner_report_${generatedAt.getTime()}.pdf`;
  const fileRef = ref(storage, storagePath);
  await uploadString(fileRef, base64, "base64", { contentType: "application/pdf", customMetadata: { apartmentId: input.apartmentId, reportPeriod: report.reportPeriod } });
  return { uri, storagePath, generatedPdfUrl: await getDownloadURL(fileRef) };
}