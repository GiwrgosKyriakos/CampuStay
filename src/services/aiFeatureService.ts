import type { AiCopywritingOption } from "@/src/types/aiFeatures";

export interface ApartmentSpecRequest {
  rooms?: number;
  sqm?: number;
  area?: string;
  amenities?: string[];
  price?: number;
}

export async function generateListingCopywritingStub(specs: ApartmentSpecRequest, tone: string): Promise<AiCopywritingOption[]> {
  const area = specs.area ?? "Central district";
  const sqm = specs.sqm ?? 80;
  const rooms = specs.rooms ?? 2;
  const price = specs.price ?? 1200;
  const amenities = specs.amenities?.length ? specs.amenities.join(", ") : "balcony, natural light, practical layout";

  const options: AiCopywritingOption[] = [
    {
      tone: "professional",
      headline: `${rooms}-Bedroom Apartment in ${area}`,
      description: `This ${rooms}-bed apartment offers ${sqm} sqm of well-planned living space in ${area}. Designed for comfortable everyday living with ${amenities} and a compelling price of €${price}.`,
      keyHighlights: ["Well-planned layout", "Prime area", "Excellent value"],
      socialMediaSnippet: `Fresh listing in ${area}: ${sqm} sqm, ${amenities}, from €${price}.`,
    },
    {
      tone: "enthusiastic",
      headline: `Your next home in ${area}`,
      description: `A welcoming and bright home with an easy flow, generous natural light, and practical features that make everyday living feel effortless. An excellent option for buyers seeking comfort and convenience in ${area}.`,
      keyHighlights: ["Bright and airy", "Move-in ready", "High-demand area"],
      socialMediaSnippet: `Discover this stylish property in ${area} — bright interiors, premium convenience, and a great value from €${price}.`,
    },
    {
      tone: "luxury",
      headline: `Luxury living in ${area}`,
      description: `A refined residential opportunity combining premium comfort, thoughtful design, and an ideal location in ${area}. With ${sqm} sqm of generous living space, this home offers the balance of contemporary elegance and practical convenience.`,
      keyHighlights: ["Premium feel", "Strong location", "Well-designed interiors"],
      socialMediaSnippet: `Luxury meets practicality in ${area}: ${sqm} sqm of elevated living, designed for effortless city living.`,
    },
  ];

  return tone === "concise_bulleted" ? [
    { ...options[0], tone: "concise_bulleted", headline: `${rooms}-Bedroom • ${area}`, description: `• ${sqm} sqm\n• ${amenities}\n• ${area}\n• €${price}`, keyHighlights: ["Efficient layout", "Convenient location", "Value for money"], socialMediaSnippet: `${area} • ${sqm} sqm • €${price}` },
  ] : options;
}

export async function generateCmaReportStub(apartmentId: string) {
  return {
    id: `cma-${apartmentId}`,
    apartmentId,
    estimatedPriceMin: 820,
    estimatedPriceMax: 950,
    recommendedListingPrice: 890,
    confidenceScore: 89,
    pricePerSqmAverage: 12.1,
    comparables: [],
    marketTrendSummary: "Prices remain stable with mild upward movement in the local market.",
    pricingAdvice: "Use a value-led range to trigger fast interest while preserving margin.",
    createdAt: Date.now(),
  };
}
