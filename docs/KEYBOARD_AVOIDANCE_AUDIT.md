# Keyboard Avoidance Audit

Date: 2026-09-04
Reference: `app/auth-email.tsx`

## Standard

- Full-screen forms use `KeyboardAwareScrollView`, `flexGrow: 1`, safe-area bottom padding, `keyboardShouldPersistTaps="handled"`, and `keyboardDismissMode="on-drag"`.
- Standalone dialogs use `KeyboardAwareModal`, which applies iOS `padding`, an inset-aware offset, and no Android behavior so `adjustResize` owns Android layout changes.
- `BaseBottomSheet` uses the same platform behavior and gives scrollable bodies flex-grow, bottom clearance, and drag dismissal.
- Gorhom sheets use `BottomSheetTextInput` for native focus/scroll integration.

## Audit Log

| Screen or modal | Current keyboard wrapper | Status |
|---|---|---|
| `app/auth-email.tsx` | `KeyboardAwareScrollView`; benchmark reference | [PASS] Compliant |
| `app/(tabs)/apartments.tsx` | Keyboard-aware filter panel; fixed search input | [PASS] Compliant |
| `app/agency-management.tsx` | Typed `KeyboardAwareScrollView` wrapper | [PASS] Compliant |
| `app/agency-onboarding.tsx` | `KeyboardAwareScrollView` with inset padding | [PASS] Compliant |
| `app/apartment-note.tsx` | `KeyboardAwareScrollView` | [PASS] Compliant |
| `app/broker-client-detail.tsx` | Keyboard-aware detail form and dialog wrapper | [PASS] Compliant |
| `app/broker-owner-detail.tsx` | `KeyboardAwareScrollView`; `BaseBottomSheet` for document sheet | [PASS] Compliant |
| `app/chat/[id].tsx` | Keyboard-controller `KeyboardAvoidingView`; Android undefined behavior | [PASS] Compliant |
| `app/edit-profile.tsx` | `KeyboardAwareScrollView` with bottom offset and inset padding | [PASS] Compliant |
| `app/feedback.tsx` | `KeyboardAwareScrollView` | [PASS] Compliant |
| `app/host-inbox.tsx` | Search input is fixed in the header above the list | [PASS] Compliant |
| `app/notifications.tsx` | `KeyboardAwareScrollView` settings form | [PASS] Compliant |
| `src/components/AddManualClientModal.tsx` | iOS `KeyboardAvoidingView` plus flex-grow `ScrollView` | [PASS] Compliant |
| `src/components/AddressAutocompleteInput.tsx` | Input is component-owned; parent viewport supplies keyboard handling | [PASS] Compliant |
| `src/components/AssignClientEmailModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/BrokerNoteModal.tsx` | iOS `KeyboardAvoidingView` plus flex-grow `ScrollView` | [PASS] Compliant |
| `src/components/calendar/PostVisitFeedbackModal.tsx` | iOS `KeyboardAvoidingView` plus flex-grow `ScrollView` | [PASS] Compliant |
| `src/components/CallFeedbackModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/chat/modals/BlockUserModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/chat/modals/EditVisitModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/chat/modals/PriceProposalModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/chat/RenameGroupModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/CloseLostDealModal.tsx` | `KeyboardAwareModal` plus option `ScrollView` | [PASS] Compliant |
| `src/components/CrossBrokerVisitModal.tsx` | `BaseBottomSheet` with scrollable body | [PASS] Compliant |
| `src/components/FilterSetVersionModal.tsx` | `KeyboardAwareModal` plus flex-grow edit form | [PASS] Compliant |
| `src/components/FilterSheet.tsx` | Gorhom `BottomSheetTextInput` | [PASS] Compliant |
| `src/components/MarketingSpendEntry.tsx` | `BaseBottomSheet` | [PASS] Compliant |
| `src/components/OpenHouseScannerModal.tsx` | `BaseBottomSheet` | [PASS] Compliant |
| `src/components/PropertyAssignmentSetupModal.tsx` | `KeyboardAwareModal` | [PASS] Compliant |
| `src/components/SignContractModal.tsx` | `BaseBottomSheet` plus scrollable body | [PASS] Compliant |
| `src/screens/ApartmentDetailScreen.tsx` | Shared `KeyboardAwareModal` alias for direct dialogs | [PASS] Compliant |
| `src/screens/chat/GroupChatScreen.tsx` | `KeyboardAvoidingView` with Android undefined behavior | [PASS] Compliant |
| `src/screens/CreateListingScreen.tsx` | `KeyboardAwareScrollView` with preserved scroll ref | [PASS] Compliant |
| `src/screens/SecretariatSettlementsScreen.tsx` | `KeyboardAwareScrollView` numeric form | [PASS] Compliant |

## Remediation Matrix

| Modified file | Auth-email parity confirmed |
|---|---|
| `app/agency-onboarding.tsx` | Keyboard-aware scroll, flex-grow content, inset padding, drag dismissal |
| `app/agency-management.tsx` | Keyboard-aware scroll, flex-grow content, inset padding, drag dismissal |
| `app/edit-profile.tsx` | Existing keyboard-aware scroll tightened with persist and drag behavior |
| `app/chat/[id].tsx` | iOS padding, Android resize, existing inset offset, drag dismissal |
| `app/feedback.tsx` | Keyboard-aware scroll, flex-grow content, inset padding |
| `app/apartment-note.tsx` | Keyboard-aware scroll, flex-grow content, inset padding |
| `app/notifications.tsx` | Keyboard-aware settings scroll, flex-grow content, inset padding |
| `app/(tabs)/apartments.tsx` | Keyboard-aware filter scroll, flex-grow content, inset padding |
| `app/broker-client-detail.tsx` | Keyboard-aware detail scroll and dialog wrappers |
| `app/broker-owner-detail.tsx` | Keyboard-aware owner form scroll and shared sheet behavior |
| `src/screens/CreateListingScreen.tsx` | Keyboard-aware scroll, preserved ref, bottom/inset padding |
| `src/screens/SecretariatSettlementsScreen.tsx` | Keyboard-aware numeric form, flex-grow content, inset padding |
| `src/components/common/BaseBottomSheet.tsx` | Platform behavior, inset offset, flex-grow body, drag dismissal |
| `src/components/common/KeyboardAwareModal.tsx` | Strict reusable modal wrapper with platform-specific behavior |
| `src/components/AddManualClientModal.tsx` | Modal offset, flex-grow content, inset padding, drag dismissal |
| `src/components/BrokerNoteModal.tsx` | Modal offset, flex-grow content, inset padding, drag dismissal |
| `src/components/calendar/PostVisitFeedbackModal.tsx` | Modal offset, flex-grow content, inset padding, drag dismissal |
| `src/components/FilterSheet.tsx` | Native Gorhom text-input integration |
| `src/components/FilterSetVersionModal.tsx` | Keyboard-aware modal and flex-grow edit form |
| `src/components/AssignClientEmailModal.tsx` | Shared keyboard-aware modal |
| `src/components/CallFeedbackModal.tsx` | Shared keyboard-aware modal |
| `src/components/chat/modals/BlockUserModal.tsx` | Shared keyboard-aware modal |
| `src/components/chat/modals/EditVisitModal.tsx` | Shared keyboard-aware modal |
| `src/components/chat/modals/PriceProposalModal.tsx` | Shared keyboard-aware modal |
| `src/components/chat/RenameGroupModal.tsx` | Shared keyboard-aware modal |
| `src/components/CloseLostDealModal.tsx` | Shared keyboard-aware modal |
| `src/components/PropertyAssignmentSetupModal.tsx` | Shared keyboard-aware modal |
| `src/screens/ApartmentDetailScreen.tsx` | Shared keyboard-aware modal for direct dialogs |

## Verification

- `node ./scripts/cmd-guard.js --preinstall`: passed.
- `npx tsc --noEmit`: passed from `C:/c/f`.
- `git diff --check`: passed for edited source files.
