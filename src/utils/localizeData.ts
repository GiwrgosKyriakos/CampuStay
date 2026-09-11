import { i18n } from "@/src/locales";

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
  q1: { very_tidy: "veryTidy", average: "average", messy: "messy" },
  q2: { weekly: "weekly", every_now_and_then: "sometimes", only_when_its_really_needed: "onlyWhenNeeded" },
  q3: { wash_daily: "washDaily", next_day: "nextDay", when_there_are_no_clean_ones_left: "whenNoCleanOnes" },
  q4: { split_everything_evenly: "splitEvenly", each_person_pays_for_a_different_one: "assignedBills", well_figure_it_out_as_we_go: "flexible" },
  q5: { yes: "smoker", only_outside: "smokesOutside", no: "nonSmoker" },
  q6: { quiet_always: "quietAlways", quiet_at_night: "quietAtNight", noise_is_fine_anytime: "noiseIsFine" },
  q7: { before_11pm: "earlyBird", "11pm_1am": "studentRoutine", after_1am: "nightOwl" },
  q8: { come_anytime: "guestsAnytime", ask_first: "askFirst", rare_visits_only: "rareVisits" },
  q9: { love_them: "loveParties", occasionally_is_fine: "occasionalGatherings", no_parties_please: "noParties" },
  q10: { lets_hang_out_and_be_friends: "closeFriends", friendly_co_living: "friendlyCoLiving", just_split_the_bills: "quietRoommates" },
  q11: { share_freely: "shareFreely", ask_first: "askFirst", prefer_not_to_share: "noSharing" },
  q12: { take_turns_buying: "takeTurns", split_evenly: "splitCosts", everyone_buys_their_own: "ownSupplies" },
  q13: { i_have_a_pet_or_definitely_want_to_get_one: "petOwnerOrWants", i_do_not_have_one_but_pets_are_totally_fine_with_me: "petsAllowed", strictly_no_pets_allowed: "noPets" },
  q14: { i_enjoy_drinking_frequently_at_home: "oftenAlcohol", i_only_drink_occasionally_on_weekends: "weekendDrinker", i_do_not_drink_or_prefer_an_alcohol_free_home: "noAlcohol" },
  q15: { i_cook_every_single_day: "everyDay", a_few_times_a_week: "fewTimes", rarely_i_mostly_order_out_or_eat_on_campus: "rarely" },
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

export function localizeLifestyle(value: string | null | undefined): string {
  return localizeData(value, "lifestyle");
}

export function localizeQuizAnswer(value: string | null | undefined, questionKey: QuizQuestionKey): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = normalizeKey(value);
  const key = quizAliases[questionKey]?.[normalized];
  return key ? translateValue(value, "lifestyle", key) : localizeLifestyle(value);
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