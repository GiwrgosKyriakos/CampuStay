# Note Client Name Integrity

`saveBrokerNote()` is the write boundary for broker calendar notes. It calls `resolveClientDisplayName(clientId, fallbackName)` before persistence. Resolution checks the user document first and then canonical broker-client profiles. When a client ID exists but all reads fail, the stored value is the non-empty legacy-safe label `Πελάτης` rather than an omitted or empty field.

Appointment records carry `clientName` from the conversation participant. The appointment-to-calendar projection reads that field, while scheduled appointments remain authoritative for visit data. The legacy `saveShowingCalendarNotes()` helper also resolves the name for callers that still use it.

Apartment notes under `users/{userId}/apartmentNotes/{apartmentId}` are property-only personal notes and intentionally have no client identity fields. They are not part of the broker-client calendar-note invariant.