export type TourPersonaKey =
  | "roommate_seeker"
  | "solo_tenant"
  | "listing_host"
  | "broker_independent"
  | "broker_agency"
  | "agency_management"
  | "guest";

export type TourAnchorKey =
  | "tab:roommates" | "tab:apartments" | "tab:matches" | "tab:explore-feed" | "tab:calendar" | "tab:broker" | "tab:profile" | "tab:analytics" | "tab:apartment-pool"
  | "roommates_quiz_pill" | "roommates_profile_button" | "roommates_preferences_button" | "roommates_top_card" | "header_calendar_button"
  | "calendar_todo_button" | "calendar_week_toggle" | "calendar_day_focus" | "calendar_add_note_fab" | "matches_segment_toggle" | "matches_broker_filter"
  | "matches_chat_row" | "chat_actions_non_orange" | "reels_action_cluster" | "apartments_main_toggles" | "apartments_adjacent_buttons"
  | "apartments_top_right_controls" | "apartments_create_listing" | "apartments_host_inbox" | "profile_edit_button" | "broker_dashboard"
  | "broker_client_dossier" | "broker_pipeline" | "broker_my_listings" | "broker_agency_reels" | "agency_management_screen"
  | "agency_unassigned_pool" | "agency_afm_management" | "agency_code_management";

export type TourStepId =
  | "guest_tabs_roommates" | "guest_tabs_apartments" | "guest_tabs_explore" | "guest_tabs_profile" | "rm_quiz_pill" | "rm_profile_btn" | "rm_prefs_btn" | "rm_swipedeck" | "cal_btn" | "cal_todo_modal"
  | "cal_week_view" | "cal_day_view" | "cal_add_note" | "match_toggle" | "match_broker_btn" | "match_chat_actions" | "reels_actions"
  | "apt_toggles" | "apt_adjacent_btns" | "apt_top_right" | "profile_edit_btn" | "solo_apartments" | "solo_reels" | "solo_matches"
  | "solo_calendar" | "host_apartments" | "host_create_listing" | "host_inbox" | "host_calendar" | "host_profile" | "broker_dashboard"
  | "broker_dossier" | "broker_pipeline" | "broker_listings" | "broker_reels" | "broker_calendar" | "broker_profile" | "management_screen"
  | "management_pool" | "management_afm" | "management_code";

export type TourTabRoute =
  | "/(tabs)/roommates"
  | "/(tabs)/apartments"
  | "/(tabs)/matches"
  | "/(tabs)/reels"
  | "/(tabs)/explore-feed"
  | "/(tabs)/calendar"
  | "/(tabs)/broker"
  | "/(tabs)/profile"
  | "/(tabs)/analytics"
  | "/(tabs)/apartment-pool";

export interface TourStep {
  id: TourStepId;
  targetKey: TourAnchorKey;
  tabRoute: TourTabRoute;
  screenRoute?: string;
  titleKey: string;
  descriptionKey: string;
  placement?: "top" | "bottom" | "center";
  actionTrigger?: "tap" | "swipe" | "auto";
  requiresModalOpen?: string;
}

export interface TourAnchorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TourModalBridge {
  open: () => void;
  close: () => void;
}

export type TourPhase = "idle" | "active";