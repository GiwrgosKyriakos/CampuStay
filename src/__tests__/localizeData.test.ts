import { setI18nLocale } from "@/src/locales";
import {
  localizeAmenity,
  localizeCity,
  localizePropertyType,
  localizeQuizAnswer,
  normalizeKey,
} from "@/src/utils/localizeData";

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

  it("localizes standard stored attributes and quiz answers", () => {
    setI18nLocale("el");

    expect(localizeAmenity("air_conditioning")).toBe("Κλιματισμός");
    expect(localizePropertyType("Διαμέρισμα")).toBe("Διαμέρισμα");
    expect(localizeQuizAnswer("No", "q5")).toBe("Μη καπνιστής");
    expect(localizeQuizAnswer("Before 11pm", "q7")).toBe("Πρωινός τύπος");
  });

  it("returns custom values unchanged", () => {
    const customVillage = "Agios Nektarios";

    setI18nLocale("el");
    expect(localizeCity(customVillage)).toBe(customVillage);
    expect(localizeAmenity("Custom rooftop greenhouse")).toBe("Custom rooftop greenhouse");
  });
});