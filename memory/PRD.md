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

## Backlog
- P1: Real backend (FastAPI + MongoDB) for profiles, persisted matches, user auth.
- P1: Apartment filtering + detail screen; apartment swipe/save.
- P2: Match detail / chat, profile editing persistence, city selection, rewind/undo swipe, super-like.

## Next Tasks
- Wire backend + persistence when user proceeds to Step 2.
