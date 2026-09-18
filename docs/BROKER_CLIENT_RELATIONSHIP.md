# Unified Broker-Client Relationship

## Canonical aggregate

The document `brokerClientProfiles/{brokerId}_{contactUserId}` is the authoritative relationship aggregate for an individual broker and either an external client or an owner/host.

It stores the contact identity, nullable `agencyId`, relationship role, lead references, active lead, chat rooms, appointments, deals, contracts, listing references, pipeline state, readiness, and timestamps. Legacy aliases such as `clientId`, `role`, `apartmentIds`, and `chatRoomId` remain during migration so existing screens can continue to render.

## Direct contact sequence

`getOrCreateHostChat()` identifies the individual broker and contact role, then `syncBrokerClientProfile()` calls `ensureBrokerClientRelationshipCallable`. The callable transaction creates or reactivates the deterministic broker/contact lead, updates the canonical profile, and links the chat and listing. Client relationships then call `initializeDealCallable` with the returned `leadId`.

## Secure business mutations

Clients never write root `deals` documents. Accepted chat offers call `recordAcceptedOfferCallable`, which atomically updates the canonical deal, creates the `offers/{dealId}_accepted` projection, links the deal ID to the profile, and advances the offer stage. Deal stage and checklist transitions remain callable-controlled.

## Screen consumption

- Calendar uses `appointments` for scheduled visits and `calendarNotes` for manual notes.
- Broker CRM uses canonical profiles for identity and pipeline metadata, with chats supplying message activity.
- Deal pipeline loaders hydrate every deal through `brokerClientProfiles/{brokerId}_{clientId}` with `users/{clientId}` fallback for missing identity fields. Stage transitions update root deals and each participating broker's canonical profile in one transaction.
- Broker-client detail reads the deterministic profile, broker-scoped interactions, appointments, deals, and checklists.
- Inbox keeps denormalized chat previews for fast rendering and synchronizes profile timestamps through chat acceptance/actions.
- Listing and apartment-detail owner workflows attach owner and listing references to the same aggregate.