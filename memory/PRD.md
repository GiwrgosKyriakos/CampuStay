# RoomieSwipe — Product Requirements

## Original Problem Statement
Mobile app (React Native + Expo + TypeScript) for university students to find roommates and apartments in their study city. MVP Step 1: app skeleton with a Bottom Navigation Bar (Roommates [default Home], Matches, Apartments, Profile) and a fully implemented Home screen — a Tinder-style swipe card stack showing profile photo + Age, Gender, Max Monthly Budget (€). Swipe left = reject, right = like. No page scrolling on Home. Top-center filter bar to adjust preferences (Gender, Age range, Budget). Frontend + mock data only.

## User Choices
- Vibe: Modern student (vibrant accents) — Electric Lime #00E676 + Amber, Bricolage Grotesque display font.
- Swipe: Tinder-style with rotation + LIKE/NOPE stamps.
- Photos: realistic stock portraits (Unsplash).
- Currency: € (Euro).
- Scope: frontend + mock data, no backend.

## Architecture
- Expo Router file-based routing. `app/index.tsx` redirects to `/roommates`. Tabs in `app/(tabs)/`.
- Custom glass tab bar (`src/components/GlassTabBar.tsx`, expo-blur).
- Swipe deck: `react-native-reanimated` + `react-native-gesture-handler` (`src/components/SwipeDeck.tsx`).
- Filter sheet: `@gorhom/bottom-sheet` + `@react-native-community/slider` (`src/components/FilterSheet.tsx`).
- In-memory matches store via `useSyncExternalStore` (`src/store/matches.ts`).
- Mock data: `src/data/profiles.ts` (8 roommates), apartments inline in screen.
- Theme tokens: `src/theme/index.ts`. Custom fonts in `assets/fonts/`.

## Implemented (2026-06-30)
- Bottom nav: Roommates / Matches / Apartments / Profile.
- Home: Tinder swipe stack (rotation, LIKE/NOPE stamps), gender/budget pills, gradient scrim, like/nope buttons, no page scroll, empty state.
- Filter pill + preferences sheet (Gender chips, Age min/max, Budget max) with live summary.
- Matches tab (reactive grid + empty state), Apartments tab (cards), Profile tab (hero, stats, settings).
- Tested: 100% pass (testing_agent iteration_1).

### Step 2 (2026-06-30)
- Matches tab reworked into Instagram-style chat list (avatar, name, "Hey there! 👋", paper-plane icon).
- Dedicated ChatScreen at `app/chat/[id].tsx` (outside tabs → tab bar fully hidden). Header shows Gender/Age/Budget; floating input + send (react-native-keyboard-controller KeyboardProvider + KeyboardAvoidingView).
- Bottom tab active indicator changed to perfect circle (48×48).
- Swipe cards: reduced photo aspect ratio (0.66) so buttons/info fit; image transition=0 + recyclingKey for flash-free, smooth swaps.
- Tested: 100% pass (testing_agent iteration_2).

### Step 4 (2026-06-30)
- Premium "Roomie Profile" row at top of Profile tab → navigates to RoomieProfileScreen (`app/roomie-profile.tsx`, outside tabs → tab bar hidden).
- Single scrollable 15-question compatibility quiz in 6 categories; emoji-prefixed questions, 3 clean (emoji-free) radio-card options each; live answered/15 progress.
- Top-right Back button auto-saves all answers to backend then returns. Answers reload on re-open.
- Backend (`server.py`): GET/PUT `/api/roomie-profile/{user_id}` (Mongo `roomie_profiles`, upsert, no `_id` leak). User id is a persistent local UUID (`src/utils/userId.ts`).
- Tested: backend 8/8 pytest + frontend all pass (testing_agent iteration_3).

### Step 7 (2026-06-30)
- Global theme overhaul: Deep Teal #083D4A bg, Vibrant Orange #E07A2F accent, Muted Light Teal #8BB4B9 (nav/filter pill), white text — applied app-wide via `src/theme/index.ts` tokens (+ added `muted`).
- Home: 'Roomie'(white)+'Swipe'(orange) brand; full-width 'Roomate Preferences' filter pill; orange info pills; full-bleed card; orange X/Heart action circles in normal flow (zero overlap, 16px/24px gaps); muted-teal tab bar with perfect-circle orange active indicator.
- Root StatusBar set to light + Stack contentStyle teal. delete-account bg tied to theme.
- Tested: frontend all pass (testing_agent iteration_4 re-run), zero-overlap geometry verified.

## Backlog
- P1: Real backend (FastAPI + MongoDB) for profiles, persisted matches, user auth.
- P1: Apartment filtering + detail screen; apartment swipe/save.
- P2: Match detail / chat, profile editing persistence, city selection, rewind/undo swipe, super-like.

## Next Tasks
- Wire backend + persistence when user proceeds to Step 2.
