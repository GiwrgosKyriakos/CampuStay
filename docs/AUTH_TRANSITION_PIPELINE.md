# Auth Transition Pipeline

## Scope

The authentication pipeline is owned by `app/_layout.tsx` and `src/context/auth.tsx`. The entry screens collect credentials and provide short-lived button feedback; they do not dispatch a destination after Firebase authentication succeeds.

## Lifecycle

1. `app/auth-email.tsx` or `app/auth-landing.tsx` disables the submit control while the initial Firebase or provider request is pending.
2. `src/context/auth.tsx` records the transition and waits for `onAuthStateChanged`.
3. The Firebase listener synchronizes `users/{uid}`, hydrates role/profile state, persists the session, and marks the auth state as logged in.
4. `app/_layout.tsx` resolves one destination and calls `router.replace` once when navigation is ready.
5. The branded loader remains the only full-screen transition surface until the destination route is active, then the auth transition is cleared.

## Transition ownership

`BrandedAuthLoader` is rendered by the root layout in two mutually exclusive phases:

- Bootstrap: `auth.isLoading` or another app prerequisite is pending. The status is `auth.loadingSession` unless an interactive auth transition is already active.
- Route handoff: the current route differs from the resolved destination, or `auth.authTransition` is active after Firebase authentication begins profile hydration.

The entry screens may show an `ActivityIndicator` inside the pressed button only while the initial request is pending. They must not add a full-screen loader or call `router.replace` after login or registration.

## Destination rules

- Authenticated, hydrated existing user: the role home tab, with apartments as the agency/default role tab where applicable.
- Authenticated, hydrated new user: `/edit-profile` while `needsProfileSetup` is true.
- Guest: `/(tabs)/roommates` from the index or auth entry.
- Unauthenticated: `/auth-landing` when a protected or index route is active.

The root guard compares the current segment key with the resolved destination key and tracks the pending route ref to make replacement idempotent. It does not chain through `index`, `auth-landing`, or `auth-email` after authentication.

## Offline and cold start

A persisted Firebase session has no pending interactive transition. Cold start displays the localized session-restoration state while Firebase and the profile document hydrate, then routes directly to the resolved destination. A failed hydration clears the transition and returns to unauthenticated state without showing a false sign-in loader.

## Audited surfaces

- `app/auth-landing.tsx`: Google, email, guest entry controls and local provider feedback.
- `app/auth-email.tsx`: login, registration, password reset, and agency-registration entry controls.
- `app/_layout.tsx`: font/language/auth readiness, root route guard, branded loader, and idempotent replacement.
- `app/index.tsx`: neutral initial route consumed by the root guard.
- `app/splash.tsx`: branded loader export for splash entry points.
- `src/context/auth.tsx`: Firebase listener, profile synchronization, persisted session state, and transition lifecycle.
- `src/components/BrandedAuthLoader.tsx`: the single branded full-screen loader and localized status mapping.
- `src/locales/en.json` and `src/locales/el.json`: session, sign-in, account-creation, and profile-setup status copy.
- `design_guidelines.json`: the auth transition and persisted-session design rules.
