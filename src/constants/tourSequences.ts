import type { TourAnchorKey, TourPersonaKey, TourStep, TourStepId } from "@/src/types/tour";

function step(
  id: TourStepId,
  targetKey: TourAnchorKey,
  tabRoute: TourStep["tabRoute"],
  titleKey: string,
  descriptionKey: string,
  options: Pick<TourStep, "screenRoute" | "placement" | "actionTrigger" | "requiresModalOpen"> = {},
): TourStep {
  return {
    id,
    targetKey,
    tabRoute,
    titleKey,
    descriptionKey,
    placement: "top",
    actionTrigger: "tap",
    ...options,
  };
}

export const ROOMMATE_SEEKER_TOUR_STEPS: TourStep[] = [
  step("rm_quiz_pill", "roommates_quiz_pill", "/(tabs)/roommates", "tour.roommate.quizTitle", "tour.roommate.quizDesc"),
  step("rm_profile_btn", "roommates_profile_button", "/(tabs)/roommates", "tour.roommate.profileTitle", "tour.roommate.profileDesc", { screenRoute: "/roomie-profile" }),
  step("rm_prefs_btn", "roommates_preferences_button", "/(tabs)/roommates", "tour.roommate.prefsTitle", "tour.roommate.prefsDesc"),
  step("rm_swipedeck", "roommates_top_card", "/(tabs)/roommates", "tour.roommate.swipeTitle", "tour.roommate.swipeDesc", { actionTrigger: "swipe" }),
  step("cal_btn", "header_calendar_button", "/(tabs)/roommates", "tour.cal.btnTitle", "tour.cal.btnDesc"),
  step("cal_todo_modal", "calendar_todo_button", "/(tabs)/calendar", "tour.cal.todoTitle", "tour.cal.todoDesc"),
  step("cal_week_view", "calendar_week_toggle", "/(tabs)/calendar", "tour.cal.weekTitle", "tour.cal.weekDesc"),
  step("cal_day_view", "calendar_day_focus", "/(tabs)/calendar", "tour.cal.dayTitle", "tour.cal.dayDesc"),
  step("cal_add_note", "calendar_add_note_fab", "/(tabs)/calendar", "tour.cal.noteTitle", "tour.cal.noteDesc"),
  step("match_toggle", "matches_segment_toggle", "/(tabs)/matches", "tour.matches.toggleTitle", "tour.matches.toggleDesc"),
  step("match_broker_btn", "matches_broker_filter", "/(tabs)/matches", "tour.matches.brokerTitle", "tour.matches.brokerDesc"),
  step("match_chat_actions", "chat_actions_non_orange", "/(tabs)/matches", "tour.chat.actionsTitle", "tour.chat.actionsDesc", { requiresModalOpen: "tour_chat_preview" }),
  step("reels_actions", "reels_action_cluster", "/(tabs)/explore-feed", "tour.reels.actionsTitle", "tour.reels.actionsDesc"),
  step("apt_toggles", "apartments_main_toggles", "/(tabs)/apartments", "tour.apt.togglesTitle", "tour.apt.togglesDesc"),
  step("apt_adjacent_btns", "apartments_adjacent_buttons", "/(tabs)/apartments", "tour.apt.adjBtnsTitle", "tour.apt.adjBtnsDesc"),
  step("profile_edit_btn", "profile_edit_button", "/(tabs)/profile", "tour.profile.editTitle", "tour.profile.editDesc"),
];

export const SOLO_TENANT_TOUR_STEPS: TourStep[] = [
  step("solo_apartments", "apartments_main_toggles", "/(tabs)/apartments", "tour.apt.togglesTitle", "tour.apt.togglesDesc"),
  step("solo_reels", "reels_action_cluster", "/(tabs)/explore-feed", "tour.reels.actionsTitle", "tour.reels.actionsDesc"),
  step("solo_matches", "matches_segment_toggle", "/(tabs)/matches", "tour.matches.toggleTitle", "tour.matches.toggleDesc"),
  step("solo_calendar", "calendar_week_toggle", "/(tabs)/calendar", "tour.cal.weekTitle", "tour.cal.weekDesc"),
  step("profile_edit_btn", "profile_edit_button", "/(tabs)/profile", "tour.profile.editTitle", "tour.profile.editDesc"),
];

export const LISTING_HOST_TOUR_STEPS: TourStep[] = [
  step("host_apartments", "apartments_main_toggles", "/(tabs)/apartments", "tour.apt.togglesTitle", "tour.apt.togglesDesc"),
  step("host_create_listing", "apartments_create_listing", "/(tabs)/apartments", "tour.host.createTitle", "tour.host.createDesc"),
  step("host_inbox", "apartments_host_inbox", "/(tabs)/apartments", "tour.host.inboxTitle", "tour.host.inboxDesc"),
  step("host_calendar", "calendar_week_toggle", "/(tabs)/calendar", "tour.cal.weekTitle", "tour.cal.weekDesc"),
  step("host_profile", "profile_edit_button", "/(tabs)/profile", "tour.profile.editTitle", "tour.profile.editDesc"),
];

export const BROKER_TOUR_STEPS: TourStep[] = [
  step("broker_dashboard", "broker_dashboard", "/(tabs)/broker", "tour.broker.dashboardTitle", "tour.broker.dashboardDesc"),
  step("broker_dossier", "broker_client_dossier", "/(tabs)/broker", "tour.broker.dossierTitle", "tour.broker.dossierDesc"),
  step("broker_pipeline", "broker_pipeline", "/(tabs)/broker", "tour.broker.pipelineTitle", "tour.broker.pipelineDesc"),
  step("broker_listings", "broker_my_listings", "/(tabs)/apartments", "tour.broker.listingsTitle", "tour.broker.listingsDesc"),
  step("broker_reels", "broker_agency_reels", "/(tabs)/apartments", "tour.broker.reelsTitle", "tour.broker.reelsDesc"),
  step("broker_calendar", "calendar_week_toggle", "/(tabs)/calendar", "tour.cal.weekTitle", "tour.cal.weekDesc"),
  step("broker_profile", "profile_edit_button", "/(tabs)/profile", "tour.profile.editTitle", "tour.profile.editDesc"),
];

export const AGENCY_LEADERSHIP_TOUR_STEPS: TourStep[] = [
  step("management_screen", "agency_management_screen", "/(tabs)/apartments", "tour.management.screenTitle", "tour.management.screenDesc", { screenRoute: "/agency-management" }),
  step("management_pool", "agency_unassigned_pool", "/(tabs)/apartments", "tour.management.poolTitle", "tour.management.poolDesc"),
  step("management_afm", "agency_afm_management", "/(tabs)/apartments", "tour.management.afmTitle", "tour.management.afmDesc"),
  step("management_code", "agency_code_management", "/(tabs)/apartments", "tour.management.codeTitle", "tour.management.codeDesc"),
];

export const TOUR_STEPS: Record<TourPersonaKey, TourStep[]> = {
  guest: [
    step("guest_tabs_roommates", "tab:roommates", "/(tabs)/roommates", "tour.steps.roommates.title", "tour.steps.roommates.description"),
    step("guest_tabs_apartments", "tab:apartments", "/(tabs)/apartments", "tour.steps.apartments.title", "tour.steps.apartments.description"),
    step("guest_tabs_explore", "tab:explore-feed", "/(tabs)/explore-feed", "tour.steps.explore.title", "tour.steps.explore.description"),
    step("guest_tabs_profile", "tab:profile", "/(tabs)/profile", "tour.steps.profile.title", "tour.steps.profile.description"),
  ],
  roommate_seeker: ROOMMATE_SEEKER_TOUR_STEPS,
  solo_tenant: SOLO_TENANT_TOUR_STEPS,
  listing_host: LISTING_HOST_TOUR_STEPS,
  broker_independent: BROKER_TOUR_STEPS,
  broker_agency: BROKER_TOUR_STEPS,
  agency_management: AGENCY_LEADERSHIP_TOUR_STEPS,
};
