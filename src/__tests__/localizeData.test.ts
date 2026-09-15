import { setI18nLocale } from "@/src/locales";
import {
  localizeAmenity,
  localizeCity,
  localizePropertyType,
  localizeQuizAnswer,
  normalizeKey,
  toCanonicalAmenity,
  toCanonicalCity,
  toCanonicalFurnishedStatus,
  toCanonicalHeatingType,
  toCanonicalPropertyType,
} from "@/src/utils/localizeData";
import { getCanonicalCity } from "@/src/utils/cityNormalization";

describe("localizeData", () => {
  afterEach(() => {
    setI18nLocale("en");
  });

  it("normalizes English and Greek city values to the same canonical label", () => {
    setI18nLocale("el");

    expect(normalizeKey("  ΘΕΣΣΑΛΟΝΊΚΗ  ")).toBe("θεσσαλονικη");
    expect(localizeCity("Thessaloniki")).toBe("Θεσσαλονίκη");
    expect(localizeCity("θεσσαλονικη")).toBe("Θεσσαλονίκη");

    setI18nLocale("en");
    expect(localizeCity("Θεσσαλονίκη")).toBe("Thessaloniki");
  });

  it("resolves supported bilingual city synonyms to canonical slugs", () => {
    expect(toCanonicalCity("Θεσσαλονίκη")).toBe("thessaloniki");
    expect(toCanonicalCity("Thessaloniki")).toBe("thessaloniki");
    expect(getCanonicalCity("Salonica")).toBe("thessaloniki");
    expect(getCanonicalCity("Πάτρα")).toBe("patras");
    expect(getCanonicalCity("Chania")).toBe("chania");
    expect(getCanonicalCity("Χανιά")).toBe("chania");
  });

  it("canonicalizes bilingual apartment attributes symmetrically", () => {
    expect(toCanonicalPropertyType("Διαμέρισμα")).toBe("apartment");
    expect(toCanonicalPropertyType("apartment")).toBe("apartment");
    expect(toCanonicalAmenity("Ασανσέρ")).toBe("elevator");
    expect(toCanonicalAmenity("Elevator")).toBe("elevator");
    expect(toCanonicalAmenity("Κλιματισμός")).toBe("air_condition");
    expect(toCanonicalHeatingType("Αυτόνομη")).toBe("autonomous_gas");
    expect(toCanonicalHeatingType("Autonomous")).toBe("autonomous_gas");
    expect(toCanonicalFurnishedStatus("Επιπλωμένο")).toBe("furnished");
    expect(toCanonicalFurnishedStatus("Furnished")).toBe("furnished");
  });

  it("localizes standard stored attributes and quiz answers", () => {
    setI18nLocale("el");

    expect(localizeAmenity("air_conditioning")).toBe("Κλιματισμός");
    expect(localizePropertyType("Διαμέρισμα")).toBe("Διαμέρισμα");
    expect(localizeQuizAnswer("No", "q5")).toBe("Μη καπνιστής");
    expect(localizeQuizAnswer("non_smoker", "q5")).toBe("Μη καπνιστής");
    expect(localizeQuizAnswer("Καπνίζω μόνο έξω ή στο μπαλκόνι", "q5")).toBe("Καπνίζει έξω");
    expect(localizeQuizAnswer("Before 11pm", "q7")).toBe("Πρωινός τύπος");
  });

  it("returns custom values unchanged", () => {
    const customVillage = "Agios Nektarios";

    setI18nLocale("el");
    expect(localizeCity(customVillage)).toBe(customVillage);
    expect(localizeAmenity("Custom rooftop greenhouse")).toBe("Custom rooftop greenhouse");
  });
});