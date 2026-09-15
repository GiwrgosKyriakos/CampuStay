import { i18n } from "@/src/locales";
import { canonicalizeQuizAnswer } from "@/src/utils/matchAlgorithm";
import { toCanonicalCity as resolveCanonicalCity } from "@/src/utils/cityTypes";

export { CITY_CANONICAL_MAP } from "@/src/utils/cityTypes";

export type LocalizedDataNamespace =
  | "cities"
  | "lifestyle"
  | "amenities"
  | "propertyTypes"
  | "propertyCategories"
  | "genders";

export type QuizQuestionKey = `q${number}`;

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

const AMENITY_CANONICAL_MAP: Record<string, string> = {
  wifi: "wifi",
  wi_fi: "wifi",
  wi_fi_included: "wifi",
  air_condition: "air_condition",
  air_conditioner: "air_condition",
  air_conditioning: "air_condition",
  ac: "air_condition",
  κλιματισμος: "air_condition",
  washing_machine: "washing_machine",
  washer: "washing_machine",
  πλυντηριο_ρουχων: "washing_machine",
  pet: "pet_friendly",
  pets: "pet_friendly",
  pet_friendly: "pet_friendly",
  κατοικιδια: "pet_friendly",
  καταλληλο_για_κατοικιδια: "pet_friendly",
  furnished: "furnished",
  επιπλωμενο: "furnished",
  balcony: "balcony",
  μπαλκονι: "balcony",
  βεραντα: "balcony",
  parking: "parking",
  παρκινγκ: "parking",
  θεση_σταθμευσης: "parking",
  near_metro: "near_metro",
  metro: "near_metro",
  κοντα_σε_μετρο: "near_metro",
  μετρο: "near_metro",
  elevator: "elevator",
  ασανσερ: "elevator",
  bills_included: "bills_included",
  λογαριασμοι_περιλαμβανονται: "bills_included",
  shared_kitchen: "shared_kitchen",
  κοινοχρηστη_κουζινα: "shared_kitchen",
  garden: "garden",
  κηπος: "garden",
  security_door: "security_door",
  πορτα_ασφαλειας: "security_door",
  solar_water_heater: "solar_water_heater",
  ηλιακος_θερμοσιφωνας: "solar_water_heater",
  alarm: "alarm",
  συναγερμος: "alarm",
  storage_room: "storage_room",
  αποθηκη: "storage_room",
  fireplace: "fireplace",
  τζακι: "fireplace",
};

const PROPERTY_TYPE_CANONICAL_MAP: Record<string, string> = {
  apartment: "apartment",
  διαμερισμα: "apartment",
  studio: "studio",
  γκαρσονιερα: "studio",
  loft: "loft",
  maisonette: "maisonette",
  μεζονετα: "maisonette",
  room: "room",
  δωματιο: "room",
};

const HEATING_CANONICAL_MAP: Record<string, string> = {
  autonomous: "autonomous_gas",
  autonomous_gas: "autonomous_gas",
  gas: "autonomous_gas",
  φυσικο_αεριο: "autonomous_gas",
  αυτονομη: "autonomous_gas",
  αυτονομο: "autonomous_gas",
  central: "central",
  κεντρικη: "central",
  κεντρικο: "central",
  heat_pump: "heat_pump",
  αντλια_θερμοτητας: "heat_pump",
  air_condition: "air_condition",
  air_conditioner: "air_condition",
  air_conditioning: "air_condition",
  κλιματισμος: "air_condition",
};

export function toCanonicalCity(city?: string | null): string {
  return resolveCanonicalCity(city);
}

export function toCanonicalAmenity(amenity: string): string {
  const normalized = normalizeKey(amenity);
  return AMENITY_CANONICAL_MAP[normalized] || normalized;
}

export function toCanonicalPropertyType(type: string): string {
  const normalized = normalizeKey(type);
  return PROPERTY_TYPE_CANONICAL_MAP[normalized] || normalized;
}

export function toCanonicalHeatingType(type: string): string {
  const normalized = normalizeKey(type);
  return HEATING_CANONICAL_MAP[normalized] || normalized;
}

export function toCanonicalFurnishedStatus(value: string): string {
  const normalized = normalizeKey(value);
  if (["furnished", "επιπλωμενο"].includes(normalized)) return "furnished";
  if (["unfurnished", "μη_επιπλωμενο", "χωρις_επιπλα"].includes(normalized)) return "unfurnished";
  return normalized;
}

const aliases: Partial<Record<LocalizedDataNamespace, Record<string, string>>> = {
  cities: {
    thessaloniki: "thessaloniki",
    θεσσαλονικη: "thessaloniki",
    athens: "athens",
    αθηνα: "athens",
    athina: "athens",
    patra: "patra",
    patras: "patra",
    πατρα: "patra",
    heraklion: "heraklion",
    ηρακλειο: "heraklion",
    iraklio: "heraklion",
    larissa: "larissa",
    larisa: "larissa",
    λαρισα: "larissa",
    ioannina: "ioannina",
    ιωαννινα: "ioannina",
    yannena: "ioannina",
    chania: "chania",
    χανια: "chania",
    hαnia: "chania",
    rethymno: "rethymno",
    rethimno: "rethymno",
    ρεθυμνο: "rethymno",
  },
  amenities: {
    wifi: "wifi",
    wi_fi: "wifi",
    wi_fi_included: "wifi",
    air_conditioning: "airConditioning",
    air_conditioner: "airConditioning",
    air_condition: "airConditioning",
    ac: "airConditioning",
    κλιματισμος: "airConditioning",
    washing_machine: "washingMachine",
    washer: "washingMachine",
    πλυντηριο_ρουχων: "washingMachine",
    pet: "petFriendly",
    pets: "petFriendly",
    pet_friendly: "petFriendly",
    κατοικιδια: "petFriendly",
    furnished: "furnished",
    επιπλωμενο: "furnished",
    balcony: "balcony",
    μπαλκονι: "balcony",
    parking: "parking",
    παρκινγκ: "parking",
    near_metro: "nearMetro",
    metro: "nearMetro",
    κοντα_σε_μετρο: "nearMetro",
    elevator: "elevator",
    ασανσερ: "elevator",
    bills_included: "billsIncluded",
    shared_kitchen: "sharedKitchen",
    garden: "garden",
  },
  propertyTypes: {
    apartment: "apartment",
    διαμερισμα: "apartment",
    studio: "studio",
    γκαρσονιερα: "studio",
    maisonette: "maisonette",
    μεζονετα: "maisonette",
    loft: "loft",
    room: "room",
    δωματιο: "room",
  },
  propertyCategories: {
    residential: "residential",
    κατοικια: "residential",
    commercial: "commercial",
    επαγγελματικη: "commercial",
    land: "land",
    γη: "land",
    other: "other",
    λοιπα: "other",
  },
  genders: {
    male: "male",
    ανδρας: "male",
    female: "female",
    γυναικα: "female",
    non_binary: "nonBinary",
    μη_δυαδικο: "nonBinary",
  },
  lifestyle: {
    smoker: "smoker",
    smoking: "smoker",
    smokes_outside: "smokesOutside",
    only_outside: "smokesOutside",
    non_smoker: "nonSmoker",
    no_smoking: "nonSmoker",
    pet_owner_or_wants: "petOwnerOrWants",
    pets_allowed: "petsAllowed",
    pet_friendly: "petsAllowed",
    no_pets: "noPets",
    very_tidy: "veryTidy",
    messy: "messy",
    early_bird: "earlyBird",
    student_routine: "studentRoutine",
    night_owl: "nightOwl",
    student: "student",
    working_student: "workingStudent",
    employed: "employed",
    postgraduate: "postgraduate",
    undergraduate: "undergraduate",
  },
};

const quizAliases: Record<string, Record<string, string>> = {
  q1: { very_tidy: "veryTidy", very_tidy_and_highly_organized: "veryTidy", average: "average", messy: "messy" },
  q2: { weekly: "weekly", sometimes: "sometimes", every_now_and_then: "sometimes", only_when_needed: "onlyWhenNeeded", only_when_its_really_needed: "onlyWhenNeeded" },
  q3: { wash_daily: "washDaily", next_day: "nextDay", when_no_clean_ones: "whenNoCleanOnes", when_there_are_no_clean_ones_left: "whenNoCleanOnes" },
  q4: { split_everything_evenly: "splitEvenly", each_person_pays_for_a_different_one: "assignedBills", well_figure_it_out_as_we_go: "flexible" },
  q5: { smoker: "smoker", yes: "smoker", smokes_outside: "smokesOutside", only_outside: "smokesOutside", non_smoker: "nonSmoker", no: "nonSmoker" },
  q6: { quiet_always: "quietAlways", quiet_at_night: "quietAtNight", noise_is_fine: "noiseIsFine", noise_is_fine_anytime: "noiseIsFine" },
  q7: { early_bird: "earlyBird", before_11pm: "earlyBird", student_routine: "studentRoutine", "11pm_1am": "studentRoutine", night_owl: "nightOwl", after_1am: "nightOwl" },
  q8: { guests_anytime: "guestsAnytime", come_anytime: "guestsAnytime", ask_first: "askFirst", rare_visits: "rareVisits", rare_visits_only: "rareVisits" },
  q9: { love_parties: "loveParties", love_them: "loveParties", occasional_gatherings: "occasionalGatherings", occasionally_is_fine: "occasionalGatherings", no_parties: "noParties", no_parties_please: "noParties" },
  q10: { close_friends: "closeFriends", lets_hang_out_and_be_friends: "closeFriends", friendly_co_living: "friendlyCoLiving", just_split_the_bills: "quietRoommates", quiet_roommates: "quietRoommates" },
  q11: { share_freely: "shareFreely", ask_first: "askFirst", prefer_not_to_share: "noSharing", no_sharing: "noSharing" },
  q12: { take_turns: "takeTurns", take_turns_buying: "takeTurns", split_costs: "splitCosts", split_evenly: "splitCosts", everyone_buys_their_own: "ownSupplies", own_supplies: "ownSupplies" },
  q13: { pet_owner_or_wants: "petOwnerOrWants", yes: "petOwnerOrWants", pets_allowed: "petsAllowed", pets_are_fine: "petsAllowed", no_pets: "noPets", no_pets_please: "noPets" },
  q14: { often_alcohol: "oftenAlcohol", i_drink_often: "oftenAlcohol", weekend_drinker: "weekendDrinker", only_weekends: "weekendDrinker", no_alcohol: "noAlcohol", i_dont_drink_but_okay_if_you_do: "noAlcohol" },
  q15: { every_day: "everyDay", i_cook_every_single_day: "everyDay", few_times: "fewTimes", a_few_times_a_week: "fewTimes", rarely: "rarely", rarely_i_mostly_order_out_or_eat_on_campus: "rarely" },
};

function hasTranslation(key: string): boolean {
  const localeTranslations = i18n.translations[i18n.locale || i18n.defaultLocale];
  const value = key.split(i18n.defaultSeparator).reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, localeTranslations);
  return typeof value === "string";
}

function translateValue(value: string, namespace: LocalizedDataNamespace, key: string): string {
  const translationKey = `${namespace}.${key}`;
  return hasTranslation(translationKey) ? String(i18n.t(translationKey)) : value;
}

export function localizeData(value: string | null | undefined, namespace: LocalizedDataNamespace): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = normalizeKey(value);
  const key = aliases[namespace]?.[normalized] ?? normalized;
  return translateValue(value, namespace, key);
}

export function localizeCity(value: string | null | undefined): string {
  return localizeData(value, "cities");
}

export function localizeHeatingType(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const key = toCanonicalHeatingType(value);
  const translationKeys: Record<string, string> = {
    autonomous_gas: "apartments.tab.heating.autonomous",
    central: "apartments.tab.heating.central",
    air_condition: "apartments.tab.heating.airConditioning",
    heat_pump: "apartments.tab.heating.heatPump",
  };
  const translationKey = translationKeys[key];
  return translationKey && hasTranslation(translationKey) ? String(i18n.t(translationKey)) : value;
}

export function localizeLifestyle(value: string | null | undefined): string {
  return localizeData(value, "lifestyle");
}

export function localizeQuizAnswer(value: string | null | undefined, questionKey: QuizQuestionKey): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const canonicalValue = canonicalizeQuizAnswer(questionKey, value) ?? value;
  const normalized = normalizeKey(canonicalValue);
  const key = quizAliases[questionKey]?.[normalized];
  return key ? translateValue(canonicalValue, "lifestyle", key) : localizeLifestyle(canonicalValue);
}

export function localizeAmenity(value: string | null | undefined): string {
  return localizeData(value, "amenities");
}

export function localizePropertyType(value: string | null | undefined): string {
  return localizeData(value, "propertyTypes");
}

export function localizePropertyCategory(value: string | null | undefined): string {
  return localizeData(value, "propertyCategories");
}

export function localizeGender(value: string | null | undefined): string {
  return localizeData(value, "genders");
}