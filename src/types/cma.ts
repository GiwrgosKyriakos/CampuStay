export interface ComparableProperty {
  id: string;
  title: string;
  address: string;
  area: string;
  sqm: number;
  price: number;
  pricePerSqm: number;
  similarityScore: number;
  soldOrListedDate: string;
}

export interface CmaValuationReport {
  id: string;
  apartmentId: string;
  estimatedPriceMin: number;
  estimatedPriceMax: number;
  recommendedListingPrice: number;
  confidenceScore: number;
  pricePerSqmAverage: number;
  comparables: ComparableProperty[];
  marketTrendSummary: string;
  pricingAdvice: string;
  createdAt: number;
}
