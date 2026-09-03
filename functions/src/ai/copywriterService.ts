import { getGeminiModel } from "./geminiClient";

export interface CopywriterInput {
  apartmentId?: string;
  title: string;
  area: string;
  sqm: number;
  bedrooms: number;
  price: number;
  features: string[];
  tone?: "professional" | "luxury" | "student_friendly";
}

export interface CopywriterResult {
  portalTitle: string;
  portalDescription: string;
  socialCaption: string;
  bulletHighlights: string[];
  seoTags: string[];
}

export interface ApartmentSpecs {
  rooms?: number;
  sqm?: number;
  area?: string;
  amenities?: string[];
  price?: number;
  title?: string;
}

export interface AiCopywritingOption {
  tone: "professional" | "enthusiastic" | "luxury" | "concise_bulleted";
  headline: string;
  description: string;
  keyHighlights: string[];
  socialMediaSnippet: string;
}

export interface GenerateListingCopywritingInput {
  specs: ApartmentSpecs;
  tone: string;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeInput(input: CopywriterInput): CopywriterInput {
  return {
    apartmentId: stringValue(input?.apartmentId) || undefined,
    title: stringValue(input?.title, "Ακίνητο προς αξιοποίηση"),
    area: stringValue(input?.area, "Ελλάδα"),
    sqm: Math.max(0, numberValue(input?.sqm)),
    bedrooms: Math.max(0, numberValue(input?.bedrooms)),
    price: Math.max(0, numberValue(input?.price)),
    features: Array.isArray(input?.features)
      ? input.features.filter((feature): feature is string => typeof feature === "string" && feature.trim().length > 0).map((feature) => feature.trim()).slice(0, 20)
      : [],
    tone: input?.tone === "luxury" || input?.tone === "student_friendly" ? input.tone : "professional",
  };
}

function fallbackCopy(input: CopywriterInput): CopywriterResult {
  const featureText = input.features.length ? input.features.join(", ") : "άνετους και λειτουργικούς χώρους";
  const priceText = input.price > 0 ? `€${input.price.toLocaleString("el-GR")}` : "κατόπιν επικοινωνίας";
  const tonePrefix = input.tone === "luxury" ? "Εκλεπτυσμένη κατοικία" : input.tone === "student_friendly" ? "Ιδανική επιλογή για φοιτητές" : "Επαγγελματική πρόταση κατοικίας";
  return {
    portalTitle: `${input.title} στην περιοχή ${input.area}`.slice(0, 70),
    portalDescription: `${tonePrefix} με ${input.sqm || "άνετους"} τ.μ. και ${input.bedrooms} υπνοδωμάτια στην ${input.area}. Διαθέτει ${featureText}. Τιμή: ${priceText}. Επικοινωνήστε για περισσότερες πληροφορίες και προγραμματισμό επίσκεψης.`,
    socialCaption: `${input.title} | ${input.area} | ${input.sqm || "άνετοι χώροι"} τ.μ. | ${priceText}. ${featureText}.`,
    bulletHighlights: [input.sqm > 0 ? `${input.sqm} τ.μ.` : "Λειτουργική επιφάνεια", `${input.bedrooms} υπνοδωμάτια`, ...input.features.slice(0, 4)],
    seoTags: ["ακίνητο", input.area, "διαμέρισμα", `${input.bedrooms} υπνοδωμάτια`].filter(Boolean),
  };
}

function normalizeResult(value: Record<string, unknown> | null, fallback: CopywriterResult): CopywriterResult {
  const text = (candidate: unknown, defaultValue: string): string => stringValue(candidate, defaultValue);
  const list = (candidate: unknown, defaultValue: string[]): string[] => Array.isArray(candidate)
    ? candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, 20)
    : defaultValue;
  return {
    portalTitle: text(value?.portalTitle, fallback.portalTitle).slice(0, 100),
    portalDescription: text(value?.portalDescription, fallback.portalDescription),
    socialCaption: text(value?.socialCaption, fallback.socialCaption),
    bulletHighlights: list(value?.bulletHighlights, fallback.bulletHighlights),
    seoTags: list(value?.seoTags, fallback.seoTags),
  };
}

export async function generatePropertyListingCopy(input: CopywriterInput): Promise<CopywriterResult> {
  const normalizedInput = normalizeInput(input);
  const fallback = fallbackCopy(normalizedInput);
  const prompt = `Είσαι επαγγελματίας copywriter για ελληνικό μεσιτικό CRM. Δημιούργησε ακριβές marketing copy για αγγελία σε Spitogatos, Xe και social media. Χρησιμοποίησε μόνο τα στοιχεία που δίνονται, χωρίς επινοημένες παροχές, αποστάσεις, ενεργειακή κλάση ή κατάσταση ανακαίνισης. Τήρησε τον τόνο: ${normalizedInput.tone}.\n\nΣτοιχεία ακινήτου: ${JSON.stringify(normalizedInput)}\n\nΕπίστρεψε αυστηρά έγκυρο JSON χωρίς markdown ή άλλο κείμενο, με ακριβώς αυτή τη δομή. Όλα τα κείμενα στα Ελληνικά (EL-GR):\n{"portalTitle":"Σύντομος τίτλος","portalDescription":"Ακριβής περιγραφή αγγελίας","socialCaption":"Σύντομη λεζάντα","bulletHighlights":["Βασικό χαρακτηριστικό"],"seoTags":["λέξη-κλειδί"]}`;
  try {
    const response = await getGeminiModel().generateContent(prompt);
    return normalizeResult(parseJsonObject(response.response.text()), fallback);
  } catch {
    return fallback;
  }
}

export async function generateListingCopywriting(specs: ApartmentSpecs, tone: string): Promise<AiCopywritingOption[]> {
  const normalizedTone = tone === "luxury" ? "luxury" : tone === "student_friendly" ? "student_friendly" : "professional";
  const result = await generatePropertyListingCopy({
    title: specs.title ?? "Ακίνητο",
    area: specs.area ?? "Ελλάδα",
    sqm: numberValue(specs.sqm),
    bedrooms: numberValue(specs.rooms),
    price: numberValue(specs.price),
    features: specs.amenities ?? [],
    tone: normalizedTone,
  });
  return [{ tone: normalizedTone === "student_friendly" ? "professional" : normalizedTone, headline: result.portalTitle, description: result.portalDescription, keyHighlights: result.bulletHighlights, socialMediaSnippet: result.socialCaption }];
}

export default generatePropertyListingCopy;
